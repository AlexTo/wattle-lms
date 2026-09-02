/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute } from '@tanstack/react-router';
import { Badge } from '@wattle/common-shadcn/components/ui/badge';
import { Button } from '@wattle/common-shadcn/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@wattle/common-shadcn/components/ui/card';
import { Input } from '@wattle/common-shadcn/components/ui/input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@wattle/common-shadcn/components/ui/sheet';
import { Textarea } from '@wattle/common-shadcn/components/ui/textarea';
import {
  BookOpen,
  CalendarDays,
  CirclePlus,
  ClipboardCheck,
  Code2,
  FileQuestion,
  FileText,
  FileUp,
  GripVertical,
  Info,
  PencilLine,
  Save,
  Trash2,
  Type,
  Users,
  Video,
} from 'lucide-react';
import { useState } from 'react';
import {
  type CourseStatus,
  courseStatusStyles,
} from '../../components/course-status';

export const Route = createFileRoute('/_authenticated/courses_/$courseId')({
  component: RouteComponent,
});

type Resource = {
  id: number;
  title: string;
  type: 'file' | 'video' | 'text' | 'quiz';
};

type ModuleItem =
  | { id: number; title: string; type: 'lesson'; resources: Resource[] }
  | {
      id: number;
      title: string;
      type: 'assignment';
      submissionType: 'quiz' | 'code' | 'file' | null;
      submissionTitle: string;
    };

type CourseModule = {
  id: number;
  title: string;
  items: ModuleItem[];
};

type CourseDetails = {
  code: string;
  title: string;
  description: string;
  term: string;
  status: CourseStatus;
  students: number;
  updated: string;
};

const courseDetails: Record<string, CourseDetails> = {
  BIO102: {
    code: 'BIO102',
    title: 'Foundations of Biology',
    description:
      'Explore the foundations of cell biology, genetics, evolution, and ecology through practical activities and assessments.',
    term: 'Semester 2, 2026',
    status: 'Published',
    students: 24,
    updated: 'Updated 2 hours ago',
  },
  MTH201: {
    code: 'MTH201',
    title: 'Applied Mathematics',
    description:
      'Apply mathematical modelling and problem-solving techniques to practical scientific and engineering scenarios.',
    term: 'Semester 2, 2026',
    status: 'Published',
    students: 31,
    updated: 'Updated yesterday',
  },
  COM105: {
    code: 'COM105',
    title: 'Academic Communication',
    description:
      'Build effective academic reading, writing, research, and presentation skills for university study.',
    term: 'Semester 2, 2026',
    status: 'Published',
    students: 19,
    updated: 'Updated 3 days ago',
  },
  DAT210: {
    code: 'DAT210',
    title: 'Data Visualisation',
    description:
      'Turn complex data into clear, accurate, and compelling visual stories for a range of audiences.',
    term: 'Term 4, 2026',
    status: 'Draft',
    students: 0,
    updated: 'Updated 30 minutes ago',
  },
  BIO101: {
    code: 'BIO101',
    title: 'Introduction to Life Sciences',
    description:
      'An introduction to the key concepts, methods, and applications that underpin the life sciences.',
    term: 'Semester 1, 2026',
    status: 'Archived',
    students: 28,
    updated: 'Archived 30 Jun',
  },
  SCI090: {
    code: 'SCI090',
    title: 'Essential Study Skills for Science',
    description:
      'Develop the practical study, laboratory, numeracy, and communication skills needed for science courses.',
    term: 'Term 1, 2026',
    status: 'Archived',
    students: 42,
    updated: 'Archived 4 Apr',
  },
};

const getInitialModules = (course: CourseDetails): CourseModule[] => [
  {
    id: 1,
    title: `Module 1: Introduction to ${course.title}`,
    items: [
      {
        id: 11,
        title: 'Welcome and course overview',
        type: 'lesson',
        resources: [
          { id: 111, title: 'Course guide', type: 'file' },
          { id: 112, title: 'Welcome video', type: 'video' },
        ],
      },
      {
        id: 12,
        title: 'Getting started quiz',
        type: 'assignment',
        submissionType: 'quiz',
        submissionTitle: 'Module 1 knowledge check',
      },
    ],
  },
  {
    id: 2,
    title: 'Module 2: Core concepts',
    items: [
      {
        id: 21,
        title: `Core concepts in ${course.code}`,
        type: 'lesson',
        resources: [
          { id: 211, title: 'Key concepts', type: 'text' },
          { id: 212, title: 'Practice quiz', type: 'quiz' },
        ],
      },
      {
        id: 22,
        title: 'Applied activity',
        type: 'assignment',
        submissionType: 'file',
        submissionTitle: 'Upload your completed activity',
      },
    ],
  },
];

