import { defineConfig } from 'vitest/config';
import base from '../../../../vitest.config';
export default defineConfig({ ...base, test: { ...base.test,
  include: ['server/routes/__tests__/batch-draft-termination-boundary.test.ts'] } });
