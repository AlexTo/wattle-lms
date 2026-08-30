/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { appRouter } from './router.js';

const PORT = 2023;

createHTTPServer({
  router: appRouter,
  middleware: cors(),
  createContext() {
    return {
      event: {} as any,
      context: {} as any,
      info: {} as any,
    };
  },
}).listen(PORT);

console.log(`Local TRPC server listening on port ${PORT}`);
