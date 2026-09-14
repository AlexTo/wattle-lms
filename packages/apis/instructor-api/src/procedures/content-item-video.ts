/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TRPCError } from '@trpc/server';
import { v7 as uuidv7 } from 'uuid';
import { courseProcedure } from '../init.js';
import { getSignedCloudFrontUrl } from '../lib/cloudfront-client.js';
import {
  bestEffortDeleteS3Objects,
  getS3Client,
  resolveLessonMediaBucketName,
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

    const ext = fileName.split('.').pop()?.toLowerCase();
    const contentType = ext ? ALLOWED_VIDEO_TYPES[ext] : undefined;
    if (!contentType) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Unsupported video file type. Allowed types: ${Object.keys(ALLOWED_VIDEO_TYPES).join(', ')}`,
      });
    }

    const contentItemId = uuidv7();
    const objectKey = `lessons/${lessonId}/${contentItemId}.${ext}`;

    const uploadUrl = await getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: await resolveLessonMediaBucketName(),
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
      !objectKey.startsWith(`lessons/${lessonId}/`) ||
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
        title,
        description,
        s3Key: objectKey,
        mimeType,
        durationSeconds,
        order,
      })
      .go();

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
    // Unlike createContentItemVideo, it won't contain this specific
    // contentItemId -- createContentItemVideoUploadUrl always mints a
    // fresh id for the replacement object's key, distinct from the
    // content item being updated.
    if (
      objectKey !== undefined &&
      !objectKey.startsWith(`lessons/${lessonId}/`)
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
        ...(objectKey !== undefined && { s3Key: objectKey }),
        ...(mimeType !== undefined && { mimeType }),
        ...(durationSeconds !== undefined && { durationSeconds }),
      })
      .go({ response: 'all_new' });

    // Best-effort: replacing the video leaves the old S3 object orphaned.
    // The DynamoDB record now points at the new object regardless of
    // whether this cleanup succeeds.
    if (
      objectKey !== undefined &&
      objectKey !== existing.s3Key &&
      existing.s3Key
    ) {
      await bestEffortDeleteS3Objects(ctx.logger, [existing.s3Key]);
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
    if (!contentItem || contentItem.type !== 'video' || !contentItem.s3Key) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const url = await getSignedCloudFrontUrl(contentItem.s3Key);

    return { url };
  });
