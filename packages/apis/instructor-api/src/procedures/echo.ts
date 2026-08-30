/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { publicProcedure } from '../init.js';
import { EchoInputSchema, EchoOutputSchema } from '../schema/index.js';

export const echo = publicProcedure
  .input(EchoInputSchema)
  .output(EchoOutputSchema)
  .query((opts) => ({ message: opts.input.message }));
