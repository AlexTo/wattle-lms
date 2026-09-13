/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from './init.js';
import { archiveCourse, createCourse } from './procedures/course.js';
import {
  createLesson,
  deleteLesson,
  updateLesson,
} from './procedures/lesson.js';
import { createModule, deleteModule } from './procedures/module.js';

export const router = t.router;

export const appRouter = router({
  course: router({
    create: createCourse,
    archive: archiveCourse,
  }),
  module: router({
    create: createModule,
    delete: deleteModule,
  }),
  lesson: router({
    create: createLesson,
    update: updateLesson,
    delete: deleteLesson,
  }),
});

export type AppRouter = typeof appRouter;
