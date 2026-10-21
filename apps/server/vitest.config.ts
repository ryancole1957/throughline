import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@throughline/shared': path.join(root, 'packages/shared/src/index.ts'),
    },
  },
  test: {
    include: [path.join(root, 'apps/server/test/**/*.test.ts')],
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    restoreMocks: true,
    testTimeout: 15_000,
  },
});
