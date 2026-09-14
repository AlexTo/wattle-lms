/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import { deleteContentItem } from './content-item-shared.js';

const {
  courseInstructorGet,
  contentItemGet,
  contentItemDelete,
  bestEffortDeleteS3Objects,
} = vi.hoisted(() => ({
  courseInstructorGet: vi.fn(),
  contentItemGet: vi.fn(),
  contentItemDelete: vi.fn(),
  bestEffortDeleteS3Objects: vi.fn(),
}));

vi.mock('@wattle/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      courseInstructor: {
        get: courseInstructorGet,
      },
      contentItem: {
        get: contentItemGet,
        delete: contentItemDelete,
      },
    },
  })),
}));

// bestEffortDeleteS3Objects's own per-key error-swallowing behavior is
// covered directly in lib/s3-client.test.ts; here it's just a mock so these
// tests can assert content-item-shared.ts calls it with the right keys.
vi.mock('../lib/s3-client.js', () => ({
  bestEffortDeleteS3Objects,
}));

const router = t.router({ deleteContentItem });
const caller = t.createCallerFactory(router);

const INSTRUCTOR_SUB = 'instructor-1';
const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';
const LESSON_ID = 'lesson-1';
const CONTENT_ITEM_ID = 'content-item-1';

const buildEvent = (groups: string[]): APIGatewayProxyEvent =>
  ({
    requestContext: {
      authorizer: { claims: { sub: INSTRUCTOR_SUB, 'cognito:groups': groups } },
    },
  }) as unknown as APIGatewayProxyEvent;

const callAs = (groups: string[] = ['instructor']) =>
  caller({ event: buildEvent(groups), context: {} as any, info: {} as any });

const videoContentItem = {
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

const textContentItem = {
  contentItemId: CONTENT_ITEM_ID,
  lessonId: LESSON_ID,
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  type: 'text' as const,
  title: 'Welcome notes',
  body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
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
  contentItemGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: videoContentItem }),
  });
  contentItemDelete.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: videoContentItem }),
  });
  bestEffortDeleteS3Objects.mockResolvedValue(undefined);
});

describe('deleteContentItem', () => {
  const input = {
    courseId: COURSE_ID,
    moduleId: MODULE_ID,
    lessonId: LESSON_ID,
    contentItemId: CONTENT_ITEM_ID,
  };

  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).deleteContentItem(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the content item does not exist', async () => {
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(callAs().deleteContentItem(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(contentItemDelete).not.toHaveBeenCalled();
  });

  it('deletes a video content item and its S3 object', async () => {
    const result = await callAs().deleteContentItem(input);

    expect(contentItemDelete).toHaveBeenCalledWith(input);
    expect(bestEffortDeleteS3Objects).toHaveBeenCalledWith(expect.anything(), [
      videoContentItem.s3Key,
    ]);
    expect(result).toEqual(videoContentItem);
  });

  it('deletes a text content item without attempting an S3 cleanup', async () => {
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: textContentItem }),
    });
    contentItemDelete.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: textContentItem }),
    });

    const result = await callAs().deleteContentItem(input);

    expect(bestEffortDeleteS3Objects).not.toHaveBeenCalled();
    expect(result).toEqual(textContentItem);
  });
});
