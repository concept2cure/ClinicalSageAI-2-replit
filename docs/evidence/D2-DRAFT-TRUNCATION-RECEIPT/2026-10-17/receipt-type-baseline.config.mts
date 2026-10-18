/** TEST ONLY: original canonical receipt source at its original module path. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import base from '../../../../vitest.config';

const target = resolve(process.cwd(), 'server/services/ana/batch-draft-result.ts');
const historicalReceipt = readFileSync(resolve(process.cwd(),
  'docs/evidence/D2-DRAFT-TRUNCATION-RECEIPT/2026-10-17/independent-baseline-receipt.ts.txt'), 'utf8');

export default defineConfig({
  ...base,
  plugins: [{
    name: 'test-receipt-original-canonical-module',
    enforce: 'pre',
    load(id) { return id.split('?')[0] === target ? historicalReceipt : undefined; },
  }],
  test: { ...base.test, include: ['server/services/ana/__tests__/batch-draft-termination-receipt.test.ts'] },
});
