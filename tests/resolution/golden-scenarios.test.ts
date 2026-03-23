/**
 * Golden Scenario Tests — Regression Backbone
 *
 * Three permanent tests covering the complete behavioral spectrum:
 *
 * 1. Assumption Change → Reapproval Cascade (full execution + governance)
 * 2. Low-Confidence Contradiction → No Auto-Execution (system refuses)
 * 3. Endpoint Drift → Full Resolution (system acts and proves it)
 *
 * These tests use intent-driven drivers, NOT ORM mocks.
 * They validate system truth, not method calls.
 *
 * Run: npx vitest run tests/resolution/golden-scenarios.test.ts
 *
 * @module tests/resolution/golden-scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE + MOCK SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const { state, mockDb } = await vi.hoisted(async () => {
  const { ResolutionTestState } = await import('./drivers/resolution-test-state');
  const { createMockDb } = await import('./drivers/mock-db-factory');

  const s = new ResolutionTestState();
  const result = createMockDb(s);
  return {
    state: s,
    mockDb: result.db,
  };
});

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

import { executeBundle } from '../../server/services/resolution/bundle-executor';
import {
  runAllInvariants,
  receiptAccountsForAllItems,
  allExecutedStepsHaveLineage,
  allPreparedStepsExplained,
  contradictionStateMatchesReality,
  noDuplicateSupersessions,
} from './drivers/resolution-invariants';
import type { BundleExecutionReceipt } from '../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// GOLDEN SCENARIO 1: Assumption Change → Reapproval Cascade
//
// Trigger: A foundational assumption changes (sample size basis)
// Expected: Assumption superseded, approved artifacts flagged for reapproval,
//           draft artifacts harmonized, governance enforced
// ═══════════════════════════════════════════════════════════════════════════════

describe('GOLDEN SCENARIO 1: Assumption Change → Reapproval Cascade', () => {
  let receipt: BundleExecutionReceipt;

  beforeEach(async () => {
    state.reset();

    // ── System state: assumption about sample size basis ──
    state.assumptions.push({
      id: 'assumption-sample-size-basis',
      organizationId: 1,
      title: 'Sample size powered for PFS with HR=0.70',
    });

    // Approved artifact that depends on the assumption
    state.artifacts.push(
      {
        id: 'art-sample-calc',
        organizationId: 1,
        title: 'Sample Size Calculation (Approved)',
        status: 'approved',
        versions: [{
          artifactId: 'art-sample-calc',
          version: 1,
          content: '## Sample Size\nPowered for PFS, HR=0.70, 80% power, alpha=0.025 one-sided',
          contentHash: 'hash1',
          changeDescription: 'Initial approved version',
          createdById: 1,
          createdAt: new Date('2026-03-15'),
        }],
      },
      {
        id: 'art-protocol-power',
        organizationId: 1,
        title: 'Protocol Section 6.1 — Power Analysis',
        status: 'draft',
        versions: [],
      }
    );

    state.documents.push({
      id: 'doc-ib-efficacy',
      organizationId: 1,
      title: "Investigator's Brochure — Efficacy Section",
      status: 'draft',
    });

    // ── Resolution plan: assumption changed ──
    state.plans.push({
      id: 'plan-assumption-001',
      organizationId: 1,
      projectId: 42,
      state: 'in_resolution',
      triggerType: 'assumption_change',
      triggerId: 'assumption-sample-size-basis',
      triggerDescription: 'Sample size basis changed from PFS HR=0.70 to OS HR=0.75 per DSMB recommendation',
      recommendedPath: 'mixed',
      confidence: 'moderate',
      requiresReview: true,
      requiresReapproval: true,
      requiresEscalation: false,
      affectedObjects: [
        { objectType: 'assumption', objectId: 'assumption-sample-size-basis', impactState: 'direct' },
        { objectType: 'artifact', objectId: 'art-sample-calc', impactState: 'direct' },
        { objectType: 'artifact', objectId: 'art-protocol-power', impactState: 'indirect' },
        { objectType: 'document', objectId: 'doc-ib-efficacy', impactState: 'indirect' },
      ],
      alternativePaths: ['supersede'],
      rationale: 'DSMB recommended switching primary endpoint from PFS to OS. All sample size calculations must be updated.',
      createdById: 1,
      bundleId: 'bundle-assumption-001',
      createdAt: new Date('2026-03-23T10:00:00Z'),
      updatedAt: new Date('2026-03-23T10:00:00Z'),
    });

    // ── Resolution bundle ──
    state.bundles.push({
      id: 'bundle-assumption-001',
      organizationId: 1,
      projectId: 42,
      planId: 'plan-assumption-001',
      title: 'Resolution: Sample Size Basis Change',
      description: 'Cascade from assumption change — supersede old assumption, reapprove affected artifacts',
      state: 'proposed',
      confidence: 'moderate',
      requiresReview: true,
      requiresReapproval: true,
      createdById: 1,
      resolutionMemo: null,
      createdAt: new Date('2026-03-23T10:05:00Z'),
      updatedAt: new Date('2026-03-23T10:05:00Z'),
    });

    // ── Bundle items ──
    state.bundleItems.push(
      {
        id: 'item-supersede-assumption',
        bundleId: 'bundle-assumption-001',
        objectType: 'assumption',
        objectId: 'assumption-sample-size-basis',
        objectTitle: 'Sample Size Basis Assumption',
        actionType: 'supersede',
        actionDescription: 'Supersede PFS-based sample size assumption with OS-based rationale',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'Root cause — assumption no longer valid after DSMB recommendation',
        sortOrder: 0,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T10:05:00Z'),
      },
      {
        id: 'item-reapprove-sample-calc',
        bundleId: 'bundle-assumption-001',
        objectType: 'artifact',
        objectId: 'art-sample-calc',
        objectTitle: 'Sample Size Calculation (Approved)',
        actionType: 'reapprove',
        actionDescription: 'Reapproval required — sample size was powered for PFS, must be recalculated for OS',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'Approved artifact directly impacted by assumption change',
        sortOrder: 1,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T10:05:00Z'),
      },
      {
        id: 'item-harmonize-protocol',
        bundleId: 'bundle-assumption-001',
        objectType: 'artifact',
        objectId: 'art-protocol-power',
        objectTitle: 'Protocol Section 6.1 — Power Analysis',
        actionType: 'harmonize',
        actionDescription: 'Harmonize power analysis section with updated sample size basis',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: 'm5.3.5.1',
        impactRationale: 'References outdated PFS-based power calculation',
        sortOrder: 2,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T10:05:00Z'),
      },
      {
        id: 'item-review-ib',
        bundleId: 'bundle-assumption-001',
        objectType: 'document',
        objectId: 'doc-ib-efficacy',
        objectTitle: "Investigator's Brochure — Efficacy Section",
        actionType: 'review',
        actionDescription: 'Review IB efficacy section for stale PFS references',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'May contain outdated efficacy claims based on PFS endpoint',
        sortOrder: 3,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T10:05:00Z'),
      }
    );

    receipt = await executeBundle(1, 1, 'bundle-assumption-001');
  });

  // ── Core behavior assertions ──

  it('supersedes the changed assumption', () => {
    const step = receipt.executedSteps.find(s => s.targetId === 'assumption-sample-size-basis');
    expect(step).toBeDefined();
    expect(step!.stepType).toBe('supersede');
    expect(step!.newState).toBe('superseded');
    expect(receipt.supersededObjects).toContain('assumption:assumption-sample-size-basis');
  });

  it('flags approved artifact for reapproval (not auto-executed)', () => {
    const step = receipt.preparedSteps.find(s => s.targetId === 'art-sample-calc');
    expect(step).toBeDefined();
    expect(step!.stepType).toBe('reapprove');
    expect(step!.result).toBe('prepared');
    // System correctly identifies reapproval is needed (either via state detection or precautionary)
    expect(step!.preparedAction).toContain('reapproval');
    expect(receipt.requiresReapproval).toContain('artifact:art-sample-calc');
  });

  it('harmonizes indirectly impacted draft artifact', () => {
    const step = receipt.executedSteps.find(s => s.targetId === 'art-protocol-power');
    expect(step).toBeDefined();
    expect(step!.stepType).toBe('harmonize');
    expect(step!.newState).toBe('flagged_for_harmonization');
    expect(receipt.updatedArtifacts).toContain('artifact:art-protocol-power');
  });

  it('prepares review for indirectly impacted document', () => {
    const step = receipt.preparedSteps.find(s => s.targetId === 'doc-ib-efficacy');
    expect(step).toBeDefined();
    expect(step!.result).toBe('prepared');
    expect(receipt.requiresReview).toContain('document:doc-ib-efficacy');
  });

  it('contradiction state is in_resolution (prepared steps remain)', () => {
    expect(receipt.contradictionState).toBe('in_resolution');
  });

  it('receipt accounts for all 4 items', () => {
    expect(receipt.summary.totalItems).toBe(4);
    const result = receiptAccountsForAllItems(receipt);
    expect(result.valid).toBe(true);
  });

  it('passes ALL invariant checks', () => {
    const { allValid, report } = runAllInvariants(state, receipt);
    if (!allValid) {
      console.log('Invariant failures:', report.filter(r => r.startsWith('FAIL')));
    }
    expect(allValid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOLDEN SCENARIO 2: Low-Confidence Contradiction → No Auto-Execution
//
// Trigger: Contradiction detected but confidence is low/uncertain
// Expected: ZERO auto-executed steps. ALL items prepared only.
//           System refuses to act when it shouldn't.
// ═══════════════════════════════════════════════════════════════════════════════

describe('GOLDEN SCENARIO 2: Low-Confidence Contradiction → No Auto-Execution', () => {
  let receipt: BundleExecutionReceipt;

  beforeEach(async () => {
    state.reset();

    state.artifacts.push(
      {
        id: 'art-csr-safety',
        organizationId: 1,
        title: 'CSR Safety Section — Adverse Events Summary',
        status: 'draft',
        versions: [],
      },
      {
        id: 'art-dsur-table',
        organizationId: 1,
        title: 'DSUR Table 2.1 — SAE Listing',
        status: 'approved',
        versions: [],
      }
    );

    state.plans.push({
      id: 'plan-low-conf-001',
      organizationId: 1,
      projectId: 42,
      state: 'in_resolution',
      triggerType: 'contradiction',
      triggerId: 'contradiction-safety-drift-001',
      triggerDescription: 'Potential AE frequency mismatch between CSR safety section and DSUR SAE listing',
      recommendedPath: 'review_only',
      confidence: 'uncertain',
      requiresReview: true,
      requiresReapproval: true,
      requiresEscalation: true,
      affectedObjects: [
        { objectType: 'artifact', objectId: 'art-csr-safety', impactState: 'direct' },
        { objectType: 'artifact', objectId: 'art-dsur-table', impactState: 'direct' },
      ],
      alternativePaths: ['escalate'],
      rationale: 'AE frequencies may differ due to different cutoff dates. Uncertain whether this is a true contradiction.',
      createdById: 1,
      bundleId: 'bundle-low-conf-001',
      createdAt: new Date('2026-03-23T11:00:00Z'),
      updatedAt: new Date('2026-03-23T11:00:00Z'),
    });

    state.bundles.push({
      id: 'bundle-low-conf-001',
      organizationId: 1,
      projectId: 42,
      planId: 'plan-low-conf-001',
      title: 'Resolution: Safety Data Frequency Mismatch',
      description: 'Investigate potential AE frequency contradiction between CSR and DSUR',
      state: 'proposed',
      confidence: 'uncertain',
      requiresReview: true,
      requiresReapproval: true,
      createdById: 1,
      resolutionMemo: null,
      createdAt: new Date('2026-03-23T11:05:00Z'),
      updatedAt: new Date('2026-03-23T11:05:00Z'),
    });

    state.bundleItems.push(
      {
        id: 'item-rewrite-csr-uncertain',
        bundleId: 'bundle-low-conf-001',
        objectType: 'artifact',
        objectId: 'art-csr-safety',
        objectTitle: 'CSR Safety Section — Adverse Events Summary',
        actionType: 'rewrite',
        actionDescription: 'Rewrite CSR safety section with corrected AE frequencies',
        status: 'pending',
        preparedContent: '## Safety — Updated AE frequencies based on final data cut',
        preparedContentConfidence: 'uncertain',
        sectionCode: 'm5.3.5.3',
        impactRationale: 'AE frequency table may contain stale data',
        sortOrder: 0,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T11:05:00Z'),
      },
      {
        id: 'item-reapprove-dsur-uncertain',
        bundleId: 'bundle-low-conf-001',
        objectType: 'artifact',
        objectId: 'art-dsur-table',
        objectTitle: 'DSUR Table 2.1 — SAE Listing',
        actionType: 'reapprove',
        actionDescription: 'Reapproval if SAE listing needs correction after investigation',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'DSUR was previously approved — may need update',
        sortOrder: 1,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T11:05:00Z'),
      },
      {
        id: 'item-escalate-safety',
        bundleId: 'bundle-low-conf-001',
        objectType: 'artifact',
        objectId: 'art-csr-safety',
        objectTitle: 'CSR Safety Section',
        actionType: 'escalate',
        actionDescription: 'Escalate safety data discrepancy to medical safety officer',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'Safety data discrepancy requires senior medical review',
        sortOrder: 2,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T11:05:00Z'),
      }
    );

    receipt = await executeBundle(1, 1, 'bundle-low-conf-001');
  });

  // ── Core behavior: system REFUSES to act ──

  it('executes ZERO steps — system refuses when uncertain', () => {
    expect(receipt.executedSteps.length).toBe(0);
  });

  it('prepares ALL items for human review', () => {
    expect(receipt.preparedSteps.length).toBe(3);
  });

  it('has ZERO blocked steps (items are valid, just not auto-executable)', () => {
    expect(receipt.blockedSteps.length).toBe(0);
  });

  it('uncertain rewrite is prepared, not executed', () => {
    const step = receipt.preparedSteps.find(s => s.targetId === 'art-csr-safety' && s.stepType === 'rewrite');
    expect(step).toBeDefined();
    expect(step!.confidence).toBe('uncertain');
    expect(step!.preparedAction).toContain('uncertain');
  });

  it('approved artifact reapproval is prepared', () => {
    const step = receipt.preparedSteps.find(s => s.targetId === 'art-dsur-table');
    expect(step).toBeDefined();
    expect(step!.stepType).toBe('reapprove');
    // System correctly identifies reapproval is needed (either via state detection or precautionary)
    expect(step!.preparedAction).toContain('reapproval');
  });

  it('escalation is always prepared, never auto-executed', () => {
    const step = receipt.preparedSteps.find(s => s.stepType === 'escalate');
    expect(step).toBeDefined();
    expect(step!.confidence).toBe('uncertain');
  });

  it('contradiction state is in_resolution (nothing was auto-resolved)', () => {
    // With 0 executed, 3 prepared, 0 blocked → in_resolution
    expect(receipt.contradictionState).toBe('in_resolution');
  });

  it('receipt accounts for all 3 items', () => {
    expect(receipt.summary.totalItems).toBe(3);
    expect(receipt.summary.executed).toBe(0);
    expect(receipt.summary.prepared).toBe(3);
    expect(receipt.summary.blocked).toBe(0);
  });

  it('passes ALL invariant checks', () => {
    const { allValid, report } = runAllInvariants(state, receipt);
    if (!allValid) {
      console.log('Invariant failures:', report.filter(r => r.startsWith('FAIL')));
    }
    expect(allValid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOLDEN SCENARIO 3: Endpoint Drift → Full Resolution
//
// Trigger: Primary endpoint defined differently in Protocol vs SAP
// Expected: Assumption superseded, artifacts rewritten/harmonized,
//           review prepared, full receipt with traceability
// ═══════════════════════════════════════════════════════════════════════════════

describe('GOLDEN SCENARIO 3: Endpoint Drift → Full Resolution', () => {
  let receipt: BundleExecutionReceipt;

  beforeEach(async () => {
    state.reset();

    state.artifacts.push(
      {
        id: 'art-protocol-ep',
        organizationId: 1,
        title: 'Protocol Section 3.1 — Primary Endpoint',
        status: 'draft',
        versions: [{
          artifactId: 'art-protocol-ep',
          version: 1,
          content: '## 3.1 Primary Endpoint\nProgression-Free Survival (PFS)',
          contentHash: 'p1',
          changeDescription: 'Initial draft',
          createdById: 1,
          createdAt: new Date('2026-03-10'),
        }],
      },
      {
        id: 'art-sap-primary',
        organizationId: 1,
        title: 'SAP Section 2.4 — Primary Analysis',
        status: 'draft',
        versions: [{
          artifactId: 'art-sap-primary',
          version: 1,
          content: '## 2.4 Primary Analysis\nPrimary endpoint: Overall Survival (OS)',
          contentHash: 's1',
          changeDescription: 'Initial draft',
          createdById: 1,
          createdAt: new Date('2026-03-12'),
        }],
      }
    );

    state.assumptions.push({
      id: 'assumption-ep-selection',
      organizationId: 1,
      title: 'Primary Endpoint Selection — PFS from Phase II',
    });

    state.documents.push({
      id: 'doc-regulatory-brief',
      organizationId: 1,
      title: 'FDA Pre-IND Regulatory Brief',
      status: 'draft',
    });

    state.plans.push({
      id: 'plan-ep-drift-001',
      organizationId: 1,
      projectId: 42,
      state: 'in_resolution',
      triggerType: 'contradiction',
      triggerId: 'contradiction-ep-drift-001',
      triggerDescription: 'Protocol defines PFS as primary endpoint but SAP defines OS',
      recommendedPath: 'mixed',
      confidence: 'moderate',
      requiresReview: true,
      requiresReapproval: false,
      requiresEscalation: false,
      affectedObjects: [
        { objectType: 'artifact', objectId: 'art-protocol-ep', impactState: 'direct' },
        { objectType: 'artifact', objectId: 'art-sap-primary', impactState: 'direct' },
        { objectType: 'assumption', objectId: 'assumption-ep-selection', impactState: 'direct' },
        { objectType: 'document', objectId: 'doc-regulatory-brief', impactState: 'indirect' },
      ],
      alternativePaths: ['supersede', 'escalate'],
      rationale: 'Critical: Protocol and SAP disagree on the primary endpoint. Must resolve before submission.',
      createdById: 1,
      bundleId: 'bundle-ep-drift-001',
      createdAt: new Date('2026-03-23T12:00:00Z'),
      updatedAt: new Date('2026-03-23T12:00:00Z'),
    });

    state.bundles.push({
      id: 'bundle-ep-drift-001',
      organizationId: 1,
      projectId: 42,
      planId: 'plan-ep-drift-001',
      title: 'Resolution: Primary Endpoint Drift (Protocol vs SAP)',
      description: 'Resolve endpoint contradiction — align Protocol, SAP, and supporting assumptions',
      state: 'proposed',
      confidence: 'moderate',
      requiresReview: true,
      requiresReapproval: false,
      createdById: 1,
      resolutionMemo: null,
      createdAt: new Date('2026-03-23T12:05:00Z'),
      updatedAt: new Date('2026-03-23T12:05:00Z'),
    });

    state.bundleItems.push(
      {
        id: 'item-supersede-ep-assumption',
        bundleId: 'bundle-ep-drift-001',
        objectType: 'assumption',
        objectId: 'assumption-ep-selection',
        objectTitle: 'Primary Endpoint Selection — PFS from Phase II',
        actionType: 'supersede',
        actionDescription: 'Supersede PFS assumption with OS per FDA guidance + DSMB recommendation',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'Root cause of endpoint contradiction',
        sortOrder: 0,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T12:05:00Z'),
      },
      {
        id: 'item-rewrite-sap',
        bundleId: 'bundle-ep-drift-001',
        objectType: 'artifact',
        objectId: 'art-sap-primary',
        objectTitle: 'SAP Section 2.4 — Primary Analysis',
        actionType: 'rewrite',
        actionDescription: 'Rewrite SAP to formalize OS as primary endpoint with updated estimand',
        status: 'pending',
        preparedContent: '## 2.4 Primary Analysis\n\nPrimary endpoint: Overall Survival (OS), time from randomization to death.\n\n### Estimand\nTreatment policy strategy, ITT population.',
        preparedContentConfidence: 'strong',
        sectionCode: 'm5.3.5.2',
        impactRationale: 'SAP must be authoritative source for endpoint definition',
        sortOrder: 1,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T12:05:00Z'),
      },
      {
        id: 'item-harmonize-protocol',
        bundleId: 'bundle-ep-drift-001',
        objectType: 'artifact',
        objectId: 'art-protocol-ep',
        objectTitle: 'Protocol Section 3.1 — Primary Endpoint',
        actionType: 'harmonize',
        actionDescription: 'Harmonize protocol endpoint section to align with corrected OS definition',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: 'm5.3.5.1',
        impactRationale: 'Protocol still references PFS — must align with OS',
        sortOrder: 2,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T12:05:00Z'),
      },
      {
        id: 'item-review-reg-brief',
        bundleId: 'bundle-ep-drift-001',
        objectType: 'document',
        objectId: 'doc-regulatory-brief',
        objectTitle: 'FDA Pre-IND Regulatory Brief',
        actionType: 'review',
        actionDescription: 'Review regulatory brief for stale PFS endpoint references',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'Brief may reference outdated PFS endpoint in regulatory strategy',
        sortOrder: 3,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T12:05:00Z'),
      }
    );

    receipt = await executeBundle(1, 1, 'bundle-ep-drift-001');
  });

  // ── Execution outcomes ──

  it('supersedes the root-cause assumption', () => {
    const step = receipt.executedSteps.find(s => s.targetId === 'assumption-ep-selection');
    expect(step).toBeDefined();
    expect(step!.stepType).toBe('supersede');
    expect(step!.newState).toBe('superseded');
    expect(step!.priorState).toBe('active');
    expect(receipt.supersededObjects).toContain('assumption:assumption-ep-selection');
  });

  it('executes SAP rewrite with strong confidence', () => {
    const step = receipt.executedSteps.find(s => s.targetId === 'art-sap-primary');
    expect(step).toBeDefined();
    expect(step!.stepType).toBe('rewrite');
    expect(step!.newState).toBe('rewrite_staged');
    expect(receipt.updatedArtifacts).toContain('artifact:art-sap-primary');
  });

  it('flags protocol for harmonization', () => {
    const step = receipt.executedSteps.find(s => s.targetId === 'art-protocol-ep');
    expect(step).toBeDefined();
    expect(step!.stepType).toBe('harmonize');
    expect(step!.newState).toBe('flagged_for_harmonization');
    expect(receipt.updatedArtifacts).toContain('artifact:art-protocol-ep');
  });

  it('prepares regulatory brief review (not auto-executed)', () => {
    const step = receipt.preparedSteps.find(s => s.targetId === 'doc-regulatory-brief');
    expect(step).toBeDefined();
    expect(step!.result).toBe('prepared');
    expect(receipt.requiresReview).toContain('document:doc-regulatory-brief');
  });

  // ── Behavioral spectrum validation ──

  it('has mixed execution: some executed, some prepared, zero blocked', () => {
    expect(receipt.summary.executed).toBe(3); // supersede + rewrite + harmonize
    expect(receipt.summary.prepared).toBe(1); // review
    expect(receipt.summary.blocked).toBe(0);
  });

  it('contradiction state is in_resolution (review step still pending)', () => {
    expect(receipt.contradictionState).toBe('in_resolution');
  });

  // ── Traceability ──

  it('every executed step has full lineage (bundleId, planId, timestamps)', () => {
    const result = allExecutedStepsHaveLineage(receipt);
    if (!result.valid) console.log('Lineage violations:', result.violations);
    expect(result.valid).toBe(true);

    for (const step of receipt.executedSteps) {
      expect(step.bundleId).toBe('bundle-ep-drift-001');
      expect(step.resolutionPlanId).toBe('plan-ep-drift-001');
      expect(step.timestamp).toBeTruthy();
    }
  });

  it('every prepared step explains why it was not auto-executed', () => {
    const result = allPreparedStepsExplained(receipt);
    if (!result.valid) console.log('Explanation violations:', result.violations);
    expect(result.valid).toBe(true);
  });

  it('contradiction state matches execution reality', () => {
    const result = contradictionStateMatchesReality(receipt);
    expect(result.valid).toBe(true);
  });

  // ── Full invariant suite ──

  it('passes ALL invariant checks', () => {
    const { allValid, report } = runAllInvariants(state, receipt);
    if (!allValid) {
      console.log('Invariant failures:', report.filter(r => r.startsWith('FAIL')));
    }
    expect(allValid).toBe(true);
  });

  it('no duplicate supersessions', () => {
    const result = noDuplicateSupersessions(state);
    expect(result.valid).toBe(true);
  });

  it('receipt is JSON-serializable and round-trips cleanly', () => {
    const json = JSON.stringify(receipt);
    const parsed = JSON.parse(json);
    expect(parsed.bundleId).toBe(receipt.bundleId);
    expect(parsed.summary.totalItems).toBe(receipt.summary.totalItems);
    expect(parsed.executedSteps.length).toBe(receipt.executedSteps.length);
    expect(parsed.preparedSteps.length).toBe(receipt.preparedSteps.length);
  });
});
