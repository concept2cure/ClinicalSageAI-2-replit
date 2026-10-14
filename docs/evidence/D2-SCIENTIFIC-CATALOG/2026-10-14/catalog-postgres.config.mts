import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/catalog-postgres.test.mts'], setupFiles: [], pool: 'forks', maxWorkers: 1, fileParallelism: false, reporters: ['verbose'], hookTimeout: 60000, testTimeout: 20000 } });
