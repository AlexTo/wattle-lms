/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

export const ModuleSchema = z.object({
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IModule = z.output<typeof ModuleSchema>;

export const CreateModuleInputSchema = z.object({
  courseId: z.string(),
  title: z.string().min(1).max(200),
});

export type ICreateModuleInput = z.output<typeof CreateModuleInputSchema>;

export const CreateModuleOutputSchema = ModuleSchema;

export type ICreateModuleOutput = z.output<typeof CreateModuleOutputSchema>;
