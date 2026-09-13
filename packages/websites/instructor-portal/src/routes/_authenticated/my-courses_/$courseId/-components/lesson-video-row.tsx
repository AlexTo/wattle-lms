/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button } from '@wattle/common-shadcn/components/ui/button';
import { PencilLine, Video } from 'lucide-react';
import {
  AttachLessonVideoDialog,
  RemoveLessonVideoButton,
} from './attach-lesson-video-dialog';

export function LessonVideoRow({
  courseId,
  moduleId,
  lessonId,
  contentItems,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItems: {
    contentItemId: string;
    type: string;
    title: string;
    description?: string;
  }[];
}) {
  const videos = contentItems.filter((item) => item.type === 'video');

  return (
    <div className="bg-muted/15 pb-3 pl-12 pr-4 sm:pl-24 sm:pr-5">
      {videos.map((video) => (
        <div
          key={video.contentItemId}
          className="group/resource flex items-center gap-2 border-l px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            <Video className="size-3.5" />
          </div>
          <span className="flex-1 truncate text-xs font-medium">
            {video.title}
          </span>
          <AttachLessonVideoDialog
            courseId={courseId}
            moduleId={moduleId}
            lessonId={lessonId}
            contentItemId={video.contentItemId}
            title={video.title}
            description={video.description}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label={`Edit ${video.title}`}
                className="transition-opacity sm:opacity-0 sm:group-hover/resource:opacity-100 focus-visible:opacity-100"
              >
                <PencilLine />
              </Button>
            }
          />
          <RemoveLessonVideoButton
            courseId={courseId}
            moduleId={moduleId}
            lessonId={lessonId}
            contentItemId={video.contentItemId}
            title={video.title}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2 border-l px-3 pt-2">
        <AttachLessonVideoDialog
          courseId={courseId}
          moduleId={moduleId}
          lessonId={lessonId}
          trigger={
            <Button variant="outline" size="sm" type="button">
              <Video /> Video
            </Button>
          }
        />
      </div>
    </div>
  );
}
