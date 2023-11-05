import {
  TRPCClientError,
  type TRPCLink,
  createTRPCProxyClient,
  loggerLink,
} from "@trpc/client";
import { cookies } from "next/headers";

import { appRouter, type AppRouter } from "~/server/api/root";
import { transformer } from "./shared";
import {
  callProcedure,
  type AnyRouter,
  type inferRouterContext,
} from "@trpc/server";

import { observable } from "@trpc/server/observable";
import type { TRPCErrorResponse } from "@trpc/server/rpc";
import { createInnerTRPCContext } from "~/server/api/trpc";

function directLink<TRouter extends AnyRouter>(opts: {
  router: TRouter;
  createContext: () => Promise<inferRouterContext<TRouter>>;
}): TRPCLink<TRouter> {
  return (runtime) =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type } = op;

        const promise = opts
          .createContext()
          .then(async (ctx) => {
            const procedureResult = await callProcedure({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              procedures: opts.router._def.procedures,
              path,
              rawInput: input,
              ctx: ctx,
              type,
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return runtime.transformer.serialize(procedureResult);
          })
          .catch((cause: TRPCErrorResponse) => {
            observer.error(TRPCClientError.from(cause));
          });

        promise
          .then((data) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const transformedResult = runtime.transformer.deserialize(data);
            observer.next({ result: { data: transformedResult } });
            observer.complete();
          })
          .catch((cause: TRPCErrorResponse) => {
            observer.error(TRPCClientError.from(cause));
          });
      });
}

export const api = createTRPCProxyClient<AppRouter>({
  transformer,
  links: [
    loggerLink({
      enabled: (op) =>
        process.env.NODE_ENV === "development" ||
        (op.direction === "down" && op.result instanceof Error),
    }),
    directLink({
      createContext: () => {
        return createInnerTRPCContext({
          headers: new Headers({
            cookie: cookies().toString(),
            "x-trpc-source": "rsc",
          }),
        });
      },
      router: appRouter,
    }),
  ],
});
