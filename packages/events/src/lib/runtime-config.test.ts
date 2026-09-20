/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAppConfig } = vi.hoisted(() => ({
  getAppConfig: vi.fn(),
}));

vi.mock('@aws-lambda-powertools/parameters/appconfig', () => ({
  getAppConfig,
}));

// Each resolver caches its resolved value at module scope, so reusing one
// import across tests with different mock setups would leak the first
// successful resolution into later tests -- reset and re-import per test.
const importFreshModule = async () => {
  vi.resetModules();
  return import('./runtime-config.js');
};

const MEDIA_BUCKET_NAME = 'lesson-media-bucket';
const UPLOAD_BUCKET_NAME = 'lesson-media-upload-bucket';
const ROLE_ARN = 'arn:aws:iam::123456789012:role/MediaConvert';
const JOB_TEMPLATE_ARN =
  'arn:aws:mediaconvert:ap-southeast-2:123456789012:jobTemplates/template';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RUNTIME_CONFIG_APP_ID = 'app-1';
  getAppConfig.mockImplementation((namespace: string) => {
    if (namespace === 's3') {
      return Promise.resolve({
        LessonMediaBucket: { bucketName: MEDIA_BUCKET_NAME },
        LessonMediaUploadBucket: { bucketName: UPLOAD_BUCKET_NAME },
      });
    }
    if (namespace === 'mediaConvert') {
      return Promise.resolve({
        VideoTranscodePipeline: {
          roleArn: ROLE_ARN,
          jobTemplateArn: JOB_TEMPLATE_ARN,
        },
      });
    }
    return Promise.resolve({});
  });
});

describe('resolveLessonMediaBucketName', () => {
  it('resolves the bucket name from the s3 namespace', async () => {
    const { resolveLessonMediaBucketName } = await importFreshModule();

    await expect(resolveLessonMediaBucketName()).resolves.toBe(
      MEDIA_BUCKET_NAME,
    );
  });

  it('caches the resolved value across calls', async () => {
    const { resolveLessonMediaBucketName } = await importFreshModule();

    await resolveLessonMediaBucketName();
    await resolveLessonMediaBucketName();

    expect(getAppConfig).toHaveBeenCalledTimes(1);
  });

  it('throws when RUNTIME_CONFIG_APP_ID is not set', async () => {
    delete process.env.RUNTIME_CONFIG_APP_ID;
    const { resolveLessonMediaBucketName } = await importFreshModule();

    await expect(resolveLessonMediaBucketName()).rejects.toThrow(
      'RUNTIME_CONFIG_APP_ID environment variable is not set',
    );
  });

  it('throws when the key is missing from runtime config', async () => {
    getAppConfig.mockResolvedValue({});
    const { resolveLessonMediaBucketName } = await importFreshModule();

    await expect(resolveLessonMediaBucketName()).rejects.toThrow(
      'Could not resolve s3.LessonMediaBucket from runtime config',
    );
  });
});

describe('resolveLessonMediaUploadBucketName', () => {
  it('resolves the upload bucket name from the s3 namespace', async () => {
    const { resolveLessonMediaUploadBucketName } = await importFreshModule();

    await expect(resolveLessonMediaUploadBucketName()).resolves.toBe(
      UPLOAD_BUCKET_NAME,
    );
  });
});

describe('resolveVideoTranscodePipelineConfig', () => {
  it('resolves the role and job template ARNs from the mediaConvert namespace', async () => {
    const { resolveVideoTranscodePipelineConfig } = await importFreshModule();

    await expect(resolveVideoTranscodePipelineConfig()).resolves.toEqual({
      roleArn: ROLE_ARN,
      jobTemplateArn: JOB_TEMPLATE_ARN,
    });
  });
});
