/**
 * Copyright Alex To. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { cn } from '@wattle/common-shadcn/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-accent', className)}
      {...props}
    />
  );
}

export { Skeleton };
