/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bestEffortCancelTranscodeJob,
  bestEffortCancelTranscodeJobs,
  submitTranscodeJob,
} from './mediaconvert-client.js';

const {
  mediaConvertSend,
  resolveAppConfigValue,
  resolveLessonMediaBucketName,
  resolveLessonMediaUploadBucketName,
} = vi.hoisted(() => ({
  mediaConvertSend: vi.fn(),
  resolveAppConfigValue: vi.fn(),
  resolveLessonMediaBucketName: vi.fn(),
  resolveLessonMediaUploadBucketName: vi.fn(),
}));

vi.mock('@aws-sdk/client-mediaconvert', () => ({
  MediaConvertClient: vi.fn(function () {
    return { send: mediaConvertSend };
  }),
  CreateJobCommand: vi.fn(function (input) {
    return { __command: 'CreateJob', ...input };
  }),
  CancelJobCommand: vi.fn(function (input) {
    return { __command: 'CancelJob', ...input };
  }),
}));

vi.mock('./runtime-config.js', () => ({
  resolveAppConfigValue,
}));

vi.mock('./s3-client.js', () => ({
  resolveLessonMediaBucketName,
  resolveLessonMediaUploadBucketName,
}));

const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';
const LESSON_ID = 'lesson-1';
const CONTENT_ITEM_ID = 'content-item-1';
const OBJECT_KEY = `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}.mp4`;
const SUBMISSION_NONCE = 'nonce-1';
const UPLOAD_BUCKET_NAME = 'lesson-media-upload-bucket';
const MEDIA_BUCKET_NAME = 'lesson-media-bucket';
const ROLE_ARN = 'arn:aws:iam::123456789012:role/MediaConvert';
const JOB_TEMPLATE_ARN =
  'arn:aws:mediaconvert:ap-southeast-2:123456789012:jobTemplates/template';

beforeEach(() => {
  vi.clearAllMocks();
  resolveAppConfigValue.mockResolvedValue({
    roleArn: ROLE_ARN,
    jobTemplateArn: JOB_TEMPLATE_ARN,
  });
  resolveLessonMediaUploadBucketName.mockResolvedValue(UPLOAD_BUCKET_NAME);
  resolveLessonMediaBucketName.mockResolvedValue(MEDIA_BUCKET_NAME);
  mediaConvertSend.mockResolvedValue({ Job: { Id: 'job-1' } });
});

