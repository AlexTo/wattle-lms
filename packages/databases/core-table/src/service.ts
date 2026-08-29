/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Service } from 'electrodb';
import {
  createAssignmentEntity,
  createCourseEntity,
  createEnrolmentEntity,
  createLessonEntity,
  createModuleEntity,
  createProgressEntity,
  createSubmissionEntity,
  createUserEntity,
} from './entities/index.js';

// Course, Module, and Lesson join the `curriculum` collection (declared on
// each entity's primary index), so a course's full curriculum can be read
// with a single query: coreTableService.collections.curriculum({ courseId
// }).go(). Other entities are included for a single access point but don't
// need to be queried alongside the curriculum.
export const createCoreTableService = async () => {
  const [
    user,
    course,
    lesson,
    module,
    enrolment,
    assignment,
    submission,
    progress,
  ] = await Promise.all([
    createUserEntity(),
    createCourseEntity(),
    createLessonEntity(),
    createModuleEntity(),
    createEnrolmentEntity(),
    createAssignmentEntity(),
    createSubmissionEntity(),
    createProgressEntity(),
  ]);

  return new Service({
    user,
    course,
    module,
    lesson,
    enrolment,
    assignment,
    submission,
    progress,
  });
};
