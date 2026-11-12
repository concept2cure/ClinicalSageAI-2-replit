/**
 * The application type a catalog filing creates is ONE function, read by the
 * New project picker and by POST /api/c2c/projects alike (S12 biotech sweep,
 * 2026-11-09, package S1).
 *
 * `programTypeFor` lived in Projects.tsx, so only the picker could ask it. The
 * create endpoint recorded `submissionTypeId` and never compared it with the
 * type that filing creates: a Type II Variation sent as an MAA was scaffolded
 * as an MAA, while the picker asked the verdict about an NDA at EMA and marked
 * it not offered. Moved unchanged to shared/constants/domain so the server
 * computes what the picker computes.
 *
 * The picker passes the tab the person is looking at; the server knows no tab.
 * That is sound only while no catalog filing's type depends on the tab, which
 * the second test asserts over the whole catalog.
 */
import { describe, it, expect } from 'vitest';
import { programTypeFor } from '../filing-application-type';
import { FILING_CATALOG, resolveFilingCatalogEntry } from '../../../regulatory/filing-catalog';

/** Exactly what the picker sends for a catalog row (Projects.tsx, RegistryPicker applicationTypeOf). */
const asPicker = (id: string, lane = 'biotech') => {
  const e = resolveFilingCatalogEntry(id)!;
  return programTypeFor({ id: e.id, label: e.id, pathway: e.pathwayKey || 'ctd' }, lane);
};

/** Every lane the New project wizard opens in (Projects.tsx SEG_LABELS). */
const LANES = ['biotech', 'pharma', 'medtech', 'diagnostics', 'cro', 'health'];

describe('programTypeFor, shared by the picker and the create endpoint', () => {
  it('gives each filing the application it creates', () => {
    expect(asPicker('eu_variation_ii')).toBe('nda');
    expect(asPicker('eu_maa')).toBe('maa');
    expect(asPicker('eu_cta')).toBe('cta');
    expect(asPicker('us_505b2')).toBe('nda');
    expect(asPicker('us_351k')).toBe('bla');
  });

  it('no catalog filing\'s application type depends on the tab the picker is on', () => {
    const tabDependent = FILING_CATALOG
      .map((e) => [e.id, new Set(LANES.map((lane) => asPicker(e.id, lane)))] as const)
      .filter(([, types]) => types.size > 1)
      .map(([id, types]) => `${id}: ${[...types].join(' | ')}`);
    expect(FILING_CATALOG.length).toBeGreaterThan(200);
    expect(tabDependent).toEqual([]);
  });
});
