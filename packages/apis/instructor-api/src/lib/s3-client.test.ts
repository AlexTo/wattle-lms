/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bestEffortDeleteS3Objects } from './s3-client.js';

const { send, getAppConfig } = vi.hoisted(() => ({
  send: vi.fn(),
  getAppConfig: vi.fn(),
}));

// Plain function expressions, not arrow functions: S3Client is constructed
// with `new` in s3-client.ts, and arrow functions can never be
// constructors.
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () {
    return { send };
  }),
  DeleteObjectCommand: vi.fn(function (input) {
    return input;
  }),
}));

vi.mock('@aws-lambda-powertools/parameters/appconfig', () => ({
  getAppConfig,
}));

const BUCKET_NAME = 'lesson-media-bucket';

describe('bestEffortDeleteS3Objects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RUNTIME_CONFIG_APP_ID = 'app-1';
    getAppConfig.mockResolvedValue({
      LessonMediaBucket: { bucketName: BUCKET_NAME },
    });
    send.mockResolvedValue({});
  });

  it('does nothing when given no keys', async () => {
    await bestEffortDeleteS3Objects(undefined, []);
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes every key from the lesson media bucket', async () => {
    await bestEffortDeleteS3Objects(undefined, [
      'lessons/a.mp4',
      'lessons/b.mp4',
    ]);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: BUCKET_NAME, Key: 'lessons/a.mp4' }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: BUCKET_NAME, Key: 'lessons/b.mp4' }),
    );
  });

  // Invariant: the DynamoDB record is the source of truth for whether a
  // piece of content exists, so a failure to delete its S3 object must
  // never surface to (or fail) the caller.
  it('does not throw when a delete fails, and still attempts the rest', async () => {
    send.mockRejectedValueOnce(new Error('S3 is unavailable'));
    send.mockResolvedValueOnce({});

    await expect(
      bestEffortDeleteS3Objects(undefined, ['lessons/a.mp4', 'lessons/b.mp4']),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('logs each failure with its s3Key', async () => {
    const error = new Error('S3 is unavailable');
    send.mockRejectedValue(error);
    const logger = { error: vi.fn() };

    await bestEffortDeleteS3Objects(logger as any, ['lessons/a.mp4']);

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to delete lesson media object from S3',
      { error, s3Key: 'lessons/a.mp4' },
    );
  });

  it('tolerates a missing logger when a delete fails', async () => {
    send.mockRejectedValue(new Error('S3 is unavailable'));

    await expect(
      bestEffortDeleteS3Objects(undefined, ['lessons/a.mp4']),
    ).resolves.toBeUndefined();
  });
});
