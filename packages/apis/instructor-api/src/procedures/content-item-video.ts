/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { extname } from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TRPCError } from '@trpc/server';
import { v7 as uuidv7 } from 'uuid';
import { courseProcedure } from '../init.js';
import { getSignedCloudFrontUrl } from '../lib/cloudfront-client.js';
import { submitTranscodeJob } from '../lib/mediaconvert-client.js';
import {
  bestEffortDeleteContentItemVideos,
  getS3Client,
  resolveLessonMediaUploadBucketName,
} from '../lib/s3-client.js';
import {
  CreateContentItemVideoInputSchema,
  CreateContentItemVideoOutputSchema,
  CreateContentItemVideoUploadUrlInputSchema,
  CreateContentItemVideoUploadUrlOutputSchema,
  CreateContentItemVideoUrlInputSchema,
  CreateContentItemVideoUrlOutputSchema,
  type ICreateContentItemVideoOutput,
  type IUpdateContentItemVideoOutput,
  UpdateContentItemVideoInputSchema,
  UpdateContentItemVideoOutputSchema,
} from '../schema/index.js';
import { asContentItemOutput } from './content-item-shared.js';

// Extension -> content type allowlist for lesson videos. Anything else is
// rejected with BAD_REQUEST before a presigned URL is ever issued.
const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60;

