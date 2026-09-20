/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  CreateJobCommand,
  MediaConvertClient,
} from '@aws-sdk/client-mediaconvert';
import { resolveAppConfigValue } from './runtime-config.js';
import {
  resolveLessonMediaBucketName,
  resolveLessonMediaUploadBucketName,
} from './s3-client.js';

// MediaConvert's DescribeEndpoints-based account-endpoint discovery is
// deprecated -- requests can go straight to the regional endpoint now, so a
// plain client is enough (no per-account endpoint to resolve/cache).
let _client: MediaConvertClient | undefined;

const getMediaConvertClient = (): MediaConvertClient => {
  if (!_client) {
    _client = new MediaConvertClient({});
  }
  return _client;
};

type VideoTranscodePipelineConfig = {
  roleArn: string;
  jobTemplateArn: string;
};

const resolveVideoTranscodePipelineConfig =
  (): Promise<VideoTranscodePipelineConfig> =>
    resolveAppConfigValue<VideoTranscodePipelineConfig>(
      'mediaConvert',
      'VideoTranscodePipeline',
    );

/**
 * Submits a MediaConvert job transcoding a just-uploaded video into HLS.
 * Called from createContentItemVideo/updateContentItemVideo only after the
 * DynamoDB record they write has been created/updated, so the completion
 * callback that later patches that record can never fire first. Returns the
 * new job's id so the caller can stamp it onto that same record --
 * transcode-complete.ts uses it to ignore a stale completion event from a
 * job a later replacement has since superseded.
 */
export const submitTranscodeJob = async ({
  courseId,
  moduleId,
  lessonId,
  contentItemId,
  objectKey,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItemId: string;
  objectKey: string;
}): Promise<string> => {
  const [{ roleArn, jobTemplateArn }, uploadBucketName, mediaBucketName] =
    await Promise.all([
      resolveVideoTranscodePipelineConfig(),
      resolveLessonMediaUploadBucketName(),
      resolveLessonMediaBucketName(),
    ]);

  // MediaConvert derives every output filename in the group from the last
  // path segment of `Destination` (the "base filename") -- "master" here is
  // what makes the multivariant playlist come out as master.m3u8, with
  // renditions as master_1080p.m3u8 etc. alongside it.
  const destination = `s3://${mediaBucketName}/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/${contentItemId}/master`;

  const { Job } = await getMediaConvertClient().send(
    new CreateJobCommand({
      Role: roleArn,
      JobTemplate: jobTemplateArn,
      // rawObjectKey lets the completion callback delete the raw upload
      // without needing to guess its extension back from just the 4 ids.
      UserMetadata: {
        courseId,
        moduleId,
        lessonId,
        contentItemId,
        rawObjectKey: objectKey,
      },
      Settings: {
        Inputs: [{ FileInput: `s3://${uploadBucketName}/${objectKey}` }],
        OutputGroups: [
          {
            OutputGroupSettings: {
              Type: 'HLS_GROUP_SETTINGS',
              HlsGroupSettings: { Destination: destination },
            },
          },
        ],
      },
    }),
  );

  if (!Job?.Id) {
    throw new Error('MediaConvert CreateJob response is missing Job.Id');
  }

  return Job.Id;
};
