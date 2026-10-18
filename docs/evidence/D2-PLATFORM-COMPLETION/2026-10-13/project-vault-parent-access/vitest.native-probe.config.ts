import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import native from '../../../../../vitest.db.config';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

// Evidence-only red probe: explicitly REPLACE the native include. Never add
// intended failures to the normal native CI glob, or import the pg-mocked setup.
export default defineConfig({
  ...native,
  root: repo,
  test: {
    ...native.test,
    include: ['docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/project-vault-parent-access/native-parent-access.probe.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
