/**
 * Copyright Alex To. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { App } from '@wattle/common-constructs';
import { listStageNames, resolveStage } from '@wattle/common-infra-config';
import { ApplicationStage } from './stages/application-stage.js';

const app = new App();

// Stage configuration (credentials, region, per-component settings) is
// defined in packages/common/infra-config/src/stages.config.ts. Add a stage
// there to deploy it — no changes needed here.
const PROJECT_PATH = 'packages/infra';

for (const stageName of listStageNames(PROJECT_PATH)) {
  const config = resolveStage(PROJECT_PATH, stageName);
  new ApplicationStage(app, stageName, {
    env: {
      account: config?.account ?? process.env.CDK_DEFAULT_ACCOUNT,
      region: config?.region ?? process.env.CDK_DEFAULT_REGION,
    },
    ...config?.components,
  });
}

app.synth();
