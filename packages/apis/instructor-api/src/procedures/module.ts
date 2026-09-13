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
  DeleteModuleInputSchema,
  DeleteModuleOutputSchema,
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

export const deleteModule = courseProcedure
  .input(DeleteModuleInputSchema)
  .output(DeleteModuleOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may delete its
    // modules, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: existing } = await coreTable.entities.module
      .get({ courseId, moduleId })
      .go();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Lessons have no lifecycle independent of their module, and there's no
    // way to reach one once its module is gone, so deleting a module
    // cascades to every lesson under it. The module and its lessons are
    // deleted transactionally so a failure partway through can't leave an
    // orphaned lesson referencing a module that no longer exists.
    const { data: lessons } = await coreTable.entities.lesson.query
      .primary({ courseId, moduleId })
      .go();

    // DynamoDB caps a single transaction at 100 items; nothing currently
    // limits how many lessons a module can hold, so a module this large
    // can't be deleted in one transactional cascade.
    if (lessons.length + 1 > 100) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'Module has too many lessons to delete in a single operation; delete some lessons first',
      });
    }

    const { canceled } = await coreTable.transaction
      .write((entities) => [
        entities.module.delete({ courseId, moduleId }).commit(),
        ...lessons.map(({ lessonId }) =>
          entities.lesson.delete({ courseId, moduleId, lessonId }).commit(),
        ),
      ])
      .go();

    if (canceled) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete module',
      });
    }

    // DynamoDB transactions don't return the deleted attributes, but we
    // already fetched the module's pre-delete state above for the
    // existence check.
    return existing;
  });
