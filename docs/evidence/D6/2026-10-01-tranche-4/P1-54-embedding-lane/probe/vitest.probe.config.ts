// Runs local-lane-placement.probe.test.ts with the repository's unit-test
// configuration (its aliases and tests/setup.ts), which does not include docs/.
// `include` is REPLACED, not merged: mergeConfig concatenates arrays, which
// would run the whole unit suite.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import base from '../../../../../../vitest.config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  ...base,
  root: path.resolve(here, '../../../../../..'),
  test: { ...base.test, include: [path.join(here, '*.probe.test.ts')] },
});
