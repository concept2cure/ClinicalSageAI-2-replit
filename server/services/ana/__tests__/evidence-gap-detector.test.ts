/**
 * Evidence-gap detector — verifies the pure, deterministic comparison between what a
 * question asked for and what the gathered evidence covers. Pure detector, so the suite
 * is hermetic (no mocks, no IO, no clock — recency uses a supplied asOfYear).
 */

import { describe, it, expect } from 'vitest';
import {
  GAP_TYPES,
  detectEvidenceGaps,
  type EvidenceItem,
  type GapQuery,
} from '../evidence-gap-detector';

const ev = (e: EvidenceItem): EvidenceItem => e;

describe('detectEvidenceGaps — geographic', () => {
  it('flags requested regions missing from evidence', () => {
    const query: GapQuery = { regions: ['US', 'EU', 'JP'] };
    const evidence = [ev({ region: 'US' }), ev({ region: 'EU' })];
    const report = detectEvidenceGaps(query, evidence);
    expect(report.complete).toBe(false);
    expect(report.gaps.length).toBe(1);
    const gap = report.gaps[0];
    expect(gap.type).toBe('geographic');
    expect(gap.severity).toBe('major');
    expect(gap.missing).toEqual(['JP']);
    expect(typeof gap.suggestedQuery).toBe('string');
    expect(gap.suggestedQuery.length).toBeGreaterThan(0);
  });

  it('matches regions case-insensitively', () => {
    const query: GapQuery = { regions: ['US', 'EU'] };
    const evidence = [ev({ region: 'us' }), ev({ region: ' eu ' })];
    const report = detectEvidenceGaps(query, evidence);
    expect(report.complete).toBe(true);
    expect(report.gaps.length).toBe(0);
  });
});

describe('detectEvidenceGaps — population', () => {
  it('flags a population gap when only adult evidence is present', () => {
    const query: GapQuery = { population: 'pediatric' };
    const evidence = [ev({ population: 'adult' })];
    const report = detectEvidenceGaps(query, evidence);
    expect(report.gaps.length).toBe(1);
    expect(report.gaps[0].type).toBe('population');
    expect(report.gaps[0].severity).toBe('major');
  });

  it('matches population case-insensitively via substring', () => {
    const query: GapQuery = { population: 'Pediatric' };
    const evidence = [ev({ population: 'PEDIATRIC oncology cohort' })];
    const report = detectEvidenceGaps(query, evidence);
    expect(report.complete).toBe(true);
  });
});

describe('detectEvidenceGaps — outcome', () => {
  it('flags requested outcome types missing from evidence', () => {
    const query: GapQuery = { outcomeTypes: ['efficacy', 'safety'] };
    const evidence = [ev({ outcomeType: 'efficacy' })];
    const report = detectEvidenceGaps(query, evidence);
    expect(report.gaps.length).toBe(1);
    expect(report.gaps[0].type).toBe('outcome');
    expect(report.gaps[0].severity).toBe('major');
    expect(report.gaps[0].missing).toEqual(['safety']);
  });
});

describe('detectEvidenceGaps — temporal', () => {
  it('flags a temporal gap when newest evidence is too old', () => {
    const query: GapQuery = { recencyYears: 2, asOfYear: 2026 };
    const evidence = [ev({ year: 2019 }), ev({ year: 2010 })];
    const report = detectEvidenceGaps(query, evidence);
    expect(report.gaps.length).toBe(1);
    expect(report.gaps[0].type).toBe('temporal');
    expect(report.gaps[0].severity).toBe('minor');
  });

  it('no temporal gap when an item is within the recency window', () => {
    const query: GapQuery = { recencyYears: 2, asOfYear: 2026 };
    const evidence = [ev({ year: 2019 }), ev({ year: 2025 })];
    const report = detectEvidenceGaps(query, evidence);
    expect(report.complete).toBe(true);
    expect(report.gaps.length).toBe(0);
  });
});

describe('detectEvidenceGaps — full coverage', () => {
  it('reports complete with no gaps when everything requested is covered', () => {
    const query: GapQuery = {
      regions: ['US', 'EU'],
      population: 'pediatric',
      outcomeTypes: ['efficacy', 'safety'],
      recencyYears: 5,
      asOfYear: 2026,
    };
    const evidence = [
      ev({ region: 'US', population: 'pediatric', outcomeType: 'efficacy', year: 2024 }),
      ev({ region: 'EU', population: 'pediatric', outcomeType: 'safety', year: 2023 }),
    ];
    const report = detectEvidenceGaps(query, evidence);
    expect(report.complete).toBe(true);
    expect(report.gaps).toEqual([]);
    expect(report.evidenceCount).toBe(2);
    expect(report.notes.length).toBeGreaterThan(0);
  });
});

describe('detectEvidenceGaps — empty evidence', () => {
  it('reports gaps for everything requested with no evidence', () => {
    const query: GapQuery = {
      regions: ['US', 'JP'],
      population: 'pediatric',
      outcomeTypes: ['efficacy', 'safety'],
      recencyYears: 2,
      asOfYear: 2026,
    };
    const report = detectEvidenceGaps(query, []);
    expect(report.evidenceCount).toBe(0);
    expect(report.complete).toBe(false);
    expect(report.gaps.map((g) => g.type)).toEqual([
      'geographic',
      'population',
      'outcome',
      'temporal',
    ]);
  });

  it('reports no gaps for an empty query regardless of evidence', () => {
    const report = detectEvidenceGaps({}, []);
    expect(report.complete).toBe(true);
    expect(report.gaps).toEqual([]);
  });
});

describe('detectEvidenceGaps — ordering and determinism', () => {
  it('orders gaps stably by GAP_TYPES', () => {
    const query: GapQuery = {
      regions: ['JP'],
      population: 'pediatric',
      outcomeTypes: ['safety'],
      recencyYears: 1,
      asOfYear: 2026,
    };
    const report = detectEvidenceGaps(query, [ev({ region: 'US', year: 2000 })]);
    const order = report.gaps.map((g) => g.type);
    const expected = [...GAP_TYPES].filter((t) => order.includes(t));
    expect(order).toEqual(expected);
  });

  it('is deterministic across repeated identical calls', () => {
    const query: GapQuery = {
      regions: ['US', 'JP'],
      outcomeTypes: ['efficacy', 'safety'],
      recencyYears: 3,
      asOfYear: 2026,
    };
    const evidence = [ev({ region: 'US', outcomeType: 'efficacy', year: 2020 })];
    const a = JSON.stringify(detectEvidenceGaps(query, evidence));
    const b = JSON.stringify(detectEvidenceGaps(query, evidence));
    expect(a).toBe(b);
  });
});
