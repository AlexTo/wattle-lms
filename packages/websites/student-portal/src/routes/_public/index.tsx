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
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarCheck,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  MessageCircleMore,
  Search,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/_public/')({
  component: RouteComponent,
});

const features = [
  {
    icon: LayoutDashboard,
    title: 'Everything in one place',
    description:
      'See your courses, upcoming work, announcements, and progress from one clear dashboard.',
  },
  {
    icon: CalendarCheck,
    title: 'Stay on track',
    description:
      'Keep deadlines visible and know what to focus on next, without hunting through every course.',
  },
  {
    icon: MessageCircleMore,
    title: 'Learn together',
    description:
      'Connect with teachers and classmates, ask questions, and keep course conversations flowing.',
  },
];

const courses = [
  {
    code: 'BIO102',
    title: 'Foundations of Biology',
    description:
      'Explore cells, genetics, ecosystems, and the living systems that shape our world.',
    duration: '8 weeks',
    level: 'Beginner',
    category: 'Science',
    icon: '🧬',
    surface: 'from-emerald-500/20 to-teal-500/5',
  },
  {
    code: 'MTH201',
    title: 'Applied Mathematics',
    description:
      'Build practical problem-solving skills through real-world mathematical models.',
    duration: '10 weeks',
    level: 'Intermediate',
    category: 'Mathematics',
    icon: '∑',
    surface: 'from-blue-500/20 to-indigo-500/5',
  },
  {
    code: 'DAT110',
    title: 'Data Literacy',
    description:
      'Learn to interpret, question, and communicate with data confidently.',
    duration: '6 weeks',
    level: 'Beginner',
    category: 'Technology',
    icon: '⌁',
    surface: 'from-violet-500/20 to-fuchsia-500/5',
  },
  {
    code: 'COM105',
    title: 'Academic Communication',
    description:
      'Write clearly, research effectively, and present your ideas with confidence.',
    duration: '6 weeks',
    level: 'Beginner',
    category: 'Communication',
    icon: '✎',
    surface: 'from-amber-500/20 to-orange-500/5',
  },
  {
    code: 'PSY101',
    title: 'Introduction to Psychology',
    description:
      'Understand human behaviour through cognition, development, and social psychology.',
    duration: '8 weeks',
    level: 'Beginner',
    category: 'Science',
    icon: '◉',
    surface: 'from-rose-500/20 to-pink-500/5',
  },
  {
    code: 'BUS120',
    title: 'Business Essentials',
    description:
      'Discover the core ideas behind teams, markets, strategy, and sustainable growth.',
    duration: '7 weeks',
    level: 'Beginner',
    category: 'Business',
    icon: '↗',
    surface: 'from-cyan-500/20 to-sky-500/5',
  },
];

const categories = [
  'All',
  'Science',
  'Technology',
  'Mathematics',
  'Communication',
  'Business',
] as const;

const steps = [
  {
    number: '01',
    title: 'Sign in',
    description: 'Use the account provided by your learning organisation.',
  },
  {
    number: '02',
    title: 'Find your courses',
    description: 'Your current courses and learning materials are ready to go.',
  },
  {
    number: '03',
    title: 'Keep moving',
    description: 'Pick up where you left off and see your next milestone.',
  },
];

