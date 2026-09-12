/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

export const LessonSchema = z.object({
  lessonId: z.string(),
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  content: z.string().optional(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ILesson = z.output<typeof LessonSchema>;

export const CreateLessonInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  title: z.string().min(1).max(200),
});

export type ICreateLessonInput = z.output<typeof CreateLessonInputSchema>;

export const CreateLessonOutputSchema = LessonSchema;

export type ICreateLessonOutput = z.output<typeof CreateLessonOutputSchema>;