export const createContentItemVideoUploadUrl = courseProcedure
  .input(CreateContentItemVideoUploadUrlInputSchema)
  .output(CreateContentItemVideoUploadUrlOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, fileName } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may attach video to
    // its lessons, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: lesson } = await coreTable.entities.lesson
      .get({ courseId, moduleId, lessonId })
      .go();
    if (!lesson) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const ext = extname(fileName).slice(1).toLowerCase();
    const contentType = ALLOWED_VIDEO_TYPES[ext];
    if (!contentType) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Unsupported video file type. Allowed types: ${Object.keys(ALLOWED_VIDEO_TYPES).join(', ')}`,
      });
    }

    // When replacing an existing video, reuse its id in the object key
    // instead of minting a fresh one, so the key's id segment always
    // matches a real content item -- the transcode-trigger Lambda parses
    // this id straight out of the S3 key with no DynamoDB lookup.
    if (input.contentItemId !== undefined) {
      const { data: existing } = await coreTable.entities.contentItem
        .get({
          courseId,
          moduleId,
          lessonId,
          contentItemId: input.contentItemId,
        })
        .go();
      if (!existing || existing.type !== 'video') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }

    const contentItemId = input.contentItemId ?? uuidv7();
    const objectKey = `courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/${contentItemId}.${ext}`;

    const uploadUrl = await getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: await resolveLessonMediaUploadBucketName(),
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_URL_EXPIRY_SECONDS },
    );

    return { contentItemId, uploadUrl, objectKey };
  });

export const createContentItemVideo = courseProcedure
  .input(CreateContentItemVideoInputSchema)
  .output(CreateContentItemVideoOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const {
      courseId,
      moduleId,
      lessonId,
      contentItemId,
      title,
      description,
      objectKey,
      mimeType,
      durationSeconds,
    } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may add content to
    // its lessons, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: lesson } = await coreTable.entities.lesson
      .get({ courseId, moduleId, lessonId })
      .go();
    if (!lesson) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // The object key must be one this lesson's own upload-url procedure
    // could have issued, so a caller can't record metadata pointing at an
    // object outside this lesson's prefix (e.g. another lesson's video).
    if (
      !objectKey.startsWith(
        `courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/`,
      ) ||
      !objectKey.includes(contentItemId)
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'objectKey does not match this lesson and content item',
      });
    }

    // New content items append to the end of the lesson. `order` isn't part
    // of any key (content item counts per lesson are small enough to sort
    // client-side), so this is a plain query-and-increment rather than an
    // atomic counter.
    const { data: contentItems } = await coreTable.entities.contentItem.query
      .primary({ courseId, moduleId, lessonId })
      .go();
    const order =
      contentItems.reduce((max, item) => Math.max(max, item.order), 0) + 1;

    const { data: contentItem } = await coreTable.entities.contentItem
      .create({
        contentItemId,
        lessonId,
        moduleId,
        courseId,
        type: 'video',
        status: 'pending',
        title,
        description,
        s3Key: objectKey,
        mimeType,
        durationSeconds,
        order,
      })
      .go();

    // Submitted only once the record exists, not from the S3 upload event
    // that landed objectKey there -- otherwise a short transcode can
    // complete before this record exists to receive the completion
    // callback's patch, and that completion is never retried.
    await submitTranscodeJob({
      courseId,
      moduleId,
      lessonId,
      contentItemId,
      objectKey,
    });

    return asContentItemOutput<ICreateContentItemVideoOutput>(contentItem);
  });

export const updateContentItemVideo = courseProcedure
  .input(UpdateContentItemVideoInputSchema)
  .output(UpdateContentItemVideoOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const {
      courseId,
      moduleId,
      lessonId,
      contentItemId,
      title,
      description,
      objectKey,
      mimeType,
      durationSeconds,
    } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may edit its lesson
    // content, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: existing } = await coreTable.entities.contentItem
      .get({ courseId, moduleId, lessonId, contentItemId })
      .go();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // A content item's type is fixed at creation -- there's no supported
    // path to turn a text item into a video.
    if (existing.type !== 'video') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Content item is type '${existing.type}', not 'video'`,
      });
    }

    // Replacing the underlying video: the object key must at least be
    // scoped to this lesson, so a caller can't point the record at an
    // object outside its lesson's prefix (e.g. another lesson's video).
    // createContentItemVideoUploadUrl reuses this contentItemId in the key
    // when told it's a replacement, but doesn't have to be -- a caller
    // could still supply an unrelated key from within this lesson, so this
    // check doesn't require an exact contentItemId match.
    if (
      objectKey !== undefined &&
      !objectKey.startsWith(
        `courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/`,
      )
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'objectKey does not match this lesson',
      });
    }

    const { data: contentItem } = await coreTable.entities.contentItem
      .patch({ courseId, moduleId, lessonId, contentItemId })
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        // Replacing the file invalidates whatever transcode already ran
        // against the old one -- the new object needs to go through it
        // again before it's playable.
        ...(objectKey !== undefined && { s3Key: objectKey, status: 'pending' }),
        ...(mimeType !== undefined && { mimeType }),
        ...(durationSeconds !== undefined && { durationSeconds }),
      })
      .go({ response: 'all_new' });

    if (objectKey !== undefined) {
      // Submitted only once the record's patch above has landed, not from
      // the S3 upload event that put objectKey there -- see the same note
      // in createContentItemVideo.
      await submitTranscodeJob({
        courseId,
        moduleId,
        lessonId,
        contentItemId,
        objectKey,
      });

      // Best-effort: replacing the video leaves the old S3 object orphaned.
      // The DynamoDB record now points at the new object regardless of
      // whether this cleanup succeeds.
      if (objectKey !== existing.s3Key && existing.s3Key) {
        await bestEffortDeleteContentItemVideos(ctx.logger, [existing]);
      }
    }

    return asContentItemOutput<IUpdateContentItemVideoOutput>(contentItem);
  });

export const createContentItemVideoUrl = courseProcedure
  .input(CreateContentItemVideoUrlInputSchema)
  .output(CreateContentItemVideoUrlOutputSchema)
  .query(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, contentItemId } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may view its lesson
    // videos, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: contentItem } = await coreTable.entities.contentItem
      .get({ courseId, moduleId, lessonId, contentItemId })
      .go();
    if (
      !contentItem ||
      contentItem.type !== 'video' ||
      !contentItem.s3Key ||
      contentItem.status !== 'ready'
    ) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const url = await getSignedCloudFrontUrl(contentItem.s3Key);

    return { url };
  });
