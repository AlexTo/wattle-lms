/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bestEffortDeleteContentItemVideos } from './s3-client.js';

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
  ListObjectsV2Command: vi.fn(function (input) {
    return { __command: 'ListObjectsV2', ...input };
  }),
  DeleteObjectsCommand: vi.fn(function (input) {
    return { __command: 'DeleteObjects', ...input };
  }),
}));

vi.mock('@aws-lambda-powertools/parameters/appconfig', () => ({
  getAppConfig,
}));

const MEDIA_BUCKET_NAME = 'lesson-media-bucket';
const UPLOAD_BUCKET_NAME = 'lesson-media-upload-bucket';

const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';
const LESSON_ID = 'lesson-1';

const readyItem = (contentItemId: string) => ({
  status: 'ready',
  s3Key: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${contentItemId}/master.m3u8`,
  courseId: COURSE_ID,
  moduleId: MODULE_ID,
  lessonId: LESSON_ID,
  contentItemId,
});

const pendingItem = (contentItemId: string, ext = 'mp4') => ({
  status: 'pending',
  s3Key: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${contentItemId}.${ext}`,
  courseId: COURSE_ID,
  moduleId: MODULE_ID,
  lessonId: LESSON_ID,
  contentItemId,
});

describe('bestEffortDeleteContentItemVideos', () => {
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
      return Promise.resolve({});
    });
    send.mockImplementation((command: any) => {
      if (command.__command === 'ListObjectsV2') {
        return Promise.resolve({
          Contents: [{ Key: command.Prefix + 'master.m3u8' }],
        });
      }
      return Promise.resolve({});
    });
  });

  it('does nothing when given no content items', async () => {
    await bestEffortDeleteContentItemVideos(undefined, []);
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes the whole content-item prefix from the media bucket for a ready item', async () => {
    await bestEffortDeleteContentItemVideos(undefined, [
      readyItem('content-item-1'),
    ]);

    const listCall = send.mock.calls.find(
      ([command]: any[]) => command.__command === 'ListObjectsV2',
    );
    expect(listCall![0]).toMatchObject({
      Bucket: MEDIA_BUCKET_NAME,
      Prefix: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/content-item-1/`,
    });

    const deleteCall = send.mock.calls.find(
      ([command]: any[]) => command.__command === 'DeleteObjects',
    );
    expect(deleteCall![0]).toMatchObject({
      Bucket: MEDIA_BUCKET_NAME,
      Delete: {
        Objects: [
          {
            Key: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/content-item-1/master.m3u8`,
          },
        ],
      },
    });
  });

  it('deletes the single raw object from the upload bucket for a non-ready item', async () => {
    const item = pendingItem('content-item-2');

    await bestEffortDeleteContentItemVideos(undefined, [item]);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        __command: 'DeleteObjects',
        Bucket: UPLOAD_BUCKET_NAME,
        Delete: { Objects: [{ Key: item.s3Key }] },
      }),
    );
  });

  it('batches ready and non-ready items into one delete call per bucket', async () => {
    await bestEffortDeleteContentItemVideos(undefined, [
      readyItem('content-item-1'),
      pendingItem('content-item-2'),
      pendingItem('content-item-3', 'webm'),
    ]);

    const deleteCalls = send.mock.calls.filter(
      ([command]: any[]) => command.__command === 'DeleteObjects',
    );
    expect(deleteCalls).toHaveLength(2);
    expect(
      deleteCalls.map(([command]: any[]) => command.Bucket).sort(),
    ).toEqual([MEDIA_BUCKET_NAME, UPLOAD_BUCKET_NAME].sort());
  });

  it('skips an item with no s3Key', async () => {
    await bestEffortDeleteContentItemVideos(undefined, [
      { ...pendingItem('content-item-4'), s3Key: undefined },
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  // Invariant: the DynamoDB record is the source of truth for whether a
  // piece of content exists, so a failure to delete its S3 object(s) must
  // never surface to (or fail) the caller.
  it('does not throw when the media bucket list fails', async () => {
    send.mockImplementation((command: any) => {
      if (command.__command === 'ListObjectsV2') {
        return Promise.reject(new Error('S3 is unavailable'));
      }
      return Promise.resolve({});
    });

    await expect(
      bestEffortDeleteContentItemVideos(undefined, [
        readyItem('content-item-1'),
      ]),
    ).resolves.toBeUndefined();
  });

  it('does not throw when a delete call fails, and logs it', async () => {
    send.mockImplementation((command: any) => {
      if (command.__command === 'DeleteObjects') {
        return Promise.reject(new Error('S3 is unavailable'));
      }
      return Promise.resolve({});
    });
    const logger = { error: vi.fn() };

    await expect(
      bestEffortDeleteContentItemVideos(logger as any, [
        pendingItem('content-item-2'),
      ]),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to delete lesson media objects from S3',
      expect.objectContaining({ bucket: UPLOAD_BUCKET_NAME }),
    );
  });

  it('tolerates a missing logger when a delete fails', async () => {
    send.mockRejectedValue(new Error('S3 is unavailable'));

    await expect(
      bestEffortDeleteContentItemVideos(undefined, [
        pendingItem('content-item-2'),
      ]),
    ).resolves.toBeUndefined();
  });
});
