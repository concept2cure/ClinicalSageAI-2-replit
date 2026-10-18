import { describe, it, expect } from 'vitest';
import {
  productTypesToSegments,
  filterTypesForSegment,
  serviceSegmentFor,
  institutionalSegmentFor,
  segmentsForScope,
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
  it('keeps CRO and CDMO service identities distinct', () => {
    expect(serviceSegmentFor('cro')).toBe('cro');
    expect(serviceSegmentFor('cdmo')).toBe('cdmo');
    expect(serviceSegmentFor(' CRO ')).toBe('cro');
    expect(serviceSegmentFor(null, 'cdmo')).toBe('cdmo');
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

describe('institutional applicability and filing scope', () => {
  it('derives supported institutional identities without inventing product segments', () => {
    expect(institutionalSegmentFor('academic')).toBe('academic');
    expect(institutionalSegmentFor(null, 'government')).toBe('government');
    expect(institutionalSegmentFor('pharma')).toBeNull();
  });

  it('preserves institutional reports while excluding a sibling product catalog', () => {
    const scoped = segmentsForScope(['ivd'], ['pharma', 'ivd', 'academic']);
    expect(scoped).toEqual(['ivd', 'academic']);
    const visible = filterTypesForSegment(REPORT_TYPE_SEED, scoped);
    expect(visible.some(t => t.typeId === 'iacuc.protocol_register')).toBe(true);
    expect(visible.some(t => t.typeId === 'ema.maa_readiness_assessment')).toBe(false);
  });

  it('offers common reporting to IVD, service and institutional clients', () => {
    for (const segments of [[], ['ivd'], ['cro'], ['cdmo'], ['academic'], ['government']] as const) {
      const ids = filterTypesForSegment(REPORT_TYPE_SEED, [...segments]).map(t => t.typeId);
      expect(ids).toEqual(expect.arrayContaining(['readiness.executive_digest', 'provenance.evidence_trace_report', 'compliance.audit_assurance_pack', 'inspection.readiness_pack']));
    }
  });

  it('offers government research registers without showing drug market packs', () => {
    const ids = filterTypesForSegment(REPORT_TYPE_SEED, ['government']).map(t => t.typeId);
    expect(ids).toContain('research_compliance.training_status');
    expect(ids).toContain('grants.portfolio_register');
    expect(ids).not.toContain('ema.maa_readiness_assessment');
    expect(REPORT_TYPE_SEED.find(t => t.typeId === 'research_compliance.training_status')?.allowedScopes).toContain('account');
    expect(REPORT_TYPE_SEED.find(t => t.typeId === 'inspection.readiness_pack')?.allowedScopes).toContain('account');
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
    expect(k510?.allowedClientSegments).toEqual(['device', 'ivd']);
    const pharmaVisible = filterTypesForSegment(REPORT_TYPE_SEED, ['pharma']);
    expect(pharmaVisible.some((t) => t.typeId === 'usa_fda.estar_510k_equivalence_matrix')).toBe(false);
    const deviceVisible = filterTypesForSegment(REPORT_TYPE_SEED, ['device']);
    expect(deviceVisible.some((t) => t.typeId === 'usa_fda.estar_510k_equivalence_matrix')).toBe(true);
  });
});
