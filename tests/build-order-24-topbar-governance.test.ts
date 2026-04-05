/**
 * Build Order #24 — TopBar/ContextBars Governance Rendering Tests
 *
 * Proves:
 *   1. WorkspaceContextBars accepts navAffordances prop
 *   2. Nav items render governance badges (data-testid)
 *   3. Shell passes verifyNavAffordance + publishNavAffordance to ContextBars
 *   4. Governance gate status shown via data attributes + badges
 *   5. Click still goes through onNavItemClick (shell preflight)
 *   6. No second fetch or state path
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. WorkspaceContextBars Accepts Affordances ─────────────────────────────

describe('WorkspaceContextBars — navAffordances prop', () => {
  it('props interface includes navAffordances', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain('navAffordances?:');
    expect(content).toContain('gateStatus');
    expect(content).toContain('badgeLabel');
    expect(content).toContain('badgeTone');
  });

  it('destructures navAffordances', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain('navAffordances,');
  });
});

// ── 2. Nav Items Render Governance Badges ────────────────────────────────────

describe('Nav items — governance badge rendering', () => {
  it('nav items have data-testid with item id', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain('data-testid={`nav-item-${item.id}`}');
  });

  it('nav items have data-gate-status attribute', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain('data-gate-status={affordance?.gateStatus}');
  });

  it('gated items render badge with badgeLabel', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain('data-testid={`nav-badge-${item.id}`}');
    expect(content).toContain('affordance?.badgeLabel');
  });

  it('badge shows color based on badgeTone', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain("badgeTone === 'red'");
    expect(content).toContain("badgeTone === 'amber'");
    expect(content).toContain("badgeTone === 'green'");
  });

  it('disabled affordance shows cursor-not-allowed', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain('cursor-not-allowed');
    expect(content).toContain('affordance?.disabled');
  });

  it('tooltip shows affordance.tooltip', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain('title={affordance?.tooltip');
  });
});

// ── 3. Shell Passes Affordances ─────────────────────────────────────────────

describe('Shell — passes affordances to ContextBars', () => {
  it('shell passes navAffordances prop to WorkspaceContextBars', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('navAffordances={{');
    expect(content).toContain('verify: verifyNavAffordance');
    expect(content).toContain('publish: publishNavAffordance');
  });

  it('verifyNavAffordance computed from selectNavGovernanceAffordance', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain("selectNavGovernanceAffordance(governance, 'verify_review'");
  });

  it('publishNavAffordance computed from selectNavGovernanceAffordance', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain("selectNavGovernanceAffordance(governance, 'publish_package'");
  });
});

// ── 4. Click Still Goes Through Shell Preflight ─────────────────────────────

describe('Click behavior — still through shell preflight', () => {
  it('nav items still call onNavItemClick (not bypass it)', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).toContain('onClick={() => onNavItemClick(item.id)');
  });

  it('shell still handles verify via applyWorkflowTransition', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain("applyWorkflowTransition('verify_review'");
  });

  it('shell still handles publish via applyWorkflowTransition', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain("applyWorkflowTransition('publish_package'");
  });
});

// ── 5. No Second Fetch or State ─────────────────────────────────────────────

describe('No second fetch or state', () => {
  it('WorkspaceContextBars does not import useFabricDecisions', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).not.toContain('useFabricDecisions');
  });

  it('WorkspaceContextBars does not import useWorkspaceGovernance', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceContextBars.tsx');
    expect(content).not.toContain('useWorkspaceGovernance');
  });

  it('shell still has exactly one useFabricDecisions call', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    const matches = content.match(/useFabricDecisions\(/g);
    expect(matches?.length).toBe(1);
  });
});

// ── 6. No Regression ────────────────────────────────────────────────────────

describe('No regression', () => {
  it('selectNavGovernanceAffordance still exported', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectNavGovernanceAffordance');
  });

  it('TransitionPreflightBanner still rendered', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('<TransitionPreflightBanner');
  });

  it('WorkspaceGovernanceProvider still wraps workspace', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('WorkspaceGovernanceProvider');
  });

  it('PROJECT_NAV_ITEMS still includes verify and publish', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellConstants.ts');
    expect(content).toContain("{ id: 'verify', label: 'Verify' }");
    expect(content).toContain("{ id: 'publish', label: 'Publish' }");
  });
});
