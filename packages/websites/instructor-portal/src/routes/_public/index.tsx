/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_public/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="text-muted-foreground">
        Welcome to your new React website!
      </p>
    </>
  );
}
