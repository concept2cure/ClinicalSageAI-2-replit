/**
 * IEC 62304 software lifecycle + cybersecurity tests.
 */

import { describe, it, expect } from 'vitest';
import {
  classifySoftwareSafety,
  assessSdlcCompleteness,
  assessSbom,
  assessCybersecurity,
} from '../iec-62304-software';

describe('classifySoftwareSafety', () => {
  it('Class C when failure can cause death/serious injury', () => {
    const r = classifySoftwareSafety({
      canContributeToHazard: true,
      worstCaseHarm: 'serious_death',
      externalRiskControlRemovesHazard: false,
    });
    expect(r.safetyClass).toBe('C');
  });

  it('Class A when no contribution to a hazard', () => {
    const r = classifySoftwareSafety({
      canContributeToHazard: false,
      worstCaseHarm: 'serious_death',
      externalRiskControlRemovesHazard: false,
    });
    expect(r.safetyClass).toBe('A');
  });

  it('external control demotes to Class A', () => {
    const r = classifySoftwareSafety({
      canContributeToHazard: true,
      worstCaseHarm: 'serious_death',
      externalRiskControlRemovesHazard: true,
    });
    expect(r.safetyClass).toBe('A');
  });
});

describe('assessSdlcCompleteness', () => {
  it('Class C requires architecture + detailed design', () => {
    const r = assessSdlcCompleteness('C', ['development_plan', 'software_requirements']);
    expect(r.compliant).toBe(false);
    expect(r.missing).toContain('architecture');
    expect(r.missing).toContain('detailed_design');
  });

  it('Class A does not require detailed design', () => {
    const r = assessSdlcCompleteness('A', [
      'development_plan', 'software_requirements', 'system_testing',
      'release', 'configuration_management', 'problem_resolution',
    ]);
    expect(r.compliant).toBe(true);
  });
});

describe('assessSbom', () => {
  it('not submission-ready with unevaluated anomalies', () => {
    const r = assessSbom([
      { name: 'openssl', version: '3.0', requirementsDocumented: true, anomaliesEvaluated: false, knownVulnerabilities: 2 },
    ]);
    expect(r.submissionReady).toBe(false);
    expect(r.totalKnownVulnerabilities).toBe(2);
    expect(r.unevaluatedAnomalies).toHaveLength(1);
  });
});

describe('assessCybersecurity', () => {
  it('blocks when RTA-critical elements are missing', () => {
    const r = assessCybersecurity(['security_controls', 'penetration_testing']);
    expect(r.submissionReady).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('submission-ready with all RTA-critical elements present', () => {
    const r = assessCybersecurity([
      'threat_model', 'security_risk_assessment', 'sbom', 'vulnerability_management_plan',
    ]);
    expect(r.submissionReady).toBe(true);
  });
});
