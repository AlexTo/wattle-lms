/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute, Link } from '@tanstack/react-router';
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@wattle/common-shadcn/components/ui/toggle-group';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CirclePlus,
  FileCheck2,
  GraduationCap,
  Search,
  Users,
} from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/_authenticated/courses')({
  component: RouteComponent,
});

type CourseStatus = 'Published' | 'Draft' | 'Archived';

const courses = [
  {
    code: 'BIO102',
    title: 'Foundations of Biology',
    term: 'Semester 2, 2026',
    status: 'Published' as CourseStatus,
    students: 24,
    ungraded: 18,
    modules: 8,
    next: 'Lab report due today at 11:59 pm',
    updated: 'Updated 2 hours ago',
    surface:
      'from-emerald-500/25 to-teal-500/10 text-emerald-700 dark:text-emerald-300',
  },
  {
    code: 'MTH201',
    title: 'Applied Mathematics',
    term: 'Semester 2, 2026',
    status: 'Published' as CourseStatus,
    students: 31,
    ungraded: 9,
    modules: 10,
    next: 'Problem set 5 due today at 5:00 pm',
    updated: 'Updated yesterday',
    surface: 'from-blue-500/25 to-cyan-500/10 text-blue-700 dark:text-blue-300',
  },
  {
    code: 'COM105',
    title: 'Academic Communication',
    term: 'Semester 2, 2026',
    status: 'Published' as CourseStatus,
    students: 19,
    ungraded: 6,
    modules: 7,
    next: 'Annotated bibliography due 6 Sep',
    updated: 'Updated 3 days ago',
    surface:
      'from-violet-500/25 to-fuchsia-500/10 text-violet-700 dark:text-violet-300',
  },
  {
    code: 'DAT210',
    title: 'Data Visualisation',
    term: 'Term 4, 2026',
    status: 'Draft' as CourseStatus,
    students: 0,
    ungraded: 0,
    modules: 4,
    next: 'Course starts 14 Sep',
    updated: 'Updated 30 minutes ago',
    surface:
      'from-amber-500/25 to-orange-500/10 text-amber-700 dark:text-amber-300',
  },
  {
    code: 'BIO101',
    title: 'Introduction to Life Sciences',
    term: 'Semester 1, 2026',
    status: 'Archived' as CourseStatus,
    students: 28,
    ungraded: 0,
    modules: 9,
    next: 'Course ended 21 Jun',
    updated: 'Archived 30 Jun',
    surface: 'from-rose-500/20 to-pink-500/10 text-rose-700 dark:text-rose-300',
  },
  {
    code: 'SCI090',
    title: 'Essential Study Skills for Science',
    term: 'Term 1, 2026',
    status: 'Archived' as CourseStatus,
    students: 42,
    ungraded: 0,
    modules: 5,
    next: 'Course ended 28 Mar',
    updated: 'Archived 4 Apr',
    surface:
      'from-slate-500/20 to-zinc-500/10 text-slate-700 dark:text-slate-300',
  },
];

const filters = ['All', 'Published', 'Draft', 'Archived'] as const;
type CourseFilter = (typeof filters)[number];

const statusStyles: Record<CourseStatus, string> = {
  Published:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  Draft: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  Archived: 'bg-muted text-muted-foreground',
};

function RouteComponent() {
  const [filter, setFilter] = useState<CourseFilter>('All');
  const [query, setQuery] = useState('');
  const normalisedQuery = query.trim().toLocaleLowerCase();
  const visibleCourses = courses.filter(
    (course) =>
      (filter === 'All' || course.status === filter) &&
      (!normalisedQuery ||
        course.title.toLocaleLowerCase().includes(normalisedQuery) ||
        course.code.toLocaleLowerCase().includes(normalisedQuery)),
  );

  return (
    <main className="w-full space-y-6 pb-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <BookOpen className="size-4" /> Teaching
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            My Courses
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage every course you teach and see its current workload.
          </p>
        </div>
        <Button asChild>
          <Link to="/courses/new">
            <CirclePlus /> Create course
          </Link>
        </Button>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Course summary"
      >
        {[
          {
            label: 'Active courses',
            value: '3',
            detail: '74 enrolled students',
          },
          {
            label: 'Draft courses',
            value: '1',
            detail: 'Preparing for publication',
          },
          {
            label: 'Awaiting grading',
            value: '33',
            detail: 'Across 3 assignments',
          },
        ].map((metric) => (
          <Card key={metric.label} className="gap-2 py-4">
            <CardContent className="px-5">
              <p className="text-sm text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-2xl font-bold">{metric.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {metric.detail}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4" aria-labelledby="course-list-heading">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h2 id="course-list-heading" className="text-lg font-semibold">
              All courses
            </h2>
            <p className="text-sm text-muted-foreground">
              {visibleCourses.length}{' '}
              {visibleCourses.length === 1 ? 'course' : 'courses'} shown
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or code"
                aria-label="Search courses"
                className="pl-9"
              />
            </div>
            <ToggleGroup
              type="single"
              value={filter}
              onValueChange={(value) => {
                if (value) setFilter(value as CourseFilter);
              }}
              variant="outline"
              size="sm"
              className="max-w-full overflow-x-auto"
              aria-label="Filter courses by status"
            >
              {filters.map((item) => (
                <ToggleGroupItem
                  key={item}
                  value={item}
                  aria-label={`Show ${item.toLocaleLowerCase()} courses`}
                >
                  {item}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        {visibleCourses.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCourses.map((course) => (
              <Card
                key={course.code}
                className="h-full gap-4 overflow-hidden py-0 transition-shadow hover:shadow-md"
              >
                <div
                  className={`flex h-24 items-end bg-gradient-to-br p-5 ${course.surface}`}
                >
                  <div className="flex size-11 items-center justify-center rounded-xl bg-background/85 shadow-sm backdrop-blur-sm">
                    <BookOpen className="size-5" />
                  </div>
                </div>
                <CardHeader className="gap-3 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground">
                        {course.code}
                      </p>
                      <CardTitle className="text-base leading-5">
                        {course.title}
                      </CardTitle>
                    </div>
                    <Badge className={statusStyles[course.status]}>
                      {course.status}
                    </Badge>
                  </div>
                  <CardDescription>{course.term}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-4 px-5 pb-5">
                  <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/20 py-3 text-center">
                    <div className="px-2">
                      <Users className="mx-auto size-4 text-muted-foreground" />
                      <p className="mt-1 text-sm font-semibold">
                        {course.students}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Students
                      </p>
                    </div>
                    <div className="px-2">
                      <FileCheck2 className="mx-auto size-4 text-muted-foreground" />
                      <p className="mt-1 text-sm font-semibold">
                        {course.ungraded}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Ungraded
                      </p>
                    </div>
                    <div className="px-2">
                      <BookOpen className="mx-auto size-4 text-muted-foreground" />
                      <p className="mt-1 text-sm font-semibold">
                        {course.modules}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Modules
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="mt-0.5 size-3 shrink-0" />{' '}
                      {course.next}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {course.updated}
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" type="button">
                    Open course <ArrowRight />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed py-12 text-center">
            <CardContent>
              <Search className="mx-auto size-8 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">No courses found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try another search or status filter.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilter('All');
                }}
              >
                Clear filters
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <GraduationCap className="size-4 shrink-0" /> Prototype content shown
        for design feedback; course data is illustrative.
      </div>
    </main>
  );
}
