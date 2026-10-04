/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const REPO = '<repo>';
const HERE = '<review-scratch>';
/** The committed tree (git archive 283fe08c4), so the working tree's uncommitted edits by another session do not leak in. */
const TREE = path.join(HERE, 'tree');

export default defineConfig({
  root: HERE,
  resolve: {
    alias: {
      '@': path.resolve(REPO, 'client/src'),
      '@shared': path.resolve(TREE, 'shared'),
      shared: path.resolve(TREE, 'shared'),
    },
  },
  server: { fs: { allow: [REPO, HERE] } },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [path.resolve(TREE, 'tests/setup.ts')],
    include: ['*.probe.test.ts', '*.probe.test.tsx'],
    exclude: ['node_modules', 'tree/**'],
    testTimeout: 60000,
    hookTimeout: 90000,
    pool: 'forks',
    maxWorkers: 1,
    reporters: ['verbose'],
    watch: false,
  },
});