type EditorTarget =
  | {
      kind: 'module';
      moduleId: number;
      type: 'module';
      title: string;
    }
  | {
      kind: 'item';
      moduleId: number;
      itemId: number;
      type: ModuleItem['type'];
      title: string;
    }
  | {
      kind: 'resource';
      moduleId: number;
      lessonId: number;
      resourceId: number;
      type: Resource['type'];
      title: string;
    }
  | {
      kind: 'submission';
      moduleId: number;
      assignmentId: number;
      type: 'quiz' | 'code' | 'file';
      title: string;
    };

function RouteComponent() {
  const { courseId } = Route.useParams();
  const course =
    courseDetails[courseId.toUpperCase()] ??
    ({
      code: courseId === 'draft' ? 'DRAFT' : courseId.toUpperCase(),
      title: 'New draft course',
      description:
        'Add course information and organise the learning experience into modules, lessons, and assignments.',
      term: 'Not scheduled',
      status: 'Draft',
      students: 0,
      updated: 'Not saved',
    } satisfies CourseDetails);
  const [modules, setModules] = useState<CourseModule[]>(() =>
    courseId === 'draft' ? [] : getInitialModules(course),
  );
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [editorTitle, setEditorTitle] = useState('');

  const openEditor = (target: EditorTarget) => {
    setEditor(target);
    setEditorTitle(target.title);
  };

  const changeModules = (
    update: (current: CourseModule[]) => CourseModule[],
  ) => {
    setModules(update);
  };

  const addModule = () => {
    changeModules((current) => [
      ...current,
      {
        id: Date.now(),
        title: `Module ${current.length + 1}: Untitled module`,
        items: [],
      },
    ]);
  };

  const addModuleItem = (moduleId: number, type: 'lesson' | 'assignment') => {
    changeModules((current) =>
      current.map((module) => {
        if (module.id !== moduleId) return module;
        const count =
          module.items.filter((item) => item.type === type).length + 1;
        const item: ModuleItem =
          type === 'lesson'
            ? {
                id: Date.now(),
                title: `Untitled lesson ${count}`,
                type,
                resources: [],
              }
            : {
                id: Date.now(),
                title: `Untitled assignment ${count}`,
                type,
                submissionType: null,
                submissionTitle: '',
              };
        return { ...module, items: [...module.items, item] };
      }),
    );
  };

  const addResource = (
    moduleId: number,
    lessonId: number,
    type: Resource['type'],
  ) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              items: module.items.map((item) =>
                item.id === lessonId && item.type === 'lesson'
                  ? {
                      ...item,
                      resources: [
                        ...item.resources,
                        {
                          id: Date.now(),
                          title: `Untitled ${type}`,
                          type,
                        },
                      ],
                    }
                  : item,
              ),
            }
          : module,
      ),
    );
  };

  const updateModuleTitle = (moduleId: number, title: string) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId ? { ...module, title } : module,
      ),
    );
  };

  const updateItemTitle = (moduleId: number, itemId: number, title: string) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              items: module.items.map((item) =>
                item.id === itemId ? { ...item, title } : item,
              ),
            }
          : module,
      ),
    );
  };

  const setAssignmentType = (
    moduleId: number,
    assignmentId: number,
    submissionType: 'quiz' | 'code' | 'file',
  ) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              items: module.items.map((item) =>
                item.id === assignmentId && item.type === 'assignment'
                  ? {
                      ...item,
                      submissionType,
                      submissionTitle:
                        submissionType === 'quiz'
                          ? 'Untitled quiz'
                          : submissionType === 'code'
                            ? 'Untitled coding exercise'
                            : 'File submission',
                    }
                  : item,
              ),
            }
          : module,
      ),
    );
  };

  const updateSubmissionTitle = (
    moduleId: number,
    assignmentId: number,
    submissionTitle: string,
  ) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              items: module.items.map((item) =>
                item.id === assignmentId && item.type === 'assignment'
                  ? { ...item, submissionTitle }
                  : item,
              ),
            }
          : module,
      ),
    );
  };

  const clearSubmissionType = (moduleId: number, assignmentId: number) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              items: module.items.map((item) =>
                item.id === assignmentId && item.type === 'assignment'
                  ? { ...item, submissionType: null, submissionTitle: '' }
                  : item,
              ),
            }
          : module,
      ),
    );
  };

  const updateResourceTitle = (
    moduleId: number,
    lessonId: number,
    resourceId: number,
    title: string,
  ) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              items: module.items.map((item) =>
                item.id === lessonId && item.type === 'lesson'
                  ? {
                      ...item,
                      resources: item.resources.map((resource) =>
                        resource.id === resourceId
                          ? { ...resource, title }
                          : resource,
                      ),
                    }
                  : item,
              ),
            }
          : module,
      ),
    );
  };

  const removeModule = (moduleId: number) => {
    changeModules((current) =>
      current.filter((module) => module.id !== moduleId),
    );
  };

  const removeItem = (moduleId: number, itemId: number) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              items: module.items.filter((item) => item.id !== itemId),
            }
          : module,
      ),
    );
  };

  const removeResource = (
    moduleId: number,
    lessonId: number,
    resourceId: number,
  ) => {
    changeModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              items: module.items.map((item) =>
                item.id === lessonId && item.type === 'lesson'
                  ? {
                      ...item,
                      resources: item.resources.filter(
                        (resource) => resource.id !== resourceId,
                      ),
                    }
                  : item,
              ),
            }
          : module,
      ),
    );
  };

  const saveEditor = () => {
    if (!editor) return;
    if (editor.kind === 'module') {
      updateModuleTitle(editor.moduleId, editorTitle);
    } else if (editor.kind === 'item') {
      updateItemTitle(editor.moduleId, editor.itemId, editorTitle);
    } else if (editor.kind === 'resource') {
      updateResourceTitle(
        editor.moduleId,
        editor.lessonId,
        editor.resourceId,
        editorTitle,
      );
    } else {
      updateSubmissionTitle(editor.moduleId, editor.assignmentId, editorTitle);
    }
    setEditor(null);
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 pb-10">
      <section>
        <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tracking-wide text-primary">
                  {course.code}
                </span>
                <Badge className={courseStatusStyles[course.status]}>
                  {course.status}
                </Badge>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                {course.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {course.description}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4" /> {course.term}
            </span>
            <span className="flex items-center gap-2">
              <Users className="size-4" /> {course.students} students
            </span>
            <span>{course.updated}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="content-heading" className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h2 id="content-heading" className="text-xl font-semibold">
              Course content
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Place lessons or assignments in modules, with files and videos
            inside each lesson.
          </p>
        </div>

        {modules.length === 0 ? (
          <Card className="border-dashed py-14 text-center">
            <CardContent>
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BookOpen className="size-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">
                Start with your first module
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Modules are the top-level sections of a course. Lessons and
                assignments live inside them.
              </p>
              <Button className="mt-5" type="button" onClick={addModule}>
                <CirclePlus /> Create first module
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {modules.map((module, moduleIndex) => (
              <Card key={module.id} className="gap-0 overflow-hidden py-0">
                <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2">
                    <GripVertical
                      className="size-4 shrink-0 cursor-grab text-muted-foreground"
                      aria-label="Drag module to reorder"
                    />
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold shadow-xs">
                      {moduleIndex + 1}
                    </span>
                    <Input
                      value={module.title}
                      onChange={(event) =>
                        updateModuleTitle(module.id, event.target.value)
                      }
                      aria-label={`Module ${moduleIndex + 1} title`}
                      className="border-0 bg-transparent font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
                    />
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {module.items.length}{' '}
                      {module.items.length === 1 ? 'item' : 'items'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      aria-label={`Edit module ${moduleIndex + 1}`}
                      onClick={() =>
                        openEditor({
                          kind: 'module',
                          moduleId: module.id,
                          type: 'module',
                          title: module.title,
                        })
                      }
                    >
                      <PencilLine />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      aria-label={`Remove module ${moduleIndex + 1}`}
                      className="-ml-2"
                      onClick={() => removeModule(module.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {module.items.map((item, itemIndex) => (
                    <article
                      key={item.id}
                      className="border-t first:border-t-0"
                    >
                      <div className="group flex items-center gap-2 px-4 py-2.5 sm:pl-12 sm:pr-5">
                        <GripVertical
                          className="size-4 shrink-0 cursor-grab text-muted-foreground"
                          aria-label="Drag item to reorder"
                        />
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${item.type === 'lesson' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'}`}
                        >
                          {item.type === 'lesson' ? (
                            <FileText className="size-4" />
                          ) : (
                            <ClipboardCheck className="size-4" />
                          )}
                        </div>
                        <Input
                          value={item.title}
                          onChange={(event) =>
                            updateItemTitle(
                              module.id,
                              item.id,
                              event.target.value,
                            )
                          }
                          aria-label={`${item.type} ${itemIndex + 1} title`}
                          className="border-0 font-medium shadow-none focus-visible:ring-0"
                        />
                        <Badge
                          variant="outline"
                          className="hidden text-[10px] sm:inline-flex"
                        >
                          {item.type === 'lesson' ? 'Lesson' : 'Assignment'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          type="button"
                          aria-label={`Edit ${item.type}`}
                          onClick={() =>
                            openEditor({
                              kind: 'item',
                              moduleId: module.id,
                              itemId: item.id,
                              type: item.type,
                              title: item.title,
                            })
                          }
                        >
                          <PencilLine />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          type="button"
                          aria-label={`Remove ${item.type}`}
                          className="-ml-2"
                          onClick={() => removeItem(module.id, item.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>

                      {item.type === 'lesson' && (
                        <div className="bg-muted/15 pb-3 pl-12 pr-4 sm:pl-24 sm:pr-5">
                          {item.resources.map((resource) => (
                            <div
                              key={resource.id}
                              className="group/resource flex items-center gap-2 border-l px-3 py-2 transition-colors hover:bg-muted/50"
                            >
                              <div
                                className={`flex size-7 shrink-0 items-center justify-center rounded-md ${resource.type === 'file' ? 'bg-primary/10 text-primary' : resource.type === 'video' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : resource.type === 'text' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}
                              >
                                {resource.type === 'file' ? (
                                  <FileUp className="size-3.5" />
                                ) : resource.type === 'video' ? (
                                  <Video className="size-3.5" />
                                ) : resource.type === 'text' ? (
                                  <Type className="size-3.5" />
                                ) : (
                                  <FileQuestion className="size-3.5" />
                                )}
                              </div>
                              <Input
                                value={resource.title}
                                onChange={(event) =>
                                  updateResourceTitle(
                                    module.id,
                                    item.id,
                                    resource.id,
                                    event.target.value,
                                  )
                                }
                                aria-label={`${resource.type} title`}
                                className="h-8 border-0 text-xs shadow-none focus-visible:ring-0"
                              />
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                type="button"
                                aria-label={`Edit ${resource.type}`}
                                className="transition-opacity sm:opacity-0 sm:group-hover/resource:opacity-100 focus-visible:opacity-100"
                                onClick={() =>
                                  openEditor({
                                    kind: 'resource',
                                    moduleId: module.id,
                                    lessonId: item.id,
                                    resourceId: resource.id,
                                    type: resource.type,
                                    title: resource.title,
                                  })
                                }
                              >
                                <PencilLine />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                type="button"
                                aria-label={`Remove ${resource.type}`}
                                className="-ml-2 transition-opacity sm:opacity-0 sm:group-hover/resource:opacity-100 focus-visible:opacity-100"
                                onClick={() =>
                                  removeResource(
                                    module.id,
                                    item.id,
                                    resource.id,
                                  )
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          ))}
                          <div className="flex flex-wrap gap-2 border-l px-3 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() =>
                                addResource(module.id, item.id, 'file')
                              }
                            >
                              <FileUp /> File
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() =>
                                addResource(module.id, item.id, 'video')
                              }
                            >
                              <Video /> Video
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() =>
                                addResource(module.id, item.id, 'text')
                              }
                            >
                              <Type /> Text
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() =>
                                addResource(module.id, item.id, 'quiz')
                              }
                            >
                              <FileQuestion /> Quiz
                            </Button>
                          </div>
                        </div>
                      )}
                      {item.type === 'assignment' && (
                        <div className="bg-muted/15 pb-3 pl-12 pr-4 sm:pl-24 sm:pr-5">
                          {item.submissionType && (
                            <div className="group/submission flex items-center gap-2 border-l px-3 py-2">
                              <div
                                className={`flex size-7 shrink-0 items-center justify-center rounded-md ${item.submissionType === 'quiz' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : item.submissionType === 'code' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-primary/10 text-primary'}`}
                              >
                                {item.submissionType === 'quiz' ? (
                                  <FileQuestion className="size-3.5" />
                                ) : item.submissionType === 'code' ? (
                                  <Code2 className="size-3.5" />
                                ) : (
                                  <FileUp className="size-3.5" />
                                )}
                              </div>
                              <Input
                                value={item.submissionTitle}
                                onChange={(event) =>
                                  updateSubmissionTitle(
                                    module.id,
                                    item.id,
                                    event.target.value,
                                  )
                                }
                                aria-label={`${item.submissionType} title`}
                                className="h-8 border-0 text-xs shadow-none focus-visible:ring-0"
                              />
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                type="button"
                                aria-label={`Edit ${item.submissionType}`}
                                className="transition-opacity sm:opacity-0 sm:group-hover/submission:opacity-100 focus-visible:opacity-100"
                                onClick={() =>
                                  openEditor({
                                    kind: 'submission',
                                    moduleId: module.id,
                                    assignmentId: item.id,
                                    type: item.submissionType!,
                                    title: item.submissionTitle,
                                  })
                                }
                              >
                                <PencilLine />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                type="button"
                                aria-label="Remove assignment type"
                                className="-ml-2 transition-opacity sm:opacity-0 sm:group-hover/submission:opacity-100 focus-visible:opacity-100"
                                onClick={() =>
                                  clearSubmissionType(module.id, item.id)
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 border-l px-3 pt-2">
                            {[
                              {
                                type: 'quiz' as const,
                                label: 'Quiz',
                                icon: FileQuestion,
                              },
                              {
                                type: 'code' as const,
                                label: 'Code',
                                icon: Code2,
                              },
                              {
                                type: 'file' as const,
                                label: 'File submission',
                                icon: FileUp,
                              },
                            ].map((option) => (
                              <Button
                                key={option.type}
                                variant="outline"
                                size="sm"
                                type="button"
                                disabled={item.submissionType === option.type}
                                onClick={() =>
                                  setAssignmentType(
                                    module.id,
                                    item.id,
                                    option.type,
                                  )
                                }
                              >
                                <option.icon /> {option.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                  <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-3 sm:pl-12 sm:pr-5">
                    <span className="mr-1 text-xs font-medium text-muted-foreground">
                      New content:
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => addModuleItem(module.id, 'lesson')}
                    >
                      <FileText /> Lesson
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => addModuleItem(module.id, 'assignment')}
                    >
                      <ClipboardCheck /> Assignment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" type="button" onClick={addModule}>
              <CirclePlus /> New module
            </Button>
          </div>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-dashed bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" /> Prototype only: course
        content is not persisted after refresh.
      </div>

      <Sheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>
              Edit{' '}
              {editor?.type
                ? editor.type.charAt(0).toUpperCase() + editor.type.slice(1)
                : 'content'}
            </SheetTitle>
            <SheetDescription>
              Update the details students will see for this content item.
            </SheetDescription>
          </SheetHeader>

          {editor && (
            <div className="flex-1 space-y-6 px-6 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="editor-title">
                  Title
                </label>
                <Input
                  id="editor-title"
                  value={editorTitle}
                  onChange={(event) => setEditorTitle(event.target.value)}
                />
              </div>

              {editor.kind === 'module' && (
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="module-description"
                  >
                    Module description
                  </label>
                  <Textarea
                    id="module-description"
                    className="min-h-28"
                    placeholder="Introduce this section of the course."
                  />
                </div>
              )}

              {editor.kind === 'item' && editor.type === 'lesson' && (
                <>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="lesson-summary"
                    >
                      Lesson summary
                    </label>
                    <Textarea
                      id="lesson-summary"
                      className="min-h-28"
                      placeholder="Explain what students will learn in this lesson."
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="lesson-duration"
                    >
                      Estimated duration
                    </label>
                    <Input id="lesson-duration" placeholder="e.g. 20 minutes" />
                  </div>
                </>
              )}

              {editor.kind === 'item' && editor.type === 'assignment' && (
                <>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="assignment-instructions"
                    >
                      Instructions
                    </label>
                    <Textarea
                      id="assignment-instructions"
                      className="min-h-36"
                      placeholder="Describe what students need to submit."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="assignment-due"
                      >
                        Due date
                      </label>
                      <Input id="assignment-due" type="date" />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="assignment-points"
                      >
                        Points
                      </label>
                      <Input
                        id="assignment-points"
                        type="number"
                        placeholder="100"
                      />
                    </div>
                  </div>
                </>
              )}

              {editor.kind === 'resource' && editor.type === 'file' && (
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="resource-file"
                  >
                    Replace file
                  </label>
                  <Input id="resource-file" type="file" />
                  <p className="text-xs text-muted-foreground">
                    Uploaded files will be available for students to download.
                  </p>
                </div>
              )}

              {editor.kind === 'resource' && editor.type === 'video' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="video-url">
                      Video URL
                    </label>
                    <Input id="video-url" type="url" placeholder="https://…" />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="video-caption"
                    >
                      Caption or transcript
                    </label>
                    <Textarea id="video-caption" className="min-h-28" />
                  </div>
                </>
              )}

              {editor.kind === 'resource' && editor.type === 'text' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="text-content">
                    Content
                  </label>
                  <Textarea
                    id="text-content"
                    className="min-h-56"
                    placeholder="Write the lesson content here."
                  />
                </div>
              )}

              {editor.kind === 'resource' && editor.type === 'quiz' && (
                <>
                  <div className="rounded-xl border border-dashed bg-muted/30 p-5 text-center">
                    <FileQuestion className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">No questions yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      type="button"
                    >
                      <CirclePlus /> New question
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="quiz-score"
                      >
                        Passing score
                      </label>
                      <Input id="quiz-score" type="number" placeholder="80%" />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="quiz-attempts"
                      >
                        Attempts
                      </label>
                      <Input
                        id="quiz-attempts"
                        type="number"
                        placeholder="Unlimited"
                      />
                    </div>
                  </div>
                </>
              )}

              {editor.kind === 'submission' && editor.type === 'quiz' && (
                <>
                  <div className="rounded-xl border border-dashed bg-muted/30 p-5 text-center">
                    <FileQuestion className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">No questions yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      type="button"
                    >
                      <CirclePlus /> New question
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="assignment-quiz-score"
                      >
                        Passing score
                      </label>
                      <Input
                        id="assignment-quiz-score"
                        type="number"
                        placeholder="80%"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="assignment-quiz-attempts"
                      >
                        Attempts
                      </label>
                      <Input
                        id="assignment-quiz-attempts"
                        type="number"
                        placeholder="1"
                      />
                    </div>
                  </div>
                </>
              )}

              {editor.kind === 'submission' && editor.type === 'code' && (
                <>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="code-language"
                    >
                      Programming language
                    </label>
                    <select
                      id="code-language"
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option>JavaScript</option>
                      <option>TypeScript</option>
                      <option>Python</option>
                      <option>Java</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="starter-code"
                    >
                      Starter code
                    </label>
                    <Textarea
                      id="starter-code"
                      className="min-h-40 font-mono"
                      placeholder="// Starter code"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="code-tests">
                      Evaluation notes
                    </label>
                    <Textarea
                      id="code-tests"
                      className="min-h-24"
                      placeholder="Describe how the submission will be evaluated."
                    />
                  </div>
                </>
              )}

              {editor.kind === 'submission' && editor.type === 'file' && (
                <>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="allowed-files"
                    >
                      Allowed file formats
                    </label>
                    <Input
                      id="allowed-files"
                      placeholder="e.g. PDF, DOCX, ZIP"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="file-count">
                      Maximum files
                    </label>
                    <Input id="file-count" type="number" placeholder="1" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="file-size">
                      Maximum file size
                    </label>
                    <Input id="file-size" placeholder="e.g. 25 MB" />
                  </div>
                </>
              )}
            </div>
          )}

          <SheetFooter className="border-t px-6 py-4 sm:flex-row sm:justify-end">
            <SheetClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </SheetClose>
            <Button type="button" onClick={saveEditor}>
              <Save /> Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}
