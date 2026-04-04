/**
 * Build Order #9 — Lean Core Production Hardening Tests
 *
 * Tests for:
 *   - Governed repository canonical authority (no stale imports)
 *   - Governance controller observability
 *   - Review queue consumption
 *   - Decision history consumption
 *   - Lifecycle transition wiring
 *   - Correspondence lifecycle gate durable consequence
 *   - Observability health/diagnostic coverage
 *   - Dependency/runtime ownership guards
 *   - DOCX runtime enforcement
 *   - No regression on dead-shim removal
 */

import { describe, expect, it, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Repository canonical authority tests ─────────────────────────────────────

describe('Governed Decision Repository — canonical authority', () => {
  it('exports recordGovernedDecision', async () => {
    const repo = await import('../server/services/governed-decision-repository');
    expect(typeof repo.recordGovernedDecision).toBe('function');
  });

  it('exports transitionGovernedDecision', async () => {
    const repo = await import('../server/services/governed-decision-repository');
    expect(typeof repo.transitionGovernedDecision).toBe('function');
  });

  it('exports getProjectReviewQueue', async () => {
    const repo = await import('../server/services/governed-decision-repository');
    expect(typeof repo.getProjectReviewQueue).toBe('function');
  });

  it('exports getDecisionTimeline', async () => {
    const repo = await import('../server/services/governed-decision-repository');
    expect(typeof repo.getDecisionTimeline).toBe('function');
  });

  it('exports hasUnresolvedGovernedDecisions', async () => {
    const repo = await import('../server/services/governed-decision-repository');
    expect(typeof repo.hasUnresolvedGovernedDecisions).toBe('function');
  });

  it('does NOT export clearGovernedDecisionLog (removed dead shim)', async () => {
    const repo = await import('../server/services/governed-decision-repository');
    expect((repo as Record<string, unknown>).clearGovernedDecisionLog).toBeUndefined();
  });

  it('does NOT export clearTransitionLog (removed dead shim)', async () => {
    const repo = await import('../server/services/governed-decision-repository');
    expect((repo as Record<string, unknown>).clearTransitionLog).toBeUndefined();
  });

  it('exports isValidTransition with correct state machine', async () => {
    const { isValidTransition } = await import('../server/services/governed-decision-repository');
    expect(isValidTransition('recommended_only', 'under_review')).toBe(true);
    expect(isValidTransition('under_review', 'approved')).toBe(true);
    expect(isValidTransition('under_review', 'rejected')).toBe(true);
    expect(isValidTransition('under_review', 'escalated')).toBe(true);
    expect(isValidTransition('approved', 'executed')).toBe(true);
    expect(isValidTransition('superseded', 'under_review')).toBe(false);
    expect(isValidTransition('executed', 'approved')).toBe(false);
  });

  it('exports convenience wrappers for all lifecycle actions', async () => {
    const repo = await import('../server/services/governed-decision-repository');
    expect(typeof repo.submitForReview).toBe('function');
    expect(typeof repo.approveDecision).toBe('function');
    expect(typeof repo.rejectDecision).toBe('function');
    expect(typeof repo.escalateDecision).toBe('function');
    expect(typeof repo.deferDecision).toBe('function');
    expect(typeof repo.executeDecision).toBe('function');
    expect(typeof repo.supersedeDecision).toBe('function');
  });
});

// ── Governance Controller tests ──────────────────────────────────────────────

describe('Governance Controller — handler validation', () => {
  it('exports all 6 handler functions', async () => {
    const controller = await import('../server/controllers/governance-controller');
    expect(typeof controller.handleGetDecisions).toBe('function');
    expect(typeof controller.handleGetSummary).toBe('function');
    expect(typeof controller.handleGetArtifactTrace).toBe('function');
    expect(typeof controller.handleGetReviewQueue).toBe('function');
    expect(typeof controller.handleGetHistory).toBe('function');
    expect(typeof controller.handleTransition).toBe('function');
  });

  it('handleTransition rejects unknown actions', async () => {
    const { handleTransition } = await import('../server/controllers/governance-controller');
    const result = await handleTransition({
      decisionId: 'test-id',
      organizationId: 1,
      projectId: 1,
      actorId: 'user-1',
      action: 'invalid_action',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('handleTransition validates rejection requires reason', async () => {
    const { handleTransition } = await import('../server/controllers/governance-controller');
    const result = await handleTransition({
      decisionId: 'test-id',
      organizationId: 1,
      projectId: 1,
      actorId: 'user-1',
      action: 'reject',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('reason');
  });

  it('handleTransition validates escalation requires target', async () => {
    const { handleTransition } = await import('../server/controllers/governance-controller');
    const result = await handleTransition({
      decisionId: 'test-id',
      organizationId: 1,
      projectId: 1,
      actorId: 'user-1',
      action: 'escalate',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('escalatedTo');
  });
});

// ── Governance Observability tests ───────────────────────────────────────────

describe('Governance Observability — metrics service', () => {
  it('exports governanceMetrics singleton', async () => {
    const { governanceMetrics } = await import('../server/services/governance-observability');
    expect(governanceMetrics).toBeDefined();
    expect(typeof governanceMetrics.recordDecisionCreated).toBe('function');
    expect(typeof governanceMetrics.recordTransitionExecuted).toBe('function');
    expect(typeof governanceMetrics.recordPersistenceWrite).toBe('function');
    expect(typeof governanceMetrics.recordPersistenceFailure).toBe('function');
    expect(typeof governanceMetrics.recordQueryExecuted).toBe('function');
    expect(typeof governanceMetrics.recordQueryFailure).toBe('function');
    expect(typeof governanceMetrics.recordCorrespondenceGate).toBe('function');
    expect(typeof governanceMetrics.recordCorrespondenceGateFailure).toBe('function');
  });

  it('tracks counters correctly', async () => {
    const { governanceMetrics } = await import('../server/services/governance-observability');
    governanceMetrics.reset();

    governanceMetrics.recordDecisionCreated('allow');
    governanceMetrics.recordDecisionCreated('block');
    governanceMetrics.recordTransitionExecuted('approve');
    governanceMetrics.recordPersistenceWrite();
    governanceMetrics.recordQueryExecuted();

    const counters = governanceMetrics.getCounters();
    expect(counters.decisionsCreated).toBe(2);
    expect(counters.decisionsCreatedByOutcome['allow']).toBe(1);
    expect(counters.decisionsCreatedByOutcome['block']).toBe(1);
    expect(counters.transitionsExecuted).toBe(1);
    expect(counters.transitionsByAction['approve']).toBe(1);
    expect(counters.persistenceWrites).toBe(1);
    expect(counters.queryExecuted).toBe(1);
  });

  it('records failures with bounded ring buffer', async () => {
    const { governanceMetrics } = await import('../server/services/governance-observability');
    governanceMetrics.reset();

    governanceMetrics.recordPersistenceFailure('test_op', new Error('test error'));
    const failures = governanceMetrics.getRecentFailures();
    expect(failures.length).toBe(1);
    expect(failures[0].type).toBe('persistence');
    expect(failures[0].operation).toBe('test_op');
    expect(failures[0].error).toBe('test error');
  });

  it('getHealth returns structured health report', async () => {
    const { governanceMetrics } = await import('../server/services/governance-observability');
    const health = await governanceMetrics.getHealth();

    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('dbReachable');
    expect(health).toHaveProperty('transitionTableReachable');
    expect(health).toHaveProperty('decisionRecordTableReachable');
    expect(health).toHaveProperty('counters');
    expect(health).toHaveProperty('recentFailures');
    expect(health).toHaveProperty('failureRate');
    expect(health).toHaveProperty('uptimeSeconds');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
  });

  it('correspondence gate methods exist and track', async () => {
    const { governanceMetrics } = await import('../server/services/governance-observability');
    governanceMetrics.reset();

    governanceMetrics.recordCorrespondenceGate();
    const counters = governanceMetrics.getCounters();
    expect(counters.transitionsExecuted).toBe(1);
    expect(counters.transitionsByAction['correspondence_lifecycle_gate']).toBe(1);
  });
});

// ── Client hooks/selector tests (file-based, avoids React/TanStack dependency) ─

describe('Client fabric selectors — code structure verification', () => {
  it('useFabricState exports selectPromotionBlockersFromFabric', () => {
    const root = path.resolve(__dirname, '..');
    const content = fs.readFileSync(
      path.join(root, 'client/src/concept2cure/hooks/useFabricState.ts'),
      'utf-8'
    );
    expect(content).toContain('export function selectPromotionBlockersFromFabric');
    // Verify it filters by outcome === 'block'
    expect(content).toContain("d.outcome === 'block'");
  });

  it('useFabricState exports selectGovernanceDecisionBadge', () => {
    const root = path.resolve(__dirname, '..');
    const content = fs.readFileSync(
      path.join(root, 'client/src/concept2cure/hooks/useFabricState.ts'),
      'utf-8'
    );
    expect(content).toContain('export function selectGovernanceDecisionBadge');
    // Verify badge logic
    expect(content).toContain("tone: 'red'");
    expect(content).toContain("tone: 'green'");
    expect(content).toContain("tone: 'amber'");
  });

  it('useFabricState exports all 5 hooks', () => {
    const root = path.resolve(__dirname, '..');
    const content = fs.readFileSync(
      path.join(root, 'client/src/concept2cure/hooks/useFabricState.ts'),
      'utf-8'
    );
    expect(content).toContain('export function useFabricDecisions');
    expect(content).toContain('export function useFabricSummary');
    expect(content).toContain('export function useGovernedReviewQueue');
    expect(content).toContain('export function useGovernedDecisionHistory');
    expect(content).toContain('export function useGovernedDecisionTransition');
  });

  it('useGovernance.ts retired (legacy adapters deleted in BO18)', () => {
    const root = path.resolve(__dirname, '..');
    expect(fs.existsSync(path.join(root, 'client/src/concept2cure/hooks/useGovernance.ts'))).toBe(false);
  });
});

// ── Document consequence tests ───────────────────────────────────────────────

describe('Document consequence row builder — governance fabric state', () => {
  it('attaches governedFabric state from fabricStateMap', async () => {
    const { buildDocumentConsequenceRows } = await import(
      '../client/src/concept2cure/components/workspace/documentConsequence'
    );

    const fabricStateMap = {
      'art-1': {
        decisionId: 'dec-1',
        outcome: 'block' as const,
        readiness: 'draft',
        readinessScore: 30,
        blockerCount: 2,
      },
    };

    const rows = buildDocumentConsequenceRows({
      artifacts: [],
      computeJobs: [
        {
          artifact_id: 'art-1',
          artifact_title: 'Test Doc',
          artifact_version: 1,
          artifact_status: 'draft',
          created_at: new Date().toISOString(),
        },
      ],
      proposals: [],
      fabricStateMap,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].governedFabric).toBeDefined();
    expect(rows[0].governedFabric?.outcome).toBe('block');
    expect(rows[0].governedFabric?.blockerCount).toBe(2);
  });
});

// ── Dependency/runtime ownership guards ──────────────────────────────────────

describe('Dependency ownership — no unapproved runtime drift', () => {
  it('@xyflow/react imports are all commented out (dead dependency)', () => {
    const root = path.resolve(__dirname, '..');
    const impactGraphTab = fs.readFileSync(
      path.join(root, 'client/src/components/cmc/ImpactGraphTab.jsx'),
      'utf-8'
    );
    const processCanvas = fs.readFileSync(
      path.join(root, 'client/src/components/cmc/ProcessCanvasEditor.jsx'),
      'utf-8'
    );

    // All @xyflow/react imports should be commented out
    const activeXyflow = impactGraphTab.split('\n')
      .filter(l => l.includes('@xyflow/react') && !l.trim().startsWith('//'));
    const activeXyflow2 = processCanvas.split('\n')
      .filter(l => l.includes('@xyflow/react') && !l.trim().startsWith('//'));

    expect(activeXyflow.length).toBe(0);
    expect(activeXyflow2.length).toBe(0);
  });

  it('governed-decision-repository does not export dead test helpers', () => {
    const root = path.resolve(__dirname, '..');
    const repoContent = fs.readFileSync(
      path.join(root, 'server/services/governed-decision-repository.ts'),
      'utf-8'
    );
    expect(repoContent).not.toContain('export function clearGovernedDecisionLog');
    expect(repoContent).not.toContain('export function clearTransitionLog');
  });

  it('service-registry.ts exists but is unused by design (documented)', () => {
    const root = path.resolve(__dirname, '..');
    const exists = fs.existsSync(
      path.join(root, 'server/services/service-registry.ts')
    );
    expect(exists).toBe(true);
  });
});

// ── DOCX runtime canonicality ────────────────────────────────────────────────

describe('DOCX runtime canonicality', () => {
  it('CI guard script exists', () => {
    const root = path.resolve(__dirname, '..');
    const exists = fs.existsSync(
      path.join(root, 'scripts/ci/check-docx-runtime-canonicality.mjs')
    );
    expect(exists).toBe(true);
  });

  it('approved DOCX entry points exist', () => {
    const root = path.resolve(__dirname, '..');
    expect(fs.existsSync(path.join(root, 'server/services/docx/docxFactory.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'server/services/docxGenerator.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'shadow_service/shadow_service/docx_renderer.py'))).toBe(true);
  });
});

// ── Migration table structure ────────────────────────────────────────────────

describe('Governed decision transitions migration', () => {
  it('migration file 0011 exists and defines the table', () => {
    const root = path.resolve(__dirname, '..');
    const migrationPath = path.join(root, 'migrations/0011_governed_decision_transitions.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('governed_decision_transitions');
    expect(content).toContain('decision_id');
    expect(content).toContain('from_state');
    expect(content).toContain('to_state');
    expect(content).toContain('actor_id');
  });
});

// ── Governance health route ──────────────────────────────────────────────────

describe('Governance health route', () => {
  it('health route is registered in concept2cure.ts', () => {
    const root = path.resolve(__dirname, '..');
    const routeContent = fs.readFileSync(
      path.join(root, 'server/routes/concept2cure.ts'),
      'utf-8'
    );
    expect(routeContent).toContain("router.get('/governance/health'");
    expect(routeContent).toContain('governanceMetrics');
    expect(routeContent).toContain('getHealth');
  });
});

// ── Route uses controller (not direct repo imports) ──────────────────────────

describe('Route-controller delegation', () => {
  it('transition route uses handleTransition from controller', () => {
    const root = path.resolve(__dirname, '..');
    const content = fs.readFileSync(
      path.join(root, 'server/routes/concept2cure.ts'),
      'utf-8'
    );

    // The transition route should import from controller, not directly from repo
    const transitionRouteBlock = content.slice(
      content.indexOf("router.post('/projects/:projectId/governance/decisions/:decisionId/transition'"),
      content.indexOf("router.get('/projects/:projectId/governance/decisions/:decisionId/history'")
    );

    expect(transitionRouteBlock).toContain('handleTransition');
    expect(transitionRouteBlock).toContain('governance-controller');
    // Should NOT contain direct repo convenience wrapper imports
    expect(transitionRouteBlock).not.toContain('submitForReview');
    expect(transitionRouteBlock).not.toContain('approveDecision');
  });

  it('history route uses handleGetHistory from controller', () => {
    const root = path.resolve(__dirname, '..');
    const content = fs.readFileSync(
      path.join(root, 'server/routes/concept2cure.ts'),
      'utf-8'
    );
    expect(content).toContain('handleGetHistory');
    expect(content).toContain("governance-controller");
  });

  it('review-queue route uses handleGetReviewQueue from controller', () => {
    const root = path.resolve(__dirname, '..');
    const content = fs.readFileSync(
      path.join(root, 'server/routes/concept2cure.ts'),
      'utf-8'
    );
    expect(content).toContain('handleGetReviewQueue');
  });
});

// ── Workspace review panel exists ────────────────────────────────────────────

describe('Workspace governed review panel', () => {
  it('GovernedDecisionReviewPanel component exists', () => {
    const root = path.resolve(__dirname, '..');
    const panelPath = path.join(
      root,
      'client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx'
    );
    expect(fs.existsSync(panelPath)).toBe(true);

    const content = fs.readFileSync(panelPath, 'utf-8');
    expect(content).toContain('useGovernedReviewQueue');
    expect(content).toContain('useGovernedDecisionHistory');
    expect(content).toContain('useGovernedDecisionTransition');
    expect(content).toContain('GovernedDecisionReviewPanel');
  });

  it('is wired into ProjectWorkspaceShell', () => {
    const root = path.resolve(__dirname, '..');
    const shellContent = fs.readFileSync(
      path.join(root, 'client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx'),
      'utf-8'
    );
    expect(shellContent).toContain('GovernedDecisionReviewPanel');
    expect(shellContent).toContain('reviewQueueVisible');
    expect(shellContent).toContain('setReviewQueueVisible');
  });

  it('GovernanceStatusBar has onOpenReviewQueue callback', () => {
    const root = path.resolve(__dirname, '..');
    const content = fs.readFileSync(
      path.join(root, 'client/src/concept2cure/components/editor/GovernanceStatusBar.tsx'),
      'utf-8'
    );
    expect(content).toContain('onOpenReviewQueue');
    expect(content).toContain('Review Queue');
  });
});
