/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import {
  listCoursesByInstructor,
  listInstructorsForCourse,
  viewCourse,
} from './course.js';

const {
  courseInstructorQueryByInstructor,
  courseInstructorQueryPrimary,
  courseGet,
  userGet,
} = vi.hoisted(() => ({
  courseInstructorQueryByInstructor: vi.fn(),
  courseInstructorQueryPrimary: vi.fn(),
  courseGet: vi.fn(),
  userGet: vi.fn(),
}));

vi.mock('@wattle/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      course: { get: courseGet },
      user: { get: userGet },
      courseInstructor: {
        query: {
          byInstructor: courseInstructorQueryByInstructor,
          primary: courseInstructorQueryPrimary,
        },
      },
    },
  })),
}));

const router = t.router({
  listCoursesByInstructor,
  listInstructorsForCourse,
  viewCourse,
});
const caller = t.createCallerFactory(router);

const USER_SUB = 'user-1';

const buildEvent = (): APIGatewayProxyEvent =>
  ({
    requestContext: { authorizer: { claims: { sub: USER_SUB } } },
  }) as unknown as APIGatewayProxyEvent;

const callAsUser = () =>
  caller({ event: buildEvent(), context: {} as any, info: {} as any });

const callAnonymously = () =>
  caller({
    event: { requestContext: {} } as unknown as APIGatewayProxyEvent,
    context: {} as any,
    info: {} as any,
  });

const course = {
  courseId: 'course-1',
  title: 'Intro to DynamoDB',
  status: 'draft' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listCoursesByInstructor', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      callAnonymously().listCoursesByInstructor({
        instructorId: 'instructor-1',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(courseInstructorQueryByInstructor).not.toHaveBeenCalled();
  });

  it('returns an empty page without batch-getting when the instructor teaches nothing', async () => {
    courseInstructorQueryByInstructor.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: [], cursor: null }),
    });

    const result = await callAsUser().listCoursesByInstructor({
      instructorId: 'instructor-1',
    });

    expect(result).toEqual({ items: [], cursor: null });
    expect(courseGet).not.toHaveBeenCalled();
  });

  it('defaults limit to 10 when the caller omits it', async () => {
    courseInstructorQueryByInstructor.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: [], cursor: null }),
    });

    await callAsUser().listCoursesByInstructor({
      instructorId: 'instructor-1',
    });

    expect(
      courseInstructorQueryByInstructor.mock.results[0].value.go,
    ).toHaveBeenCalledWith({ cursor: undefined, limit: 10 });
  });

  it('passes cursor/limit through to the query and forwards the next cursor', async () => {
    courseInstructorQueryByInstructor.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [{ courseId: 'course-1', instructorId: 'instructor-1' }],
        cursor: 'next-page',
      }),
    });
    courseGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: [course] }),
    });

    const result = await callAsUser().listCoursesByInstructor({
      instructorId: 'instructor-1',
      cursor: 'prev-page',
      limit: 10,
    });

    expect(courseInstructorQueryByInstructor).toHaveBeenCalledWith({
      instructorId: 'instructor-1',
    });
    expect(
      courseInstructorQueryByInstructor.mock.results[0].value.go,
    ).toHaveBeenCalledWith({ cursor: 'prev-page', limit: 10 });
    expect(courseGet).toHaveBeenCalledWith([{ courseId: 'course-1' }]);
    expect(courseGet.mock.results[0].value.go).toHaveBeenCalledWith({
      preserveBatchOrder: true,
    });
    expect(result).toEqual({ items: [course], cursor: 'next-page' });
  });

  it('filters out null gaps from the batch-get (e.g. a course deleted after its membership row was written)', async () => {
    courseInstructorQueryByInstructor.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [
          { courseId: 'course-1', instructorId: 'instructor-1' },
          { courseId: 'deleted-course', instructorId: 'instructor-1' },
        ],
        cursor: null,
      }),
    });
    courseGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: [course, null] }),
    });

    const result = await callAsUser().listCoursesByInstructor({
      instructorId: 'instructor-1',
    });

    expect(result).toEqual({ items: [course], cursor: null });
  });
});

describe('listInstructorsForCourse', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      callAnonymously().listInstructorsForCourse({ courseId: course.courseId }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(courseInstructorQueryPrimary).not.toHaveBeenCalled();
  });

  it('returns an empty page without batch-getting when the course has no instructors', async () => {
    courseInstructorQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: [], cursor: null }),
    });

    const result = await callAsUser().listInstructorsForCourse({
      courseId: course.courseId,
    });

    expect(result).toEqual({ items: [], cursor: null });
    expect(userGet).not.toHaveBeenCalled();
  });

  it('defaults limit to 10 when the caller omits it', async () => {
    courseInstructorQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: [], cursor: null }),
    });

    await callAsUser().listInstructorsForCourse({ courseId: course.courseId });

    expect(
      courseInstructorQueryPrimary.mock.results[0].value.go,
    ).toHaveBeenCalledWith({ cursor: undefined, limit: 10 });
  });

  it('filters out null gaps from the batch-get (e.g. a user deleted after its membership row was written)', async () => {
    courseInstructorQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [
          { courseId: course.courseId, instructorId: 'instructor-1' },
          { courseId: course.courseId, instructorId: 'deleted-instructor' },
        ],
        cursor: null,
      }),
    });
    const instructor = { userId: 'instructor-1', email: 'a@b.com' };
    userGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: [instructor, null] }),
    });

    const result = await callAsUser().listInstructorsForCourse({
      courseId: course.courseId,
    });

    expect(result).toEqual({ items: [instructor], cursor: null });
  });

  it('passes cursor/limit through and batch-gets the instructors teaching a course', async () => {
    courseInstructorQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [{ courseId: course.courseId, instructorId: 'instructor-1' }],
        cursor: 'next-page',
      }),
    });
    const instructor = { userId: 'instructor-1', email: 'a@b.com' };
    userGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: [instructor] }),
    });

    const result = await callAsUser().listInstructorsForCourse({
      courseId: course.courseId,
      cursor: 'prev-page',
      limit: 10,
    });

    expect(courseInstructorQueryPrimary).toHaveBeenCalledWith({
      courseId: course.courseId,
    });
    expect(
      courseInstructorQueryPrimary.mock.results[0].value.go,
    ).toHaveBeenCalledWith({ cursor: 'prev-page', limit: 10 });
    expect(userGet).toHaveBeenCalledWith([{ userId: 'instructor-1' }]);
    expect(userGet.mock.results[0].value.go).toHaveBeenCalledWith({
      preserveBatchOrder: true,
    });
    expect(result).toEqual({ items: [instructor], cursor: 'next-page' });
  });
});

describe('viewCourse', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      callAnonymously().viewCourse({ courseId: course.courseId }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(courseGet).not.toHaveBeenCalled();
  });

  it('returns the course when found', async () => {
    courseGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: course }),
    });

    const result = await callAsUser().viewCourse({ courseId: course.courseId });

    expect(courseGet).toHaveBeenCalledWith({ courseId: course.courseId });
    expect(result).toEqual(course);
  });

  it('throws NOT_FOUND when the course does not exist', async () => {
    courseGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAsUser().viewCourse({ courseId: 'missing' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
