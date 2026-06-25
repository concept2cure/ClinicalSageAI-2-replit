import { describe, it, expect } from 'vitest';
import {
  STANDARDS_REGISTRY,
  getStandard,
  isStandardId,
  standardsByDomain,
  standardsByBody,
  type StandardId,
} from '../../shared/regulatory/standards-registry';
import {
  CLIENT_SEGMENTS,
  standardsForSegment,
  type ClientSegmentId,
} from '../../shared/regulatory/client-segments';

describe('standards registry — versioned source of truth', () => {
  it('every entry is self-consistent (id matches key) and carries a version', () => {
    for (const [key, entry] of Object.entries(STANDARDS_REGISTRY)) {
      expect(entry.id).toBe(key);
      expect(entry.currentVersion.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(0);
    }
  });

  it('grounds the specific version of the standards that were bare strings', () => {
    expect(getStandard('iso_14971').currentVersion).toBe('2019');
    expect(getStandard('iso_13485').currentVersion).toBe('2016');
    expect(getStandard('ich_q5').designation).toBe('ICH Q5A–Q5E');
    expect(getStandard('ich_q5').domain).toBe('cmc_biologic');
  });

  it('indexes by domain and by body', () => {
    expect(standardsByDomain('risk').map((s) => s.id)).toContain('iso_14971');
    expect(standardsByBody('ICH').length).toBeGreaterThanOrEqual(4);
    expect(standardsByBody('CLSI').map((s) => s.id)).toEqual(['clsi_ep_suite']);
  });

  it('isStandardId is a real guard', () => {
    expect(isStandardId('iso_14971')).toBe(true);
    expect(isStandardId('not_a_standard')).toBe(false);
  });
});

describe('client segments — standards are derived from the registry', () => {
  it('every segment standardId resolves in the registry (no dangling references)', () => {
    for (const seg of Object.values(CLIENT_SEGMENTS)) {
      for (const id of seg.standardIds) {
        expect(isStandardId(id)).toBe(true);
        expect(getStandard(id as StandardId)).toBeDefined();
      }
    }
  });

  it('the displayed designations are byte-identical to the curated lists (no drift)', () => {
    // Grounding must not change what clients see today.
    expect(CLIENT_SEGMENTS.device.standards).toEqual([
      'ISO 13485', 'ISO 14971', 'IEC 62304', 'IEC 62366-1', 'FD&C §524B', '21 CFR 820 / QMSR',
    ]);
    expect(CLIENT_SEGMENTS.ivd.standards).toEqual([
      'ISO 13485', 'CLSI EP05/EP06/EP07/EP17', 'ISO 14971', '42 CFR 493 (CLIA)',
    ]);
    expect(CLIENT_SEGMENTS.biotech.standards).toEqual([
      'ICH Q5A–Q5E', 'ICH E (efficacy)', 'ICH S6', 'PHS Act §351',
    ]);
    expect(CLIENT_SEGMENTS.pharma.standards).toEqual([
      'ICH Q1–Q12', 'ICH E (efficacy)', 'ICH M3(R2) / S-series', '21 CFR 314',
    ]);
  });

  it('standards string array equals the registry designations for standardIds', () => {
    for (const seg of Object.values(CLIENT_SEGMENTS)) {
      expect(seg.standards).toEqual(seg.standardIds.map((id) => getStandard(id).designation));
    }
  });

  it('standardsForSegment returns the full versioned entries', () => {
    const ivd = standardsForSegment('ivd');
    expect(ivd.map((s) => s.id)).toEqual(['iso_13485', 'clsi_ep_suite', 'iso_14971', 'cfr_493_clia']);
    expect(ivd.find((s) => s.id === 'clsi_ep_suite')?.domain).toBe('analytical_performance');
  });

  it('every standard a segment cites is registered as governing that segment', () => {
    // Integrity in the meaningful direction: the curated per-segment list must be
    // a subset of what the registry says governs that segment. (The registry's
    // `segments` may be broader — e.g. IEC 62304 governs IVD software too even
    // though the IVD display list does not enumerate it.)
    for (const [segId, seg] of Object.entries(CLIENT_SEGMENTS) as [ClientSegmentId, typeof CLIENT_SEGMENTS[ClientSegmentId]][]) {
      for (const id of seg.standardIds) {
        expect(getStandard(id).segments).toContain(segId);
      }
    }
  });
});
