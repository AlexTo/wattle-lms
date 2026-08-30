/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from './init.js';
import { echo } from './procedures/echo.js';

export const router = t.router;

export const appRouter = router({
  echo,
});

export type AppRouter = typeof appRouter;
