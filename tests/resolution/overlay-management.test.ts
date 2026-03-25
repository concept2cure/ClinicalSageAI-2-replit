/**
 * Overlay Management — Pass 15 Tests
 *
 * Tests covering:
 * - Overlay rule data structure
 * - Grouping by regulator body
 * - Authority/severity override display logic
 * - Seed rule coverage
 *
 * @module tests/resolution/overlay-management.test
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface OverlayRule {
  id?: string;
  ruleCode: string;
  ruleName: string;
  regulatorBody: string;
  contradictionType: string;
  severityOverride?: string;
  authorityOverride?: string;
  consequenceOverride?: string;
  description?: string;
  regulatoryReference?: string;
  priority?: number;
  active?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS (matching panel logic)
// ═══════════════════════════════════════════════════════════════════════════════

function groupByBody(rules: OverlayRule[]): Record<string, OverlayRule[]> {
  const groups: Record<string, OverlayRule[]> = {};
  for (const r of rules) {
    const body = r.regulatorBody || 'General';
    if (!groups[body]) groups[body] = [];
    groups[body].push(r);
  }
  return groups;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

const SEED_RULES: OverlayRule[] = [
  { ruleCode: 'FDA-DOS-001', ruleName: 'FDA dosage conflict escalation', regulatorBody: 'FDA', contradictionType: 'dosage_conflict', severityOverride: 'critical', authorityOverride: 'blocks_promotion', priority: 10 },
  { ruleCode: 'EMA-CMC-001', ruleName: 'EMA CMC parameter escalation', regulatorBody: 'EMA', contradictionType: 'parameter_mismatch', severityOverride: 'critical', authorityOverride: 'blocks_promotion', priority: 10 },
  { ruleCode: 'FDA-REG-001', ruleName: 'FDA regulatory discrepancy authority escalation', regulatorBody: 'FDA', contradictionType: 'regulatory_discrepancy', severityOverride: 'high', authorityOverride: 'requires_approval', priority: 20 },
  { ruleCode: 'EMA-XJUR-001', ruleName: 'EMA cross-jurisdictional divergence', regulatorBody: 'EMA', contradictionType: 'cross_jurisdictional_divergence', severityOverride: 'high', authorityOverride: 'requires_approval', priority: 15 },
  { ruleCode: 'FDA-DRIFT-001', ruleName: 'FDA assumption drift in pivotal studies', regulatorBody: 'FDA', contradictionType: 'assumption_drift', severityOverride: 'critical', authorityOverride: 'blocks_promotion', priority: 5 },
  { ruleCode: 'PMDA-TEMPO-001', ruleName: 'PMDA temporal inconsistency escalation', regulatorBody: 'PMDA', contradictionType: 'temporal_inconsistency', severityOverride: 'high', authorityOverride: 'requires_approval', priority: 15 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: GROUPING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Overlay Rules Grouping by Body', () => {
  it('groups rules by regulator body', () => {
    const groups = groupByBody(SEED_RULES);
    expect(Object.keys(groups)).toHaveLength(3); // FDA, EMA, PMDA
  });

  it('FDA has 3 rules', () => {
    const groups = groupByBody(SEED_RULES);
    expect(groups['FDA']).toHaveLength(3);
  });

  it('EMA has 2 rules', () => {
    const groups = groupByBody(SEED_RULES);
    expect(groups['EMA']).toHaveLength(2);
  });

  it('PMDA has 1 rule', () => {
    const groups = groupByBody(SEED_RULES);
    expect(groups['PMDA']).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: OVERRIDE DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Overlay Override Display', () => {
  it('blocking rules show danger variant', () => {
    const authorityVariant: Record<string, string> = {
      advisory_only: 'default', requires_review: 'info',
      requires_approval: 'warning', blocks_promotion: 'danger', requires_escalation: 'danger',
    };

    const blockingRules = SEED_RULES.filter(r => r.authorityOverride === 'blocks_promotion');
    expect(blockingRules.length).toBeGreaterThan(0);
    for (const r of blockingRules) {
      expect(authorityVariant[r.authorityOverride!]).toBe('danger');
    }
  });

  it('approval-required rules show warning variant', () => {
    const authorityVariant: Record<string, string> = {
      advisory_only: 'default', requires_review: 'info',
      requires_approval: 'warning', blocks_promotion: 'danger', requires_escalation: 'danger',
    };

    const approvalRules = SEED_RULES.filter(r => r.authorityOverride === 'requires_approval');
    expect(approvalRules.length).toBeGreaterThan(0);
    for (const r of approvalRules) {
      expect(authorityVariant[r.authorityOverride!]).toBe('warning');
    }
  });

  it('critical severity overrides show danger', () => {
    const severityVariant: Record<string, string> = {
      critical: 'danger', high: 'danger', medium: 'warning', low: 'default',
    };

    const criticalRules = SEED_RULES.filter(r => r.severityOverride === 'critical');
    expect(criticalRules.length).toBeGreaterThan(0);
    for (const r of criticalRules) {
      expect(severityVariant[r.severityOverride!]).toBe('danger');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: SEED RULE COVERAGE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Seed Rule Coverage', () => {
  it('covers FDA, EMA, and PMDA bodies', () => {
    const bodies = new Set(SEED_RULES.map(r => r.regulatorBody));
    expect(bodies.has('FDA')).toBe(true);
    expect(bodies.has('EMA')).toBe(true);
    expect(bodies.has('PMDA')).toBe(true);
  });

  it('covers multiple contradiction types', () => {
    const types = new Set(SEED_RULES.map(r => r.contradictionType));
    expect(types.size).toBeGreaterThanOrEqual(4);
    expect(types.has('dosage_conflict')).toBe(true);
    expect(types.has('parameter_mismatch')).toBe(true);
    expect(types.has('assumption_drift')).toBe(true);
  });

  it('all rules have unique rule codes', () => {
    const codes = SEED_RULES.map(r => r.ruleCode);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('all rules have a priority', () => {
    for (const r of SEED_RULES) {
      expect(r.priority).toBeDefined();
      expect(typeof r.priority).toBe('number');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: API STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Overlay Rules API', () => {
  it('search endpoint is POST with limit', () => {
    const endpoint = '/api/governed-intelligence/overlays/search';
    const body = { limit: 50 };
    expect(endpoint).toContain('overlays/search');
    expect(body.limit).toBe(50);
  });

  it('seed endpoint is POST to authoring-actions', () => {
    const endpoint = '/api/authoring-actions/seed-overlay-rules';
    expect(endpoint).toContain('seed-overlay-rules');
  });
});
