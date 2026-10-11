/**
 * Repository-runnable isolated regression suite. Complete production services
 * execute against a SQLite-backed adapter; ORM/schema, identity and audit are
 * explicit doubles. FOR UPDATE/SHARE requests are observed, NOT executed.
 * This is not a PostgreSQL/PGlite, RLS or end-to-end signature qualification.
 */
import { createRequire } from 'node:module';
import { describe, it } from 'vitest';
import { REPO_ROOT } from '../../../tests/golden-journeys/harness';
import cases from './fixtures/artifact-signed-target-cases.json';

const require = createRequire(import.meta.url);
const { runCase } = require('./fixtures/artifact-signed-target-harness.cjs') as {
  runCase(tree: string, testCase: Record<string, unknown>): Promise<unknown>;
};

describe('commit-time artifact and version binding (isolated adapter)', () => {
  it.each(cases)('$name', async testCase => {
    await runCase(REPO_ROOT, testCase);
  });
});
