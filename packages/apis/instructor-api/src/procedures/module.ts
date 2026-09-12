/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import { v7 as uuidv7 } from 'uuid';
import { courseProcedure } from '../init.js';
import {
  CreateModuleInputSchema,
  CreateModuleOutputSchema,
} from '../schema/index.js';

export const createModule = courseProcedure
  .input(CreateModuleInputSchema)
  .output(CreateModuleOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, title } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may add modules to it,
    // not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    // New modules append to the end of the course. `order` isn't part of any
    // key (module counts per course are small enough to sort client-side),
    // so this is a plain query-and-increment rather than an atomic counter.
    const { data: modules } = await coreTable.entities.module.query
      .primary({ courseId })
      .go();
    const order =
      modules.reduce((max, module) => Math.max(max, module.order), 0) + 1;

    const { data: module } = await coreTable.entities.module
      .create({ moduleId: uuidv7(), courseId, title, order })
      .go();

    return module;
  });
