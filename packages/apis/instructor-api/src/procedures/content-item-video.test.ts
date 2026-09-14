/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import {
  createContentItemVideo,
  createContentItemVideoUploadUrl,
  createContentItemVideoUrl,
  updateContentItemVideo,
} from './content-item-video.js';

const {
  courseInstructorGet,
  lessonGet,
  contentItemQueryPrimary,
  contentItemCreate,
  contentItemGet,
  contentItemPatch,
  contentItemPatchSet,
  s3Send,
  getSignedUrl,
  resolveLessonMediaBucketName,
  bestEffortDeleteS3Objects,
  getSignedCloudFrontUrl,
} = vi.hoisted(() => ({
  courseInstructorGet: vi.fn(),
  lessonGet: vi.fn(),
  contentItemQueryPrimary: vi.fn(),
  contentItemCreate: vi.fn(),
  contentItemGet: vi.fn(),
  contentItemPatch: vi.fn(),
  contentItemPatchSet: vi.fn(),
  s3Send: vi.fn(),
  getSignedUrl: vi.fn(),
  resolveLessonMediaBucketName: vi.fn(),
  bestEffortDeleteS3Objects: vi.fn(),
  getSignedCloudFrontUrl: vi.fn(),
}));

vi.mock('@wattle/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      courseInstructor: {
        get: courseInstructorGet,
      },
      lesson: {
        get: lessonGet,
      },
      contentItem: {
        query: {
          primary: contentItemQueryPrimary,
        },
        create: contentItemCreate,
        get: contentItemGet,
        patch: contentItemPatch,
      },
    },
  })),
}));

// Plain function expressions, not arrow functions: these are constructed
// with `new` in content-item-video.ts, and arrow functions can never be
// constructors.
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(function (input) {
    return input;
  }),
  DeleteObjectCommand: vi.fn(function (input) {
    return input;
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl,
}));

// bestEffortDeleteS3Objects's own per-key error-swallowing behavior is
// covered directly in lib/s3-client.test.ts; here it's just a mock so
// these tests can assert content-item-video.ts calls it with the right keys.
vi.mock('../lib/s3-client.js', () => ({
  getS3Client: () => ({ send: s3Send }),
  resolveLessonMediaBucketName,
  bestEffortDeleteS3Objects,
}));

// getSignedCloudFrontUrl's own config-resolution/signing behavior is
// covered directly in lib/cloudfront-client.test.ts; here it's just a mock
// so these tests can assert createContentItemVideoUrl calls it correctly.
vi.mock('../lib/cloudfront-client.js', () => ({
  getSignedCloudFrontUrl,
}));

const router = t.router({
  createContentItemVideoUploadUrl,
  createContentItemVideo,
  updateContentItemVideo,
  createContentItemVideoUrl,
});
const caller = t.createCallerFactory(router);

const INSTRUCTOR_SUB = 'instructor-1';
const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';
const LESSON_ID = 'lesson-1';
const CONTENT_ITEM_ID = 'content-item-1';
const BUCKET_NAME = 'lesson-media-bucket';

const buildEvent = (groups: string[]): APIGatewayProxyEvent =>
  ({
    requestContext: {
      authorizer: { claims: { sub: INSTRUCTOR_SUB, 'cognito:groups': groups } },
    },
  }) as unknown as APIGatewayProxyEvent;

const callAs = (groups: string[] = ['instructor']) =>
  caller({ event: buildEvent(groups), context: {} as any, info: {} as any });

const lesson = {
  lessonId: LESSON_ID,
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  title: 'Welcome',
  order: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const contentItem = {
  contentItemId: CONTENT_ITEM_ID,
  lessonId: LESSON_ID,
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  type: 'video' as const,
  title: 'Intro video',
  s3Key: `lessons/${LESSON_ID}/${CONTENT_ITEM_ID}.mp4`,
  mimeType: 'video/mp4',
  order: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const textBody = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

const textContentItem = {
  contentItemId: CONTENT_ITEM_ID,
  lessonId: LESSON_ID,
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  type: 'text' as const,
  title: 'Welcome notes',
  body: textBody,
  order: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();

  courseInstructorGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({
      data: { courseId: COURSE_ID, instructorId: INSTRUCTOR_SUB },
    }),
  });
  lessonGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: lesson }),
  });
  contentItemQueryPrimary.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: [] }),
  });
  contentItemCreate.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: contentItem }),
  });
  contentItemGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: contentItem }),
  });
  contentItemPatch.mockReturnValue({ set: contentItemPatchSet });
  contentItemPatchSet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: contentItem }),
  });
  s3Send.mockResolvedValue({});
  getSignedUrl.mockResolvedValue('https://example.com/signed-url');
  resolveLessonMediaBucketName.mockResolvedValue(BUCKET_NAME);
  bestEffortDeleteS3Objects.mockResolvedValue(undefined);
  getSignedCloudFrontUrl.mockResolvedValue(
    'https://example.cloudfront.net/signed-url',
  );
});

