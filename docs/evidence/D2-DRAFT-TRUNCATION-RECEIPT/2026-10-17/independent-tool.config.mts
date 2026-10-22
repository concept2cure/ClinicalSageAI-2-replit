import { defineConfig } from 'vitest/config';
import base from '../../../../vitest.config';
export default defineConfig({ ...base, test: { ...base.test,
  include: ['server/services/ana/__tests__/batch-draft-termination-tool.test.ts'] } });
