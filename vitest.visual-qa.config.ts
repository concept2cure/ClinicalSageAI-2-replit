/// <reference types="vitest" />
/**
 * The runner for the visual-QA capture specs.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * `npm run visual-qa:capture` named two spec files directly:
 *
 *     vitest run scripts/visual-qa/dump-surface-markup.spec.tsx …
 *
 * and vitest matches a filter against its `include` globs before running
 * anything. The base config includes `tests/`, `server/`, `client/` and
 * `shared/` — not `scripts/` — so both files were filtered out and the command
 * exited with "No test files found". The documented entry point,
 * `npm run visual-qa`, therefore failed at its first step, which is why
 * `.visual-qa/markup` was empty and every check downstream had nothing to read.
 *
 * The repo's own reachability guard could not see this: `check-unrun-tests`
 * walks `tests|server|client|shared` and never looks in `scripts/`, so it
 * reported "every test file is reachable" over two files that could not run.
 * That guard now walks `scripts/` too, and this config is what makes these
 * files genuinely reachable rather than merely counted.
 *
 * ── Why it is separate from the base config ──────────────────────────────────
 * These specs WRITE files (`.visual-qa/markup`). They are capture steps for an
 * on-demand audit, not assertions about the product, and folding them into the
 * config `npm test` uses would make an ordinary test run produce artifacts.
 * A separate runner keeps the documented command working without putting
 * captures in everyone's test run.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
      shared: path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['scripts/visual-qa/**/*.spec.tsx'],
    exclude: ['node_modules', 'dist', '_archive', '_deprecated'],
    testTimeout: 30000,
  },
});
