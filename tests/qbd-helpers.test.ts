/**
 * Unit tests for the QbD analyzer's pure helper functions. These cover
 * the JSON-extraction shapes that come out of jsonb fields in the CMC
 * source tables and the ICH-guideline classification heuristics.
 */

import { describe, it, expect } from 'vitest';
import {
  extractParameterNames, extractImpurityNames,
  extractCharacterizationAttrs, extractCppEntries, extractCppFromPayload,
  classifyCqaIchBasis, matchesAnyPurpose, prettifyAttribute,
} from '../server/services/cmc/qbd-helpers';

describe('extractParameterNames', () => {
  it('returns names from an array of strings', () => {
    expect(extractParameterNames(['assay', 'related substances', 'pH']))
      .toEqual(['assay', 'related substances', 'pH']);
  });

  it('extracts .name / .parameter / .test / .attribute from object arrays', () => {
    expect(extractParameterNames([
      { name: 'assay', limit: '95-105%' },
      { parameter: 'dissolution', method: 'USP <711>' },
      { test: 'water content' },
      { attribute: 'particulate matter' },
    ])).toEqual(['assay', 'dissolution', 'water content', 'particulate matter']);
  });

  it('returns object keys when given a plain object', () => {
    const out = extractParameterNames({ assay: '95-105%', impurities: '<0.5%' });
    expect(out.sort()).toEqual(['assay', 'impurities']);
  });

  it('returns empty for null / undefined / primitive inputs', () => {
    expect(extractParameterNames(null)).toEqual([]);
    expect(extractParameterNames(undefined)).toEqual([]);
    expect(extractParameterNames(42)).toEqual([]);
    expect(extractParameterNames('plain string')).toEqual([]);
  });

  it('skips object entries with no name-like field', () => {
    expect(extractParameterNames([
      { limit: '95-105%' },
      { name: 'assay' },
      {},
    ])).toEqual(['assay']);
  });
});

describe('extractImpurityNames', () => {
  it('extracts impurity names from a typed-array shape', () => {
    expect(extractImpurityNames([
      { name: 'Imp-A', threshold: 0.1 },
      { impurityName: 'Imp-B' },
      { identifier: 'Imp-C' },
      'Imp-D-string',
    ])).toEqual(['Imp-A', 'Imp-B', 'Imp-C', 'Imp-D-string']);
  });

  it('returns object keys when impurities is a dict', () => {
    const out = extractImpurityNames({ 'Imp-A': 0.1, 'Imp-B': 0.05 });
    expect(out.sort()).toEqual(['Imp-A', 'Imp-B']);
  });

  it('returns empty for non-object/array inputs', () => {
    expect(extractImpurityNames(null)).toEqual([]);
    expect(extractImpurityNames('Imp-A')).toEqual([]);
  });
});

describe('extractCharacterizationAttrs', () => {
  it('returns keys of the characterization object', () => {
    const out = extractCharacterizationAttrs({
      peptide_map: { method: 'UPLC' },
      glycan_profile: { method: 'HILIC-MS' },
    });
    expect(out.sort()).toEqual(['glycan_profile', 'peptide_map']);
  });

  it('returns empty when characterization is null / undefined / array', () => {
    expect(extractCharacterizationAttrs(null)).toEqual([]);
    expect(extractCharacterizationAttrs(undefined)).toEqual([]);
  });
});

describe('extractCppEntries', () => {
  it('parses array of strings as CPP names', () => {
    expect(extractCppEntries(['temperature', 'pH', 'mixing time']))
      .toEqual([
        { name: 'temperature' },
        { name: 'pH' },
        { name: 'mixing time' },
      ]);
  });

  it('parses array of objects with name + step + range + impacts', () => {
    const r = extractCppEntries([
      { name: 'temperature', step: 'granulation', range: '20-25°C', impacts: ['assay', 'dissolution'] },
      { parameter: 'compression force', processStep: 'tableting', acceptableRange: '8-12 kN' },
      { cpp: 'fill volume' },
    ]);
    expect(r).toEqual([
      { name: 'temperature', step: 'granulation', range: '20-25°C', impacts: ['assay', 'dissolution'] },
      { name: 'compression force', step: 'tableting', range: '8-12 kN', impacts: undefined },
      { name: 'fill volume', step: undefined, range: undefined, impacts: undefined },
    ]);
  });

  it('treats object dict as name->range mapping', () => {
    const r = extractCppEntries({ temperature: '20-25°C', pH: '6.5-7.5' });
    expect(r).toEqual([
      { name: 'temperature', range: '20-25°C' },
      { name: 'pH', range: '6.5-7.5' },
    ]);
  });

  it('skips array entries lacking a name-like field', () => {
    const r = extractCppEntries([{ step: 'granulation' }, { name: 'pH' }]);
    expect(r).toEqual([{ name: 'pH', step: undefined, range: undefined, impacts: undefined }]);
  });
});

