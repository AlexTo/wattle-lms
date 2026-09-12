/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@wattle/common-shadcn/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@wattle/common-shadcn/components/ui/dialog';
import { Input } from '@wattle/common-shadcn/components/ui/input';
import { type ReactNode, useState } from 'react';
import { z } from 'zod';
import { useCoreApi } from '../hooks/useCoreApi';
import { useInstructorApi } from '../hooks/useInstructorApi';
import { Alert } from './alert';

const lessonFormSchema = z.object({
  title: z.string().trim().min(1, 'Lesson title is required').max(200),
});

export function CreateLessonDialog({
  courseId,
  moduleId,
  trigger,
}: {
  courseId: string;
  moduleId: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { course } = useCoreApi();
  const { lesson } = useInstructorApi();
  const queryClient = useQueryClient();
  const {
    mutateAsync: createLesson,
    reset: resetCreateLesson,
    isError,
    error,
  } = useMutation(lesson.create.mutationOptions());

  const form = useForm({
    defaultValues: { title: '' },
    validators: { onChange: lessonFormSchema },
    onSubmit: async ({ value }) => {
      try {
        await createLesson({
          courseId,
          moduleId,
          title: value.title.trim(),
        });
      } catch {
        // Surfaced via the error below; keep the dialog open.
        return;
      }
      setOpen(false);
      form.reset();
      void queryClient.invalidateQueries({
        queryKey: course.view.queryKey({ courseId }),
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset();
          resetCreateLesson();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New lesson</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Lessons hold the content students work through inside a module.
          </p>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          {isError && (
            <Alert type="error" header="Couldn't create the lesson">
              {error.message}
            </Alert>
          )}

          <form.Field name="title">
            {({ name, state, handleBlur, handleChange }) => {
              const error = state.meta.errors[0];
              return (
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium leading-none"
                    htmlFor={name}
                  >
                    Lesson title
                  </label>
                  <Input
                    id={name}
                    name={name}
                    value={state.value}
                    onBlur={handleBlur}
                    onChange={(event) => handleChange(event.target.value)}
                    placeholder="e.g. Welcome and course overview"
                    aria-invalid={Boolean(error)}
                    autoFocus
                  />
                  {error && (
                    <p className="text-xs text-destructive">{error.message}</p>
                  )}
                </div>
              );
            }}
          </form.Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create lesson'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
