/**
 * Copyright Alex To. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { protectedProcedure } from '../init.js';
import { EchoInputSchema, EchoOutputSchema } from '../schema/index.js';

export const echo = protectedProcedure
  .input(EchoInputSchema)
  .output(EchoOutputSchema)
  .query((opts) => ({ message: opts.input.message }));
