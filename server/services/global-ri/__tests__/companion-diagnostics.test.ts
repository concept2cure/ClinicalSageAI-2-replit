/**
 * Companion-diagnostics (CDx) co-development expert — FDA & EU.
 */

import { describe, it, expect } from 'vitest';
import {
  getCompanionDiagnosticFramework,
  getCodevelopmentConsiderations,
  CDX_REGIONS,
  type CdxRegion,
} from '../companion-diagnostics';

describe('getCompanionDiagnosticFramework — coverage', () => {
  it('models every region with a truthy citation and core fields', () => {
    for (const r of CDX_REGIONS) {
      const f = getCompanionDiagnosticFramework(r);
      expect(f.region).toBe(r);
      expect(f.definition).toBeTruthy();
      expect(f.deviceClassification).toBeTruthy();
      expect(f.regulatoryRoute).toBeTruthy();
      expect(f.medicinesConsultation).toBeTruthy();
      expect(f.oversight).toBeTruthy();
      expect(f.citation).toBeTruthy();
      expect(f.notes.length).toBeGreaterThan(0);
    }
  });

  it('CDX_REGIONS is exactly FDA + EU', () => {
    expect(CDX_REGIONS).toEqual(['FDA', 'EU']);
  });
});

describe('getCompanionDiagnosticFramework — FDA', () => {
  it('deviceClassification mentions Class III and PMA', () => {
    const f = getCompanionDiagnosticFramework('FDA');
    expect(f.deviceClassification).toContain('Class III');
    expect(f.deviceClassification).toContain('PMA');
  });

  it('definition reflects the essential-for-safe-and-effective-use concept', () => {
    const f = getCompanionDiagnosticFramework('FDA');
    expect(f.definition.toLowerCase()).toContain('essential');
  });

  it('oversight references CDRH and CDER/CBER coordination', () => {
    const f = getCompanionDiagnosticFramework('FDA');
    expect(f.oversight).toContain('CDRH');
    expect(f.oversight).toMatch(/CDER|CBER/);
  });
});

describe('getCompanionDiagnosticFramework — EU', () => {
  it('deviceClassification mentions IVDR and Class C', () => {
    const f = getCompanionDiagnosticFramework('EU');
    expect(f.deviceClassification).toContain('Class C');
    expect(f.citation).toContain('IVDR');
  });

  it('route requires a Notified Body', () => {
    const f = getCompanionDiagnosticFramework('EU');
    expect(f.regulatoryRoute).toContain('Notified Body');
  });

  it('medicinesConsultation references the Article 48(7) consultation', () => {
    const f = getCompanionDiagnosticFramework('EU');
    expect(f.medicinesConsultation).toContain('48(7)');
    expect(f.medicinesConsultation.toLowerCase()).toContain('consult');
  });
});

describe('getCodevelopmentConsiderations', () => {
  it('returns at least 4 considerations including clinical_validation + cross_labeling', () => {
    const r = getCodevelopmentConsiderations();
    expect(r.considerations.length).toBeGreaterThanOrEqual(4);
    const ids = r.considerations.map((c) => c.id);
    expect(ids).toContain('clinical_validation');
    expect(ids).toContain('cross_labeling');
    expect(ids).toContain('analytical_validation');
    expect(ids).toContain('contemporaneous_timeline');
    expect(ids).toContain('assay_bridging');
    expect(r.citation).toBeTruthy();
  });

  it('every consideration has a title and detail', () => {
    const r = getCodevelopmentConsiderations();
    for (const c of r.considerations) {
      expect(c.id).toBeTruthy();
      expect(c.title).toBeTruthy();
      expect(c.detail).toBeTruthy();
    }
  });
});

describe('errors + determinism', () => {
  it('throws for an unmodeled region', () => {
    expect(() => getCompanionDiagnosticFramework('JP' as CdxRegion)).toThrow();
  });

  it('framework lookup is deterministic', () => {
    expect(getCompanionDiagnosticFramework('EU')).toEqual(getCompanionDiagnosticFramework('EU'));
  });

  it('co-development checklist is deterministic', () => {
    expect(getCodevelopmentConsiderations()).toEqual(getCodevelopmentConsiderations());
  });
});
