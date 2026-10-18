import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/independent-core-adversaries.test.mts'], setupFiles: [], pool: 'forks', maxWorkers: 1, fileParallelism: false, reporters: ['verbose'] } });
