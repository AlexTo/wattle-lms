/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import { createModule } from './module.js';

const { courseInstructorGet, moduleQueryPrimary, moduleCreate } = vi.hoisted(
  () => ({
    courseInstructorGet: vi.fn(),
    moduleQueryPrimary: vi.fn(),
    moduleCreate: vi.fn(),
  }),
);

vi.mock('@wattle/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      courseInstructor: {
        get: courseInstructorGet,
      },
      module: {
        query: {
          primary: moduleQueryPrimary,
        },
        create: moduleCreate,
      },
    },
  })),
}));

const router = t.router({ createModule });
const caller = t.createCallerFactory(router);

const INSTRUCTOR_SUB = 'instructor-1';
const COURSE_ID = 'course-1';

const buildEvent = (groups: string[]): APIGatewayProxyEvent =>
  ({
    requestContext: {
      authorizer: { claims: { sub: INSTRUCTOR_SUB, 'cognito:groups': groups } },
    },
  }) as unknown as APIGatewayProxyEvent;

const callAs = (groups: string[] = ['instructor']) =>
  caller({ event: buildEvent(groups), context: {} as any, info: {} as any });

const module = {
  moduleId: 'module-1',
  courseId: COURSE_ID,
  title: 'Introduction',
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
  moduleQueryPrimary.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: [] }),
  });
  moduleCreate.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: module }),
  });
});

describe('createModule', () => {
  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).createModule({ courseId: COURSE_ID, title: 'Intro' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  // Invariant: only an instructor who actually teaches the course may add
  // modules to it -- membership in the `instructor` group is not enough.
  it('throws FORBIDDEN when the caller does not teach the course', async () => {
    courseInstructorGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().createModule({ courseId: COURSE_ID, title: 'Intro' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(moduleQueryPrimary).not.toHaveBeenCalled();
    expect(moduleCreate).not.toHaveBeenCalled();
  });

  it('starts at order 1 for the first module in a course', async () => {
    await callAs().createModule({ courseId: COURSE_ID, title: 'Intro' });

    expect(moduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: COURSE_ID,
        title: 'Intro',
        order: 1,
      }),
    );
  });

  // Invariant: new modules append to the end, never colliding with or
  // reordering existing ones, even if orders have gaps.
  it('appends after the highest existing order, not the module count', async () => {
    moduleQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [
          { ...module, moduleId: 'module-1', order: 1 },
          { ...module, moduleId: 'module-5', order: 5 },
        ],
      }),
    });

    await callAs().createModule({ courseId: COURSE_ID, title: 'New module' });

    expect(moduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({ order: 6 }),
    );
  });

  it('returns the created module', async () => {
    const result = await callAs().createModule({
      courseId: COURSE_ID,
      title: 'Introduction',
    });
    expect(result).toEqual(module);
  });
});
