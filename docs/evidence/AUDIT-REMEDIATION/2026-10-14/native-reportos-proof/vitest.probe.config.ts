import { defineConfig } from 'vitest/config';
import base from '../../../../../vitest.db.config';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['docs/evidence/AUDIT-REMEDIATION/2026-10-14/native-reportos-proof/reportos-native.dbtest.ts'],
  },
});
