/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

export const ContentItemSchema = z.object({
  contentItemId: z.string(),
  lessonId: z.string(),
  moduleId: z.string(),
  courseId: z.string(),
  type: z.literal('video'),
  title: z.string(),
  description: z.string().optional(),
  s3Key: z.string(),
  mimeType: z.string(),
  durationSeconds: z.number().optional(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IContentItem = z.output<typeof ContentItemSchema>;

export const CreateContentItemVideoUploadUrlInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  lessonId: z.string(),
  fileName: z.string().min(1),
});

export type ICreateContentItemVideoUploadUrlInput = z.output<
  typeof CreateContentItemVideoUploadUrlInputSchema
>;

export const CreateContentItemVideoUploadUrlOutputSchema = z.object({
  contentItemId: z.string(),
  uploadUrl: z.string(),
  objectKey: z.string(),
});

export type ICreateContentItemVideoUploadUrlOutput = z.output<
  typeof CreateContentItemVideoUploadUrlOutputSchema
>;

export const CreateContentItemInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  lessonId: z.string(),
  contentItemId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  objectKey: z.string(),
  mimeType: z.string(),
  durationSeconds: z.number().optional(),
});

export type ICreateContentItemInput = z.output<
  typeof CreateContentItemInputSchema
>;

export const CreateContentItemOutputSchema = ContentItemSchema;

export type ICreateContentItemOutput = z.output<
  typeof CreateContentItemOutputSchema
>;

export const UpdateContentItemInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  lessonId: z.string(),
  contentItemId: z.string(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  objectKey: z.string().optional(),
  mimeType: z.string().optional(),
  durationSeconds: z.number().optional(),
});

export type IUpdateContentItemInput = z.output<
  typeof UpdateContentItemInputSchema
>;

export const UpdateContentItemOutputSchema = ContentItemSchema;

export type IUpdateContentItemOutput = z.output<
  typeof UpdateContentItemOutputSchema
>;

export const CreateContentItemVideoUrlInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  lessonId: z.string(),
  contentItemId: z.string(),
});

export type ICreateContentItemVideoUrlInput = z.output<
  typeof CreateContentItemVideoUrlInputSchema
>;

export const CreateContentItemVideoUrlOutputSchema = z.object({
  url: z.string(),
});

export type ICreateContentItemVideoUrlOutput = z.output<
  typeof CreateContentItemVideoUrlOutputSchema
>;

export const DeleteContentItemInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  lessonId: z.string(),
  contentItemId: z.string(),
});

export type IDeleteContentItemInput = z.output<
  typeof DeleteContentItemInputSchema
>;

export const DeleteContentItemOutputSchema = ContentItemSchema;

export type IDeleteContentItemOutput = z.output<
  typeof DeleteContentItemOutputSchema
>;
