/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import { v7 as uuidv7 } from 'uuid';
import { courseProcedure } from '../init.js';
import { bestEffortDeleteContentItemVideos } from '../lib/s3-client.js';
import {
  CreateLessonInputSchema,
  CreateLessonOutputSchema,
  DeleteLessonInputSchema,
  DeleteLessonOutputSchema,
  UpdateLessonInputSchema,
  UpdateLessonOutputSchema,
} from '../schema/index.js';

export const createLesson = courseProcedure
  .input(CreateLessonInputSchema)
  .output(CreateLessonOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, title, description } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may add lessons to it,
    // not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: module } = await coreTable.entities.module
      .get({ courseId, moduleId })
      .go();
    if (!module) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // New lessons append to the end of their module. `order` isn't part of
    // any key (lesson counts per module are small enough to sort
    // client-side), so this is a plain query-and-increment rather than an
    // atomic counter.
    const { data: lessons } = await coreTable.entities.lesson.query
      .primary({ courseId, moduleId })
      .go();
    const order =
      lessons.reduce((max, lesson) => Math.max(max, lesson.order), 0) + 1;

    const { data: lesson } = await coreTable.entities.lesson
      .create({
        lessonId: uuidv7(),
        moduleId,
        courseId,
        title,
        description,
        order,
      })
      .go();

    return lesson;
  });

export const updateLesson = courseProcedure
  .input(UpdateLessonInputSchema)
  .output(UpdateLessonOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, title, description, order } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may edit its lessons,
    // not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: existing } = await coreTable.entities.lesson
      .get({ courseId, moduleId, lessonId })
      .go();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const { data: lesson } = await coreTable.entities.lesson
      .patch({ courseId, moduleId, lessonId })
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order }),
      })
      .go({ response: 'all_new' });

    return lesson;
  });

export const deleteLesson = courseProcedure
  .input(DeleteLessonInputSchema)
  .output(DeleteLessonOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may delete its
    // lessons, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: existing } = await coreTable.entities.lesson
      .get({ courseId, moduleId, lessonId })
      .go();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Content items have no lifecycle independent of their lesson, and
    // there's no way to reach one once its lesson is gone, so deleting a
    // lesson cascades to every content item under it. The lesson and its
    // content items are deleted transactionally so a failure partway
    // through can't leave an orphaned content item referencing a lesson
    // that no longer exists.
    const { data: contentItems } = await coreTable.entities.contentItem.query
      .primary({ courseId, moduleId, lessonId })
      .go();

    // DynamoDB caps a single transaction at 100 items; nothing currently
    // limits how many content items a lesson can hold, so a lesson this
    // large can't be deleted in one transactional cascade.
    if (contentItems.length + 1 > 100) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'Lesson has too many content items to delete in a single operation; delete some content items first',
      });
    }

    const { canceled } = await coreTable.transaction
      .write((entities) => [
        entities.lesson.delete({ courseId, moduleId, lessonId }).commit(),
        ...contentItems.map(({ contentItemId }) =>
          entities.contentItem
            .delete({ courseId, moduleId, lessonId, contentItemId })
            .commit(),
        ),
      ])
      .go();

    if (canceled) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete lesson',
      });
    }

    // Best-effort: the DynamoDB records are the source of truth for the
    // lesson's content, so a failure to remove the underlying S3 objects
    // is logged rather than thrown. Only video content items have an S3
    // object to clean up.
    await bestEffortDeleteContentItemVideos(
      ctx.logger,
      contentItems.filter((item) => item.type === 'video' && item.s3Key),
    );

    // DynamoDB transactions don't return the deleted attributes, but we
    // already fetched the lesson's pre-delete state above for the
    // existence check.
    return existing;
  });
