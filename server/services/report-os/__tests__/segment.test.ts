import { describe, it, expect } from 'vitest';
import {
  productTypesToSegments,
  filterTypesForSegment,
  serviceSegmentFor,
  type SegmentFilterableType,
} from '../segment';
import { REPORT_TYPE_SEED } from '../taxonomy';

describe('productTypesToSegments', () => {
  it('maps each product type to its segment', () => {
    expect(productTypesToSegments(['drug'])).toEqual(['pharma']);
    expect(productTypesToSegments(['biologic'])).toEqual(['biotech']);
    expect(productTypesToSegments(['device'])).toEqual(['device']);
    expect(productTypesToSegments(['ivd'])).toEqual(['ivd']);
    expect(productTypesToSegments(['combination'])).toEqual(['device']);
  });

  it('returns the distinct union for multi-product orgs, in canonical order', () => {
    expect(productTypesToSegments(['device', 'drug', 'drug'])).toEqual(['pharma', 'device']);
    expect(productTypesToSegments(['ivd', 'biologic', 'device'])).toEqual(['biotech', 'device', 'ivd']);
  });

  it('is case/whitespace tolerant and drops unknown types', () => {
    expect(productTypesToSegments([' Drug ', 'BIOLOGIC'])).toEqual(['pharma', 'biotech']);
    expect(productTypesToSegments(['widget', ''])).toEqual([]);
  });
});

describe('serviceSegmentFor', () => {
  it('maps CRO/CDMO client types to the cro service segment', () => {
    expect(serviceSegmentFor('cro')).toBe('cro');
    expect(serviceSegmentFor('cdmo')).toBe('cro');
    expect(serviceSegmentFor(' CRO ')).toBe('cro');
    expect(serviceSegmentFor(null, 'cdmo')).toBe('cro');
  });

  it('does NOT treat product-owning client types (incl. the pharma default) as service', () => {
    // client_type defaults to 'pharma' for every org — must not add a segment,
    // or the pharma catalog would leak to every org and break anchoring.
    expect(serviceSegmentFor('pharma')).toBeNull();
    expect(serviceSegmentFor('biotech')).toBeNull();
    expect(serviceSegmentFor('medtech')).toBeNull();
    expect(serviceSegmentFor(null, null)).toBeNull();
    expect(serviceSegmentFor(undefined, undefined)).toBeNull();
  });
});

describe('CRO segment anchoring (real taxonomy)', () => {
  it('a CRO org sees the eTMF completeness pack; a program-less non-service org does not', () => {
    const croVisible = filterTypesForSegment(REPORT_TYPE_SEED, ['cro']);
    expect(croVisible.some((t) => t.typeId === 'etmf.completeness_pack')).toBe(true);
    // A program-less, non-service org (no derived segments) sees only universal
    // types — the CRO-scoped eTMF pack is not universal, so it is excluded.
    const universalOnly = filterTypesForSegment(REPORT_TYPE_SEED, []);
    expect(universalOnly.some((t) => t.typeId === 'etmf.completeness_pack')).toBe(false);
  });
});

describe('filterTypesForSegment', () => {
  const rows: SegmentFilterableType[] = [
    { allowedClientSegments: [] }, // universal
    { allowedClientSegments: ['device'] },
    { allowedClientSegments: ['pharma', 'biotech'] },
    { allowedClientSegments: ['ivd'], allowedPersonas: ['ra_lead'] },
  ];

  it('always keeps universal (empty allowedClientSegments) types', () => {
    expect(filterTypesForSegment(rows, [])).toEqual([rows[0]]);
    expect(filterTypesForSegment(rows, ['device'])).toContain(rows[0]);
  });

  it('keeps a typed row only when its segments intersect the org segments', () => {
    const device = filterTypesForSegment(rows, ['device']);
    expect(device).toContain(rows[1]);
    expect(device).not.toContain(rows[2]); // pharma/biotech only
  });

  it('shows a multi-segment type to any matching segment', () => {
    expect(filterTypesForSegment(rows, ['pharma'])).toContain(rows[2]);
    expect(filterTypesForSegment(rows, ['biotech'])).toContain(rows[2]);
  });

  it('intersects on persona when a persona filter is given', () => {
    const ivdRaLead = filterTypesForSegment(rows, ['ivd'], 'ra_lead');
    expect(ivdRaLead).toContain(rows[3]);
    const ivdOther = filterTypesForSegment(rows, ['ivd'], 'executive');
    expect(ivdOther).not.toContain(rows[3]); // persona mismatch
  });

  it('anchors the real taxonomy: a pharma org excludes the device-only 510(k) matrix', () => {
    const k510 = REPORT_TYPE_SEED.find((t) => t.typeId === 'usa_fda.estar_510k_equivalence_matrix');
    expect(k510?.allowedClientSegments).toEqual(['device']);
    const pharmaVisible = filterTypesForSegment(REPORT_TYPE_SEED, ['pharma']);
    expect(pharmaVisible.some((t) => t.typeId === 'usa_fda.estar_510k_equivalence_matrix')).toBe(false);
    const deviceVisible = filterTypesForSegment(REPORT_TYPE_SEED, ['device']);
    expect(deviceVisible.some((t) => t.typeId === 'usa_fda.estar_510k_equivalence_matrix')).toBe(true);
  });
});
