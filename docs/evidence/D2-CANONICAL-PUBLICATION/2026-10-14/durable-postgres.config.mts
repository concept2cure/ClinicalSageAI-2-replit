import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve: { alias: { shared: path.resolve(process.cwd(), 'shared'), '@shared': path.resolve(process.cwd(), 'shared') } }, test: { environment: 'node', include: ['docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14/durable-postgres.test.mts'], setupFiles: [], pool: 'forks', maxWorkers: 1, fileParallelism: false, reporters: ['verbose'], hookTimeout: 60000, testTimeout: 20000 } });
