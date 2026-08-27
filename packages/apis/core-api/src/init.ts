import { initTRPC, TRPCError } from '@trpc/server';
import {
  createAuthPlugin,
  createErrorPlugin,
  createLoggerPlugin,
  createMetricsPlugin,
  createTracerPlugin,
  IMiddlewareContext,
} from './middleware/index.js';

process.env.POWERTOOLS_SERVICE_NAME = 'CoreApi';
process.env.POWERTOOLS_METRICS_NAMESPACE = 'CoreApi';

export type Context = IMiddlewareContext;

export const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure
  .concat(createLoggerPlugin())
  .concat(createTracerPlugin())
  .concat(createMetricsPlugin())
  .concat(createAuthPlugin())
  .concat(createErrorPlugin());

/**
 * Like publicProcedure, but requires ctx.user to be set (i.e. the caller
 * presented a valid Cognito token), narrowing ctx.user from optional to
 * required for the procedures built on top of it.
 */
export const protectedProcedure = publicProcedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return opts.next({
    ctx: {
      ...opts.ctx,
      user: opts.ctx.user,
    },
  });
});
