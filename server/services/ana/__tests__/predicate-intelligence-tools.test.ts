/**
 * Predicate-intelligence AnA tools — contract + guard behavior.
 * The handlers proxy an external shadow service, so live calls aren't exercised
 * here; these lock the contract and the org-context / required-param guards
 * (the ownership + shadow call is covered structurally by the shared helper).
 */

import { describe, it, expect } from 'vitest';

import { PREDICATE_INTELLIGENCE_TOOLS } from '../predicateIntelligenceTools';
import { getToolHandler } from '../AnaToolExecutor';

describe('PREDICATE_INTELLIGENCE_TOOLS contract', () => {
  it('exposes the three discovery/SE tools with object schemas', () => {
    expect(PREDICATE_INTELLIGENCE_TOOLS.map(t => t.name).sort()).toEqual([
      'generate_se_matrix',
      'get_predicate_defense_preview',
      'suggest_predicate_devices',
    ]);
    for (const t of PREDICATE_INTELLIGENCE_TOOLS) {
      expect(t.input_schema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.input_schema.required).toContain('program_id');
    }
  });
});

describe('predicate tool guards', () => {
  it('every handler refuses without organization context', async () => {
    for (const name of ['suggest_predicate_devices', 'generate_se_matrix', 'get_predicate_defense_preview']) {
      const handler = getToolHandler(name);
      expect(handler, `${name} registered`).toBeTypeOf('function');
      const out = JSON.parse(await handler!({ program_id: 'p' }, {}));
      expect(out.error).toMatch(/organization context/);
    }
  });

  it('requires program_id even with org context', async () => {
    const handler = getToolHandler('suggest_predicate_devices')!;
    const out = JSON.parse(await handler({}, { organizationId: 1 }));
    expect(out.status).toBe('needs_parameters');
  });
});
