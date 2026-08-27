import { defineConfig } from 'rolldown';

export default defineConfig([
  {
    tsconfig: 'tsconfig.lib.json',
    input: 'src/cognito/post-confirmation.ts',
    output: {
      file: '../../dist/packages/events/bundle/lambda/post-confirmation/index.js',
      format: 'cjs',
      codeSplitting: false,
    },
    platform: 'node',
    external: [/@aws-sdk\/.*/],
  },
]);
