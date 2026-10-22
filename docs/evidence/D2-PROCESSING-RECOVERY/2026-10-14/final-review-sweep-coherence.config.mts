import { defineConfig } from 'vitest/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ownedCache = mkdtempSync(path.join(tmpdir(), 'c2c-d2-independent-'));
process.once('exit', () => rmSync(ownedCache, { recursive: true, force: true }));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: path.join(ownedCache, 'vite'),
  test: {
    environment: 'node',
    include: ['final-review-sweep-coherence.test.mts'],
    testNamePattern: 'FINAL REVIEW',
    setupFiles: [],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 15000,
    reporters: ['verbose'],
    watch: false,
  },
});
