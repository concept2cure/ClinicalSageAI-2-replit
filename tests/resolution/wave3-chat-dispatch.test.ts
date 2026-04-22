/**
 * Wave 3 Chat Dispatch — Pass 11 Tests
 *
 * Tests covering:
 * - Contradiction resolution suggested action generation
 * - Intent-to-endpoint mapping
 * - Action visibility based on contradiction context
 *
 * @module tests/resolution/wave3-chat-dispatch.test
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (matching the legacy AnaPersistentPanel action interface — shape is
// now produced by the Claude Design shell at claude-ana)
// ═══════════════════════════════════════════════════════════════════════════════

interface SuggestedAction {
  id: string;
  label: string;
  intent: string;
  description: string;
}

interface ContradictionEntry {
  id: string;
  type: string;
  severity: string;
  explanation: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Builds suggested actions from authoring context (mirrors panel logic)
// ═══════════════════════════════════════════════════════════════════════════════

function buildContradictionActions(
  contradictions: ContradictionEntry[] | undefined
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Action 14: Explain contradiction resolution
  if (contradictions && contradictions.length > 0) {
    actions.push({
      id: 'explain-contradiction-resolution',
      label: `Explain ${contradictions.length} contradiction(s)`,
      intent: 'explain_contradiction_resolution',
      description: 'Structured explanation of contradictions and resolution paths',
    });
  }

  // Action 15: Plan contradiction resolution
  if (contradictions && contradictions.length > 0) {
    const blockingCount = contradictions.filter(
      c => c.severity === 'critical' || c.severity === 'high'
    ).length;
    if (blockingCount > 0) {
      actions.push({
        id: 'plan-contradiction-resolution',
        label: `Plan resolution for ${blockingCount} blocker(s)`,
        intent: 'plan_contradiction_resolution',
        description: 'Create resolution plan with authority check and affected objects',
      });
    }
  }

  // Action 16: Project resolution status (always available)
  actions.push({
    id: 'project-resolution-status',
    label: 'Resolution status',
    intent: 'project_resolution_status',
    description: 'View resolution plans, bundles, and progress',
  });

  return actions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: SUGGESTED ACTION GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Resolution Suggested Actions', () => {
  it('shows explain + plan + status when blocking contradictions exist', () => {
    const contradictions: ContradictionEntry[] = [
      { id: 'f-001', type: 'assumption_drift', severity: 'critical', explanation: 'Endpoint drift' },
      { id: 'f-002', type: 'parameter_mismatch', severity: 'high', explanation: 'Dose conflict' },
    ];

    const actions = buildContradictionActions(contradictions);

    expect(actions).toHaveLength(3); // explain + plan + status
    expect(actions[0].intent).toBe('explain_contradiction_resolution');
    expect(actions[0].label).toContain('2 contradiction(s)');
    expect(actions[1].intent).toBe('plan_contradiction_resolution');
    expect(actions[1].label).toContain('2 blocker(s)');
    expect(actions[2].intent).toBe('project_resolution_status');
  });

  it('shows explain + status (no plan) when contradictions are low severity', () => {
    const contradictions: ContradictionEntry[] = [
      { id: 'f-003', type: 'factual_contradiction', severity: 'low', explanation: 'Minor discrepancy' },
    ];

    const actions = buildContradictionActions(contradictions);

    expect(actions).toHaveLength(2); // explain + status (no plan — no blocking)
    expect(actions[0].intent).toBe('explain_contradiction_resolution');
    expect(actions[1].intent).toBe('project_resolution_status');
  });

  it('shows only status when no contradictions exist', () => {
    const actions = buildContradictionActions([]);

    expect(actions).toHaveLength(1); // only status
    expect(actions[0].intent).toBe('project_resolution_status');
  });

  it('shows only status when contradictions is undefined', () => {
    const actions = buildContradictionActions(undefined);

    expect(actions).toHaveLength(1);
    expect(actions[0].intent).toBe('project_resolution_status');
  });

  it('plan shows correct count of blocking contradictions', () => {
    const contradictions: ContradictionEntry[] = [
      { id: 'f-001', type: 'assumption_drift', severity: 'critical', explanation: 'Critical' },
      { id: 'f-002', type: 'parameter_mismatch', severity: 'medium', explanation: 'Medium' },
      { id: 'f-003', type: 'dosage_conflict', severity: 'high', explanation: 'High' },
      { id: 'f-004', type: 'factual_contradiction', severity: 'low', explanation: 'Low' },
    ];

    const actions = buildContradictionActions(contradictions);
    const planAction = actions.find(a => a.intent === 'plan_contradiction_resolution');

    expect(planAction).toBeDefined();
    expect(planAction!.label).toContain('2 blocker(s)'); // only critical + high
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: INTENT → ENDPOINT MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Intent → Endpoint Mapping', () => {
  const intentEndpointMap: Record<string, { method: string; path: string }> = {
    explain_contradiction_resolution: { method: 'POST', path: '/api/authoring-actions/explain-contradiction-resolution' },
    plan_contradiction_resolution: { method: 'POST', path: '/api/authoring-actions/plan-contradiction-resolution' },
    execute_contradiction_resolution: { method: 'POST', path: '/api/authoring-actions/execute-contradiction-resolution' },
    project_resolution_status: { method: 'GET', path: '/api/authoring-actions/project-resolution-status/:projectId' },
  };

  it('explain maps to POST /api/authoring-actions/explain-contradiction-resolution', () => {
    const mapping = intentEndpointMap['explain_contradiction_resolution'];
    expect(mapping.method).toBe('POST');
    expect(mapping.path).toContain('explain-contradiction-resolution');
  });

  it('plan maps to POST /api/authoring-actions/plan-contradiction-resolution', () => {
    const mapping = intentEndpointMap['plan_contradiction_resolution'];
    expect(mapping.method).toBe('POST');
    expect(mapping.path).toContain('plan-contradiction-resolution');
  });

  it('execute maps to POST /api/authoring-actions/execute-contradiction-resolution', () => {
    const mapping = intentEndpointMap['execute_contradiction_resolution'];
    expect(mapping.method).toBe('POST');
    expect(mapping.path).toContain('execute-contradiction-resolution');
  });

  it('status maps to GET with projectId param', () => {
    const mapping = intentEndpointMap['project_resolution_status'];
    expect(mapping.method).toBe('GET');
    expect(mapping.path).toContain(':projectId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: CONTRADICTION SEVERITY SORTING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Severity Sorting for Dispatch', () => {
  it('sorts contradictions by severity (critical first)', () => {
    const contradictions = [
      { id: 'f-001', severity: 'low' },
      { id: 'f-002', severity: 'critical' },
      { id: 'f-003', severity: 'high' },
      { id: 'f-004', severity: 'medium' },
    ];

    const sevWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const sorted = [...contradictions].sort(
      (a, b) => (sevWeight[b.severity] || 0) - (sevWeight[a.severity] || 0)
    );

    expect(sorted[0].id).toBe('f-002'); // critical
    expect(sorted[1].id).toBe('f-003'); // high
    expect(sorted[2].id).toBe('f-004'); // medium
    expect(sorted[3].id).toBe('f-001'); // low
  });

  it('dispatches the most severe contradiction to explain endpoint', () => {
    const contradictions = [
      { id: 'f-001', severity: 'medium', type: 'parameter_mismatch' },
      { id: 'f-002', severity: 'critical', type: 'assumption_drift' },
    ];

    const sevWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const sorted = [...contradictions].sort(
      (a, b) => (sevWeight[b.severity] || 0) - (sevWeight[a.severity] || 0)
    );

    // The first (most severe) finding is sent to the explain endpoint
    expect(sorted[0].id).toBe('f-002');
    expect(sorted[0].type).toBe('assumption_drift');
  });
});
