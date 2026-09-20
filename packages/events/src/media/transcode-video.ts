/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { parser } from '@aws-lambda-powertools/parser/middleware';
import { S3Schema } from '@aws-lambda-powertools/parser/schemas';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import {
  CreateJobCommand,
  MediaConvertClient,
} from '@aws-sdk/client-mediaconvert';
import middy from '@middy/core';
import type { Context } from 'aws-lambda';
import { z } from 'zod';
import {
  resolveLessonMediaBucketName,
  resolveVideoTranscodePipelineConfig,
} from '../lib/runtime-config.js';

export type { Context };

process.env.POWERTOOLS_METRICS_NAMESPACE = 'TranscodeVideo';
process.env.POWERTOOLS_SERVICE_NAME = 'TranscodeVideo';

const tracer = new Tracer();
const logger = new Logger();
const metrics = new Metrics();

// Mirrors the upload key format built by createContentItemVideoUploadUrl
// (packages/apis/instructor-api/src/procedures/content-item-video.ts):
// courses/<courseId>/modules/<moduleId>/lessons/<lessonId>/content-items/<contentItemId>.<ext>
const OBJECT_KEY_PATTERN =
  /^courses\/(?<courseId>[^/]+)\/modules\/(?<moduleId>[^/]+)\/lessons\/(?<lessonId>[^/]+)\/content-items\/(?<contentItemId>[^/.]+)\.[^/]+$/;

// MediaConvert's DescribeEndpoints-based account-endpoint discovery is
// deprecated -- requests can go straight to the regional endpoint now, so a
// plain client is enough (no per-account endpoint to resolve/cache).
const mediaConvertClient = new MediaConvertClient({});

export const transcodeVideo = async (
  event: z.infer<typeof S3Schema>,
): Promise<void> => {
  logger.info('Received event', event);

  const [{ roleArn, jobTemplateArn }, outputBucketName] = await Promise.all([
    resolveVideoTranscodePipelineConfig(),
    resolveLessonMediaBucketName(),
  ]);

  await Promise.all(
    event.Records.map(async (record) => {
      const bucketName = record.s3.bucket.name;
      const objectKey = decodeURIComponent(
        record.s3.object.key.replace(/\+/g, ' '),
      );

      const match = OBJECT_KEY_PATTERN.exec(objectKey);
      if (!match?.groups) {
        logger.warn('Ignoring object with an unrecognised key format', {
          bucketName,
          objectKey,
        });
        return;
      }
      const { courseId, moduleId, lessonId, contentItemId } = match.groups;

      // MediaConvert derives every output filename in the group from the
      // last path segment of `Destination` (the "base filename") --
      // "master" here is what makes the multivariant playlist come out as
      // master.m3u8, with renditions as master_1080p.m3u8 etc. alongside it.
      const destination = `s3://${outputBucketName}/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/${contentItemId}/master`;

      await mediaConvertClient.send(
        new CreateJobCommand({
          Role: roleArn,
          JobTemplate: jobTemplateArn,
          // rawObjectKey lets the completion callback delete the raw
          // upload without needing to guess its extension back from just
          // the 4 ids.
          UserMetadata: {
            courseId,
            moduleId,
            lessonId,
            contentItemId,
            rawObjectKey: objectKey,
          },
          Settings: {
            Inputs: [{ FileInput: `s3://${bucketName}/${objectKey}` }],
            OutputGroups: [
              {
                OutputGroupSettings: {
                  Type: 'HLS_GROUP_SETTINGS',
                  HlsGroupSettings: { Destination: destination },
                },
              },
            ],
          },
        }),
      );
    }),
  );
};

export const handler = middy()
  .use(captureLambdaHandler(tracer))
  .use(injectLambdaContext(logger))
  .use(logMetrics(metrics))
  .use(parser({ schema: S3Schema }))
  .handler(transcodeVideo);
