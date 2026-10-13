import { defineConfig } from 'vitest/config';
import base from '../../../../../vitest.db.config';

/** Explicit opt-in for an intentionally red native evidence probe. */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/protocol-finalization/native-baseline.probe.ts'],
    maxWorkers: 1,
  },
});
