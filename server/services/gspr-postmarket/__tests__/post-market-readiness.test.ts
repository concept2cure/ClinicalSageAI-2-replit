/**
 * Post-Market Documentation Status — honest aggregation. Required-vs-optional is
 * driven by device class; presence/status/gate are factual; missing required
 * documents are reported as such; and the report never claims everything is
 * approved unless every required document is actually approved AND passes the
 * existing completeness gate.
 */

import { describe, it, expect } from 'vitest';
import { computeDocStatus } from '../post-market-readiness';
import { buildPmsPlanContent } from '../post-market-authoring';
import type {
  PostMarketDocument,
  PostMarketDocumentType,
} from '../../../../shared/schema/gspr-postmarket';

function doc(
  documentType: PostMarketDocumentType,
  overrides: Partial<PostMarketDocument> = {}
): PostMarketDocument {
  return {
    id: `doc-${documentType}`,
    documentType,
    version: 1,
    status: 'draft',
    locked: false,
    content: {},
    reportingPeriodStart: null,
    reportingPeriodEnd: null,
    ...overrides,
  } as unknown as PostMarketDocument;
}

const ctx = { deviceName: 'Acme Pump', deviceClass: 'IIb', regulation: 'MDR' as const };

describe('computeDocStatus', () => {
  it('reports all six types, flagging required ones for a Class IIb device', () => {
    const r = computeDocStatus([], 'IIb', 'MDR', 'p1');
    expect(r.documents).toHaveLength(6);
    const required = new Set(r.documents.filter(d => d.required).map(d => d.documentType));
    // Class IIb: PMS plan, PSUR, PMCF plan + evaluation required; SSCP not (non-implantable).
    expect(required).toContain('pms_plan');
    expect(required).toContain('psur');
    expect(required).toContain('pmcf_plan');
    expect(required).toContain('pmcf_evaluation');
    expect(required.has('sscp')).toBe(false);
  });

  it('marks absent required documents as missing and not approved', () => {
    const r = computeDocStatus([], 'IIb', 'MDR', 'p1');
    const pms = r.documents.find(d => d.documentType === 'pms_plan')!;
    expect(pms.present).toBe(false);
    expect(pms.status).toBe('missing');
    expect(r.requiredPresent).toBe(0);
    expect(r.allRequiredApproved).toBe(false);
  });

  it('uses the latest version per type and runs the real validation gate', () => {
    const docs = [
      doc('pms_plan', { version: 1, content: {} }),
      doc('pms_plan', { version: 2, content: buildPmsPlanContent(ctx), status: 'approved' }),
    ];
    const r = computeDocStatus(docs, 'IIb', 'MDR', 'p1');
    const pms = r.documents.find(d => d.documentType === 'pms_plan')!;
    expect(pms.present).toBe(true);
    expect(pms.latestVersion).toBe(2);
    expect(pms.status).toBe('approved');
    expect(pms.gatePasses).toBe(true); // complete content → gate passes
  });

  it('an approved-but-incomplete document does NOT count as gate-passing', () => {
    const docs = [doc('pms_plan', { status: 'approved', content: {} })];
    const r = computeDocStatus(docs, 'IIb', 'MDR', 'p1');
    const pms = r.documents.find(d => d.documentType === 'pms_plan')!;
    expect(pms.status).toBe('approved');
    expect(pms.gatePasses).toBe(false); // empty content fails the completeness gate
  });

  it('allRequiredApproved is true only when every required doc is approved AND passes the gate', () => {
    // Class I device: required = pms_plan + pms_report.
    const docs = [
      doc('pms_plan', { status: 'approved', content: buildPmsPlanContent({ ...ctx, deviceClass: 'I' }) }),
      doc('pms_report', {
        status: 'approved',
        content: {
          summaryOfFindings: 'x',
          correctivePreventiveActions: 'y',
          concludingAssessment: 'z',
        },
        reportingPeriodStart: new Date('2025-01-01') as any,
        reportingPeriodEnd: new Date('2025-12-31') as any,
      }),
    ];
    const r = computeDocStatus(docs, 'I', 'MDR', 'p1');
    expect(r.requiredTotal).toBe(2);
    expect(r.allRequiredApproved).toBe(true);
  });

  it('requires SSCP for an implantable Class IIb device', () => {
    const r = computeDocStatus([], 'IIb implantable', 'MDR', 'p1');
    expect(r.documents.find(d => d.documentType === 'sscp')!.required).toBe(true);
  });
});
