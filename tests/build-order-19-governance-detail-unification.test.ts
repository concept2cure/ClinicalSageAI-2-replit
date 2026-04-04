/**
 * Build Order #19 — Governance Detail Unification Tests
 *
 * Proves:
 *   1. StatusBar no longer owns a parallel useFabricDecisions fetch
 *   2. Shared model carries fabricEntries for detail consumers
 *   3. Shell pushes fabric data into governance model
 *   4. Context exports selectSelectedGovernanceDetail + selectBlockerSummary
 *   5. Touched slice is leaner (no duplicate fetch)
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. StatusBar De-duplication ─────────────────────────────────────────────

describe('GovernanceStatusBar — no parallel fetch', () => {
  it('does NOT call useFabricDecisions directly', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).not.toContain('useFabricDecisions(');
  });

  it('does NOT import useFabricDecisions', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    // Should only import selectPromotionBlockersFromFabric, not the hook
    expect(content).not.toMatch(/import.*useFabricDecisions/);
  });

  it('reads entries from governanceModel.fabricEntries', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('governanceModel?.fabricEntries');
  });

  it('reads loading from governanceModel.fabricLoading', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('governanceModel?.fabricLoading');
  });

  it('still uses selectPromotionBlockersFromFabric for blockers', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('selectPromotionBlockersFromFabric(entries)');
  });
});

// ── 2. Shared Model Detail Truth ────────────────────────────────────────────

describe('Governance model — carries detail truth', () => {
  it('model interface includes fabricEntries', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('fabricEntries: FabricDecisionEntry[]');
  });

  it('model interface includes fabricLoading', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('fabricLoading: boolean');
  });

  it('model interface includes setFabricDetail setter', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('setFabricDetail');
  });

  it('imports FabricDecisionEntry type', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain("import type { FabricDecisionEntry }");
  });
});

// ── 3. Shell Pushes Fabric Data ─────────────────────────────────────────────

describe('Shell — pushes fabric data into governance model', () => {
  it('shell calls useFabricDecisions', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('useFabricDecisions(');
  });

  it('shell syncs fabric data via useEffect + setFabricDetail', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.setFabricDetail');
    expect(content).toContain('fabricQuery.data?.entries');
  });

  it('shell imports useFabricDecisions from useFabricState', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain("from '../../hooks/useFabricState'");
  });
});

// ── 4. Context Selectors ────────────────────────────────────────────────────

describe('Context selectors — centralized detail derivation', () => {
  it('exports selectSelectedGovernanceDetail', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectSelectedGovernanceDetail');
  });

  it('exports selectBlockerSummary', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectBlockerSummary');
  });

  it('selectSelectedGovernanceDetail finds matching entry by decisionId', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('model.selectedDecisionId');
    expect(content).toContain('fabricEntries.find');
  });
});

// ── 5. Touched-Slice Cleanup ────────────────────────────────────────────────

describe('Touched-slice cleanup — one fewer duplicate fetch', () => {
  it('StatusBar does not own any useQuery or useFabricDecisions call', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).not.toContain('useQuery(');
    expect(content).not.toContain('useFabricDecisions(');
  });

  it('no duplicate useFabricDecisions in workspace subtree outside shell', () => {
    // Shell should be the only useFabricDecisions caller in the workspace
    const statusBar = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(statusBar).not.toContain('useFabricDecisions(');
  });
});

// ── 6. No Regression ────────────────────────────────────────────────────────

describe('No regression', () => {
  it('governance context still exports provider and hooks', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('WorkspaceGovernanceProvider');
    expect(content).toContain('useWorkspaceGovernance');
    expect(content).toContain('selectGovernanceBadge');
  });

  it('model still exports state machine', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('export function useWorkspaceGovernanceModel');
  });

  it('shell still wraps in WorkspaceGovernanceProvider', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('WorkspaceGovernanceProvider');
  });

  it('review panel still wires governance callbacks', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    expect(content).toContain('onInspect?.(decisionId');
  });

  it('backend controller unchanged', () => {
    const content = read('server/controllers/governance-controller.ts');
    expect(content).toContain('handleTransition');
  });
});
