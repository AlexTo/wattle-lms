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
import {
  CreateScheduleCommand,
  SchedulerClient,
} from '@aws-sdk/client-scheduler';
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

let _schedulerClient: SchedulerClient | undefined;

const getSchedulerClient = (): SchedulerClient => {
  if (!_schedulerClient) {
    _schedulerClient = new SchedulerClient({});
  }
  return _schedulerClient;
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

type TranscodeCleanupConfig = {
  lambdaArn: string;
  schedulerRoleArn: string;
  scheduleGroupName: string;
};

const resolveTranscodeCleanupConfig = (): Promise<TranscodeCleanupConfig> =>
  resolveAppConfigValue<TranscodeCleanupConfig>(
    'mediaConvert',
    'TranscodeCleanup',
  );

// How long to wait after canceling a job before deleting its output.
// MediaConvert doesn't stop writing the instant CancelJob is called --
// direct testing observed writes continuing for ~30s afterward -- and
// once destinations are nonce-scoped (see submitTranscodeJob), a longer
// delay costs nothing (nothing else will ever reference that prefix
// again, so there's no race to avoid by cleaning up sooner), while a
// delay that's too short risks missing the job's last few writes and
// leaving a smaller version of the same orphan behind. 10 minutes is a
// comfortable, arbitrary-but-safe multiple of the one tail we've
// actually measured, not a value derived from a documented guarantee.
const CANCELLATION_CLEANUP_DELAY_MINUTES = 10;

/**
 * Schedules a one-time cleanup of a single canceled job's own nonce-scoped
 * S3 output, via an EventBridge Scheduler schedule that invokes
 * transcode-cleanup.ts a few minutes from now. Best-effort: a failure to
 * schedule just means that job's output isn't automatically cleaned up,
 * not that the cancellation itself (already done by the caller) is
 * undone.
 */
const scheduleTranscodeCleanup = async (
  logger: Logger | undefined,
  params: {
    courseId: string;
    moduleId: string;
    lessonId: string;
    contentItemId: string;
    submissionNonce: string;
  },
): Promise<void> => {
  try {
    const { lambdaArn, schedulerRoleArn, scheduleGroupName } =
      await resolveTranscodeCleanupConfig();

    // Schedule names cap out at 64 characters; a hash of the two ids that
    // actually identify this job's own prefix keeps this well within
    // that regardless of their length, and needs no other uniqueness --
    // the identifying detail lives in the target's Input, not the name.
    const scheduleName = `cleanup-${createHash('sha256')
      .update(`${params.contentItemId}:${params.submissionNonce}`)
      .digest('hex')
      .slice(0, 32)}`;

    // EventBridge Scheduler's at() expression takes a literal local
    // timestamp with no timezone suffix or fractional seconds.
    const runAt = new Date(
      Date.now() + CANCELLATION_CLEANUP_DELAY_MINUTES * 60_000,
    )
      .toISOString()
      .slice(0, 19);

    await getSchedulerClient().send(
      new CreateScheduleCommand({
        Name: scheduleName,
        GroupName: scheduleGroupName,
        ScheduleExpression: `at(${runAt})`,
        FlexibleTimeWindow: { Mode: 'OFF' },
        // The schedule has done its job once it's fired once; nothing
        // reuses a specific job's cleanup schedule, so there's no reason
        // to let it linger.
        ActionAfterCompletion: 'DELETE',
        Target: {
          Arn: lambdaArn,
          RoleArn: schedulerRoleArn,
          Input: JSON.stringify(params),
        },
      }),
    );
  } catch (error) {
    logger?.error('Failed to schedule transcode cleanup', {
      error,
      ...params,
    });
  }
};

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

export type ICancelableTranscodeJob = {
  jobId: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItemId: string;
  submissionNonce?: string;
};

/**
 * Cancels a MediaConvert job that no longer has anywhere to report to --
 * either a replacement upload has superseded it, or the content item it was
 * transcoding for has been deleted -- best-effort, since the job may already
 * be too far along to cancel, or already finished, and the caller (a video
 * mutation or delete) must still succeed regardless. transcodeComplete's
 * mediaConvertJobId check is what actually guards DynamoDB against a
 * replacement job this fails to stop; for a delete there's no longer any
 * record to guard.
 *
 * Also schedules a delayed cleanup of this job's own S3 output (see
 * scheduleTranscodeCleanup) -- whether or not the cancel above actually
 * succeeds. The caller has already decided to supersede or delete this
 * content item's video regardless, so even a job that happened to finish
 * on its own moments before the cancel landed has nothing left pointing
 * at its output; scheduling cleanup for it is still correct.
 */
export const bestEffortCancelTranscodeJob = async (
  logger: Logger | undefined,
  job: ICancelableTranscodeJob,
): Promise<void> => {
  try {
    await getMediaConvertClient().send(new CancelJobCommand({ Id: job.jobId }));
  } catch (error) {
    logger?.error('Failed to cancel transcode job', {
      error,
      jobId: job.jobId,
    });
  }

  // Older records from before submissionNonce existed have nothing to
  // scope a cleanup to -- best-effort, so this is silently skipped for
  // them rather than treated as an error.
  if (job.submissionNonce !== undefined) {
    await scheduleTranscodeCleanup(logger, {
      courseId: job.courseId,
      moduleId: job.moduleId,
      lessonId: job.lessonId,
      contentItemId: job.contentItemId,
      submissionNonce: job.submissionNonce,
    });
  }
};

export type ICancelableVideoContentItem = {
  status: string;
  mediaConvertJobId?: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItemId: string;
  submissionNonce?: string;
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
        bestEffortCancelTranscodeJob(logger, {
          jobId: item.mediaConvertJobId,
          courseId: item.courseId,
          moduleId: item.moduleId,
          lessonId: item.lessonId,
          contentItemId: item.contentItemId,
          submissionNonce: item.submissionNonce,
        }),
      ),
  );
};
