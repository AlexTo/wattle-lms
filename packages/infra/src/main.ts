import { App } from '@lms/common-constructs';
import { resolveStage } from '@lms/common-infra-config';
import { ApplicationStage } from './stages/application-stage.js';

const app = new App();

// Stage configuration is defined in packages/common/infra-config/src/stages.config.ts
// The project path 'packages/infra' is used as the key in the config.
// Project-specific settings override shared settings for the same stage name.

// Sandbox stage — uses your CLI credentials by default.
// Add an entry in stages.config.ts to configure specific credentials.
const sandboxConfig = resolveStage('packages/infra', 'lms-infra-sandbox');
new ApplicationStage(app, 'lms-infra-sandbox', {
  env: {
    account: sandboxConfig?.account ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: sandboxConfig?.region ?? process.env.CDK_DEFAULT_REGION,
  },
});

// Define other instances of stages, such as beta and prod, below

app.synth();
