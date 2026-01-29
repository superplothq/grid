import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
  files: 'src/**/*.test.ts',
  nodeResolve: true,
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
  ],
  testFramework: {
    config: {
      timeout: 3000,
    },
  },
  coverage: false,
  concurrency: 10,
  browserStartTimeout: 30000,
};
