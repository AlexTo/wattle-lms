/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Logger } from '@aws-lambda-powertools/logger';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { resolveAppConfigValue } from './runtime-config.js';

let _client: S3Client | undefined;

export const getS3Client = (): S3Client => {
  if (!_client) {
    _client = new S3Client({});
  }
  return _client;
};

type S3Config = {
  bucketName: string;
};

const resolveBucketName = async (runtimeConfigKey: string): Promise<string> =>
  (await resolveAppConfigValue<S3Config>('s3', runtimeConfigKey)).bucketName;

export const resolveLessonMediaBucketName = (): Promise<string> =>
  resolveBucketName('LessonMediaBucket');

// The raw, untranscoded upload -- never served directly, see decision log
// in #110. createContentItemVideoUploadUrl targets this bucket instead of
// LessonMediaBucket; createContentItemVideo/updateContentItemVideo submit
// the transcode job that eventually moves the finished object over and
// deletes the raw one (see lib/mediaconvert-client.ts).
export const resolveLessonMediaUploadBucketName = (): Promise<string> =>
  resolveBucketName('LessonMediaUploadBucket');

export type IDeletableVideoContentItem = {
  status: string;
  s3Key?: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItemId: string;
};

/**
 * Best-effort deletes one or more video content items' underlying S3
 * object(s) -- a single item for a direct delete/replace, or several at
 * once for a lesson/module cascade delete. Failures are logged, never
 * thrown: the DynamoDB record is always the source of truth for whether a
 * piece of content exists, so a failure to clean up here must never fail
 * the caller's mutation.
 *
 * Which bucket holds an item's object(s) depends on its `status`: a
 * `'ready'` item's `s3Key` is its HLS manifest in LessonMediaBucket,
 * alongside segment files that aren't individually tracked, so the whole
 * `.../content-items/<contentItemId>/` prefix is deleted; any other status
 * means `s3Key` is still the single raw upload in LessonMediaUploadBucket.
 */
export const bestEffortDeleteContentItemVideos = async (
  logger: Logger | undefined,
  contentItems: readonly IDeletableVideoContentItem[],
): Promise<void> => {
  const readyItems = contentItems.filter(
    (item) => item.status === 'ready' && item.s3Key,
  );
  const rawKeys = contentItems
    .filter((item) => item.status !== 'ready' && item.s3Key)
    .map((item) => item.s3Key!);

  if (readyItems.length > 0) {
    const bucket = await resolveLessonMediaBucketName();
    const keysToDelete: string[] = [];
    await Promise.all(
      readyItems.map(async (item) => {
        const prefix = `courses/${item.courseId}/modules/${item.moduleId}/lessons/${item.lessonId}/content-items/${item.contentItemId}/`;
        try {
          const { Contents } = await getS3Client().send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
          );
          for (const object of Contents ?? []) {
            if (object.Key !== undefined) {
              keysToDelete.push(object.Key);
            }
          }
        } catch (error) {
          logger?.error('Failed to list lesson media objects from S3', {
            error,
            bucket,
            prefix,
          });
        }
      }),
    );
    if (keysToDelete.length > 0) {
      try {
        await getS3Client().send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keysToDelete.map((Key) => ({ Key })) },
          }),
        );
      } catch (error) {
        logger?.error('Failed to delete lesson media objects from S3', {
          error,
          bucket,
          keys: keysToDelete,
        });
      }
    }
  }

  if (rawKeys.length > 0) {
    const bucket = await resolveLessonMediaUploadBucketName();
    try {
      await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: rawKeys.map((Key) => ({ Key })) },
        }),
      );
    } catch (error) {
      logger?.error('Failed to delete lesson media objects from S3', {
        error,
        bucket,
        keys: rawKeys,
      });
    }
  }
};
