/**
 * Predicate-intelligence AnA tools — contract + guard behavior.
 * The handlers proxy an external shadow service, so live calls aren't exercised
 * here; these lock the contract and the org-context / required-param guards
 * (the ownership + shadow call is covered structurally by the shared helper).
 */

import { describe, it, expect, vi } from 'vitest';

// 2026-09-28: a confirm-class call now also needs an editor role, read from
// organization_users (AnaToolExecutor writeRoleRefusal). The database is mocked
// here, so the confirming person is modelled as a 'member'. The role gate itself
// is tested in confirmed-write-role-gate.test.ts.
const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { PREDICATE_INTELLIGENCE_TOOLS } from '../predicateIntelligenceTools';
import { getToolHandler } from '../AnaToolExecutor';
import { toolAuthorizationOf } from '../tool-authorization';

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
      const out = JSON.parse(await handler!({ program_id: 'p' }, { humanConfirmed: true }));
      // 2026-09-28: suggest_predicate_devices and generate_se_matrix are confirm-class,
      // so the registry refuses them before their handler's own organization guard;
      // get_predicate_defense_preview is a read and still reaches that guard.
      if (name === 'get_predicate_defense_preview') {
        expect(toolAuthorizationOf(name, { program_id: 'p' }).class).toBe('read');
        expect(out.error, name).toMatch(/organization context/);
      } else {
        expect(toolAuthorizationOf(name, { program_id: 'p' }).class).toBe('confirm');
        expect(out.error, name).toMatch(/needs an identified member of the organization/);
        expect(out.error, name).toMatch(/Nothing was changed/);
      }
    }
  });

  it('requires program_id even with org context', async () => {
    const handler = getToolHandler('suggest_predicate_devices')!;
    // 2026-09-28: the confirming person is identified (userId), as in chat; role mocked above.
    const out = JSON.parse(await handler({}, { organizationId: 1, userId: 1, humanConfirmed: true }));
    expect(out.status).toBe('needs_parameters');
  });
});
