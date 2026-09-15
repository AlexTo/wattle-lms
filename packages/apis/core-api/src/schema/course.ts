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

export const PublicListCoursesInputSchema = QueryInputSchema;

export type IPublicListCoursesInput = z.output<
  typeof PublicListCoursesInputSchema
>;

export const PublicListCoursesOutputSchema =
  createPaginatedQueryOutputSchema(CourseSchema);

export const ViewCourseInputSchema = z.object({
  courseId: z.string(),
});

export type IViewCourseInput = z.output<typeof ViewCourseInputSchema>;

const ContentItemBaseSchema = {
  contentItemId: z.string(),
  lessonId: z.string(),
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export const ContentItemSchema = z.discriminatedUnion('type', [
  z.object({
    ...ContentItemBaseSchema,
    type: z.literal('video'),
    s3Key: z.string(),
    mimeType: z.string(),
    durationSeconds: z.number().optional(),
  }),
  z.object({
    ...ContentItemBaseSchema,
    type: z.literal('text'),
    body: z.string(),
  }),
]);

export type IContentItem = z.output<typeof ContentItemSchema>;

export const LessonSchema = z.object({
  lessonId: z.string(),
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentItems: z.array(ContentItemSchema),
});

export type ILesson = z.output<typeof LessonSchema>;

export const ModuleSchema = z.object({
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lessons: z.array(LessonSchema),
});

export type IModule = z.output<typeof ModuleSchema>;

export const ViewCourseOutputSchema = CourseSchema.extend({
  modules: z.array(ModuleSchema),
});

export type IViewCourseOutput = z.output<typeof ViewCourseOutputSchema>;
