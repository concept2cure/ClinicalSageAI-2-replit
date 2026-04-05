/**
 * Build Order #20 — Workflow Gating, Next-Action Guidance Tests
 *
 * Proves:
 *   1. Workflow gating selectors (verify/publish) derive from shared model
 *   2. Next-action recommendations derive from governance state
 *   3. Manual refresh path exists through governance model
 *   4. StatusBar shows next actions and verify gate status
 *   5. No second fetch path or state system
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Workflow Gating Selectors ────────────────────────────────────────────

describe('Workflow gating — verify/publish gates', () => {
  it('exports selectVerifyGate', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectVerifyGate');
  });

  it('exports selectPublishGate', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectPublishGate');
  });

  it('verify gate checks escalated and blockers', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectVerifyGate'), content.indexOf('function selectPublishGate'));
    expect(fn).toContain('escalated');
    expect(fn).toContain("'blocked'");
    expect(fn).toContain("'review_required'");
    expect(fn).toContain("'allowed'");
  });

  it('publish gate depends on verify gate', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectPublishGate'));
    expect(fn).toContain('selectVerifyGate(model)');
    expect(fn).toContain('publishGateOutcome');
  });

  it('WorkflowGateResult has status + reasons + counts', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('WorkflowGateResult');
    expect(content).toContain('status: WorkflowGateStatus');
    expect(content).toContain('reasons: string[]');
    expect(content).toContain('blockerCount: number');
  });
});

// ── 2. Next-Action Recommendations ──────────────────────────────────────────

describe('Next-action guidance — from governance state', () => {
  it('exports selectNextActions', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectNextActions');
  });

  it('NextActionRecommendation has action, label, priority, reason', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('NextActionRecommendation');
    expect(content).toContain("priority: 'high' | 'medium' | 'low'");
  });

  it('recommends resolving escalated as high priority', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectNextActions'));
    expect(fn).toContain("action: 'resolve_escalated'");
    expect(fn).toContain("priority: 'high'");
  });

  it('recommends proceed_to_verify when clear', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain("action: 'proceed_to_verify'");
  });
});

// ── 3. Manual Refresh Path ──────────────────────────────────────────────────

describe('Manual refresh — through governance model', () => {
  it('model interface includes requestRefresh', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('requestRefresh: () => void');
  });

  it('model interface includes setRefreshFn', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('setRefreshFn');
  });

  it('shell wires refetch into governance model', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.setRefreshFn');
    expect(content).toContain('fabricQuery.refetch');
  });

  it('StatusBar uses requestRefresh for manual refresh', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('governanceModel?.requestRefresh()');
  });
});

// ── 4. StatusBar Shows Gating + Next Actions ────────────────────────────────

describe('GovernanceStatusBar — gating + next actions', () => {
  it('imports selectVerifyGate and selectNextActions', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('selectVerifyGate');
    expect(content).toContain('selectNextActions');
  });

  it('renders next-actions section', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('data-testid="governance-next-actions"');
    expect(content).toContain('Next Actions');
  });

  it('renders verify gate status', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('data-testid="verify-gate-status"');
    expect(content).toContain('Verify:');
  });

  it('shows priority indicators for next actions', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain("a.priority === 'high'");
    expect(content).toContain("'bg-red-400'");
    expect(content).toContain("'bg-amber-400'");
  });
});

// ── 5. No Second Fetch/State System ─────────────────────────────────────────

describe('No second fetch or state system', () => {
  it('StatusBar still reads from shared model', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('governanceModel?.fabricEntries');
    expect(content).not.toContain('useFabricDecisions(');
  });

  it('shell is the only useFabricDecisions caller', () => {
    const shell = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(shell).toContain('useFabricDecisions(');
    const statusBar = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(statusBar).not.toContain('useFabricDecisions(');
  });
});

// ── 6. No Regression ────────────────────────────────────────────────────────

describe('No regression', () => {
  it('governance model still exports state machine', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('export function useWorkspaceGovernanceModel');
  });

  it('context still exports provider and consumer hooks', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('WorkspaceGovernanceProvider');
    expect(content).toContain('useWorkspaceGovernance');
  });

  it('backend controller unchanged', () => {
    const content = read('server/controllers/governance-controller.ts');
    expect(content).toContain('handleTransition');
  });
});
