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
        // 'video' and 'text' today; leaves room for sibling content types
        // (file, quiz) from #102. Per-type required-ness (e.g. a video
        // needs s3Key/mimeType, a text item needs body) is enforced by the
        // zod schemas in instructor-api/core-api, not here -- ElectroDB has
        // no native discriminated-attribute support for a single entity.
        type: {
          type: ['video', 'text'] as const,
          required: true,
        },
        // 'ready' by default so synchronous types (text, and any future
        // non-video type from #102) need no code changes -- only video's
        // create path (async, transcoded by MediaConvert) overrides this to
        // 'pending'.
        status: {
          type: ['pending', 'ready', 'failed'] as const,
          required: true,
          default: 'ready',
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
        },
        mimeType: {
          type: 'string',
        },
        durationSeconds: {
          type: 'number',
        },
        // Tiptap's JSON document, stored as a string. Only present for
        // type: 'text'.
        body: {
          type: 'string',
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
