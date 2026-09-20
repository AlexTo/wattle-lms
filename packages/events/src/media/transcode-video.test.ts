/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transcodeVideo } from './transcode-video.js';

const {
  mediaConvertSend,
  resolveVideoTranscodePipelineConfig,
  resolveLessonMediaBucketName,
} = vi.hoisted(() => ({
  mediaConvertSend: vi.fn(),
  resolveVideoTranscodePipelineConfig: vi.fn(),
  resolveLessonMediaBucketName: vi.fn(),
}));

vi.mock('@aws-sdk/client-mediaconvert', () => ({
  MediaConvertClient: vi.fn(function () {
    return { send: mediaConvertSend };
  }),
  CreateJobCommand: vi.fn(function (input) {
    return { __command: 'CreateJob', ...input };
  }),
}));

vi.mock('../lib/runtime-config.js', () => ({
  resolveVideoTranscodePipelineConfig,
  resolveLessonMediaBucketName,
}));

const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';
const LESSON_ID = 'lesson-1';
const CONTENT_ITEM_ID = 'content-item-1';
const SOURCE_BUCKET = 'lesson-media-upload-bucket';
const OBJECT_KEY = `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}.mp4`;
const ROLE_ARN = 'arn:aws:iam::123456789012:role/MediaConvert';
const JOB_TEMPLATE_ARN =
  'arn:aws:mediaconvert:ap-southeast-2:123456789012:jobTemplates/template';
const MEDIA_BUCKET_NAME = 'lesson-media-bucket';

const buildEvent = (objectKey: string) => ({
  Records: [
    {
      eventVersion: '2.1',
      eventSource: 'aws:s3' as const,
      awsRegion: 'ap-southeast-2',
      eventTime: '2024-01-01T00:00:00.000Z',
      eventName: 'ObjectCreated:Put',
      userIdentity: { principalId: 'AWS:principal' },
      requestParameters: { sourceIPAddress: '1.2.3.4' },
      responseElements: {
        'x-amz-request-id': 'req-id',
        'x-amz-id-2': 'id-2',
      },
      s3: {
        s3SchemaVersion: '1.0',
        configurationId: 'config-1',
        bucket: {
          name: SOURCE_BUCKET,
          ownerIdentity: { principalId: 'AWS:owner' },
          arn: `arn:aws:s3:::${SOURCE_BUCKET}`,
        },
        object: { key: objectKey },
      },
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  resolveVideoTranscodePipelineConfig.mockResolvedValue({
    roleArn: ROLE_ARN,
    jobTemplateArn: JOB_TEMPLATE_ARN,
  });
  resolveLessonMediaBucketName.mockResolvedValue(MEDIA_BUCKET_NAME);
  mediaConvertSend.mockResolvedValue({ Job: { Id: 'job-1' } });
});

describe('transcodeVideo', () => {
  it('submits a MediaConvert job referencing the job template, with ids parsed from the key', async () => {
    await transcodeVideo(buildEvent(OBJECT_KEY));

    const createJobCall = mediaConvertSend.mock.calls.find(
      ([command]: any[]) => command.__command === 'CreateJob',
    );
    expect(createJobCall).toBeDefined();
    const [command] = createJobCall!;
    expect(command.Role).toBe(ROLE_ARN);
    expect(command.JobTemplate).toBe(JOB_TEMPLATE_ARN);
    expect(command.UserMetadata).toEqual({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
      rawObjectKey: OBJECT_KEY,
    });
    expect(command.Settings.Inputs).toEqual([
      { FileInput: `s3://${SOURCE_BUCKET}/${OBJECT_KEY}` },
    ]);
    expect(
      command.Settings.OutputGroups[0].OutputGroupSettings.HlsGroupSettings
        .Destination,
    ).toBe(
      `s3://${MEDIA_BUCKET_NAME}/courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}/master`,
    );
  });

  it('ignores an object whose key does not match the expected format', async () => {
    await transcodeVideo(buildEvent('unexpected/key.mp4'));

    const createJobCalls = mediaConvertSend.mock.calls.filter(
      ([command]: any[]) => command.__command === 'CreateJob',
    );
    expect(createJobCalls).toHaveLength(0);
  });

  it('propagates a failure to resolve the runtime config', async () => {
    resolveVideoTranscodePipelineConfig.mockRejectedValue(
      new Error('RUNTIME_CONFIG_APP_ID environment variable is not set'),
    );

    await expect(transcodeVideo(buildEvent(OBJECT_KEY))).rejects.toThrow();
  });
});
