import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: { alias: { shared: resolve(process.cwd(), 'shared'), '@shared': resolve(process.cwd(), 'shared') } },
  test: { environment: 'node', include: ['docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14/recall-rag-integration.test.mts'],
    pool: 'forks', maxWorkers: 1, fileParallelism: false, reporters: ['verbose'], testTimeout: 10000 },
});
