import "server-only";

import {
  TRPCClientError,
  createTRPCProxyClient,
  loggerLink,
} from "@trpc/client";
import { cookies } from "next/headers";
import { appRouter } from "~/server/api/root";
import { transformer } from "./shared";
import { callProcedure } from "@trpc/server";

import { observable } from "@trpc/server/observable";
import type { TRPCErrorResponse } from "@trpc/server/rpc";
import { createInnerTRPCContext } from "~/server/api/trpc";
import { cache } from "react";

const createContext = cache(() => {
  return createInnerTRPCContext({
    headers: new Headers({
      cookie: cookies().toString(),
      "x-trpc-source": "rsc",
    }),
  });
});

export const api = createTRPCProxyClient<typeof appRouter>({
  transformer,
  links: [
    loggerLink({
      enabled: (op) =>
        process.env.NODE_ENV === "development" ||
        (op.direction === "down" && op.result instanceof Error),
    }),
    /**
     * Custom RSC link that invokes procedures directly in the server component
     */
    () =>
      ({ op }) =>
        observable((observer) => {
          createContext()
            .then((ctx) => {
              return callProcedure({
                procedures: appRouter._def.procedures,
                path: op.path,
                rawInput: op.input,
                ctx,
                type: op.type,
              });
            })
            .then((data) => {
              observer.next({ result: { data } });
              observer.complete();
            })
            .catch((cause: TRPCErrorResponse) => {
              observer.error(TRPCClientError.from(cause));
            });
        }),
  ],
});
