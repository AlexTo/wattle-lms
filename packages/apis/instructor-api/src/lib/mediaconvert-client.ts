/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash } from 'node:crypto';
import type { Logger } from '@aws-lambda-powertools/logger';
import {
  CancelJobCommand,
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
 *
 * `submissionNonce` becomes MediaConvert's `ClientRequestToken`. It's the
 * caller's own durable record of "is this the same submission attempt as
 * before" (see content-item-video.ts), not a fingerprint of the uploaded
 * file -- a caller retrying this exact mutation after a crash (e.g. the
 * process died after this function returned but before the caller could
 * stamp the job id onto its record) passes back the *same* nonce it
 * already persisted, so CreateJob recognizes the token it already handled
 * and returns the existing job instead of starting a redundant one. A
 * genuinely new submission always gets a fresh nonce from the caller, so
 * it can never collide with anything, no matter how much time has passed
 * or how identical the uploaded content happens to be to something past.
 * (An earlier version derived this token from the raw upload's S3 ETag
 * instead -- abandoned because MediaConvert's own token-reuse window
 * turned out to be far less bounded in practice than documented, so a
 * coincidental content match could dedupe onto an unrelated, long-dead
 * job. The nonce sidesteps that entirely by never depending on content.)
 */
export const submitTranscodeJob = async ({
  courseId,
  moduleId,
  lessonId,
  contentItemId,
  objectKey,
  submissionNonce,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItemId: string;
  objectKey: string;
  submissionNonce: string;
}): Promise<string> => {
  const [{ roleArn, jobTemplateArn }, uploadBucketName, mediaBucketName] =
    await Promise.all([
      resolveVideoTranscodePipelineConfig(),
      resolveLessonMediaUploadBucketName(),
      resolveLessonMediaBucketName(),
    ]);

  // Scoped by submissionNonce, not just contentItemId: every submission
  // attempt (including one a cancellation supersedes) writes to its own
  // subdirectory, so a canceled job's in-flight writes never share a path
  // with -- and can never be confused for -- the job that replaces it.
  // MediaConvert's own job id can't serve this role: it doesn't exist
  // until after CreateJob returns, by which point Destination has already
  // had to be specified. MediaConvert derives every output filename in the
  // group from the last path segment of `Destination` (the "base
  // filename") -- "master" here is what makes the multivariant playlist
  // come out as master.m3u8, with renditions as master_1080p.m3u8 etc.
  // alongside it.
  const destination = `s3://${mediaBucketName}/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/${contentItemId}/${submissionNonce}/master`;

  // ClientRequestToken caps out at 64 ASCII characters; hashing keeps this
  // well within that regardless of contentItemId/nonce length.
  const clientRequestToken = createHash('sha256')
    .update(`${contentItemId}:${submissionNonce}`)
    .digest('hex')
    .slice(0, 32);

  const { Job } = await getMediaConvertClient().send(
    new CreateJobCommand({
      ClientRequestToken: clientRequestToken,
      Role: roleArn,
      JobTemplate: jobTemplateArn,
      // rawObjectKey lets the completion callback delete the raw upload
      // without needing to guess its extension back from just the 4 ids.
      // submissionNonce lets it reconstruct this same job's nonce-scoped
      // manifest path without needing to parse Destination back out of
      // the job's own settings.
      UserMetadata: {
        courseId,
        moduleId,
        lessonId,
        contentItemId,
        rawObjectKey: objectKey,
        submissionNonce,
      },
      Settings: {
        // AudioSelectors/TimecodeSource are per-input, not settable on the
        // job template (MediaConvert's CreateJobTemplate API rejects an
        // Inputs property outright) -- 'Audio Selector 1' is what every
        // rendition's AudioDescriptions.AudioSourceName in the template
        // refers to, so it must be defined here on the job's own input.
        Inputs: [
          {
            FileInput: `s3://${uploadBucketName}/${objectKey}`,
            AudioSelectors: {
              'Audio Selector 1': { DefaultSelection: 'DEFAULT' },
            },
            TimecodeSource: 'ZEROBASED',
          },
        ],
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

/**
 * Cancels a MediaConvert job that no longer has anywhere to report to --
 * either a replacement upload has superseded it, or the content item it was
 * transcoding for has been deleted -- best-effort, since the job may already
 * be too far along to cancel, or already finished, and the caller (a video
 * mutation or delete) must still succeed regardless. transcodeComplete's
 * mediaConvertJobId check is what actually guards DynamoDB against a
 * replacement job this fails to stop; for a delete there's no longer any
 * record to guard, so this just avoids wasting MediaConvert time and
 * leaving an orphaned HLS output with nothing pointing at it.
 */
export const bestEffortCancelTranscodeJob = async (
  logger: Logger | undefined,
  jobId: string,
): Promise<void> => {
  try {
    await getMediaConvertClient().send(new CancelJobCommand({ Id: jobId }));
  } catch (error) {
    logger?.error('Failed to cancel transcode job', {
      error,
      jobId,
    });
  }
};

export type ICancelableVideoContentItem = {
  status: string;
  mediaConvertJobId?: string;
};

/**
 * Cancels the still-running transcode job (if any) for each content item
 * that's mid-transcode, best-effort. A `'ready'`/`'failed'` item has no job
 * left to cancel; a `'pending'` item with no `mediaConvertJobId` yet hasn't
 * gotten far enough into submission to have one.
 */
export const bestEffortCancelTranscodeJobs = async (
  logger: Logger | undefined,
  contentItems: readonly ICancelableVideoContentItem[],
): Promise<void> => {
  await Promise.all(
    contentItems
      .filter(
        (
          item,
        ): item is ICancelableVideoContentItem & {
          mediaConvertJobId: string;
        } => item.status === 'pending' && !!item.mediaConvertJobId,
      )
      .map((item) =>
        bestEffortCancelTranscodeJob(logger, item.mediaConvertJobId),
      ),
  );
};
