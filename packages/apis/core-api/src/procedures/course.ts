/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import { courseProcedure, publicCourseProcedure } from '../init.js';
import {
  ListCoursesByInstructorInputSchema,
  ListCoursesByInstructorOutputSchema,
  ListInstructorsForCourseInputSchema,
  ListInstructorsForCourseOutputSchema,
  ListPublicCoursesInputSchema,
  ListPublicCoursesOutputSchema,
  ViewCourseInputSchema,
  ViewCourseOutputSchema,
} from '../schema/index.js';

export const listCoursesByInstructor = courseProcedure
  .input(ListCoursesByInstructorInputSchema)
  .output(ListCoursesByInstructorOutputSchema)
  .query(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { instructorId, cursor, limit } = input;

    // byInstructor's sort key is courseUpdatedAt#courseId; order: 'desc'
    // surfaces the most recently updated courses first.
    const { data: memberships, cursor: nextCursor } =
      await coreTable.entities.courseInstructor.query
        .byInstructor({ instructorId })
        .go({ cursor, limit, order: 'desc' });
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

export const listPublicCourses = publicCourseProcedure
  .input(ListPublicCoursesInputSchema)
  .output(ListPublicCoursesOutputSchema)
  .query(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { cursor, limit } = input;

    const { data: courses, cursor: nextCursor } =
      await coreTable.entities.course.query
        .byStatus({ status: 'published' })
        .go({ cursor, limit });

    return { items: courses, cursor: nextCursor };
  });

export const viewCourse = courseProcedure
  .input(ViewCourseInputSchema)
  .output(ViewCourseOutputSchema)
  .query(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;

    // Course, its modules, and their lessons all share the `curriculum`
    // collection's partition (see @wattle/core-table's service.ts), so one
    // query returns the whole curriculum instead of a get plus per-module
    // lesson queries.
    const {
      data: { course: courses, module: modules, lesson: lessons },
    } = await coreTable.collections
      .curriculum({ courseId: input.courseId })
      .go();
    const [course] = courses;
    if (!course) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const lessonsByModuleId = new Map<string, typeof lessons>();
    for (const lesson of lessons) {
      const moduleLessons = lessonsByModuleId.get(lesson.moduleId) ?? [];
      moduleLessons.push(lesson);
      lessonsByModuleId.set(lesson.moduleId, moduleLessons);
    }

    return {
      ...course,
      modules: modules
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((module) => ({
          ...module,
          lessons: (lessonsByModuleId.get(module.moduleId) ?? [])
            .slice()
            .sort((a, b) => a.order - b.order),
        })),
    };
  });
