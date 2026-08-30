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

export type ICourse = z.TypeOf<typeof CourseSchema>;

export const ListCoursesByInstructorInputSchema = QueryInputSchema.extend({
  instructorId: z.string(),
});

export type IListCoursesByInstructorInput = z.TypeOf<
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

export type IInstructor = z.TypeOf<typeof InstructorSchema>;

export const ListInstructorsForCourseInputSchema = QueryInputSchema.extend({
  courseId: z.string(),
});

export type IListInstructorsForCourseInput = z.TypeOf<
  typeof ListInstructorsForCourseInputSchema
>;

export const ListInstructorsForCourseOutputSchema =
  createPaginatedQueryOutputSchema(InstructorSchema);

export const ViewCourseInputSchema = z.object({
  courseId: z.string(),
});

export type IViewCourseInput = z.TypeOf<typeof ViewCourseInputSchema>;

export const ViewCourseOutputSchema = CourseSchema;
