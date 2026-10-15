/**
 * ICH E6(R3) principles P3 and P5 are assessed from their own inputs (audit
 * finding 23 of the f/g/h fabrication sweep, 2026-10-15).
 *
 * What the code used to do: assessGCPCompliance scored P3 (independent ethics
 * review) from ethicsApprovalCurrent, P1's input, and P5 (proportionate,
 * fit-for-purpose processes) from riskBasedQualityManagement, P4's input. So
 * `{ ethicsApprovalCurrent: true, riskBasedQualityManagement: true }` printed
 * "Independent ethics review evidenced." and "Processes are proportionate and
 * fit-for-purpose." although no input addressed either principle.
 *
 * Now P3 reads independentEthicsReviewDocumented and P5 reads
 * proportionateProcessesDocumented, each 'unverified' when absent. Because the
 * shared flag used to pull P3 down with P1, 'compliant' now also requires
 * every principle to conform, so a trial without current ethics approval can
 * no longer come out compliant.
 */
import { describe, expect, it } from 'vitest';
import {
  assessGCPCompliance,
  type GCPComplianceParams,
} from '../gcp-operations-knowledge';

const ALL_TRUE: GCPComplianceParams = {
  ethicsApprovalCurrent: true,
  independentEthicsReviewDocumented: true,
  informedConsentProcessCompliant: true,
  sponsorOversightDocumented: true,
  vendorOversightDocumented: true,
  delegationDocumented: true,
  personnelQualified: true,
  protocolFollowedWithChangeControl: true,
  ipManagementCompliant: true,
  safetyReportingCompliant: true,
  dataGovernanceAlcoaPlus: true,
  computerizedSystemsValidated: true,
  auditTrailReviewPerformed: true,
  riskBasedQualityManagement: true,
  proportionateProcessesDocumented: true,
  recordRetentionCompliant: true,
};

const principle = (r: ReturnType<typeof assessGCPCompliance>, id: string) =>
  r.principleAssessments.find((p) => p.principleId === id)!;

describe('assessGCPCompliance: P3 and P5 have their own inputs', () => {
  it('leaves P3 and P5 unverified when only P1 and P4 inputs are given', () => {
    const r = assessGCPCompliance({ ethicsApprovalCurrent: true, riskBasedQualityManagement: true });

    expect(principle(r, 'P1').conforms).toBe('conforms');
    expect(principle(r, 'P4').conforms).toBe('conforms');
    expect(principle(r, 'P3').conforms).toBe('unverified');
    expect(principle(r, 'P5').conforms).toBe('unverified');
    expect(principle(r, 'P3').finding).not.toBe('Independent ethics review evidenced.');
    expect(principle(r, 'P5').finding).not.toBe('Processes are proportionate and fit-for-purpose.');
  });

  it('scores P3 and P5 from their own inputs, in both directions', () => {
    const yes = assessGCPCompliance(ALL_TRUE);
    expect(principle(yes, 'P3').conforms).toBe('conforms');
    expect(principle(yes, 'P5').conforms).toBe('conforms');
    expect(yes.overallStatus).toBe('compliant');

    const no = assessGCPCompliance({
      ...ALL_TRUE,
      independentEthicsReviewDocumented: false,
      proportionateProcessesDocumented: false,
    });
    expect(principle(no, 'P1').conforms).toBe('conforms');
    expect(principle(no, 'P3').conforms).toBe('gap');
    expect(principle(no, 'P5').conforms).toBe('gap');
  });

  it('does not call a trial compliant while a principle is a gap or unverified', () => {
    expect(assessGCPCompliance({ ...ALL_TRUE, ethicsApprovalCurrent: false }).overallStatus).not.toBe('compliant');
    expect(assessGCPCompliance({ ...ALL_TRUE, proportionateProcessesDocumented: undefined }).overallStatus).not.toBe('compliant');
  });
});
