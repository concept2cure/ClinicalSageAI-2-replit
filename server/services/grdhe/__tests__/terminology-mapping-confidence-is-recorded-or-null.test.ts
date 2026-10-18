/**
 * A terminology mapping's confidence is the one recorded on the mapping row, or
 * null (audit 2026-10-15, finding 19).
 *
 * mapTerminologyTerm used to report `parseFloat(confidence_score) || 1.0` for an
 * exact mapping and `(parseFloat(confidence_score) || 0.8) * 0.8` for a broader
 * one. terminology_mappings.confidence_score is nullable with no default
 * (db/migrations/081_grdhe_regulatory_mapping_layer.sql), so a mapping nobody
 * scored was reported as an exact match at confidence 1.0, not needing review,
 * and a curated 0.0 read as 1.0 too (0 is falsy). A broader fallback reported
 * 0.64 with no score, every recorded score was discounted by an invented 0.8,
 * and a 'related' mapping was labelled 'broader'.
 *
 * The database is mocked at the one handle the service uses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const state = vi.hoisted(() => ({
  exact: [] as Record<string, unknown>[],
  broader: [] as Record<string, unknown>[],
}));

vi.mock('../../../db', () => {
  const dialect = new PgDialect();
  const version = {
    id: '6d1f0e1a-0000-4000-8000-000000000001',
    terminology_system: 'MEDDRA',
    version_code: '26.1',
    version_date: '2023-09-01',
    display_name: 'MedDRA Version 26.1',
    applicable_jurisdictions: ['FDA'],
    effective_from: '2023-09-01',
    is_current: false,
    is_deprecated: false,
    created_at: '2026-01-24T00:00:00Z',
    updated_at: '2026-01-24T00:00:00Z',
  };
  return {
    db: {
      execute: vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
        const text = dialect.sqlToQuery(query).sql;
        if (/FROM regulatory_harmonization\.terminology_versions/.test(text)) return { rows: [version] };
        if (/mapping_type IN \('broader', 'related'\)/.test(text)) return { rows: state.broader };
        if (/FROM regulatory_harmonization\.terminology_mappings/.test(text)) return { rows: state.exact };
        return { rows: [] };
      }),
    },
  };
});

import { grdheService } from '../grdheService';

const mappingRow = (over: Record<string, unknown>) => ({
  target_code: '10019211',
  target_display: 'Headache',
  mapping_type: 'equivalent',
  requires_review: false,
  ...over,
});
const map = () => grdheService.mapTerminologyTerm('MEDDRA', '10019211', 'MEDDRA', 'FDA');

beforeEach(() => {
  state.exact = [];
  state.broader = [];
});

describe('a terminology mapping reports the confidence recorded on it, or null', () => {
  it('an exact mapping nobody scored has no confidence and needs review', async () => {
    state.exact = [mappingRow({ confidence_score: null })];
    const r = await map();
    expect(r.confidenceScore, 'no confidence was recorded on this mapping').toBeNull();
    expect(r.requiresReview).toBe(true);
  });

  it('a curated confidence of 0 is reported as 0, not as 1.0', async () => {
    state.exact = [mappingRow({ confidence_score: '0.0000' })];
    expect((await map()).confidenceScore).toBe(0);
  });

  it('a recorded confidence is reported as recorded, with the review flag the row carries', async () => {
    state.exact = [mappingRow({ confidence_score: '0.9000' })];
    const r = await map();
    expect(r.confidenceScore).toBe(0.9);
    expect(r.requiresReview).toBe(false);
  });

  it('a broader fallback nobody scored has no confidence, not 0.64', async () => {
    state.broader = [mappingRow({ mapping_type: 'broader', confidence_score: null })];
    const r = await map();
    expect(r.confidenceScore).toBeNull();
    expect(r.requiresReview).toBe(true);
    expect(r.fallbackUsed).toBe(true);
  });

  it('a related fallback keeps its recorded confidence and its own mapping type', async () => {
    state.broader = [mappingRow({ mapping_type: 'related', confidence_score: '0.9000' })];
    const r = await map();
    expect(r.confidenceScore, 'the recorded 0.9, not 0.9 discounted by an invented 0.8').toBe(0.9);
    expect(r.mappingType).toBe('related');
  });
});
