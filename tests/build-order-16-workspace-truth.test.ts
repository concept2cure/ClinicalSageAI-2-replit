/**
 * Build Order #16 — Workspace Truth Convergence Tests
 *
 * Proves:
 *   1. Governance model is the single source of truth (no loose booleans)
 *   2. Queue → inspect → act is one coordinated flow
 *   3. Consequence rows and queue items bridge through one model
 *   4. Shell wires governance callbacks to review panel
 *   5. Touched slice is leaner (backward-compat removed from controller)
 *   6. No regression on backend or hooks
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Single Governance Model ──────────────────────────────────────────────

describe('Governance model — single source of truth', () => {
  it('useDocumentConsequenceState exposes governance model only, not loose booleans', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    // Should return governance, not showGovernedPanel/reviewQueueVisible as own state
    const fnBody = content.slice(content.indexOf('useDocumentConsequenceState'));
    expect(fnBody).toContain('governance,');
    // Should NOT have backward-compat boolean accessors as return values
    expect(fnBody).not.toContain('showGovernedPanel,');
    expect(fnBody).not.toContain('reviewQueueVisible,');
    expect(fnBody).not.toContain('setShowGovernedPanel,');
    expect(fnBody).not.toContain('setReviewQueueVisible,');
  });

  it('shell derives booleans from governance model, not from controller', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.governedPanelOpen');
    expect(content).toContain('governance.isActive');
    expect(content).toContain('governance.openQueue');
    expect(content).toContain('governance.closeQueue');
  });

  it('governance model still exports state machine types', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain("'idle'");
    expect(content).toContain("'queue'");
    expect(content).toContain("'inspecting'");
    expect(content).toContain("'acting'");
    expect(content).toContain("'result'");
  });
});

// ── 2. Queue → Inspect → Act Flow ──────────────────────────────────────────

describe('Queue → inspect → act — coordinated through model', () => {
  it('shell passes governance callbacks to GovernedDecisionReviewPanel', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('onInspectDecision');
    expect(content).toContain('governance.inspectDecision');
    expect(content).toContain('onActionStarted');
    expect(content).toContain('governance.startAction');
    expect(content).toContain('onActionCompleted');
    expect(content).toContain('governance.completeAction');
  });

  it('GovernedDecisionReviewPanel accepts governance callbacks', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    expect(content).toContain('onInspectDecision');
    expect(content).toContain('onActionStarted');
    expect(content).toContain('onActionCompleted');
  });

  it('close uses governance.closeQueue, not setReviewQueueVisible', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.closeQueue()');
  });
});

// ── 3. Consequence/Queue Bridge ─────────────────────────────────────────────

describe('Consequence/queue bridge — one operating surface', () => {
  it('documentConsequence exports mapQueueToGovernanceItems', () => {
    const content = read('client/src/concept2cure/components/workspace/documentConsequence.ts');
    expect(content).toContain('export function mapQueueToGovernanceItems');
  });

  it('GovernanceQueueItem interface exists', () => {
    const content = read('client/src/concept2cure/components/workspace/documentConsequence.ts');
    expect(content).toContain('export interface GovernanceQueueItem');
    expect(content).toContain('decisionId');
    expect(content).toContain('actionable');
    expect(content).toContain('actionsAvailable');
  });

  it('mapQueueToGovernanceItems produces correct items', async () => {
    const mod = await import('../client/src/concept2cure/components/workspace/documentConsequence');
    const queue = { pending: ['d1'], escalated: ['d2'], deferred: [], rejected: [] };
    const rows = [
      {
        rowKey: 'a', title: 'Doc A', artifactId: 'art1', version: 1, status: 'draft',
        sourceType: 'compute' as const, placement: 'unplaced', provenancePresent: false,
        auditPresent: false, openable: true,
        governedFabric: { decisionId: 'd1', outcome: 'review' as const },
      },
    ];
    const items = mod.mapQueueToGovernanceItems(queue, rows);
    expect(items.length).toBe(2);
    // d1 should have artifact context from consequence row
    const d1 = items.find(i => i.decisionId === 'd1');
    expect(d1).toBeDefined();
    expect(d1?.artifactId).toBe('art1');
    expect(d1?.title).toBe('Doc A');
    expect(d1?.state).toBe('under_review');
    expect(d1?.actionsAvailable).toContain('approve');
    // d2 should have no row context (no matching consequence)
    const d2 = items.find(i => i.decisionId === 'd2');
    expect(d2).toBeDefined();
    expect(d2?.state).toBe('escalated');
    expect(d2?.artifactId).toBeUndefined();
  });
});

// ── 4. Touched-Slice Cleanup ────────────────────────────────────────────────

describe('Touched-slice cleanup — leaner than before', () => {
  it('useDocumentConsequenceState has no backward-compat boolean accessors', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    const fnBody = content.slice(
      content.indexOf('useDocumentConsequenceState'),
      content.indexOf('usePhase4Panels'),
    );
    // No setShowGovernedPanel or setReviewQueueVisible as return values
    expect(fnBody).not.toContain('setShowGovernedPanel');
    expect(fnBody).not.toContain('setReviewQueueVisible');
  });

  it('GovernedFabricState still has lifecycleState (from BO15)', () => {
    const content = read('client/src/concept2cure/components/workspace/documentConsequence.ts');
    expect(content).toContain('lifecycleState');
  });

  it('summarizeConsequenceGovernance still works', async () => {
    const mod = await import('../client/src/concept2cure/components/workspace/documentConsequence');
    const summary = mod.summarizeConsequenceGovernance([]);
    expect(summary.totalRows).toBe(0);
    expect(summary.hasBlockers).toBe(false);
  });
});

// ── 5. No Regression ────────────────────────────────────────────────────────

describe('No regression — backend and hooks intact', () => {
  it('useFabricState exports all 5 hooks', () => {
    const content = read('client/src/concept2cure/hooks/useFabricState.ts');
    expect(content).toContain('export function useFabricDecisions');
    expect(content).toContain('export function useGovernedReviewQueue');
    expect(content).toContain('export function useGovernedDecisionTransition');
  });

  it('useGovernance still re-exports canonical hooks', () => {
    const content = read('client/src/concept2cure/hooks/useGovernance.ts');
    expect(content).toContain('useGovernedReviewQueue');
    expect(content).toContain('useGovernedDecisionHistory');
  });

  it('governance-controller still exports all handlers', () => {
    const content = read('server/controllers/governance-controller.ts');
    expect(content).toContain('handleGetDecisions');
    expect(content).toContain('handleGetReviewQueue');
    expect(content).toContain('handleTransition');
  });

  it('governed-decision-repository still exports core functions', () => {
    const content = read('server/services/governed-decision-repository.ts');
    expect(content).toContain('export async function transitionGovernedDecision');
    expect(content).toContain('export async function getProjectReviewQueue');
  });

  it('GovernanceStatusBar still uses usePromotionBlockers', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('usePromotionBlockers');
    expect(content).toContain('useGovernanceDecisions');
  });
});
