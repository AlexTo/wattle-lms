/**
 * Stage configuration for CDK deployments.
 *
 * This file maps CDK stage names to their deployment settings. When you run
 * `pnpm nx run <project>:deploy <stage-name>/*`, the infra-deploy script
 * automatically resolves and applies the correct credentials.
 *
 * Project keys are the project path relative to the workspace root
 * (e.g., 'packages/infra').
 *
 * Stage names must match the CDK stage identifiers defined in your main.ts —
 * the first argument to `new ApplicationStage(app, '<stage-name>', ...)`.
 * For example, if main.ts has `new ApplicationStage(app, 'my-app-dev', ...)`
 * then the stage name here is 'my-app-dev'.
 *
 * We recommend committing this file so the team shares a single source of truth.
 * If it contains personal profile names, you can add it to .gitignore instead.
 */
import type { StagesConfig } from './stages.types.js';

export default {
  projects: {
    'packages/infra': {
      stages: {
        // No credentials/region set yet — deploys use your active AWS CLI
        // credentials and CDK_DEFAULT_REGION until these are configured.
        development: {
          components: {
            identity: { enableWaf: false, enableMfa: false },
            coreApi: { enableWaf: false },
            coreTable: {
              enableKmsEncryption: false,
              enableDeletionProtection: false,
            },
            studentPortal: { enableWaf: false, enableKmsEncryption: false },
          },
        },
        production: {
          components: {
            identity: { enableWaf: true, enableMfa: true },
            coreApi: { enableWaf: true },
            coreTable: {
              enableKmsEncryption: true,
              enableDeletionProtection: true,
            },
            studentPortal: { enableWaf: true, enableKmsEncryption: true },
          },
        },
      },
    },
  },
  shared: {
    stages: {
      // Example: shared sandbox stage available to all projects
      // 'sandbox': {
      //   credentials: { type: 'profile', profile: 'sandbox-profile' },
      //   region: 'us-east-1',
      // },
    },
  },
} as const satisfies StagesConfig;
