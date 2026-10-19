import { defineConfig } from 'vitest/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = mkdtempSync(path.join(tmpdir(), 'c2c-d2-pg-race-'));
process.once('exit', () => rmSync(cache, { recursive: true, force: true }));
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), cacheDir: path.join(cache, 'vite'),
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js', '.json', '.mjs', '.mts'] },
  test: { environment: 'node', include: ['race-postgres.test.mts'], setupFiles: [],
    pool: 'forks', maxWorkers: 1, fileParallelism: false,
    hookTimeout: 60000, testTimeout: 15000, reporters: ['verbose'], watch: false },
});
