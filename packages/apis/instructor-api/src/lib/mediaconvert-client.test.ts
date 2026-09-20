/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitTranscodeJob } from './mediaconvert-client.js';

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
    return input;
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
        },
      }),
    );
    const [command] = mediaConvertSend.mock.calls[0]!;
    expect(command.Settings.Inputs).toEqual([
      { FileInput: `s3://${UPLOAD_BUCKET_NAME}/${OBJECT_KEY}` },
    ]);
    expect(
      command.Settings.OutputGroups[0].OutputGroupSettings.HlsGroupSettings
        .Destination,
    ).toBe(
      `s3://${MEDIA_BUCKET_NAME}/courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}/master`,
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
      }),
    ).rejects.toThrow('MediaConvert CreateJob response is missing Job.Id');
  });
});
