/**
 * Pure document-citation matching — no database.
 * Covers label↔field affinity, value comparison (consistent vs divergent),
 * candidate tie-breaking, and the summary.
 */

import { describe, it, expect } from 'vitest';

import {
  labelMatchesFact,
  matchCitationsToFacts,
  normalizeToken,
  summarizeCitationMatches,
  type ActiveFactView,
  type ExtractedNumber,
} from '../document-citations';

const fact = (over: Partial<ActiveFactView> = {}): ActiveFactView => ({
  id: 'f-1',
  entity: 'trial',
  field: 'sample_size',
  valueNum: 186,
  valueText: null,
  unit: 'subjects',
  valueType: 'count',
  ...over,
});

const num = (over: Partial<ExtractedNumber> = {}): ExtractedNumber => ({
  label: 'sample_size',
  value: '186',
  context: 'A total of N=186 subjects were randomized.',
  offset: 10,
  ...over,
});

describe('normalizeToken', () => {
  it('lowercases and collapses non-alphanumerics', () => {
    expect(normalizeToken('Sample Size')).toBe('sample_size');
    expect(normalizeToken('NOAEL (mg/kg/day)')).toBe('noael_mg_kg_day');
    expect(normalizeToken('__p-value__')).toBe('p_value');
  });
});

describe('labelMatchesFact', () => {
  it('matches a label to a fact by field synonym', () => {
    expect(labelMatchesFact('sample_size', fact({ field: 'sample_size' }))).toBe(true);
    expect(labelMatchesFact('sample_size', fact({ entity: 'study', field: 'enrolled' }))).toBe(true);
    expect(labelMatchesFact('noael', fact({ field: 'noael', valueType: 'measure' }))).toBe(true);
  });

  it('does not match unrelated fields', () => {
    expect(labelMatchesFact('sample_size', fact({ entity: 'drug', field: 'shelf_life' }))).toBe(false);
    expect(labelMatchesFact('dose_mg', fact({ field: 'duration_weeks' }))).toBe(false);
  });

  it('short synonym tokens do not substring-match everything', () => {
    // 'n'/'p' are guarded — they only match a field that equals them exactly.
    expect(labelMatchesFact('sample_size', fact({ entity: 'x', field: 'notes' }))).toBe(false);
  });

  it('maps device/IVD labels to their fact fields', () => {
    expect(labelMatchesFact('sensitivity', fact({ entity: 'assay', field: 'clinical_sensitivity' }))).toBe(true);
    expect(labelMatchesFact('lod', fact({ entity: 'assay', field: 'limit_of_detection', valueType: 'measure' }))).toBe(true);
    expect(labelMatchesFact('predicate_knumber', fact({ entity: 'device', field: 'predicate', valueType: 'text' }))).toBe(true);
    expect(labelMatchesFact('precision_cv', fact({ entity: 'assay', field: 'repeatability', valueType: 'measure' }))).toBe(true);
    // Cross-domain guard: an IVD label must not bind a pharma field.
    expect(labelMatchesFact('sensitivity', fact({ entity: 'trial', field: 'shelf_life' }))).toBe(false);
  });
});

describe('matchCitationsToFacts', () => {
  it('binds a consistent citation when the cited value agrees', () => {
    const r = matchCitationsToFacts([num({ value: '186' })], [fact()]);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].consistency).toBe('consistent');
    expect(r.matches[0].factId).toBe('f-1');
  });

  it('flags a divergent citation when the cited value disagrees', () => {
    const r = matchCitationsToFacts([num({ value: '150' })], [fact()]);
    expect(r.matches[0].consistency).toBe('divergent');
    expect(r.matches[0].driftType).toBe('value_mismatch');
  });

  it('records labels that map to no fact as unmatched', () => {
    const r = matchCitationsToFacts([num({ label: 'p_value', value: '0.01' })], [fact()]);
    expect(r.matches).toHaveLength(0);
    expect(r.unmatchedLabels).toEqual(['p_value']);
  });

  it('prefers a consistent fact over a divergent one when several have affinity', () => {
    const facts = [
      fact({ id: 'f-div', valueNum: 200 }),
      fact({ id: 'f-ok', valueNum: 186 }),
    ];
    const r = matchCitationsToFacts([num({ value: '186' })], facts);
    expect(r.matches[0].factId).toBe('f-ok');
    expect(r.matches[0].consistency).toBe('consistent');
  });

  it('honors numeric tolerance for measures', () => {
    const measure = fact({ field: 'duration', valueNum: 18.5, unit: 'months', valueType: 'measure' });
    const close = matchCitationsToFacts(
      [num({ label: 'duration_weeks', value: '18.6' })],
      [measure],
      { tolerance: 0.05 }
    );
    expect(close.matches[0].consistency).toBe('consistent');
  });
});

describe('summarizeCitationMatches', () => {
  it('counts matched / consistent / divergent / extracted', () => {
    const facts = [fact({ id: 'a', field: 'sample_size', valueNum: 186 }), fact({ id: 'b', field: 'noael', valueNum: 50, valueType: 'measure', unit: 'mg/kg' })];
    const extracted = [
      num({ label: 'sample_size', value: '186' }), // consistent
      num({ label: 'noael', value: '40' }),         // divergent
      num({ label: 'p_value', value: '0.01' }),      // unmatched
    ];
    const result = matchCitationsToFacts(extracted, facts);
    const s = summarizeCitationMatches(result);
    expect(s.matched).toBe(2);
    expect(s.consistent).toBe(1);
    expect(s.divergent).toBe(1);
    expect(s.extracted).toBe(3);
  });
});
