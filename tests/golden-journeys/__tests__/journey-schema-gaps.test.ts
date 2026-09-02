/**
 * Every journey on the shared harness checks its own schema gaps.
 *
 * `assertNoSchemaGaps` only works if a journey calls it, and whoever adds the
 * tenth journey has no reason to know it exists. This is the gate that makes
 * the check non-optional for the harness that supports it.
 *
 * Ledger L145: seven of nine journeys were running against databases missing
 * tables their own subject writes to — `audit.tamper_proof_log` in four of
 * them, the 21 CFR Part 11 tamper-evident store, while those journeys asserted
 * Part 11 claims. Nothing failed, because the writers that need it swallow
 * their own errors: correct in production, fatal to the evidence here.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(__dirname, '..');
const journeys = fs.readdirSync(DIR).filter((f) => f.endsWith('.journey.test.ts'));

describe('golden journeys — the schema-gap check is not optional', () => {
  it('finds the journeys (guards the scanner itself)', () => {
    expect(journeys.length).toBeGreaterThanOrEqual(9);
  });

  it.each(journeys)('%s', (file) => {
    const src = fs.readFileSync(path.join(DIR, file), 'utf8');
    if (!/\bcreateJourneyDb\s*\(/.test(src)) {
      // A journey on a different harness cannot be checked this way. It must
      // SAY so at the call site rather than silently omit the assertion — that
      // sentence is the only thing separating "not applicable" from "forgotten".
      expect(
        src,
        `${file} does not use createJourneyDb and does not explain why it is not schema-gap checked`,
      ).toMatch(/NOT schema-gap checked/);
      return;
    }
    expect(
      src,
      `${file} builds its database with createJourneyDb but never calls assertNoSchemaGaps — ` +
        `it can run against a database missing tables its subject writes to and still pass`,
    ).toMatch(/assertNoSchemaGaps\(/);
  });
});