describe('createContentItemVideoUploadUrl', () => {
  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).createContentItemVideoUploadUrl({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        lessonId: LESSON_ID,
        fileName: 'intro.mp4',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the caller does not teach the course', async () => {
    courseInstructorGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().createContentItemVideoUploadUrl({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        lessonId: LESSON_ID,
        fileName: 'intro.mp4',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(lessonGet).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the lesson does not exist', async () => {
    lessonGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().createContentItemVideoUploadUrl({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        lessonId: 'missing-lesson',
        fileName: 'intro.mp4',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('throws BAD_REQUEST for a disallowed file extension', async () => {
    await expect(
      callAs().createContentItemVideoUploadUrl({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        lessonId: LESSON_ID,
        fileName: 'intro.exe',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns a presigned upload URL scoped to the lesson', async () => {
    const result = await callAs().createContentItemVideoUploadUrl({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      fileName: 'intro.mp4',
    });

    expect(result.objectKey).toMatch(new RegExp(`^lessons/${LESSON_ID}/`));
    expect(result.objectKey.endsWith('.mp4')).toBe(true);
    expect(result.uploadUrl).toBe('https://example.com/signed-url');
    expect(result.contentItemId).toBeTruthy();
  });
});

describe('createContentItemVideo', () => {
  const validInput = {
    courseId: COURSE_ID,
    moduleId: MODULE_ID,
    lessonId: LESSON_ID,
    contentItemId: CONTENT_ITEM_ID,
    title: 'Intro video',
    objectKey: `lessons/${LESSON_ID}/${CONTENT_ITEM_ID}.mp4`,
    mimeType: 'video/mp4',
  };

  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).createContentItemVideo(validInput),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the lesson does not exist', async () => {
    lessonGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().createContentItemVideo(validInput),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(contentItemCreate).not.toHaveBeenCalled();
  });

  it('throws BAD_REQUEST when the objectKey does not match the lesson and content item', async () => {
    await expect(
      callAs().createContentItemVideo({
        ...validInput,
        objectKey: 'lessons/other-lesson/some-id.mp4',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(contentItemCreate).not.toHaveBeenCalled();
  });

  it('starts at order 1 for the first content item in a lesson', async () => {
    await callAs().createContentItemVideo(validInput);

    expect(contentItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'video', order: 1 }),
    );
  });

  it('appends after the highest existing order', async () => {
    contentItemQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [{ ...contentItem, order: 3 }],
      }),
    });

    await callAs().createContentItemVideo(validInput);

    expect(contentItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ order: 4 }),
    );
  });
});

describe('createContentItemVideoUrl', () => {
  const input = {
    courseId: COURSE_ID,
    moduleId: MODULE_ID,
    lessonId: LESSON_ID,
    contentItemId: CONTENT_ITEM_ID,
  };

  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).createContentItemVideoUrl(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the content item does not exist', async () => {
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().createContentItemVideoUrl(input),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(getSignedCloudFrontUrl).not.toHaveBeenCalled();
  });

  it('returns a signed CloudFront playback URL for the content item', async () => {
    const result = await callAs().createContentItemVideoUrl(input);
    expect(getSignedCloudFrontUrl).toHaveBeenCalledWith(contentItem.s3Key);
    expect(result).toEqual({
      url: 'https://example.cloudfront.net/signed-url',
    });
  });
});

describe('updateContentItemVideo', () => {
  const input = {
    courseId: COURSE_ID,
    moduleId: MODULE_ID,
    lessonId: LESSON_ID,
    contentItemId: CONTENT_ITEM_ID,
  };

  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).updateContentItemVideo(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the content item does not exist', async () => {
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(callAs().updateContentItemVideo(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(contentItemPatch).not.toHaveBeenCalled();
  });

  it('only patches fields provided in the input', async () => {
    await callAs().updateContentItemVideo({
      ...input,
      title: 'Updated title',
    });

    expect(contentItemPatch).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
      contentItemId: CONTENT_ITEM_ID,
    });
    expect(contentItemPatchSet).toHaveBeenCalledWith({
      title: 'Updated title',
    });
    expect(bestEffortDeleteS3Objects).not.toHaveBeenCalled();
  });

  it('throws BAD_REQUEST when a replacement objectKey does not match the lesson and content item', async () => {
    await expect(
      callAs().updateContentItemVideo({
        ...input,
        objectKey: 'lessons/other-lesson/some-id.mp4',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(contentItemPatch).not.toHaveBeenCalled();
  });

  // Invariant: replacing a video's underlying file must not leave the old
  // object in the bucket, or the lesson media bucket accumulates orphans
  // every time an instructor swaps a video out.
  // Regression: createContentItemVideoUploadUrl always mints a fresh id for
  // the replacement object's key (see its own test above), distinct from
  // the contentItemId being updated -- the replacement objectKey must not
  // be required to contain the target contentItemId.
  it('deletes the old S3 object when the video file is replaced with an unrelated object id', async () => {
    const newObjectKey = `lessons/${LESSON_ID}/some-other-fresh-id.mp4`;

    await callAs().updateContentItemVideo({
      ...input,
      objectKey: newObjectKey,
      mimeType: 'video/webm',
    });

    expect(contentItemPatchSet).toHaveBeenCalledWith({
      s3Key: newObjectKey,
      mimeType: 'video/webm',
    });
    expect(bestEffortDeleteS3Objects).toHaveBeenCalledWith(expect.anything(), [
      contentItem.s3Key,
    ]);
  });

  it('does not attempt an S3 delete when the objectKey is unchanged', async () => {
    await callAs().updateContentItemVideo({
      ...input,
      objectKey: contentItem.s3Key,
    });

    expect(bestEffortDeleteS3Objects).not.toHaveBeenCalled();
  });

  it('throws BAD_REQUEST when the existing content item is not a video', async () => {
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: textContentItem }),
    });

    await expect(callAs().updateContentItemVideo(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(contentItemPatch).not.toHaveBeenCalled();
  });
});
