/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transcodeComplete } from './transcode-complete.js';

const {
  contentItemPatch,
  contentItemPatchSet,
  contentItemPatchWhere,
  s3Send,
  resolveLessonMediaUploadBucketName,
} = vi.hoisted(() => ({
  contentItemPatch: vi.fn(),
  contentItemPatchSet: vi.fn(),
  contentItemPatchWhere: vi.fn(),
  s3Send: vi.fn(),
  resolveLessonMediaUploadBucketName: vi.fn(),
}));

vi.mock('@wattle/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      contentItem: {
        patch: contentItemPatch,
      },
    },
  })),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () {
    return { send: s3Send };
  }),
  DeleteObjectCommand: vi.fn(function (input) {
    return input;
  }),
}));

vi.mock('../lib/runtime-config.js', () => ({
  resolveLessonMediaUploadBucketName,
}));

const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';
const LESSON_ID = 'lesson-1';
const CONTENT_ITEM_ID = 'content-item-1';
const RAW_OBJECT_KEY = `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}.mp4`;
const UPLOAD_BUCKET_NAME = 'lesson-media-upload-bucket';
const JOB_ID = 'job-1';
const SUBMISSION_NONCE = 'nonce-1';

const buildEvent = (status: string, jobId: string = JOB_ID) => ({
  version: '0',
  id: 'event-1',
  source: 'aws.mediaconvert',
  account: 'test-account',
  time: '2024-01-01T00:00:00.000Z',
  region: 'ap-southeast-2',
  resources: [`arn:aws:mediaconvert:ap-southeast-2:test-account:jobs/${jobId}`],
  'detail-type': 'MediaConvert Job State Change',
  detail: {
    jobId,
    status,
    userMetadata: {
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      rawObjectKey: RAW_OBJECT_KEY,
      submissionNonce: SUBMISSION_NONCE,
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  resolveLessonMediaUploadBucketName.mockResolvedValue(UPLOAD_BUCKET_NAME);
  contentItemPatch.mockReturnValue({ set: contentItemPatchSet });
  contentItemPatchSet.mockReturnValue({ where: contentItemPatchWhere });
  contentItemPatchWhere.mockReturnValue({
    go: vi.fn().mockResolvedValue({}),
  });
  s3Send.mockResolvedValue({});
});

describe('transcodeComplete', () => {
  it('marks the content item ready and repoints s3Key on COMPLETE', async () => {
    await transcodeComplete(buildEvent('COMPLETE') as any);

    expect(contentItemPatch).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
    });
    expect(contentItemPatchSet).toHaveBeenCalledWith({
      status: 'ready',
      s3Key: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}/${SUBMISSION_NONCE}/master.m3u8`,
    });
  });

  // Must match submitTranscodeJob's Destination exactly, or a genuinely
  // completed job's output would never be found at the s3Key this stamps.
  it('scopes the repointed s3Key by the job own submissionNonce', async () => {
    const buildEventWithNonce = (nonce: string) => ({
      ...buildEvent('COMPLETE'),
      detail: {
        ...buildEvent('COMPLETE').detail,
        userMetadata: {
          ...buildEvent('COMPLETE').detail.userMetadata,
          submissionNonce: nonce,
        },
      },
    });

    await transcodeComplete(buildEventWithNonce('a-different-nonce') as any);

    expect(contentItemPatchSet).toHaveBeenCalledWith({
      status: 'ready',
      s3Key: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}/a-different-nonce/master.m3u8`,
    });
  });

  it('deletes the raw upload from the upload bucket on COMPLETE', async () => {
    await transcodeComplete(buildEvent('COMPLETE') as any);

    expect(s3Send).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: UPLOAD_BUCKET_NAME,
        Key: RAW_OBJECT_KEY,
      }),
    );
  });

  it('does not delete the raw upload when the DynamoDB patch fails', async () => {
    contentItemPatchWhere.mockReturnValue({
      go: vi.fn().mockRejectedValue(new Error('item does not exist')),
    });

    await transcodeComplete(buildEvent('COMPLETE') as any);

    expect(s3Send).not.toHaveBeenCalled();
  });

  it('includes a condition matching the record to the job that just completed', async () => {
    await transcodeComplete(buildEvent('COMPLETE') as any);

    const [whereCallback] = contentItemPatchWhere.mock.calls[0]!;
    const eq = vi.fn((attr: string, value: string) => `${attr} = ${value}`);
    const result = whereCallback(
      { mediaConvertJobId: 'mediaConvertJobId' },
      { eq },
    );

    expect(eq).toHaveBeenCalledWith('mediaConvertJobId', JOB_ID);
    expect(result).toBe(`mediaConvertJobId = ${JOB_ID}`);
  });

  it('does not mark the content item ready when a later replacement has superseded this job', async () => {
    contentItemPatchWhere.mockReturnValue({
      go: vi
        .fn()
        .mockRejectedValue(new Error('The conditional request failed')),
    });

    await transcodeComplete(buildEvent('COMPLETE', 'superseded-job') as any);

    expect(s3Send).not.toHaveBeenCalled();
  });

  it('swallows a raw upload delete failure so it does not crash the handler', async () => {
    s3Send.mockRejectedValue(new Error('S3 is unavailable'));

    await expect(
      transcodeComplete(buildEvent('COMPLETE') as any),
    ).resolves.toBeUndefined();
  });

  it('marks the content item failed and leaves the raw upload in place on ERROR', async () => {
    await transcodeComplete(buildEvent('ERROR') as any);

    expect(contentItemPatchSet).toHaveBeenCalledWith({ status: 'failed' });
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('includes a condition matching the record to the job that just errored', async () => {
    await transcodeComplete(buildEvent('ERROR') as any);

    const [whereCallback] = contentItemPatchWhere.mock.calls[0]!;
    const eq = vi.fn((attr: string, value: string) => `${attr} = ${value}`);
    const result = whereCallback(
      { mediaConvertJobId: 'mediaConvertJobId' },
      { eq },
    );

    expect(eq).toHaveBeenCalledWith('mediaConvertJobId', JOB_ID);
    expect(result).toBe(`mediaConvertJobId = ${JOB_ID}`);
  });

  it('swallows a patch failure so a deleted content item does not crash the handler', async () => {
    contentItemPatchWhere.mockReturnValue({
      go: vi.fn().mockRejectedValue(new Error('item does not exist')),
    });

    await expect(
      transcodeComplete(buildEvent('ERROR') as any),
    ).resolves.toBeUndefined();
  });

  it('ignores statuses other than COMPLETE or ERROR', async () => {
    await transcodeComplete(buildEvent('PROGRESSING') as any);

    expect(contentItemPatch).not.toHaveBeenCalled();
    expect(s3Send).not.toHaveBeenCalled();
  });
});
