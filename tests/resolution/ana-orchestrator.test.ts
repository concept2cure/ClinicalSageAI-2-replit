/**
 * AnA Resolution Orchestrator Tests — Sprint 5
 *
 * Tests the orchestrator's decision classification logic and the full
 * orchestration flow using the intent-driven mock system.
 *
 * Three decision scenarios:
 * 1. Execute: moderate/strong confidence, no escalation → full execution with receipt
 * 2. Prepare: provisional confidence or escalation → plan + bundle, no execution
 * 3. Block: uncertain confidence or no affected objects → plan only
 *
 * Run: npx vitest run tests/resolution/ana-orchestrator.test.ts
 *
 * @module tests/resolution/ana-orchestrator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION CLASSIFICATION — PURE UNIT TESTS (no DB needed)
// ═══════════════════════════════════════════════════════════════════════════════

// We test the classifyDecision logic by importing the orchestrator's
// decision rules through the orchestrateResolution function behavior.
// Since classifyDecision is internal, we validate it through observable outcomes.

// ═══════════════════════════════════════════════════════════════════════════════
// FULL ORCHESTRATION — INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

const { state, mockDb } = await vi.hoisted(async () => {
  const { ResolutionTestState } = await import('./drivers/resolution-test-state');
  const { createMockDb } = await import('./drivers/mock-db-factory');

  const s = new ResolutionTestState();
  const result = createMockDb(s);
  return { state: s, mockDb: result.db };
});

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

import { orchestrateResolution } from '../../server/services/resolution/ana-resolution-orchestrator';
import type { OrchestratorResult } from '../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER — Seed full state for orchestrator integration test
// ═══════════════════════════════════════════════════════════════════════════════

function seedFullState(opts: {
  planId: string;
  bundleId: string;
  confidence: string;
  requiresEscalation?: boolean;
  affectedObjects: any[];
  bundleItems: Array<{
    id: string;
    objectType: string;
    objectId: string;
    objectTitle: string;
    actionType: string;
    actionDescription: string;
    status?: string;
    preparedContent?: string | null;
    preparedContentConfidence?: string | null;
  }>;
}) {
  // Plan (already "created" — orchestrator reads this after its insert returns)
  state.plans.push({
    id: opts.planId,
    organizationId: 1,
    projectId: 42,
    state: 'unresolved',
    triggerType: 'contradiction',
    triggerId: 'trigger-001',
    triggerDescription: 'Test trigger',
    recommendedPath: 'mixed',
    confidence: opts.confidence,
    requiresReview: true,
    requiresReapproval: true,
    requiresEscalation: opts.requiresEscalation ?? false,
    affectedObjects: opts.affectedObjects,
    alternativePaths: [],
    rationale: 'Test',
    createdById: 1,
    bundleId: opts.bundleId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Bundle
  state.bundles.push({
    id: opts.bundleId,
    organizationId: 1,
    projectId: 42,
    planId: opts.planId,
    title: 'Resolution: Test',
    description: 'Test',
    state: 'proposed',
    confidence: opts.confidence,
    requiresReview: true,
    requiresReapproval: true,
    createdById: 1,
    resolutionMemo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Bundle items
  for (let i = 0; i < opts.bundleItems.length; i++) {
    const item = opts.bundleItems[i];
    state.bundleItems.push({
      id: item.id,
      bundleId: opts.bundleId,
      objectType: item.objectType,
      objectId: item.objectId,
      objectTitle: item.objectTitle,
      actionType: item.actionType,
      actionDescription: item.actionDescription,
      status: item.status ?? 'pending',
      preparedContent: item.preparedContent ?? null,
      preparedContentConfidence: item.preparedContentConfidence ?? null,
      sectionCode: null,
      impactRationale: null,
      sortOrder: i,
      completedAt: null,
      completedById: null,
      createdAt: new Date(),
    });
  }

  // Seed objects referenced by affected objects
  for (const obj of opts.affectedObjects) {
    if (obj.objectType === 'artifact') {
      state.artifacts.push({
        id: obj.objectId,
        organizationId: 1,
        title: obj.objectTitle || obj.objectId,
        status: 'draft',
        versions: [],
      });
    }
    if (obj.objectType === 'document') {
      state.documents.push({
        id: obj.objectId,
        organizationId: 1,
        title: obj.objectTitle || obj.objectId,
        status: 'draft',
      });
    }
    if (obj.objectType === 'assumption') {
      state.assumptions.push({
        id: obj.objectId,
        organizationId: 1,
        title: obj.objectTitle || obj.objectId,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: Auto-Execution — Moderate Confidence, No Escalation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Orchestrator Scenario 1: Auto-Execution (moderate confidence)', () => {
  let result: OrchestratorResult;

  beforeEach(async () => {
    state.reset();

    const affectedObjects = [
      { objectType: 'artifact', objectId: 'art-protocol', objectTitle: 'Protocol 3.1', impactState: 'direct' },
      { objectType: 'artifact', objectId: 'art-sap', objectTitle: 'SAP 2.4', impactState: 'direct' },
      { objectType: 'document', objectId: 'doc-summary', objectTitle: 'Executive Summary', impactState: 'indirect' },
    ];

    seedFullState({
      planId: 'plan-exec-001',
      bundleId: 'bundle-exec-001',
      confidence: 'moderate',
      affectedObjects,
      bundleItems: [
        { id: 'bi-1', objectType: 'artifact', objectId: 'art-protocol', objectTitle: 'Protocol 3.1', actionType: 'harmonize', actionDescription: 'Harmonize protocol' },
        { id: 'bi-2', objectType: 'artifact', objectId: 'art-sap', objectTitle: 'SAP 2.4', actionType: 'rewrite', actionDescription: 'Rewrite SAP', preparedContent: '## Updated SAP', preparedContentConfidence: 'moderate' },
        { id: 'bi-3', objectType: 'document', objectId: 'doc-summary', objectTitle: 'Executive Summary', actionType: 'review', actionDescription: 'Review summary' },
      ],
    });

    result = await orchestrateResolution(1, 1, {
      projectId: 42,
      triggerType: 'contradiction',
      triggerId: 'trigger-001',
      triggerDescription: 'Endpoint drift between Protocol and SAP',
      affectedObjects,
      forceConfidence: 'moderate',
    });
  });

  it('decides to execute', () => {
    expect(result.decision).toBe('execute');
  });

  it('provides decision rationale mentioning confidence', () => {
    expect(result.decisionRationale).toContain('moderate');
  });

  it('creates a resolution plan', () => {
    expect(result.plan).toBeDefined();
    expect(result.plan.triggerType).toBeTruthy();
  });

  it('creates a bundle', () => {
    expect(result.bundle).toBeDefined();
  });

  it('returns an execution receipt', () => {
    expect(result.receipt).toBeDefined();
    expect(result.receipt!.bundleId).toBeTruthy();
    expect(result.receipt!.summary.totalItems).toBeGreaterThan(0);
    // All items accounted for
    const { executed, prepared, blocked } = result.receipt!.summary;
    expect(executed + prepared + blocked).toBe(result.receipt!.summary.totalItems);
  });

  it('returns a structured explanation', () => {
    expect(result.explanation).toBeDefined();
    expect(result.explanation.summary).toBeTruthy();
    expect(result.explanation.triggerExplanation).toBeTruthy();
    expect(result.explanation.nextSteps.length).toBeGreaterThan(0);
  });

  it('includes timestamp', () => {
    expect(result.timestamp).toBeTruthy();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Prepare-Only — Provisional Confidence
// ═══════════════════════════════════════════════════════════════════════════════

describe('Orchestrator Scenario 2: Prepare-Only (provisional confidence)', () => {
  let result: OrchestratorResult;

  beforeEach(async () => {
    state.reset();

    const affectedObjects = [
      { objectType: 'artifact', objectId: 'art-safety', objectTitle: 'CSR Safety Section', impactState: 'direct' },
      { objectType: 'artifact', objectId: 'art-dsur', objectTitle: 'DSUR Table', impactState: 'direct' },
    ];

    seedFullState({
      planId: 'plan-prep-001',
      bundleId: 'bundle-prep-001',
      confidence: 'provisional',
      affectedObjects,
      bundleItems: [
        { id: 'bi-safety', objectType: 'artifact', objectId: 'art-safety', objectTitle: 'CSR Safety', actionType: 'rewrite', actionDescription: 'Rewrite safety' },
        { id: 'bi-dsur', objectType: 'artifact', objectId: 'art-dsur', objectTitle: 'DSUR', actionType: 'review', actionDescription: 'Review DSUR' },
      ],
    });

    result = await orchestrateResolution(1, 1, {
      projectId: 42,
      triggerType: 'contradiction',
      triggerId: 'trigger-002',
      triggerDescription: 'Safety data frequency mismatch',
      affectedObjects,
      forceConfidence: 'provisional',
    });
  });

  it('decides to prepare (not execute)', () => {
    expect(result.decision).toBe('prepare');
  });

  it('provides rationale about provisional confidence', () => {
    expect(result.decisionRationale).toContain('provisional');
  });

  it('creates a plan', () => {
    expect(result.plan).toBeDefined();
    expect(result.plan.confidence).toBe('provisional');
  });

  it('creates a bundle (prepared, not executed)', () => {
    expect(result.bundle).toBeDefined();
  });

  it('does NOT return an execution receipt', () => {
    expect(result.receipt).toBeUndefined();
  });

  it('returns a structured explanation', () => {
    expect(result.explanation).toBeDefined();
    expect(result.explanation.summary).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Blocked — Uncertain Confidence
// ═══════════════════════════════════════════════════════════════════════════════

describe('Orchestrator Scenario 3: Blocked (uncertain confidence)', () => {
  let result: OrchestratorResult;

  beforeEach(async () => {
    state.reset();

    const affectedObjects = [
      { objectType: 'artifact', objectId: 'art-unclear', objectTitle: 'Unclear Artifact', impactState: 'potential' },
    ];

    seedFullState({
      planId: 'plan-block-001',
      bundleId: 'bundle-block-001',
      confidence: 'uncertain',
      affectedObjects,
      bundleItems: [], // Won't be used — blocked before bundle creation
    });

    result = await orchestrateResolution(1, 1, {
      projectId: 42,
      triggerType: 'impact_propagation',
      triggerId: 'trigger-003',
      triggerDescription: 'Unclear downstream impact',
      affectedObjects,
      forceConfidence: 'uncertain',
    });
  });

  it('decides to block', () => {
    expect(result.decision).toBe('block');
  });

  it('provides rationale about uncertainty', () => {
    expect(result.decisionRationale).toContain('uncertain');
  });

  it('creates a plan (for visibility)', () => {
    expect(result.plan).toBeDefined();
    expect(result.plan.confidence).toBe('uncertain');
  });

  it('does NOT create a bundle', () => {
    expect(result.bundle).toBeUndefined();
  });

  it('does NOT return an execution receipt', () => {
    expect(result.receipt).toBeUndefined();
  });

  it('returns explanation so user understands the situation', () => {
    expect(result.explanation).toBeDefined();
    expect(result.explanation.confidenceExplanation).toContain('uncertain');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION MATRIX — Systematic Coverage
// ═══════════════════════════════════════════════════════════════════════════════

describe('Orchestrator Decision Matrix', () => {
  beforeEach(() => state.reset());

  it('strong confidence + no escalation → execute', async () => {
    const aff = [{ objectType: 'artifact', objectId: 'a1', impactState: 'direct' }];
    seedFullState({
      planId: 'plan-strong', bundleId: 'bundle-strong',
      confidence: 'strong', affectedObjects: aff,
      bundleItems: [{ id: 'bi-s', objectType: 'artifact', objectId: 'a1', objectTitle: 'A1', actionType: 'harmonize', actionDescription: 'Test' }],
    });
    const r = await orchestrateResolution(1, 1, {
      projectId: 42, triggerType: 'contradiction', triggerId: 'c1',
      triggerDescription: 'Test', affectedObjects: aff, forceConfidence: 'strong',
    });
    expect(r.decision).toBe('execute');
    expect(r.receipt).toBeDefined();
  });

  it('provisional confidence → prepare (not execute)', async () => {
    const aff = [{ objectType: 'artifact', objectId: 'a2', impactState: 'direct' }];
    seedFullState({
      planId: 'plan-prov', bundleId: 'bundle-prov',
      confidence: 'provisional', affectedObjects: aff,
      bundleItems: [{ id: 'bi-e', objectType: 'artifact', objectId: 'a2', objectTitle: 'A2', actionType: 'review', actionDescription: 'Test' }],
    });
    const r = await orchestrateResolution(1, 1, {
      projectId: 42, triggerType: 'assumption_change', triggerId: 'c2',
      triggerDescription: 'Test', affectedObjects: aff, forceConfidence: 'provisional',
    });
    expect(r.decision).toBe('prepare');
    expect(r.bundle).toBeDefined();
    expect(r.receipt).toBeUndefined();
  });

  it('uncertain confidence → block (never act on uncertain)', async () => {
    const aff = [{ objectType: 'artifact', objectId: 'a3', impactState: 'potential' }];
    seedFullState({
      planId: 'plan-unc', bundleId: 'bundle-unc',
      confidence: 'uncertain', affectedObjects: aff,
      bundleItems: [],
    });
    const r = await orchestrateResolution(1, 1, {
      projectId: 42, triggerType: 'stale_dependency', triggerId: 'c3',
      triggerDescription: 'Test', affectedObjects: aff, forceConfidence: 'uncertain',
    });
    expect(r.decision).toBe('block');
    expect(r.bundle).toBeUndefined();
    expect(r.receipt).toBeUndefined();
  });
});
