/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getAppConfig } from '@aws-lambda-powertools/parameters/appconfig';

type S3Config = {
  bucketName: string;
};

type MediaConvertConfig = {
  roleArn: string;
  jobTemplateArn: string;
};

const resolveAppConfigValue = (() => {
  const cache = new Map<string, unknown>();
  return async <T>(namespace: string, key: string): Promise<T> => {
    const cacheKey = `${namespace}.${key}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached as T;
    }
    const appId = process.env.RUNTIME_CONFIG_APP_ID;
    if (!appId) {
      throw new Error('RUNTIME_CONFIG_APP_ID environment variable is not set');
    }
    const config = await getAppConfig<{ [k: string]: T | undefined }>(
      namespace,
      {
        application: appId,
        environment: 'default',
        transform: 'json',
      },
    );
    const value = config?.[key];
    if (!value) {
      throw new Error(
        `Could not resolve ${namespace}.${key} from runtime config`,
      );
    }
    cache.set(cacheKey, value);
    return value;
  };
})();

export const resolveLessonMediaBucketName = async (): Promise<string> =>
  (await resolveAppConfigValue<S3Config>('s3', 'LessonMediaBucket')).bucketName;

export const resolveLessonMediaUploadBucketName = async (): Promise<string> =>
  (await resolveAppConfigValue<S3Config>('s3', 'LessonMediaUploadBucket'))
    .bucketName;

export const resolveVideoTranscodePipelineConfig =
  async (): Promise<MediaConvertConfig> =>
    resolveAppConfigValue<MediaConvertConfig>(
      'mediaConvert',
      'VideoTranscodePipeline',
    );
