import { defineConfig } from 'vitest/config';
import base from '../../../../../vitest.config';

// An intentionally red, read-only reproduction. Keep it outside the normal
// server/test include so it cannot change the frozen bridge publication gate.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/project-vault-parent-access/parent-access.probe.ts'],
  },
});
