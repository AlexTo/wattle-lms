/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import { createLesson } from './lesson.js';

const { courseInstructorGet, moduleGet, lessonQueryPrimary, lessonCreate } =
  vi.hoisted(() => ({
    courseInstructorGet: vi.fn(),
    moduleGet: vi.fn(),
    lessonQueryPrimary: vi.fn(),
    lessonCreate: vi.fn(),
  }));

vi.mock('@wattle/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      courseInstructor: {
        get: courseInstructorGet,
      },
      module: {
        get: moduleGet,
      },
      lesson: {
        query: {
          primary: lessonQueryPrimary,
        },
        create: lessonCreate,
      },
    },
  })),
}));

const router = t.router({ createLesson });
const caller = t.createCallerFactory(router);

const INSTRUCTOR_SUB = 'instructor-1';
const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';

const buildEvent = (groups: string[]): APIGatewayProxyEvent =>
  ({
    requestContext: {
      authorizer: { claims: { sub: INSTRUCTOR_SUB, 'cognito:groups': groups } },
    },
  }) as unknown as APIGatewayProxyEvent;

const callAs = (groups: string[] = ['instructor']) =>
  caller({ event: buildEvent(groups), context: {} as any, info: {} as any });

const module = {
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  title: 'Introduction',
  order: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const lesson = {
  lessonId: 'lesson-1',
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  title: 'Welcome',
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
  moduleGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: module }),
  });
  lessonQueryPrimary.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: [] }),
  });
  lessonCreate.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: lesson }),
  });
});

describe('createLesson', () => {
  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).createLesson({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        title: 'Welcome',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  // Invariant: only an instructor who actually teaches the course may add
  // lessons to it -- membership in the `instructor` group is not enough.
  it('throws FORBIDDEN when the caller does not teach the course', async () => {
    courseInstructorGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().createLesson({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        title: 'Welcome',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(moduleGet).not.toHaveBeenCalled();
    expect(lessonCreate).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the module does not exist', async () => {
    moduleGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().createLesson({
        courseId: COURSE_ID,
        moduleId: 'missing-module',
        title: 'Welcome',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(lessonQueryPrimary).not.toHaveBeenCalled();
    expect(lessonCreate).not.toHaveBeenCalled();
  });

  it('starts at order 1 for the first lesson in a module', async () => {
    await callAs().createLesson({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      title: 'Welcome',
    });

    expect(lessonQueryPrimary).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
    });
    expect(lessonCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
        title: 'Welcome',
        order: 1,
      }),
    );
  });

  // Invariant: new lessons append to the end of their module, never
  // colliding with or reordering existing ones, even if orders have gaps.
  it('appends after the highest existing order, not the lesson count', async () => {
    lessonQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [
          { ...lesson, lessonId: 'lesson-1', order: 1 },
          { ...lesson, lessonId: 'lesson-5', order: 5 },
        ],
      }),
    });

    await callAs().createLesson({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      title: 'New lesson',
    });

    expect(lessonCreate).toHaveBeenCalledWith(
      expect.objectContaining({ order: 6 }),
    );
  });

  it('returns the created lesson', async () => {
    const result = await callAs().createLesson({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      title: 'Welcome',
    });
    expect(result).toEqual(lesson);
  });
});
