import { defineConfig } from 'vitest/config';
import base from '../../../../vitest.config.js';
export default defineConfig({ ...base, test: { ...base.test,
  include: ['docs/evidence/D2-ANA-DURABLE-RECEIPTS/2026-10-14/legacy-gap.baseline.test.ts'] } });
