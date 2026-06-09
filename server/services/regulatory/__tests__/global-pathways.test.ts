/**
 * Global pathway descriptor + readiness tests.
 */

import { describe, it, expect } from 'vitest';
import { PATHWAYS, assessPathwayReadiness, listPathways } from '../global-pathways';

describe('global pathways', () => {
  it('lists all supported jurisdictions', () => {
    const all = listPathways();
    expect(all.length).toBe(5);
    expect(PATHWAYS.ca_health_canada.mdsapLeverage).toBe(true);
    expect(PATHWAYS.cn_nmpa.localRepresentativeRequired).toBe(true);
  });

  it('Health Canada ready when MDSAP + core docs present', () => {
    const r = assessPathwayReadiness('ca_health_canada', [
      'device_classification',
      'iso_13485_mdsap_certificate',
      'safety_effectiveness_evidence',
      'labelling',
      'quality_plan',
    ]);
    expect(r.ready).toBe(true);
    expect(r.readinessScore).toBe(1);
  });

  it('NMPA flags missing type testing', () => {
    const r = assessPathwayReadiness('cn_nmpa', ['device_classification', 'local_agent']);
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('type_testing_chinese_lab');
  });
});
