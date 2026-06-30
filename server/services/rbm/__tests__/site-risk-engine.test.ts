/**
 * Unit tests for the RBM site-risk engine's pure snapshot derivation.
 * Quality scores (0-100, higher better) invert to risk (higher worse), and the
 * monitoring tier is risk-proportionate. Covers both site_intel.sites variants.
 */

import { describe, it, expect } from 'vitest';
import { snapshotFromSiteRow } from '../site-risk-engine';

describe('snapshotFromSiteRow', () => {
  it('inverts high quality scores to low risk → reduced tier', () => {
    const s = snapshotFromSiteRow({
      id: 1, site_number: 'S001', site_name: 'Alpha',
      enrollment_score: 90, quality_score: 90, operational_score: 90, composite_score: 90,
    });
    expect(s.enrollmentRisk).toBe(10);
    expect(s.qualityRisk).toBe(10);
    expect(s.operationalRisk).toBe(10);
    expect(s.compositeRisk).toBe(10);
    expect(s.monitoringTier).toBe('reduced');
    expect(s.drivers).toEqual([]);
    expect(s.siteId).toBe('1');
    expect(s.siteNumber).toBe('S001');
    expect(s.siteName).toBe('Alpha');
  });

  it('derives composite from components when absent and flags high-risk drivers', () => {
    const s = snapshotFromSiteRow({
      id: 2, site_number: 'S002',
      enrollment_score: 30, quality_score: 30, operational_score: 30,
    });
    expect(s.compositeRisk).toBe(70); // avg of three 70s
    expect(s.monitoringTier).toBe('enhanced');
    expect(s.drivers.sort()).toEqual(['enrollment', 'operational', 'quality']);
  });

  it('reads the alternate schema variant (overall_score / compliance_score)', () => {
    const s = snapshotFromSiteRow({
      id: 3, overall_score: 50, compliance_score: 50, enrollment_score: 50, quality_score: 50,
    });
    expect(s.operationalRisk).toBe(50); // from compliance_score
    expect(s.compositeRisk).toBe(50);   // from overall_score
    expect(s.monitoringTier).toBe('standard');
  });

  it('tolerates missing scores → null risks, reduced tier', () => {
    const s = snapshotFromSiteRow({ id: 4, site_number: 'S004' });
    expect(s.compositeRisk).toBeNull();
    expect(s.enrollmentRisk).toBeNull();
    expect(s.monitoringTier).toBe('reduced');
    expect(s.drivers).toEqual([]);
  });
});
