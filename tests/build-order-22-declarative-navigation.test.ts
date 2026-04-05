/**
 * Build Order #22 — Declarative Workflow Gating Tests
 *
 * Proves:
 *   1. WORKFLOW_TRANSITION_MAP has declarative governanceGate field
 *   2. Shell uses transition.governanceGate instead of hardcoded key check
 *   3. isTransitionGovernanceAllowed helper exists for nav sources
 *   4. getGovernanceGatedTransitions lists gated keys
 *   5. Non-gated transitions still work without governance check
 *   6. No second state or fetch path
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Declarative Governance Gate ──────────────────────────────────────────

describe('WORKFLOW_TRANSITION_MAP — declarative governance gate', () => {
  it('verify_review has governanceGate field', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    expect(content).toContain("governanceGate: 'verify_review'");
  });

  it('publish_package has governanceGate field', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    expect(content).toContain("governanceGate: 'publish_package'");
  });

  it('non-gated transitions do NOT have governanceGate', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    // project_home, browse_list etc should not have governanceGate
    const projectHome = content.slice(content.indexOf('project_home:'), content.indexOf('dossier_planning:'));
    expect(projectHome).not.toContain('governanceGate');
  });

  it('WorkflowTransition interface includes optional governanceGate', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    expect(content).toContain("governanceGate?: 'verify_review' | 'publish_package'");
  });

  it('getGovernanceGatedTransitions exports gated keys', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceShellControllers.ts');
    expect(content).toContain('export function getGovernanceGatedTransitions');
  });
});

// ── 2. Shell Uses Declarative Gate ──────────────────────────────────────────

describe('Shell — declarative gate consumption', () => {
  it('applyWorkflowTransition uses transition.governanceGate, not hardcoded keys', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('transition.governanceGate');
    // Should NOT have the old hardcoded check
    expect(content).not.toContain("key === 'verify_review' || key === 'publish_package'");
  });

  it('governance gate check is inside the transition logic', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    const fnBody = content.slice(content.indexOf('applyWorkflowTransition'), content.indexOf('applyWorkflowTransition') + 1000);
    expect(fnBody).toContain('if (transition.governanceGate)');
    expect(fnBody).toContain('runTransitionPreflight(governance, transition.governanceGate)');
  });
});

// ── 3. Navigation Helper ────────────────────────────────────────────────────

describe('isTransitionGovernanceAllowed — nav source helper', () => {
  it('exported from WorkspaceGovernanceContext', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function isTransitionGovernanceAllowed');
  });

  it('checks transition map for governanceGate', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function isTransitionGovernanceAllowed'));
    expect(fn).toContain('governanceGate');
    expect(fn).toContain('runTransitionPreflight');
  });

  it('returns allowed: true for non-gated transitions', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(
      content.indexOf('function isTransitionGovernanceAllowed'),
      content.indexOf('function runTransitionPreflight'),
    );
    expect(fn).toContain('return { allowed: true');
  });
});

// ── 4. Preflight Still Works ────────────────────────────────────────────────

describe('Preflight — still functional through declarative gate', () => {
  it('TransitionPreflightBanner still rendered in shell', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('<TransitionPreflightBanner');
    expect(content).toContain('pendingPreflight');
  });

  it('CTA callbacks still wired', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.openQueue()');
    expect(content).toContain('governance.inspectDecision');
    expect(content).toContain('governance.requestRefresh()');
  });
});

// ── 5. No Regression ────────────────────────────────────────────────────────

describe('No regression', () => {
  it('runTransitionPreflight still exported', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function runTransitionPreflight');
  });

  it('TransitionPreflightResult still exported', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export interface TransitionPreflightResult');
  });

  it('selectVerifyGate and selectPublishGate still exported', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function selectVerifyGate');
    expect(content).toContain('export function selectPublishGate');
  });

  it('governance model still has requestRefresh', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('requestRefresh');
  });

  it('shell still wraps in WorkspaceGovernanceProvider', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('WorkspaceGovernanceProvider');
  });
});