describe('extractCppFromPayload', () => {
  it('reads criticalProcessParameters field', () => {
    expect(extractCppFromPayload({
      criticalProcessParameters: [{ name: 'temperature' }],
    })).toEqual([{ name: 'temperature', step: undefined, range: undefined, impacts: undefined }]);
  });

  it('reads cpps alias', () => {
    expect(extractCppFromPayload({ cpps: [{ name: 'pH' }] }))
      .toEqual([{ name: 'pH', step: undefined, range: undefined, impacts: undefined }]);
  });

  it('reads cpp alias', () => {
    expect(extractCppFromPayload({ cpp: ['temperature'] }))
      .toEqual([{ name: 'temperature' }]);
  });

  it('returns empty when no CPP field is present', () => {
    expect(extractCppFromPayload({ other_field: 'value' })).toEqual([]);
  });
});

describe('classifyCqaIchBasis', () => {
  it('routes assay/potency attributes to Q6A and Q6B', () => {
    const r = classifyCqaIchBasis('assay');
    expect(r).toContain('ICH Q6A');
    expect(r).toContain('ICH Q6B');
  });

  it('routes impurity attributes to Q3A/Q3B', () => {
    const r = classifyCqaIchBasis('related substances');
    expect(r).toContain('ICH Q3A(R2)');
    expect(r).toContain('ICH Q3B(R2)');
  });

  it('routes elemental impurities to Q3D', () => {
    const r = classifyCqaIchBasis('elemental impurities');
    expect(r).toContain('ICH Q3D(R2)');
  });

  it('routes residual solvents to Q3C', () => {
    const r = classifyCqaIchBasis('residual solvent profile');
    expect(r).toContain('ICH Q3C(R8)');
  });

  it('routes nitrosamines to FDA + ICH M7', () => {
    const r = classifyCqaIchBasis('nitrosamine NDMA');
    expect(r).toContain('FDA Nitrosamine Guidance');
    expect(r).toContain('ICH M7(R2)');
  });

  it('routes biologic-only attributes (aggregation, glycan, charge variant) to Q6B', () => {
    expect(classifyCqaIchBasis('aggregation')).toContain('ICH Q6B');
    expect(classifyCqaIchBasis('glycosylation profile')).toContain('ICH Q6B');
    expect(classifyCqaIchBasis('charge variant')).toContain('ICH Q6B');
  });

  it('routes dissolution to Q6A + USP', () => {
    const r = classifyCqaIchBasis('dissolution rate');
    expect(r).toContain('ICH Q6A');
    expect(r).toContain('USP <711>');
  });

  it('routes endotoxin to USP <85>', () => {
    expect(classifyCqaIchBasis('endotoxin')).toContain('USP <85>');
  });

  it('routes sterility to USP <71> + FDA guidance', () => {
    const r = classifyCqaIchBasis('sterility test');
    expect(r).toContain('USP <71>');
    expect(r).toContain('FDA Aseptic Processing Guidance (2004)');
  });

  it('defaults small-molecule attributes to Q6A when no match', () => {
    expect(classifyCqaIchBasis('some_unknown_attribute')).toEqual(['ICH Q6A']);
  });

  it('defaults biologic-DS attributes to Q6B when no match', () => {
    expect(classifyCqaIchBasis('some_unknown_attribute', 'drug_substance_biologic'))
      .toEqual(['ICH Q6B']);
  });

  it('deduplicates basis hits', () => {
    const r = classifyCqaIchBasis('assay potency content'); // matches assay/content/potency, all → Q6A+Q6B
    expect(r.length).toBe(2);
    expect(new Set(r).size).toBe(r.length);
  });
});

describe('matchesAnyPurpose', () => {
  it('returns true when attribute is contained in any purpose', () => {
    expect(matchesAnyPurpose('related substances', new Set(['related substances', 'assay']))).toBe(true);
  });

  it('returns true when any purpose is contained in attribute', () => {
    expect(matchesAnyPurpose('impurities by HPLC', new Set(['impurities']))).toBe(true);
  });

  it('returns false when no overlap', () => {
    expect(matchesAnyPurpose('dissolution', new Set(['assay', 'related substances']))).toBe(false);
  });

  it('is case-insensitive on attribute side', () => {
    expect(matchesAnyPurpose('ASSAY', new Set(['assay']))).toBe(true);
  });
});

describe('prettifyAttribute', () => {
  it('replaces underscores with spaces and capitalises', () => {
    expect(prettifyAttribute('related_substances')).toBe('Related substances');
  });

  it('replaces hyphens with spaces', () => {
    expect(prettifyAttribute('charge-variant-profile')).toBe('Charge variant profile');
  });

  it('collapses repeated whitespace', () => {
    expect(prettifyAttribute('  pH   value  ')).toBe('PH value');
  });

  it('returns empty string unchanged', () => {
    expect(prettifyAttribute('')).toBe('');
  });
});
