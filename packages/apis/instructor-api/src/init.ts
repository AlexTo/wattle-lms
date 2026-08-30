/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { initTRPC } from '@trpc/server';
import {
  createErrorPlugin,
  createLoggerPlugin,
  createMetricsPlugin,
  createTracerPlugin,
  IMiddlewareContext,
} from './middleware/index.js';

process.env.POWERTOOLS_SERVICE_NAME = 'InstructorApi';
process.env.POWERTOOLS_METRICS_NAMESPACE = 'InstructorApi';

export type Context = IMiddlewareContext;

export const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure
  .concat(createLoggerPlugin())
  .concat(createTracerPlugin())
  .concat(createMetricsPlugin())
  .concat(createErrorPlugin());
