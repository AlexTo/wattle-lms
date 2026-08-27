import { protectedProcedure } from '../init.js';
import { EchoInputSchema, EchoOutputSchema } from '../schema/index.js';

export const echo = protectedProcedure
  .input(EchoInputSchema)
  .output(EchoOutputSchema)
  .query((opts) => ({ message: opts.input.message }));
