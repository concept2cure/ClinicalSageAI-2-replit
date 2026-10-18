/** A single exact baseline module, not an older whole application. No app file changes. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import current from './independent-source-identity.config.mts';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const baseline = readFileSync(path.join(folder, 'baseline-draft-source-references.ts.txt'), 'utf8');
if (createHash('sha256').update(baseline).digest('hex') !== '9972d440b343093f82e592ff8bb26121516041aa6e388b54797b0bc012a42938') throw new Error('Baseline source bytes changed');
const baselineTest = readFileSync(path.join(folder, 'baseline-independent-source-identity.test.mts.txt'), 'utf8');
if (createHash('sha256').update(baselineTest).digest('hex') !== '2dc961ddaa8a4550bd748c838ae2334b63b211682653fd02bb039e54a6d1fcee') throw new Error('Original nine-control test bytes changed');
const modulePath = path.join(root, 'server/services/authoring/draft-source-references.ts');
const testPath = path.join(folder, 'independent-source-identity.test.mts');

export default mergeConfig(current, defineConfig({
  plugins: [{
    name: 'exact-baseline-draft-source-reference-counterfactual',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0];
      return file === modulePath ? baseline : file === testPath ? baselineTest : null;
    },
  }],
  test: { testNamePattern: '^independent extraction-bound draft-source controls' },
}));
