import { describe, it, expect } from 'vitest';
import {
  CLIENT_SEGMENTS,
  getSegment,
  segmentForProductClass,
  segmentForProductClasses,
  standardsForSegment,
  resolveEvidenceModel,
  type ClientSegmentId,
} from '../../shared/regulatory/client-segments';

describe('client-segments — the four presets', () => {
  const ALL_IDS: ClientSegmentId[] = ['device', 'ivd', 'biotech', 'pharma'];

  it('defines exactly four segments', () => {
    expect(Object.keys(CLIENT_SEGMENTS)).toHaveLength(4);
    for (const id of ALL_IDS) {
      expect(CLIENT_SEGMENTS[id]).toBeDefined();
    }
  });

  it('every segment has the required fields', () => {
    for (const seg of Object.values(CLIENT_SEGMENTS)) {
      expect(seg.id).toBeTruthy();
      expect(seg.label).toBeTruthy();
      expect(seg.productClasses.length).toBeGreaterThan(0);
      expect(seg.center).toBeTruthy();
      expect(seg.euRoute).toBeTruthy();
      expect(seg.defaultEvidenceModel).toBeTruthy();
      expect(seg.cmcModel).toBeTruthy();
      expect(seg.riskModel).toBeTruthy();
      expect(seg.lifecycleModel).toBeTruthy();
      expect(seg.dossierStandard).toBeTruthy();
      expect(seg.standardIds.length).toBeGreaterThan(0);
      expect(seg.standards.length).toBe(seg.standardIds.length);
    }
  });

  it('device and IVD use eSTAR; biotech and pharma use eCTD', () => {
    expect(getSegment('device').dossierStandard).toBe('eSTAR');
    expect(getSegment('ivd').dossierStandard).toBe('eSTAR');
    expect(getSegment('biotech').dossierStandard).toBe('eCTD');
    expect(getSegment('pharma').dossierStandard).toBe('eCTD');
  });

  it('device and IVD use ISO 14971 risk; biotech and pharma use nonclinical PV', () => {
    expect(getSegment('device').riskModel).toBe('iso14971');
    expect(getSegment('ivd').riskModel).toBe('iso14971');
    expect(getSegment('biotech').riskModel).toBe('nonclinical_pv');
    expect(getSegment('pharma').riskModel).toBe('nonclinical_pv');
  });
});

describe('client-segments — product class → segment mapping', () => {
  it('maps medical_device to device', () => {
    expect(segmentForProductClass('medical_device')).toBe('device');
  });

  it('maps ivd to ivd', () => {
    expect(segmentForProductClass('ivd')).toBe('ivd');
  });

  it('maps biologic to biotech', () => {
    expect(segmentForProductClass('biologic')).toBe('biotech');
  });

  it('maps small_molecule to pharma', () => {
    expect(segmentForProductClass('small_molecule')).toBe('pharma');
  });

  it('maps generic to pharma', () => {
    expect(segmentForProductClass('generic')).toBe('pharma');
  });

  it('maps biosimilar to biotech', () => {
    expect(segmentForProductClass('biosimilar')).toBe('biotech');
  });

  it('segmentForProductClasses returns the first concrete match', () => {
    expect(segmentForProductClasses(['ivd'])).toBe('ivd');
    expect(segmentForProductClasses(['biologic', 'small_molecule'])).toBe('biotech');
  });
});

describe('client-segments — standards corpus', () => {
  it('device carries ISO 13485 and ISO 14971', () => {
    const stds = standardsForSegment('device');
    const ids = stds.map((s) => s.id);
    expect(ids).toContain('iso_13485');
    expect(ids).toContain('iso_14971');
  });

  it('IVD carries CLSI EP suite', () => {
    const stds = standardsForSegment('ivd');
    const ids = stds.map((s) => s.id);
    expect(ids).toContain('clsi_ep_suite');
  });

  it('biotech carries ICH Q5 (biologic CMC)', () => {
    const stds = standardsForSegment('biotech');
    const ids = stds.map((s) => s.id);
    expect(ids).toContain('ich_q5');
  });

  it('pharma carries ICH Q chemistry', () => {
    const stds = standardsForSegment('pharma');
    const ids = stds.map((s) => s.id);
    expect(ids).toContain('ich_q_chemistry');
  });

  it('every standard has a version and designation', () => {
    for (const id of ['device', 'ivd', 'biotech', 'pharma'] as ClientSegmentId[]) {
      for (const s of standardsForSegment(id)) {
        expect(s.currentVersion.length).toBeGreaterThan(0);
        expect(s.designation.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('client-segments — evidence model resolution', () => {
  it('device defaults to equivalence', () => {
    expect(resolveEvidenceModel('device', null, ['medical_device'])).toBe('equivalence');
  });

  it('device PMA overrides to clinical_efficacy', () => {
    expect(resolveEvidenceModel('device', 'device_approval', ['medical_device'])).toBe('clinical_efficacy');
  });

  it('IVD defaults to performance', () => {
    expect(resolveEvidenceModel('ivd', null, ['ivd'])).toBe('performance');
  });

  it('biotech defaults to clinical_efficacy', () => {
    expect(resolveEvidenceModel('biotech', null, ['biologic'])).toBe('clinical_efficacy');
  });

  it('generic-only product classes resolve to sameness', () => {
    expect(resolveEvidenceModel('pharma', null, ['generic'])).toBe('sameness');
  });

  it('biosimilar-only resolves to sameness', () => {
    expect(resolveEvidenceModel('biotech', null, ['biosimilar'])).toBe('sameness');
  });

  it('mixed innovator + biosimilar does NOT resolve to sameness', () => {
    expect(resolveEvidenceModel('biotech', null, ['biologic', 'biosimilar'])).toBe('clinical_efficacy');
  });
});
