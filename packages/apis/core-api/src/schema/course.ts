/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import {
  createPaginatedQueryOutputSchema,
  QueryInputSchema,
} from './common.js';

export const CourseStatusSchema = z.enum(['draft', 'published', 'archived']);

export const CourseSchema = z.object({
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: CourseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ICourse = z.output<typeof CourseSchema>;

export const ListCoursesByInstructorInputSchema = QueryInputSchema.extend({
  instructorId: z.string(),
});

export type IListCoursesByInstructorInput = z.output<
  typeof ListCoursesByInstructorInputSchema
>;

export const ListCoursesByInstructorOutputSchema =
  createPaginatedQueryOutputSchema(CourseSchema);

export const InstructorSchema = z.object({
  userId: z.string(),
  email: z.string().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
});

export type IInstructor = z.output<typeof InstructorSchema>;

export const ListInstructorsForCourseInputSchema = QueryInputSchema.extend({
  courseId: z.string(),
});

export type IListInstructorsForCourseInput = z.output<
  typeof ListInstructorsForCourseInputSchema
>;

export const ListInstructorsForCourseOutputSchema =
  createPaginatedQueryOutputSchema(InstructorSchema);

export const ListPublicCoursesInputSchema = QueryInputSchema;

export type IListPublicCoursesInput = z.output<
  typeof ListPublicCoursesInputSchema
>;

export const ListPublicCoursesOutputSchema =
  createPaginatedQueryOutputSchema(CourseSchema);

export const ViewCourseInputSchema = z.object({
  courseId: z.string(),
});

export type IViewCourseInput = z.output<typeof ViewCourseInputSchema>;

export const LessonSchema = z.object({
  lessonId: z.string(),
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ILesson = z.output<typeof LessonSchema>;

export const ModuleSchema = z.object({
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lessons: z.array(LessonSchema),
});

export type IModule = z.output<typeof ModuleSchema>;

export const ViewCourseOutputSchema = CourseSchema.extend({
  modules: z.array(ModuleSchema),
});
