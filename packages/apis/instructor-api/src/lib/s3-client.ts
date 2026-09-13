/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Logger } from '@aws-lambda-powertools/logger';
import { getAppConfig } from '@aws-lambda-powertools/parameters/appconfig';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

let _client: S3Client | undefined;

export const getS3Client = (): S3Client => {
  if (!_client) {
    _client = new S3Client({});
  }
  return _client;
};

const runtimeConfigKey = 'LessonMediaBucket';

type S3Config = {
  bucketName: string;
};

let _bucketName: string | undefined;

export const resolveLessonMediaBucketName = async (): Promise<string> => {
  if (_bucketName === undefined) {
    const appId = process.env.RUNTIME_CONFIG_APP_ID;
    if (!appId) {
      throw new Error('RUNTIME_CONFIG_APP_ID environment variable is not set');
    }
    const config = await getAppConfig<{
      [key: string]: S3Config | undefined;
    }>('s3', {
      application: appId,
      environment: 'default',
      transform: 'json',
    });
    const bucketName = config?.[runtimeConfigKey]?.bucketName;
    if (!bucketName) {
      throw new Error('Could not resolve bucket name from runtime config');
    }
    _bucketName = bucketName;
  }
  return _bucketName!;
};

/**
 * Deletes lesson media objects from S3, one request per key, swallowing
 * (and logging) any individual failure. The DynamoDB record is always the
 * source of truth for whether a piece of content exists, so a failure to
 * clean up its underlying S3 object must never fail the caller's mutation.
 */
export const bestEffortDeleteS3Objects = async (
  logger: Logger | undefined,
  s3Keys: string[],
): Promise<void> => {
  if (s3Keys.length === 0) {
    return;
  }
  const bucket = await resolveLessonMediaBucketName();
  await Promise.all(
    s3Keys.map(async (key) => {
      try {
        await getS3Client().send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        );
      } catch (error) {
        logger?.error('Failed to delete lesson media object from S3', {
          error,
          s3Key: key,
        });
      }
    }),
  );
};