function RouteComponent() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('All');
  const normalisedQuery = query.trim().toLowerCase();
  const visibleCourses = courses.filter(
    (course) =>
      (category === 'All' || course.category === category) &&
      (!normalisedQuery ||
        `${course.title} ${course.code} ${course.description} ${course.category}`
          .toLowerCase()
          .includes(normalisedQuery)),
  );

  return (
    <div className="w-full overflow-hidden text-left">
      <section className="relative isolate border-b px-6 py-20 sm:py-28 lg:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,var(--color-primary)_0,transparent_34%)] opacity-10"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Badge variant="secondary" className="mb-6 gap-2 px-3 py-1">
              <Sparkles className="size-3.5" /> Learning that moves with you
            </Badge>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Find your next course.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground text-pretty">
              Browse practical courses across science, technology, business, and
              more. Start with what interests you and learn at your pace.
            </p>
            <div className="relative mt-9 max-w-xl">
              <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search courses"
                className="h-14 rounded-xl bg-background pr-32 pl-12 text-base shadow-sm"
                placeholder="What would you like to learn?"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button className="absolute top-1.5 right-1.5 h-11" asChild>
                <a href="#courses">Search</a>
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span>Popular:</span>
              {['Biology', 'Data', 'Business'].map((term) => (
                <button
                  key={term}
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={() => setQuery(term)}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-primary/10 blur-2xl" />
            <Card className="overflow-hidden border-primary/20 shadow-xl">
              <CardHeader className="border-b bg-muted/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardDescription>Welcome back, learner</CardDescription>
                    <CardTitle className="mt-1">
                      Your week at a glance
                    </CardTitle>
                  </div>
                  <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <GraduationCap className="size-5" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">Foundations of Biology</span>
                    <span className="text-muted-foreground">68%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-[68%] rounded-full bg-primary" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-background p-4">
                    <BookOpen className="mb-3 size-5 text-primary" />
                    <p className="text-sm font-semibold">3 active courses</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Continue where you left off
                    </p>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <CalendarCheck className="mb-3 size-5 text-primary" />
                    <p className="text-sm font-semibold">2 tasks this week</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your next due dates
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-primary/10 p-4">
                  <Sparkles className="size-5 shrink-0 text-primary" />
                  <p className="text-sm">
                    You are making great progress. Keep it going!
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="courses" className="scroll-mt-20 px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                Course catalogue
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Browse courses for every goal.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Search by topic or choose a category to find your next learning
                opportunity.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/signin">
                View your courses <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-8 flex flex-col gap-4 rounded-2xl border bg-muted/30 p-4 sm:p-5">
            <div className="relative">
              <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Filter course catalogue"
                className="h-11 bg-background pl-10"
                placeholder="Search by course name, code, or topic"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div
              className="flex flex-wrap gap-2"
              aria-label="Course categories"
            >
              {categories.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={category === item ? 'default' : 'outline'}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Showing {visibleCourses.length}{' '}
              {visibleCourses.length === 1 ? 'course' : 'courses'}
              {category !== 'All' ? ` in ${category}` : ''}
            </p>
            {(query || category !== 'All') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setCategory('All');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {visibleCourses.map((course) => (
              <Card
                key={course.code}
                className="group overflow-hidden pt-0 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                <div
                  className={`flex h-36 items-center justify-center bg-gradient-to-br ${course.surface}`}
                >
                  <span
                    aria-hidden="true"
                    className="text-5xl font-semibold text-foreground/80 transition-transform group-hover:scale-110"
                  >
                    {course.icon}
                  </span>
                </div>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="secondary">{course.code}</Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" /> {course.duration}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-primary">
                    {course.category}
                  </p>
                  <CardTitle className="mt-2">{course.title}</CardTitle>
                  <CardDescription className="leading-6">
                    {course.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex items-center justify-between border-t pt-5">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <BarChart3 className="size-4" /> {course.level}
                  </span>
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      to="/signin"
                      aria-label={`Sign in to view ${course.title}`}
                    >
                      Learn more <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {visibleCourses.length === 0 && (
            <div className="mt-10 rounded-2xl border border-dashed px-6 py-14 text-center">
              <Search className="mx-auto size-8 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">No matching courses</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Try another keyword or clear your filters to browse all courses.
              </p>
              <Button
                className="mt-5"
                type="button"
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setCategory('All');
                }}
              >
                Show all courses
              </Button>
            </div>
          )}
        </div>
      </section>

      <section
        id="features"
        className="scroll-mt-20 border-t bg-muted/20 px-6 py-20 lg:px-8"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Built for focus
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Spend less time searching. More time learning.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Wattle brings the important parts of your study day together in a
              simple, welcoming workspace.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="bg-card/60 shadow-sm">
                <CardHeader>
                  <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="leading-7 text-muted-foreground">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/40 px-6 py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Start simply
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              From sign-in to study in moments.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              No complicated setup. Your learning organisation takes care of the
              details so you can get straight to your work.
            </p>
          </div>
          <ol className="grid gap-8 sm:grid-cols-3">
            {steps.map((step) => (
              <li key={step.number}>
                <span className="font-mono text-sm font-bold text-primary">
                  {step.number}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-6 py-20 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-lg sm:px-12">
          <GraduationCap className="size-10" />
          <h2 className="mt-5 text-3xl font-bold tracking-tight">
            Ready to continue your learning?
          </h2>
          <p className="mt-4 max-w-xl text-primary-foreground/80">
            Sign in to view your courses, upcoming work, and latest updates.
          </p>
          <Button className="mt-7" size="lg" variant="secondary" asChild>
            <Link to="/signin">
              Go to your account <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer id="terms" className="border-t px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 text-sm text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} Wattle LMS. Learning, made clearer.
          </p>
          <nav aria-label="Footer navigation" className="flex gap-6">
            <a
              className="transition-colors hover:text-foreground"
              href="#features"
            >
              About
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="mailto:support@wattlelms.com"
            >
              Contact
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="#terms"
            >
              Terms
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
