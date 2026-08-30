/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from './init.js';
import { archiveCourse, createCourse } from './procedures/course.js';

export const router = t.router;

export const appRouter = router({
  course: router({
    create: createCourse,
    archive: archiveCourse,
  }),
});

export type AppRouter = typeof appRouter;
