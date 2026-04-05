/**
 * Build Order #15 — Workspace Operating Surface Convergence Tests
 *
 * Covers:
 *   1. Workspace governance operating model (state machine)
 *   2. Consequence/governance integration (first-class, not optional)
 *   3. Hook/state simplification
 *   4. Touched-slice runtime cleanup (deprecated types removed)
 *   5. No regression on existing governance backend
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Workspace Governance Operating Model ─────────────────────────────────

describe('Workspace governance operating model', () => {
  it('workspaceGovernanceModel.ts exports useWorkspaceGovernanceModel hook', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('export function useWorkspaceGovernanceModel');
  });

  it('defines GovernanceSurfaceState union type', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain("'idle'");
    expect(content).toContain("'queue'");
    expect(content).toContain("'inspecting'");
    expect(content).toContain("'acting'");
    expect(content).toContain("'result'");
  });

  it('exposes state machine actions', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('openQueue');
    expect(content).toContain('closeQueue');
    expect(content).toContain('inspectDecision');
    expect(content).toContain('startAction');
    expect(content).toContain('completeAction');
    expect(content).toContain('dismissResult');
  });

  it('tracks selected decision context', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('selectedDecisionId');
    expect(content).toContain('selectedDecisionState');
  });

  it('tracks action-in-progress and last result', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('actionInProgress');
    expect(content).toContain('lastResult');
    expect(content).toContain('GovernanceActionResult');
  });

  it('exports selectGovernanceOperatingStatus selector', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('export function selectGovernanceOperatingStatus');
  });

  it('derives isActive and hasUnresolved', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('isActive');
    expect(content).toContain('hasUnresolved');
  });
});

// ── 2. Consequence/Governance Integration ───────────────────────────────────

describe('Consequence model — governance as first-class', () => {
  it('GovernedFabricState has lifecycleState field', () => {
    const content = read('client/src/concept2cure/components/workspace/documentConsequence.ts');
    expect(content).toContain('lifecycleState');
    expect(content).toContain("'under_review'");
    expect(content).toContain("'escalated'");
  });

  it('GovernedFabricState doc describes it as operating truth, not optional metadata', () => {
    const content = read('client/src/concept2cure/components/workspace/documentConsequence.ts');
    expect(content).toContain('first-class operating truth');
    expect(content).not.toContain('Optional — populated when');
  });

  it('exports summarizeConsequenceGovernance selector', () => {
    const content = read('client/src/concept2cure/components/workspace/documentConsequence.ts');
    expect(content).toContain('export function summarizeConsequenceGovernance');
  });

  it('ConsequenceGovernanceSummary has governance-first fields', () => {
    const content = read('client/src/concept2cure/components/workspace/documentConsequence.ts');
    expect(content).toContain('governedRows');
    expect(content).toContain('ungoverned');
    expect(content).toContain('hasBlockers');
  });

  it('summarizeConsequenceGovernance works on empty rows', async () => {
    const mod = await import('../client/src/concept2cure/components/workspace/documentConsequence');
    const summary = mod.summarizeConsequenceGovernance([]);
    expect(summary.totalRows).toBe(0);
    expect(summary.governedRows).toBe(0);
    expect(summary.hasBlockers).toBe(false);
  });

  it('summarizeConsequenceGovernance counts governed vs ungoverned', async () => {
    const mod = await import('../client/src/concept2cure/components/workspace/documentConsequence');
    const rows = [
      { rowKey: 'a', title: 'A', artifactId: '1', version: 1, status: 'draft', sourceType: 'compute' as const, placement: 'unplaced', provenancePresent: false, auditPresent: false, openable: true, governedFabric: { outcome: 'allow' as const } },
      { rowKey: 'b', title: 'B', artifactId: '2', version: 1, status: 'draft', sourceType: 'compute' as const, placement: 'unplaced', provenancePresent: false, auditPresent: false, openable: true },
      { rowKey: 'c', title: 'C', artifactId: '3', version: 1, status: 'draft', sourceType: 'compute' as const, placement: 'unplaced', provenancePresent: false, auditPresent: false, openable: true, governedFabric: { outcome: 'block' as const } },
    ];
    const summary = mod.summarizeConsequenceGovernance(rows);
    expect(summary.totalRows).toBe(3);
    expect(summary.governedRows).toBe(2);
    expect(summary.ungoverned).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.allowed).toBe(1);
    expect(summary.hasBlockers).toBe(true);
  });
});

// ── 3. Hook/State Simplification ────────────────────────────────────────────

describe('Hook simplification — governance hooks cleaned', () => {
  it('useGovernance.ts deleted (legacy adapters fully retired in BO18)', () => {
    expect(fs.existsSync(path.join(ROOT, 'client/src/concept2cure/hooks/useGovernance.ts'))).toBe(false);
  });

  it('workspaceShellControllers uses governance model, not loose booleans', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    expect(content).toContain('useWorkspaceGovernanceModel');
    expect(content).toContain('governance');
    // Should delegate to model, not use raw useState for governance booleans
    expect(content).not.toMatch(/useState<boolean>\(false\);\s*\/\/ Governed/);
  });

  it('useDocumentConsequenceState exposes governance model', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    expect(content).toContain('governance,');
  });

  it('proposalActionState is no longer a separate concern', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    // proposalActionState should not be a separate useState
    expect(content).not.toContain("useState<Record<string, 'idle' | 'running'>>");
  });
});

// ── 4. Touched-Slice Cleanup ────────────────────────────────────────────────

describe('Touched-slice cleanup', () => {
  it('GovernanceStatusBar inlines its own type shapes', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    // Should not import from deleted useGovernance
    expect(content).not.toContain("from '../../hooks/useGovernance'");
    // Should have local interfaces
    expect(content).toContain('interface PromotionBlocker');
    expect(content).toContain('interface GovernanceDecision');
  });
});

// ── 5. No Regression ────────────────────────────────────────────────────────

describe('No regression — backend governance still works', () => {
  it('governed-decision-repository still exports core functions', () => {
    const content = read('server/services/governed-decision-repository.ts');
    expect(content).toContain('export async function recordGovernedDecision');
    expect(content).toContain('export async function transitionGovernedDecision');
    expect(content).toContain('export async function getProjectReviewQueue');
  });

  it('governance-controller still has all handlers', () => {
    const content = read('server/controllers/governance-controller.ts');
    expect(content).toContain('handleGetDecisions');
    expect(content).toContain('handleGetReviewQueue');
    expect(content).toContain('handleTransition');
  });

  it('useFabricState still exports all 5 hooks', () => {
    const content = read('client/src/concept2cure/hooks/useFabricState.ts');
    expect(content).toContain('export function useFabricDecisions');
    expect(content).toContain('export function useFabricSummary');
    expect(content).toContain('export function useGovernedReviewQueue');
    expect(content).toContain('export function useGovernedDecisionHistory');
    expect(content).toContain('export function useGovernedDecisionTransition');
  });
});
