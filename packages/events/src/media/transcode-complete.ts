/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { parser } from '@aws-lambda-powertools/parser/middleware';
import { EventBridgeSchema } from '@aws-lambda-powertools/parser/schemas';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import middy from '@middy/core';
import { createCoreTableService } from '@wattle/core-table';
import type { Context } from 'aws-lambda';
import { z } from 'zod';
import { resolveLessonMediaUploadBucketName } from '../lib/runtime-config.js';

export type { Context };

process.env.POWERTOOLS_METRICS_NAMESPACE = 'TranscodeComplete';
process.env.POWERTOOLS_SERVICE_NAME = 'TranscodeComplete';

const tracer = new Tracer();
const logger = new Logger();
const metrics = new Metrics();
const s3Client = new S3Client({});

// Memoized across invocations on a warm Lambda, same as the tRPC APIs'
// core-table plugin -- the DynamoDB client and resolved table name it
// depends on are already memoized in @wattle/core-table.
let coreTablePromise: ReturnType<typeof createCoreTableService> | undefined;

const getCoreTable = () => {
  if (!coreTablePromise) {
    coreTablePromise = createCoreTableService();
  }
  return coreTablePromise;
};

const MediaConvertJobStateChangeDetailSchema = z.object({
  status: z.string(),
  userMetadata: z.object({
    courseId: z.string(),
    moduleId: z.string(),
    lessonId: z.string(),
    contentItemId: z.string(),
    rawObjectKey: z.string(),
  }),
});

export const transcodeComplete = async (
  event: z.infer<typeof EventBridgeSchema>,
): Promise<void> => {
  logger.info('Received event', event);

  const detail = MediaConvertJobStateChangeDetailSchema.parse(event.detail);
  const { courseId, moduleId, lessonId, contentItemId, rawObjectKey } =
    detail.userMetadata;

  const coreTable = await getCoreTable();

  if (detail.status === 'COMPLETE') {
    const manifestKey = `courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/${contentItemId}/master.m3u8`;
    try {
      await coreTable.entities.contentItem
        .patch({ courseId, moduleId, lessonId, contentItemId })
        .set({ status: 'ready', s3Key: manifestKey })
        .go();
    } catch (error) {
      // The instructor may have deleted the content item while transcoding
      // was in flight -- nothing left to patch, and the DynamoDB record
      // stays the source of truth for whether it exists.
      logger.error('Failed to mark content item ready after transcode', {
        error,
        courseId,
        moduleId,
        lessonId,
        contentItemId,
      });
      return;
    }

    const uploadBucketName = await resolveLessonMediaUploadBucketName();
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: uploadBucketName,
          Key: rawObjectKey,
        }),
      );
    } catch (error) {
      logger.error('Failed to delete raw upload after transcode', {
        error,
        rawObjectKey,
      });
    }
  } else if (detail.status === 'ERROR') {
    try {
      await coreTable.entities.contentItem
        .patch({ courseId, moduleId, lessonId, contentItemId })
        .set({ status: 'failed' })
        .go();
    } catch (error) {
      logger.error('Failed to mark content item failed after transcode', {
        error,
        courseId,
        moduleId,
        lessonId,
        contentItemId,
      });
    }
  } else {
    logger.info('Ignoring MediaConvert job state change', {
      status: detail.status,
    });
  }
};

export const handler = middy()
  .use(captureLambdaHandler(tracer))
  .use(injectLambdaContext(logger))
  .use(logMetrics(metrics))
  .use(parser({ schema: EventBridgeSchema }))
  .handler(transcodeComplete);
