/**
 * Copyright Alex To. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { StagesConfig } from './stages.types.js';

export default {
  projects: {
    'packages/infra': {
      stages: {
        // No credentials/region set yet — deploys use your active AWS CLI
        // credentials and CDK_DEFAULT_REGION until these are configured.
        'wattle-development': {
          components: {
            identity: { enableWaf: false, enableMfa: false },
            coreApi: { enableWaf: false, enableKmsEncryption: false },
            coreTable: {
              enableKmsEncryption: false,
              enableDeletionProtection: false,
            },
            studentPortal: { enableWaf: false, enableKmsEncryption: false },
            instructorPortal: { enableWaf: false, enableKmsEncryption: false },
          },
        },
        'wattle-production': {
          components: {
            identity: { enableWaf: true, enableMfa: true },
            coreApi: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
            },
            coreTable: {
              enableKmsEncryption: true,
              enableKeyRotation: true,
              enableDeletionProtection: true,
            },
            studentPortal: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
            },
            instructorPortal: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
            },
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
