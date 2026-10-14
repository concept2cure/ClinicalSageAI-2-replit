import { defineConfig } from 'vitest/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This intentionally red evidence probe is never included by normal CI.
// Own only this invocation's cache directory, including on a failing run.
const probeCache = mkdtempSync(path.join(tmpdir(), 'c2c-d2-processing-recovery-'));
process.once('exit', () => rmSync(probeCache, { recursive: true, force: true }));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: path.join(probeCache, 'vite'),
  test: {
    environment: 'node',
    include: ['processing-recovery.probe.mts'],
    setupFiles: [],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 10000,
    reporters: ['verbose'],
    watch: false,
  },
});