describe('submitTranscodeJob', () => {
  it('submits a job referencing the resolved role, template, and bucket locations', async () => {
    const jobId = await submitTranscodeJob({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      objectKey: OBJECT_KEY,
      submissionNonce: SUBMISSION_NONCE,
    });

    expect(jobId).toBe('job-1');
    expect(resolveAppConfigValue).toHaveBeenCalledWith(
      'mediaConvert',
      'VideoTranscodePipeline',
    );
    expect(mediaConvertSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Role: ROLE_ARN,
        JobTemplate: JOB_TEMPLATE_ARN,
        UserMetadata: {
          courseId: COURSE_ID,
          moduleId: MODULE_ID,
          lessonId: LESSON_ID,
          contentItemId: CONTENT_ITEM_ID,
          rawObjectKey: OBJECT_KEY,
          submissionNonce: SUBMISSION_NONCE,
        },
      }),
    );
    const [command] = mediaConvertSend.mock.calls[0]!;
    expect(command.Settings.Inputs).toEqual([
      {
        FileInput: `s3://${UPLOAD_BUCKET_NAME}/${OBJECT_KEY}`,
        AudioSelectors: {
          'Audio Selector 1': { DefaultSelection: 'DEFAULT' },
        },
        TimecodeSource: 'ZEROBASED',
      },
    ]);
    expect(
      command.Settings.OutputGroups[0].OutputGroupSettings.HlsGroupSettings
        .Destination,
    ).toBe(
      `s3://${MEDIA_BUCKET_NAME}/courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}/${SUBMISSION_NONCE}/master`,
    );
  });

  // Two submissions for the same content item -- e.g. a canceled job and
  // the replacement that superseded it -- must never write to the same S3
  // destination, or one job's output can end up mixed in with the
  // other's leftovers. Scoping by submissionNonce (not just
  // contentItemId) guarantees that: it's the one thing durably decided
  // before either job exists, and it's always different across two
  // genuinely different submissions.
  it('scopes the S3 destination by submissionNonce, not just contentItemId', async () => {
    await submitTranscodeJob({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      objectKey: OBJECT_KEY,
      submissionNonce: SUBMISSION_NONCE,
    });
    const [firstCall] = mediaConvertSend.mock.calls[0]!;

    mediaConvertSend.mockClear();
    await submitTranscodeJob({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      objectKey: OBJECT_KEY,
      submissionNonce: 'a-different-nonce',
    });
    const [secondCall] = mediaConvertSend.mock.calls[0]!;

    const firstDestination =
      firstCall.Settings.OutputGroups[0].OutputGroupSettings.HlsGroupSettings
        .Destination;
    const secondDestination =
      secondCall.Settings.OutputGroups[0].OutputGroupSettings.HlsGroupSettings
        .Destination;
    expect(firstDestination).toContain(SUBMISSION_NONCE);
    expect(secondDestination).toContain('a-different-nonce');
    expect(firstDestination).not.toBe(secondDestination);
  });

  // A retry of the same tRPC mutation (e.g. after a client-side timeout,
  // even though the original call actually succeeded) passes back the
  // exact same submissionNonce its record already has recorded -- CreateJob
  // must see the same ClientRequestToken both times so MediaConvert dedupes
  // it, rather than starting a redundant job.
  it('derives a stable ClientRequestToken from contentItemId and submissionNonce', async () => {
    await submitTranscodeJob({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      objectKey: OBJECT_KEY,
      submissionNonce: SUBMISSION_NONCE,
    });
    const [firstCall] = mediaConvertSend.mock.calls[0]!;

    mediaConvertSend.mockClear();
    await submitTranscodeJob({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      objectKey: OBJECT_KEY,
      submissionNonce: SUBMISSION_NONCE,
    });
    const [secondCall] = mediaConvertSend.mock.calls[0]!;

    expect(firstCall.ClientRequestToken).toBeTruthy();
    expect(firstCall.ClientRequestToken).toBe(secondCall.ClientRequestToken);
  });

  // A genuinely new submission always gets a fresh nonce from the caller
  // (see content-item-video.ts) -- this just confirms the token actually
  // changes when the nonce does, so two unrelated submissions can never
  // collide with each other no matter how identical their uploaded content
  // happens to be.
  it('derives a different ClientRequestToken for a different submissionNonce', async () => {
    await submitTranscodeJob({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      objectKey: OBJECT_KEY,
      submissionNonce: SUBMISSION_NONCE,
    });
    const [firstCall] = mediaConvertSend.mock.calls[0]!;

    mediaConvertSend.mockClear();
    await submitTranscodeJob({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      objectKey: OBJECT_KEY,
      submissionNonce: 'a-different-nonce',
    });
    const [secondCall] = mediaConvertSend.mock.calls[0]!;

    expect(firstCall.ClientRequestToken).not.toBe(
      secondCall.ClientRequestToken,
    );
  });

  it('propagates a failure to resolve the runtime config', async () => {
    resolveAppConfigValue.mockRejectedValue(
      new Error('RUNTIME_CONFIG_APP_ID environment variable is not set'),
    );

    await expect(
      submitTranscodeJob({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        lessonId: LESSON_ID,
        contentItemId: CONTENT_ITEM_ID,
        objectKey: OBJECT_KEY,
        submissionNonce: SUBMISSION_NONCE,
      }),
    ).rejects.toThrow();
    expect(mediaConvertSend).not.toHaveBeenCalled();
  });

  it('propagates a MediaConvert CreateJob failure', async () => {
    mediaConvertSend.mockRejectedValue(
      new Error('MediaConvert is unavailable'),
    );

    await expect(
      submitTranscodeJob({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        lessonId: LESSON_ID,
        contentItemId: CONTENT_ITEM_ID,
        objectKey: OBJECT_KEY,
        submissionNonce: SUBMISSION_NONCE,
      }),
    ).rejects.toThrow('MediaConvert is unavailable');
  });

  it('throws when the CreateJob response is missing Job.Id', async () => {
    mediaConvertSend.mockResolvedValue({ Job: {} });

    await expect(
      submitTranscodeJob({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        lessonId: LESSON_ID,
        contentItemId: CONTENT_ITEM_ID,
        objectKey: OBJECT_KEY,
        submissionNonce: SUBMISSION_NONCE,
      }),
    ).rejects.toThrow('MediaConvert CreateJob response is missing Job.Id');
  });
});

describe('bestEffortCancelTranscodeJob', () => {
  it('cancels the given job', async () => {
    mediaConvertSend.mockResolvedValue({});

    await bestEffortCancelTranscodeJob(undefined, 'job-1');

    expect(mediaConvertSend).toHaveBeenCalledWith(
      expect.objectContaining({ __command: 'CancelJob', Id: 'job-1' }),
    );
  });

  it('swallows a cancel failure and logs it', async () => {
    mediaConvertSend.mockRejectedValue(new Error('job already completed'));
    const logger = { error: vi.fn() };

    await expect(
      bestEffortCancelTranscodeJob(logger as any, 'job-1'),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to cancel transcode job',
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

  it('tolerates a missing logger when cancellation fails', async () => {
    mediaConvertSend.mockRejectedValue(new Error('job already completed'));

    await expect(
      bestEffortCancelTranscodeJob(undefined, 'job-1'),
    ).resolves.toBeUndefined();
  });
});

describe('bestEffortCancelTranscodeJobs', () => {
  it('cancels only pending items that have a job id', async () => {
    mediaConvertSend.mockResolvedValue({});

    await bestEffortCancelTranscodeJobs(undefined, [
      { status: 'pending', mediaConvertJobId: 'job-1' },
      { status: 'ready', mediaConvertJobId: 'job-2' },
      { status: 'pending', mediaConvertJobId: undefined },
      { status: 'failed', mediaConvertJobId: 'job-3' },
    ]);

    expect(mediaConvertSend).toHaveBeenCalledTimes(1);
    expect(mediaConvertSend).toHaveBeenCalledWith(
      expect.objectContaining({ __command: 'CancelJob', Id: 'job-1' }),
    );
  });

  it('does nothing when given no cancelable items', async () => {
    await bestEffortCancelTranscodeJobs(undefined, [
      { status: 'ready', mediaConvertJobId: 'job-1' },
    ]);

    expect(mediaConvertSend).not.toHaveBeenCalled();
  });
});
