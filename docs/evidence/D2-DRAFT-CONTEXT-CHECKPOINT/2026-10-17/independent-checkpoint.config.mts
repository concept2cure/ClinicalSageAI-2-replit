import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { shared: path.resolve(process.cwd(), 'shared'), '@shared': path.resolve(process.cwd(), 'shared') } },
  test: { environment: 'node', include: ['server/services/ana/__tests__/draft-context-checkpoint.integration.test.ts'], setupFiles: [],
    pool: 'forks', maxWorkers: 1, fileParallelism: false, reporters: ['verbose'] },
});
