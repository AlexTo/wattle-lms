import { AwsNxPluginConfig } from '@aws/nx-plugin';

export default {
  iac: { provider: 'cdk' },
  containers: { engine: 'docker' },
  packageManager: { catalogs: true },
} satisfies AwsNxPluginConfig;
