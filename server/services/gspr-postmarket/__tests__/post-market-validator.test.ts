/**
 * Post-Market document validator tests — pure unit tests, no DB.
 */

import { describe, expect, test } from 'vitest';

import { validateDocument } from '../post-market.service';
import type { PostMarketDocument } from '../../../../shared/schema/gspr-postmarket';

const baseDoc = (overrides: Partial<PostMarketDocument> = {}): PostMarketDocument =>
  ({
    id: 'doc-1',
    organizationId: 1,
    programId: 'prog-1',
    documentType: 'pms_plan',
    code: 'PMS-001',
    version: 1,
    previousDocumentId: null,
    title: 'Test Doc',
    deviceSubjectName: null,
    reportingPeriodStart: null,
    reportingPeriodEnd: null,
    content: {},
    summary: null,
    risksIdentified: null,
    benefitRiskConclusion: null,
    status: 'draft',
    locked: false,
    approvedBy: null,
    approvedAt: null,
    signatureId: null,
    relatedCerReportId: null,
    relatedPredicateKNumber: null,
    metadata: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as PostMarketDocument;

describe('validateDocument — pms_plan', () => {
  test('empty content fails all five PMS-001 checks', () => {
    const r = validateDocument(baseDoc({ documentType: 'pms_plan', content: {} }));
    expect(r.findings.filter(f => f.code === 'PMS-001')).toHaveLength(5);
    expect(r.passesGate).toBe(false);
  });

  test('complete pms_plan passes the gate', () => {
    const r = validateDocument(
      baseDoc({
        documentType: 'pms_plan',
        content: {
          proactiveCollectionMethods: 'monthly literature scan + complaint feed',
          complaintHandlingProcess: 'SOP-CMPL-001 with 30-day SLA',
          trendReportingProcess: 'quarterly trend review',
          performanceMonitoring: 'quarterly performance KPI review',
          communicationPlan: 'quarterly notified-body sync',
        },
      })
    );
    expect(r.criticalCount).toBe(0);
    expect(r.passesGate).toBe(true);
  });
});

describe('validateDocument — pms_report', () => {
  test('missing reporting period flags PMSR-001', () => {
    const r = validateDocument(
      baseDoc({
        documentType: 'pms_report',
        content: {
          summaryOfFindings: 'no signals',
          correctivePreventiveActions: 'none',
          concludingAssessment: 'risk profile stable',
        },
      })
    );
    expect(r.findings.some(f => f.code === 'PMSR-001')).toBe(true);
  });

  test('missing content fields flag PMSR-002', () => {
    const r = validateDocument(
      baseDoc({
        documentType: 'pms_report',
        reportingPeriodStart: new Date('2025-01-01'),
        reportingPeriodEnd: new Date('2025-12-31'),
        content: { summaryOfFindings: 'signals reviewed' },
      })
    );
    expect(r.findings.some(f => f.code === 'PMSR-002')).toBe(true);
  });
});

describe('validateDocument — pmcf_plan', () => {
  test('all five required content fields fail when empty', () => {
    const r = validateDocument(baseDoc({ documentType: 'pmcf_plan', content: {} }));
    expect(r.findings.filter(f => f.code === 'PMCFP-001')).toHaveLength(5);
  });
});

describe('validateDocument — pmcf_evaluation', () => {
  test('missing reporting period flags PMCFE-001', () => {
    const r = validateDocument(baseDoc({ documentType: 'pmcf_evaluation', content: {} }));
    expect(r.findings.some(f => f.code === 'PMCFE-001')).toBe(true);
  });
});

describe('validateDocument — psur', () => {
  test('PSUR demands a reporting period and four content fields', () => {
    const r = validateDocument(baseDoc({ documentType: 'psur', content: {} }));
    expect(r.findings.some(f => f.code === 'PSUR-001')).toBe(true);
    expect(r.findings.filter(f => f.code === 'PSUR-002')).toHaveLength(4);
  });
});

describe('validateDocument — sscp', () => {
  test('SSCP demands seven content fields', () => {
    const r = validateDocument(baseDoc({ documentType: 'sscp', content: {} }));
    expect(r.findings.filter(f => f.code === 'SSCP-001')).toHaveLength(7);
  });

  test('every SSCP finding cites MDR Article 32', () => {
    const r = validateDocument(baseDoc({ documentType: 'sscp', content: {} }));
    for (const f of r.findings) {
      expect(f.citation).toMatch(/Article 32/);
    }
  });
});

describe('validateDocument — locked-state guard', () => {
  test('locked but draft status raises PM-099', () => {
    const r = validateDocument(
      baseDoc({
        documentType: 'pms_plan',
        locked: true,
        status: 'draft',
        content: {
          proactiveCollectionMethods: 'x',
          complaintHandlingProcess: 'x',
          trendReportingProcess: 'x',
          performanceMonitoring: 'x',
          communicationPlan: 'x',
        },
      })
    );
    expect(r.findings.some(f => f.code === 'PM-099')).toBe(true);
  });
});
