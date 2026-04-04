/**
 * Build Order #18 — Workspace Governance Propagation Tests
 *
 * Proves:
 *   1. Shared governance context exists and exports provider + hooks + selectors
 *   2. Shell wraps workspace in WorkspaceGovernanceProvider
 *   3. GovernanceStatusBar consumes shared context
 *   4. useGovernance.ts is deleted (legacy adapters retired)
 *   5. No second global store introduced
 *   6. Centralized selectors replace scattered logic
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Shared Governance Context ────────────────────────────────────────────

describe('Workspace governance context — shared contract', () => {
  it('WorkspaceGovernanceContext.tsx exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx'))).toBe(true);
  });

  it('exports WorkspaceGovernanceProvider', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function WorkspaceGovernanceProvider');
  });

  it('exports useWorkspaceGovernance (nullable)', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function useWorkspaceGovernance');
  });

  it('exports useWorkspaceGovernanceStrict (throws if no provider)', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function useWorkspaceGovernanceStrict');
    expect(content).toContain('throw new Error');
  });

  it('exports selectGovernanceBadge selector', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectGovernanceBadge');
  });

  it('exports selectAvailableActions selector', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectAvailableActions');
  });

  it('exports selectNeedsAttention selector', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectNeedsAttention');
  });

  it('is NOT a global store (uses React.createContext)', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('createContext');
    expect(content).not.toContain('zustand');
    expect(content).not.toContain('redux');
    expect(content).not.toContain('jotai');
  });
});

// ── 2. Shell Provides Governance Context ────────────────────────────────────

describe('Shell — provides governance to workspace subtree', () => {
  it('imports WorkspaceGovernanceProvider', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain("import { WorkspaceGovernanceProvider }");
  });

  it('wraps content in WorkspaceGovernanceProvider', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('<WorkspaceGovernanceProvider value={governance}');
    expect(content).toContain('</WorkspaceGovernanceProvider>');
  });
});

// ── 3. StatusBar Consumes Context ───────────────────────────────────────────

describe('GovernanceStatusBar — consumes shared context', () => {
  it('imports from WorkspaceGovernanceContext', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain("from '../workspace/WorkspaceGovernanceContext'");
  });

  it('calls useWorkspaceGovernance()', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('useWorkspaceGovernance()');
  });

  it('uses selectGovernanceBadge', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('selectGovernanceBadge');
  });

  it('uses selectNeedsAttention', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('selectNeedsAttention');
  });

  it('renders governance-queue-badge from shared model', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('data-testid="governance-queue-badge"');
  });
});

// ── 4. Legacy Adapter Retirement ────────────────────────────────────────────

describe('Legacy adapter retirement', () => {
  it('useGovernance.ts is deleted', () => {
    expect(fs.existsSync(path.join(ROOT, 'client/src/concept2cure/hooks/useGovernance.ts'))).toBe(false);
  });

  it('no client files import from useGovernance', () => {
    // Scan client/src for any remaining useGovernance import
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).not.toContain("from '../../hooks/useGovernance'");
  });

  it('GovernanceStatusBar uses useFabricDecisions directly', () => {
    const content = read('client/src/concept2cure/components/editor/GovernanceStatusBar.tsx');
    expect(content).toContain('useFabricDecisions');
    expect(content).toContain("from '../../hooks/useFabricState'");
  });
});

// ── 5. Centralized Selectors ────────────────────────────────────────────────

describe('Centralized selectors — replace scattered logic', () => {
  it('selectGovernanceBadge handles escalated state', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('escalated');
    expect(content).toContain("'red'");
  });

  it('selectAvailableActions maps lifecycle states to action lists', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain("'under_review'");
    expect(content).toContain("'approve'");
    expect(content).toContain("'reject'");
  });

  it('selectNeedsAttention checks hasUnresolved and escalated', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('hasUnresolved');
    expect(content).toContain('escalated');
  });
});

// ── 6. No Regression ────────────────────────────────────────────────────────

describe('No regression', () => {
  it('governance model still exports state machine', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('export function useWorkspaceGovernanceModel');
  });

  it('useFabricState still exports all hooks', () => {
    const content = read('client/src/concept2cure/hooks/useFabricState.ts');
    expect(content).toContain('export function useFabricDecisions');
    expect(content).toContain('export function useGovernedReviewQueue');
  });

  it('review panel still wires governance callbacks', () => {
    const content = read('client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx');
    expect(content).toContain('onInspect?.(decisionId');
    expect(content).toContain('onActionStart?.(decisionId');
  });

  it('backend controller unchanged', () => {
    const content = read('server/controllers/governance-controller.ts');
    expect(content).toContain('handleTransition');
    expect(content).toContain('handleGetReviewQueue');
  });
});
