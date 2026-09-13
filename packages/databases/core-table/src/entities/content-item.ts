/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Entity } from 'electrodb';
import { getDynamoDBClient, resolveTableName } from '../client.js';

// Shares its pk with Course, Module, and Lesson (COURSE#<courseId>) via the
// `curriculum` collection (../service.ts); sk is prefixed with the parent
// module and lesson ids so a lesson's content items are a contiguous range.
export const createContentItemEntity = async () =>
  new Entity(
    {
      model: {
        entity: 'contentItem',
        version: '1',
        service: 'CoreTable',
      },
      attributes: {
        contentItemId: {
          type: 'string',
          required: true,
        },
        lessonId: {
          type: 'string',
          required: true,
        },
        moduleId: {
          type: 'string',
          required: true,
        },
        courseId: {
          type: 'string',
          required: true,
        },
        // Only 'video' today; leaves room for sibling content types (text,
        // file, quiz) from #102.
        type: {
          type: ['video'] as const,
          required: true,
        },
        title: {
          type: 'string',
          required: true,
        },
        description: {
          type: 'string',
        },
        s3Key: {
          type: 'string',
          required: true,
        },
        mimeType: {
          type: 'string',
          required: true,
        },
        durationSeconds: {
          type: 'number',
        },
        // Sequencing within the lesson. Not part of any key: content item
        // counts per lesson are small enough to sort client-side after fetch.
        order: {
          type: 'number',
          required: true,
        },
        createdAt: {
          type: 'string',
          required: true,
          default: () => new Date().toISOString(),
          readOnly: true,
        },
        updatedAt: {
          type: 'string',
          required: true,
          default: () => new Date().toISOString(),
          watch: '*',
          set: () => new Date().toISOString(),
        },
      },
      indexes: {
        primary: {
          collection: 'curriculum',
          pk: {
            field: 'pk',
            composite: ['courseId'],
          },
          sk: {
            field: 'sk',
            composite: ['moduleId', 'lessonId', 'contentItemId'],
          },
        },
      },
    },
    { client: getDynamoDBClient(), table: await resolveTableName() },
  );
