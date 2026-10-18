import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { shared: path.resolve(process.cwd(), 'shared'), '@shared': path.resolve(process.cwd(), 'shared') } },
  test: {
    environment: 'node',
    include: ['docs/evidence/D2-DRAFT-SOURCE-IDENTITY/2026-10-16/independent-source-identity.test.mts'],
    setupFiles: [], pool: 'forks', maxWorkers: 1, fileParallelism: false, reporters: ['verbose'],
  },
});
