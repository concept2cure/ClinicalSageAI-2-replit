/**
 * The Drizzle model of invention_disclosures.federal_funding matches the
 * migration: nullable, no default (NULL = not yet determined).
 *
 * What the model said until 2026-10-15: `.notNull().default(false)`, while
 * migrations/20260705_invention_disclosure.sql had already made the column
 * nullable with no default. A Drizzle insert that omitted it was given false —
 * "not federally funded", a Bayh-Dole answer nobody gave — and the inferred row
 * type promised a boolean the database does not hold.
 */
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { inventionDisclosures } from '../../../../shared/schema/invention-disclosure';

describe('inventionDisclosures.federalFunding', () => {
  it('is nullable with no default, as the migration creates it', () => {
    const col = getTableConfig(inventionDisclosures).columns.find((c) => c.name === 'federal_funding');
    expect(col?.notNull).toBe(false);
    expect(col?.hasDefault).toBe(false);
  });
});
