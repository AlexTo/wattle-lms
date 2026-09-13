/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import { createModule, deleteModule, updateModule } from './module.js';

const {
  courseInstructorGet,
  moduleQueryPrimary,
  moduleCreate,
  moduleGet,
  moduleDelete,
  modulePatch,
  modulePatchSet,
  lessonQueryPrimary,
  lessonDelete,
  transactionWrite,
  transactionGo,
} = vi.hoisted(() => ({
  courseInstructorGet: vi.fn(),
  moduleQueryPrimary: vi.fn(),
  moduleCreate: vi.fn(),
  moduleGet: vi.fn(),
  moduleDelete: vi.fn(),
  modulePatch: vi.fn(),
  modulePatchSet: vi.fn(),
  lessonQueryPrimary: vi.fn(),
  lessonDelete: vi.fn(),
  transactionWrite: vi.fn(),
  transactionGo: vi.fn(),
}));

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
        get: moduleGet,
        delete: moduleDelete,
        patch: modulePatch,
      },
      lesson: {
        query: {
          primary: lessonQueryPrimary,
        },
        delete: lessonDelete,
      },
    },
    transaction: {
      write: transactionWrite,
    },
  })),
}));

const router = t.router({ createModule, updateModule, deleteModule });
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
  moduleQueryPrimary.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: [] }),
  });
  moduleGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: module }),
  });
  moduleDelete.mockImplementation((attrs) => ({
    commit: () => ({ item: null, attrs }),
  }));
  lessonQueryPrimary.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: [] }),
  });
  lessonDelete.mockImplementation((attrs) => ({
    commit: () => ({ item: null, attrs }),
  }));
  transactionWrite.mockImplementation((fn) => {
    fn({
      module: { delete: moduleDelete },
      lesson: { delete: lessonDelete },
    });
    return { go: transactionGo };
  });
  transactionGo.mockResolvedValue({ canceled: false, data: [] });
  moduleCreate.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: module }),
  });
  modulePatchSet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: module }),
  });
  modulePatch.mockReturnValue({ set: modulePatchSet });
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

  it('passes the description through to the created module', async () => {
    await callAs().createModule({
      courseId: COURSE_ID,
      title: 'Introduction',
      description: 'A quick tour of the course',
    });

    expect(moduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'A quick tour of the course' }),
    );
  });
});

describe('updateModule', () => {
  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).updateModule({
        courseId: COURSE_ID,
        moduleId: module.moduleId,
        title: 'Updated title',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  // Invariant: only an instructor who actually teaches the course may edit
  // its modules -- membership in the `instructor` group is not enough.
  it('throws FORBIDDEN when the caller does not teach the course', async () => {
    courseInstructorGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().updateModule({
        courseId: COURSE_ID,
        moduleId: module.moduleId,
        title: 'Updated title',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(moduleGet).not.toHaveBeenCalled();
    expect(modulePatch).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the module does not exist', async () => {
    moduleGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().updateModule({
        courseId: COURSE_ID,
        moduleId: 'missing-module',
        title: 'Updated title',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(modulePatch).not.toHaveBeenCalled();
  });

  it('only patches fields provided in the input', async () => {
    await callAs().updateModule({
      courseId: COURSE_ID,
      moduleId: module.moduleId,
      title: 'Updated title',
    });

    expect(modulePatch).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moduleId: module.moduleId,
    });
    expect(modulePatchSet).toHaveBeenCalledWith({ title: 'Updated title' });
  });

  it('patches title, description, and order together when all are provided', async () => {
    await callAs().updateModule({
      courseId: COURSE_ID,
      moduleId: module.moduleId,
      title: 'Updated title',
      description: 'Updated description',
      order: 2,
    });

    expect(modulePatchSet).toHaveBeenCalledWith({
      title: 'Updated title',
      description: 'Updated description',
      order: 2,
    });
  });

  it('returns the updated module', async () => {
    const updatedModule = { ...module, title: 'Updated title' };
    modulePatchSet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: updatedModule }),
    });

    const result = await callAs().updateModule({
      courseId: COURSE_ID,
      moduleId: module.moduleId,
      title: 'Updated title',
    });
    expect(result).toEqual(updatedModule);
  });
});

describe('deleteModule', () => {
  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).deleteModule({
        courseId: COURSE_ID,
        moduleId: MODULE_ID,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  // Invariant: only an instructor who actually teaches the course may
  // delete its modules -- membership in the `instructor` group is not
  // enough.
  it('throws FORBIDDEN when the caller does not teach the course', async () => {
    courseInstructorGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().deleteModule({ courseId: COURSE_ID, moduleId: MODULE_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(moduleGet).not.toHaveBeenCalled();
    expect(moduleDelete).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the module does not exist', async () => {
    moduleGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().deleteModule({
        courseId: COURSE_ID,
        moduleId: 'missing-module',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(lessonQueryPrimary).not.toHaveBeenCalled();
    expect(moduleDelete).not.toHaveBeenCalled();
  });

  it('deletes a module the caller teaches and returns it', async () => {
    const result = await callAs().deleteModule({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
    });

    expect(transactionWrite).toHaveBeenCalledTimes(1);
    expect(moduleDelete).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
    });
    expect(result).toEqual(module);
  });

  it('throws INTERNAL_SERVER_ERROR when the transaction is canceled', async () => {
    transactionGo.mockResolvedValue({ canceled: true, data: [] });

    await expect(
      callAs().deleteModule({ courseId: COURSE_ID, moduleId: MODULE_ID }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  // DynamoDB transactions cap at 100 items; a module with too many lessons
  // can't be cascade-deleted in one, so this must fail fast rather than let
  // DynamoDB reject the oversized transaction.
  it('throws INTERNAL_SERVER_ERROR without attempting a transaction when the module has too many lessons', async () => {
    lessonQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: Array.from({ length: 100 }, (_, i) => ({
          ...lesson,
          lessonId: `lesson-${i}`,
        })),
      }),
    });

    await expect(
      callAs().deleteModule({ courseId: COURSE_ID, moduleId: MODULE_ID }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  // Invariant: lessons have no lifecycle independent of their module, so
  // deleting a module must cascade to every lesson under it.
  it('cascades to delete every lesson under the module', async () => {
    lessonQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [
          { ...lesson, lessonId: 'lesson-1' },
          { ...lesson, lessonId: 'lesson-2' },
        ],
      }),
    });

    await callAs().deleteModule({ courseId: COURSE_ID, moduleId: MODULE_ID });

    expect(lessonQueryPrimary).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
    });
    expect(lessonDelete).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: 'lesson-1',
    });
    expect(lessonDelete).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: 'lesson-2',
    });
  });

  it('does not attempt to delete any lessons when the module has none', async () => {
    await callAs().deleteModule({ courseId: COURSE_ID, moduleId: MODULE_ID });

    expect(lessonDelete).not.toHaveBeenCalled();
  });
});
