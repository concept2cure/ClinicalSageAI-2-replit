import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve: { alias: { '@shared': path.resolve(process.cwd(), 'shared'), shared: path.resolve(process.cwd(), 'shared') } }, test: { environment: 'node', include: ['docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/independent-tool-adversaries.test.mts'], setupFiles: [], pool: 'forks', maxWorkers: 1, fileParallelism: false, reporters: ['verbose'] } });
