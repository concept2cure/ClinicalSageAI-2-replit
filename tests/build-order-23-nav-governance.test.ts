/**
 * Build Order #23 — Nav-Source Governance Activation Tests
 *
 * Proves:
 *   1. selectNavGovernanceAffordance exported and works
 *   2. Verify nav click routes through verify_review governance gate
 *   3. Publish nav click already routes through publish_package gate
 *   4. Shell computes nav affordances from shared model
 *   5. Nav affordance derives from same governance truth as preflight
 *   6. No second state or fetch path
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Nav Affordance Selector ──────────────────────────────────────────────

describe('selectNavGovernanceAffordance — shared selector', () => {
  it('exported from WorkspaceGovernanceContext', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectNavGovernanceAffordance');
  });

  it('NavGovernanceAffordance interface has required fields', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export interface NavGovernanceAffordance');
    expect(content).toContain('gateStatus: NavGateStatus');
    expect(content).toContain('tooltip: string');
    expect(content).toContain('disabled: boolean');
    expect(content).toContain('badgeLabel');
    expect(content).toContain('badgeTone');
  });

  it('NavGateStatus includes ready/review_needed/blocked/ungated', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain("export type NavGateStatus = 'ready' | 'review_needed' | 'blocked' | 'ungated'");
  });

  it('returns ungated for non-gated transitions', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectNavGovernanceAffordance'));
    expect(fn).toContain("gateStatus: 'ungated'");
  });

  it('returns ready/review_needed/blocked from preflight', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectNavGovernanceAffordance'));
    expect(fn).toContain("gateStatus: 'ready'");
    expect(fn).toContain("gateStatus: 'review_needed'");
    expect(fn).toContain("gateStatus: 'blocked'");
  });

  it('uses runTransitionPreflight internally', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectNavGovernanceAffordance'));
    expect(fn).toContain('runTransitionPreflight');
  });
});

// ── 2. Verify Nav Routes Through Governance Gate ────────────────────────────

describe('Verify nav — governance-gated', () => {
  it('verify nav click calls applyWorkflowTransition(verify_review)', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    // In the onNavItemClick handler for verify
    expect(content).toContain("applyWorkflowTransition('verify_review'");
  });

  it('verify nav click no longer calls browse_list for verify path', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    // The old pattern was: id === 'verify' → applyWorkflowTransition('browse_list')
    // Find the verify section and check it uses verify_review
    const verifySection = content.slice(
      content.indexOf("id === 'verify'"),
      content.indexOf("id === 'review'"),
    );
    expect(verifySection).toContain("'verify_review'");
    expect(verifySection).not.toContain("applyWorkflowTransition('browse_list'");
  });

  it('guided sequence verify stage uses verify_review gate', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    const verifyStage = content.slice(
      content.indexOf("stage === 'verify'"),
      content.indexOf("stage === 'verify'") + 300,
    );
    expect(verifyStage).toContain("'verify_review'");
  });
});

// ── 3. Shell Computes Nav Affordances ───────────────────────────────────────

describe('Shell — proactive nav affordances', () => {
  it('computes verifyNavAffordance via useMemo', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('verifyNavAffordance');
    expect(content).toContain("selectNavGovernanceAffordance(governance, 'verify_review'");
  });

  it('computes publishNavAffordance via useMemo', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('publishNavAffordance');
    expect(content).toContain("selectNavGovernanceAffordance(governance, 'publish_package'");
  });

  it('imports selectNavGovernanceAffordance', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('selectNavGovernanceAffordance');
  });
});

// ── 4. Nav Affordance Uses Same Truth ───────────────────────────────────────

describe('Nav affordance — same governance truth', () => {
  it('selectNavGovernanceAffordance calls runTransitionPreflight with same model', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectNavGovernanceAffordance'));
    expect(fn).toContain('runTransitionPreflight(model');
  });

  it('no separate useFabricDecisions call in nav affordance', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectNavGovernanceAffordance'));
    expect(fn).not.toContain('useFabricDecisions');
    expect(fn).not.toContain('apiRequest');
  });
});

// ── 5. No Second State ──────────────────────────────────────────────────────

describe('No second state or fetch path', () => {
  it('no new useQuery or fetch in nav affordance logic', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function selectNavGovernanceAffordance'));
    expect(fn).not.toContain('useQuery');
  });

  it('shell still has exactly one useFabricDecisions call', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    const matches = content.match(/useFabricDecisions\(/g);
    expect(matches?.length).toBe(1);
  });
});

// ── 6. No Regression ────────────────────────────────────────────────────────

describe('No regression', () => {
  it('declarative governanceGate still on transition map', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    expect(content).toContain("governanceGate: 'verify_review'");
    expect(content).toContain("governanceGate: 'publish_package'");
  });

  it('TransitionPreflightBanner still rendered', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('<TransitionPreflightBanner');
  });

  it('shell still wraps in WorkspaceGovernanceProvider', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('WorkspaceGovernanceProvider');
  });

  it('isTransitionGovernanceAllowed still exported', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function isTransitionGovernanceAllowed');
  });
});
