/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/apis/instructor-api',
  resolve: {
    alias: {
      // @wattle/core-table has no package.json `main`/`exports`, so it
      // resolves for tsc/tsx via tsconfig `paths` but not for Vite; alias it
      // directly to source so tests can import/mock it.
      '@wattle/core-table': fileURLToPath(
        new URL('../../databases/core-table/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    passWithNoTests: true,
    name: '@wattle/instructor-api',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
