/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import { courseProcedure } from '../init.js';
import {
  ListCoursesByInstructorInputSchema,
  ListCoursesByInstructorOutputSchema,
  ListInstructorsForCourseInputSchema,
  ListInstructorsForCourseOutputSchema,
  ViewCourseInputSchema,
  ViewCourseOutputSchema,
} from '../schema/index.js';

export const listCoursesByInstructor = courseProcedure
  .input(ListCoursesByInstructorInputSchema)
  .output(ListCoursesByInstructorOutputSchema)
  .query(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { instructorId, cursor, limit } = input;

    const { data: memberships, cursor: nextCursor } =
      await coreTable.entities.courseInstructor.query
        .byInstructor({ instructorId })
        .go({ cursor, limit });
    if (memberships.length === 0) {
      return { items: [], cursor: nextCursor };
    }

    // preserveBatchOrder so a course deleted after its membership row was
    // written shows up as a null gap to filter out, not a silently
    // reordered/shortened page.
    const { data: courses } = await coreTable.entities.course
      .get(memberships.map(({ courseId }) => ({ courseId })))
      .go({ preserveBatchOrder: true });

    return {
      items: courses.filter((course) => course !== null),
      cursor: nextCursor,
    };
  });

export const listInstructorsForCourse = courseProcedure
  .input(ListInstructorsForCourseInputSchema)
  .output(ListInstructorsForCourseOutputSchema)
  .query(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, cursor, limit } = input;

    const { data: memberships, cursor: nextCursor } =
      await coreTable.entities.courseInstructor.query
        .primary({ courseId })
        .go({ cursor, limit });
    if (memberships.length === 0) {
      return { items: [], cursor: nextCursor };
    }

    const { data: instructors } = await coreTable.entities.user
      .get(memberships.map(({ instructorId }) => ({ userId: instructorId })))
      .go({ preserveBatchOrder: true });

    return {
      items: instructors.filter((instructor) => instructor !== null),
      cursor: nextCursor,
    };
  });

export const viewCourse = courseProcedure
  .input(ViewCourseInputSchema)
  .output(ViewCourseOutputSchema)
  .query(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;

    const { data: course } = await coreTable.entities.course
      .get({ courseId: input.courseId })
      .go();
    if (!course) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return course;
  });
