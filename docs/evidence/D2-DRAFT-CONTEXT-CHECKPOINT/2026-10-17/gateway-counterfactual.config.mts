/** TEST ONLY: remove the final source guard while retaining the real gateway. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import base from '../../../../vitest.config';

const target = resolve(process.cwd(), 'server/services/ai-gateway/gateway.ts');
const original = readFileSync(target, 'utf8');
const needle = 'await beforeDispatch();';
if (original.split(needle).length !== 2) throw new Error('Expected exactly one canonical source-dispatch checkpoint');
const counterfactual = original.replace(needle, 'await Promise.resolve(); // TEST ONLY: source verification omitted');

export default defineConfig({
  ...base,
  plugins: [{
    name: 'test-gateway-source-checkpoint-omission',
    enforce: 'pre',
    load(id) { return id.split('?')[0] === target ? counterfactual : undefined; },
  }],
  test: { ...base.test, include: ['server/services/ai-gateway/__tests__/gateway-source-checkpoint.test.ts'] },
});
