/**
 * Build Order #21 — Workflow Transition Enforcement Tests
 *
 * Proves:
 *   1. Transition preflight contract exists and works
 *   2. Shell workflow transitions consult governance gates
 *   3. Interception UX component exists and renders gating info
 *   4. Next actions in preflight are actionable (CTA)
 *   5. No second client state or fetch path
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ── 1. Transition Preflight Contract ────────────────────────────────────────

describe('Transition preflight — shared contract', () => {
  it('exports runTransitionPreflight', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export function runTransitionPreflight');
  });

  it('TransitionPreflightResult has required fields', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('export interface TransitionPreflightResult');
    expect(content).toContain('target: string');
    expect(content).toContain('allowed: boolean');
    expect(content).toContain('status: WorkflowGateStatus');
    expect(content).toContain('reasons: string[]');
    expect(content).toContain('nextActions: NextActionRecommendation[]');
    expect(content).toContain('blockingDecisionIds: string[]');
    expect(content).toContain('cta?');
  });

  it('non-gated transitions always return allowed', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function runTransitionPreflight'));
    // Non-verify/publish targets should pass
    expect(fn).toContain("target !== 'verify_review'");
    expect(fn).toContain('allowed: true');
  });

  it('verify/publish transitions consult selectVerifyGate/selectPublishGate', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function runTransitionPreflight'));
    expect(fn).toContain('selectVerifyGate');
    expect(fn).toContain('selectPublishGate');
  });

  it('blocked transitions get a CTA', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function runTransitionPreflight'));
    expect(fn).toContain("action: 'open_queue'");
    expect(fn).toContain("action: 'refresh'");
  });
});

// ── 2. Shell Workflow Enforcement ───────────────────────────────────────────

describe('Shell — governance-aware transitions', () => {
  it('applyWorkflowTransition calls runTransitionPreflight for verify', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain("key === 'verify_review'");
    expect(content).toContain('runTransitionPreflight(governance, key)');
  });

  it('applyWorkflowTransition calls runTransitionPreflight for publish', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain("key === 'publish_package'");
  });

  it('blocked transition sets pendingPreflight state', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('setPendingPreflight(preflight)');
  });

  it('allowed transition clears pendingPreflight', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('setPendingPreflight(null)');
  });

  it('imports runTransitionPreflight from context', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('runTransitionPreflight');
    expect(content).toContain('TransitionPreflightResult');
  });
});

// ── 3. Interception UX Component ────────────────────────────────────────────

describe('TransitionPreflightBanner — interception UX', () => {
  it('component file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx'))).toBe(true);
  });

  it('exports TransitionPreflightBanner', () => {
    const content = read('client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx');
    expect(content).toContain('export function TransitionPreflightBanner');
  });

  it('renders gating reasons', () => {
    const content = read('client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx');
    expect(content).toContain('data-testid="preflight-reasons"');
  });

  it('renders next actions', () => {
    const content = read('client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx');
    expect(content).toContain('data-testid="preflight-next-actions"');
  });

  it('renders CTA button', () => {
    const content = read('client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx');
    expect(content).toContain('data-testid="preflight-cta"');
  });

  it('allows dismiss for review_required status', () => {
    const content = read('client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx');
    expect(content).toContain('data-testid="preflight-dismiss"');
    expect(content).toContain('Proceed anyway');
  });

  it('returns null when allowed', () => {
    const content = read('client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx');
    expect(content).toContain('if (preflight.allowed) return null');
  });

  it('shell renders TransitionPreflightBanner', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('<TransitionPreflightBanner');
    expect(content).toContain('pendingPreflight');
  });
});

// ── 4. Next-Action Activation ───────────────────────────────────────────────

describe('Next-action activation — CTA drives real navigation', () => {
  it('CTA open_queue calls governance.openQueue', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.openQueue()');
  });

  it('CTA inspect_decision calls governance.inspectDecision', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.inspectDecision(id');
  });

  it('CTA refresh calls governance.requestRefresh', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('governance.requestRefresh()');
  });

  it('banner has onOpenQueue, onInspectDecision, onRefresh, onDismiss callbacks', () => {
    const content = read('client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx');
    expect(content).toContain('onOpenQueue');
    expect(content).toContain('onInspectDecision');
    expect(content).toContain('onRefresh');
    expect(content).toContain('onDismiss');
  });
});

// ── 5. No Second State ──────────────────────────────────────────────────────

describe('No second state or fetch path', () => {
  it('preflight derives from existing governance model', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    const fn = content.slice(content.indexOf('function runTransitionPreflight'));
    expect(fn).toContain('model: WorkspaceGovernanceViewModel');
    // No fetch inside the preflight
    expect(fn).not.toContain('apiRequest');
    expect(fn).not.toContain('useFabricDecisions');
  });

  it('banner does not fetch its own data', () => {
    const content = read('client/src/concept2cure/components/workspace/TransitionPreflightBanner.tsx');
    expect(content).not.toContain('useQuery');
    expect(content).not.toContain('useFabricDecisions');
    expect(content).not.toContain('apiRequest');
  });
});

// ── 6. No Regression ────────────────────────────────────────────────────────

describe('No regression', () => {
  it('governance model still exports state machine', () => {
    const content = read('client/src/concept2cure/components/workspace/workspaceGovernanceModel.ts');
    expect(content).toContain('export function useWorkspaceGovernanceModel');
  });

  it('shell still wraps in WorkspaceGovernanceProvider', () => {
    const content = read('client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx');
    expect(content).toContain('WorkspaceGovernanceProvider');
  });

  it('existing selectors still exported', () => {
    const content = read('client/src/concept2cure/components/workspace/WorkspaceGovernanceContext.tsx');
    expect(content).toContain('selectVerifyGate');
    expect(content).toContain('selectPublishGate');
    expect(content).toContain('selectNextActions');
  });
});
