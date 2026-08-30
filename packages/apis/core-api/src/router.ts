/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { t } from './init.js';
import {
  listCoursesByInstructor,
  listInstructorsForCourse,
  viewCourse,
} from './procedures/course.js';

export const router = t.router;

export const appRouter = router({
  course: router({
    listByInstructor: listCoursesByInstructor,
    listInstructors: listInstructorsForCourse,
    view: viewCourse,
  }),
});

export type AppRouter = typeof appRouter;
