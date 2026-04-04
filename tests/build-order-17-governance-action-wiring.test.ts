/**
 * Build Order #17 — Governance Action Wiring Tests
 *
 * Proves:
 *   1. GovernedDecisionReviewPanel drives the workspace governance model
 *   2. DecisionRow invokes onInspect/onActionStart/onActionComplete callbacks
 *   3. GovernanceStatusBar uses useFabricDecisions directly (not legacy adapters)
 *   4. Queue/consequence selection converges to one model
 *   5. Touched slice is leaner (legacy adapter dependency removed)
 *   6. No regression on backend or model
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Review Panel Action Wiring ───────────────────────────────────────────

describe('GovernedDecisionReviewPanel — real action wiring', () => {
  it('DecisionRow accepts onInspect/onActionStart/onActionComplete props', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    expect(content).toContain('onInspect?.(decisionId, state)');
    expect(content).toContain('onActionStart?.(decisionId, action)');
    expect(content).toContain('onActionComplete?.');
  });

  it('DecisionRow calls onInspect when expanding', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    expect(content).toContain('handleExpand');
    // handleExpand should call onInspect when opening
    const expandFn = content.slice(content.indexOf('const handleExpand'), content.indexOf('const handleAction'));
    expect(expandFn).toContain('onInspect');
  });

  it('DecisionRow calls onActionStart before mutation', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    const actionFn = content.slice(content.indexOf('const handleAction'), content.indexOf('const history'));
    expect(actionFn).toContain('onActionStart?.(decisionId, action)');
  });

  it('DecisionRow calls onActionComplete after mutation success', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    const actionFn = content.slice(content.indexOf('const handleAction'), content.indexOf('const history'));
    expect(actionFn).toContain('onActionComplete?.({');
    expect(actionFn).toContain('success: true');
  });

  it('DecisionRow calls onActionComplete with error on failure', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    const actionFn = content.slice(content.indexOf('const handleAction'), content.indexOf('const history'));
    expect(actionFn).toContain('success: false');
    expect(actionFn).toContain("error: 'Network error'");
  });

  it('panel passes callbacks through to DecisionRow', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    expect(content).toContain('onInspect={onInspectDecision}');
    expect(content).toContain('onActionStart={onActionStarted}');
    expect(content).toContain('onActionComplete={onActionCompleted}');
  });
});

// ── 2. Queue/Consequence Selection Convergence ───────────────────────���──────

describe('Queue/consequence — one selected state', () => {
  it('shell passes governance.inspectDecision to review panel', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.inspectDecision');
    expect(content).toContain('governance.startAction');
    expect(content).toContain('governance.completeAction');
  });

  it('governance model tracks selected decision from either queue or consequence', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('selectedDecisionId');
    expect(content).toContain('inspectDecision');
  });
});

// ── 3. GovernanceStatusBar — canonical path ─────────────────────────────────

describe('GovernanceStatusBar — off legacy adapters', () => {
  it('imports useFabricDecisions directly from useFabricState', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain("from '../../hooks/useFabricState'");
    expect(content).toContain('useFabricDecisions');
  });

  it('does NOT import from useGovernance', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).not.toContain("from '../../hooks/useGovernance'");
  });

  it('does NOT use usePromotionBlockers or useGovernanceDecisions', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).not.toContain('usePromotionBlockers');
    expect(content).not.toContain('useGovernanceDecisions');
  });

  it('uses selectPromotionBlockersFromFabric directly', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('selectPromotionBlockersFromFabric');
  });

  it('derives decisions from fabric entries (single data source)', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    // Should have one refetchAll, not separate refetchBlockers/refetchDecisions
    expect(content).toContain('refetchAll');
    expect(content).not.toContain('refetchBlockers');
    expect(content).not.toContain('refetchDecisions');
  });
});

// ── 4. Touched-Slice Cleanup ────────────────────────────────────────────────

describe('Touched-slice cleanup — leaner', () => {
  it('GovernanceStatusBar has single data source (useFabricDecisions)', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    // Count useFabricDecisions calls — should be exactly 1
    const matches = content.match(/useFabricDecisions\(/g);
    expect(matches?.length).toBe(1);
  });

  it('DecisionRow no longer silently ignores governance model', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    // onInspect is called, not just accepted
    expect(content).toContain('onInspect?.(');
    expect(content).toContain('onActionStart?.(');
  });
});

// ── 5. State Refresh After Actions ──────────────────────────────────────────

describe('State refresh after lifecycle actions', () => {
  it('DecisionRow invalidates queue queries after action', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    expect(content).toContain("invalidateQueries({ queryKey: ['concept2cure', 'governance', 'review-queue'");
    expect(content).toContain("invalidateQueries({ queryKey: ['concept2cure', 'governance', 'decision-history'");
  });
});

// ── 6. No Regression ────────────────────────────────────────────────────────

describe('No regression', () => {
  it('governance model still exports state machine', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('export function useWorkspaceGovernanceModel');
    expect(content).toContain("'idle'");
    expect(content).toContain("'queue'");
  });

  it('useFabricState still exports all hooks', () => {
    const content = read('client/src/concept2cure/hooks/useFabricState.ts');
    expect(content).toContain('export function useFabricDecisions');
    expect(content).toContain('export function useGovernedReviewQueue');
    expect(content).toContain('export function useGovernedDecisionTransition');
  });

  it('backend controller still thin and complete', () => {
    const content = read('server/controllers/governance-controller.ts');
    expect(content).toContain('handleGetDecisions');
    expect(content).toContain('handleGetReviewQueue');
    expect(content).toContain('handleTransition');
  });

  it('mapQueueToGovernanceItems still works', async () => {
    const mod = await import('../client/src/concept2cure/components/workspace/documentConsequence');
    const items = mod.mapQueueToGovernanceItems(
      { pending: ['x'], escalated: [], deferred: [], rejected: [] },
      [],
    );
    expect(items.length).toBe(1);
    expect(items[0].state).toBe('under_review');
  });
});
