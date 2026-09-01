/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Badge } from '@wattle/common-shadcn/components/ui/badge';
import { Button } from '@wattle/common-shadcn/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@wattle/common-shadcn/components/ui/card';
import { Input } from '@wattle/common-shadcn/components/ui/input';
import { Textarea } from '@wattle/common-shadcn/components/ui/textarea';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Eye,
  FileText,
  Info,
  LockKeyhole,
  Users,
} from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/_authenticated/courses_/new')({
  component: RouteComponent,
});

const steps = [
  {
    title: 'Basic information',
    description: 'Name and describe',
    icon: FileText,
  },
  { title: 'Delivery', description: 'Schedule and access', icon: CalendarDays },
] as const;

const fieldClassName =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30';
const labelClassName = 'text-sm font-medium leading-none';

function RouteComponent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [access, setAccess] = useState<'private' | 'catalogue'>('private');
  const createCourse = () => {
    void navigate({
      to: '/courses/$courseId',
      params: { courseId: 'draft' },
    });
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 pb-10">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Create a course
            </h1>
            <Badge variant="secondary">Draft</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up the course details and delivery. You will add modules,
            lessons, and assessments from the course page afterward.
          </p>
        </div>
      </section>

      <nav aria-label="Course creation progress">
        <ol className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-sm">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const isCurrent = index === step;
            const isComplete = index < step;
            return (
              <li key={item.title} className="relative">
                {index > 0 && (
                  <span className="absolute left-0 top-1/2 h-10 w-px -translate-y-1/2 bg-border" />
                )}
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex w-full items-center justify-center gap-3 px-3 py-4 text-left transition-colors sm:px-6 ${isCurrent ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full ${isCurrent ? 'bg-primary text-primary-foreground' : isComplete ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}
                  >
                    {isComplete ? (
                      <Check className="size-4" />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-semibold ${isCurrent ? 'text-primary' : ''}`}
                    >
                      {item.title}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {item.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div>
        <div>
          <section hidden={step !== 0} aria-labelledby="basics-heading">
            <Card className="gap-5 py-5">
              <CardHeader className="px-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <FileText className="size-5" />
                  </div>
                  <div>
                    <CardTitle id="basics-heading" className="text-lg">
                      Basic course information
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Help instructors and students identify the course.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 px-5 sm:grid-cols-2 sm:px-6">
                <div className="space-y-2 sm:col-span-2">
                  <label className={labelClassName} htmlFor="course-title">
                    Course title
                  </label>
                  <Input
                    id="course-title"
                    placeholder="e.g. Foundations of Environmental Science"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use a clear title that students will recognise.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className={labelClassName} htmlFor="course-code">
                    Course code
                  </label>
                  <Input id="course-code" placeholder="e.g. ENV101" />
                </div>
                <div className="space-y-2">
                  <label className={labelClassName} htmlFor="course-category">
                    Category
                  </label>
                  <select
                    id="course-category"
                    className={fieldClassName}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    <option>Science</option>
                    <option>Mathematics</option>
                    <option>Communication</option>
                    <option>Data and technology</option>
                    <option>Professional development</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className={labelClassName} htmlFor="course-summary">
                    Course summary
                  </label>
                  <Textarea
                    id="course-summary"
                    className="min-h-32 resize-y"
                    placeholder="Describe what students will learn and who this course is for."
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    0 / 500 characters
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section
            hidden={step !== 1}
            aria-labelledby="delivery-heading"
            className="space-y-6"
          >
            <Card className="gap-5 py-5">
              <CardHeader className="px-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <CalendarDays className="size-5" />
                  </div>
                  <div>
                    <CardTitle id="delivery-heading" className="text-lg">
                      Schedule and pace
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Choose when the course runs and how learners progress.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 px-5 sm:grid-cols-2 sm:px-6">
                <div className="space-y-2">
                  <label className={labelClassName} htmlFor="course-term">
                    Teaching period
                  </label>
                  <select
                    id="course-term"
                    className={fieldClassName}
                    defaultValue="semester-2"
                  >
                    <option value="semester-2">Semester 2, 2026</option>
                    <option value="term-4">Term 4, 2026</option>
                    <option value="self-paced">Self-paced</option>
                    <option value="custom">Custom dates</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className={labelClassName} htmlFor="course-timezone">
                    Time zone
                  </label>
                  <select
                    id="course-timezone"
                    className={fieldClassName}
                    defaultValue="sydney"
                  >
                    <option value="sydney">Australia/Sydney (AEST/AEDT)</option>
                    <option value="perth">Australia/Perth (AWST)</option>
                    <option value="utc">UTC</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className={labelClassName} htmlFor="start-date">
                    Start date
                  </label>
                  <Input id="start-date" type="date" />
                </div>
                <div className="space-y-2">
                  <label className={labelClassName} htmlFor="end-date">
                    End date
                  </label>
                  <Input id="end-date" type="date" />
                </div>
                <fieldset className="space-y-3 sm:col-span-2">
                  <legend className={labelClassName}>Course pace</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary bg-primary/5 p-4">
                      <input
                        type="radio"
                        name="pace"
                        defaultChecked
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-semibold">
                          Instructor-led
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          Activities follow your scheduled dates.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-muted/40">
                      <input
                        type="radio"
                        name="pace"
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-semibold">
                          Self-paced
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          Students progress on their own schedule.
                        </span>
                      </span>
                    </label>
                  </div>
                </fieldset>
              </CardContent>
            </Card>

            <Card className="gap-5 py-5">
              <CardHeader className="px-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Users className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      Access and enrolment
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Control how students discover this course.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 px-5 sm:grid-cols-2 sm:px-6">
                {[
                  {
                    value: 'private' as const,
                    icon: LockKeyhole,
                    title: 'Private',
                    description:
                      'Only invited or manually enrolled students can access it.',
                  },
                  {
                    value: 'catalogue' as const,
                    icon: Eye,
                    title: 'Visible in catalogue',
                    description:
                      'Students can discover the course and request enrolment.',
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAccess(option.value)}
                    aria-pressed={access === option.value}
                    className={`relative flex items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${access === option.value ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <option.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-semibold">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                    {access === option.value && (
                      <Check className="absolute right-3 top-3 size-4 text-primary" />
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Content comes next</p>
                  <p className="mt-1 text-xs leading-5">
                    After creating the draft, open the course to add modules,
                    lessons, assignments, and quizzes.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:px-4">
        <Button
          variant="outline"
          type="button"
          disabled={step === 0}
          onClick={() => setStep(0)}
        >
          <ArrowLeft /> Back
        </Button>
        <p className="hidden text-xs text-muted-foreground sm:block">
          {steps[step].title}
        </p>
        {step === 0 ? (
          <Button type="button" onClick={() => setStep(1)}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button type="button" onClick={createCourse}>
            <BookOpen /> Create draft course
          </Button>
        )}
      </footer>
    </main>
  );
}
