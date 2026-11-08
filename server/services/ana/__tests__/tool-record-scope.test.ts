/**
 * A program id the model supplies is the caller's organization's, or the tool
 * does not run (P1-34 hand-on 2; tool-record-scope.ts).
 *
 * The unit cases drive the check with an injected verdict; the registry cases
 * prove it is wired into the wrapper every handler is registered through, so a
 * handler never runs — read or write — for another tenant's program.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ownership = vi.hoisted(() => ({ ours: new Set<string>(['11111111-1111-4111-8111-111111111111']), unavailable: false }));
// The one program check (server/services/c2c/program-access.ts), answered by the test.
const programCheck = vi.hoisted(() => async (_db: unknown, programId: string) => {
  if (ownership.unavailable) throw Object.assign(new Error('program ownership check could not be run'), { name: 'VerificationUnavailableError' });
  return ownership.ours.has(programId);
});
vi.mock('../../c2c/program-access', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: programCheck,
}));
vi.mock('../../c2c/program-access.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: programCheck,
}));
const { resolveSignerOrgRole } = vi.hoisted(() => ({ resolveSignerOrgRole: vi.fn(async () => 'member') }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));
// The registry's mandatory-skill check (governed-tool-gate.ts, P-104) reads the
// organisation's rules from the database; here the organisation has none, so the
// program check is what these cases see (as in nonclinical-drafts-refuse-model-figures.test.ts).
vi.mock('../governed-tool-gate.js', async orig => ({
  ...await orig<typeof import('../governed-tool-gate.js')>(),
  loadToolSkillGates: async (scope?: { organizationId?: number; userId?: number; projectId?: number }) => scope?.organizationId
    ? { organizationId: scope.organizationId, userId: scope.userId ?? null, projectId: scope.projectId ?? null,
      rules: [], ruleHash: 'e'.repeat(64) } : null,
}));

import { foreignProgramRefusal, foreignRecordRefusal, RECORD_SCOPES } from '../tool-record-scope';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { getToolHandler, registerToolHandler } from '../AnaToolExecutor.js';

const OURS = '11111111-1111-4111-8111-111111111111';
const THEIRS = '22222222-2222-4222-8222-222222222222';

describe('foreignProgramRefusal', () => {
  const check = vi.fn(async (id: string) => id === OURS);
  beforeEach(() => check.mockClear());

  it('lets through a call that names no program, without asking', async () => {
    expect(await foreignProgramRefusal({ title: 'x' }, 7, check)).toBeNull();
    expect(await foreignProgramRefusal({ program_id: '   ' }, 7, check)).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it("lets through the caller's own program", async () => {
    expect(await foreignProgramRefusal({ program_id: OURS }, 7, check)).toBeNull();
    expect(check).toHaveBeenCalledWith(OURS, 7);
  });

  it.each(['program_id', 'programId', 'device_program_id'])("refuses another tenant's program in %s, without echoing it", async field => {
    const out = await foreignProgramRefusal({ [field]: THEIRS }, 7, check);
    expect(out?.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
    expect(out?.result).not.toContain(THEIRS);
    expect(JSON.parse(out!.result).error).toMatch(new RegExp(`${field} does not name one of this organization's programs`));
  });

  it('checks every program a call names', async () => {
    const out = await foreignProgramRefusal({ program_id: OURS, device_program_id: THEIRS }, 7, check);
    expect(out?.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
  });

  it('refuses without an organization rather than guessing', async () => {
    expect((await foreignProgramRefusal({ program_id: OURS }, null, check))?.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
    expect(check).not.toHaveBeenCalled();
  });

  it('refuses when ownership cannot be checked, rather than passing', async () => {
    const broken = vi.fn(async () => {
      throw new Error('no registry could be read');
    });
    expect((await foreignProgramRefusal({ program_id: OURS }, 7, broken))?.code).toBe('PROGRAM_CHECK_UNAVAILABLE');
  });
});

describe('the registry wrapper', () => {
  const probe = vi.fn(async () => JSON.stringify({ ok: true }));
  registerToolHandler('zz_program_scope_probe', probe);
  const CTX = { organizationId: 7, userId: 3, humanConfirmed: true };
  const run = async (input: Record<string, unknown>, ctx: Record<string, unknown> = CTX) =>
    JSON.parse(await getToolHandler('zz_program_scope_probe')!(input, ctx as never));

  beforeEach(() => {
    probe.mockClear();
    ownership.unavailable = false;
  });

  it("never runs a handler for another tenant's program", async () => {
    const out = await run({ program_id: THEIRS });
    expect(out.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
    expect(probe).not.toHaveBeenCalled();
  });

  it("runs it for the caller's own", async () => {
    await run({ programId: OURS });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('does not run it when ownership cannot be checked', async () => {
    ownership.unavailable = true;
    expect((await run({ program_id: OURS })).code).toBe('PROGRAM_CHECK_UNAVAILABLE');
    expect(probe).not.toHaveBeenCalled();
  });

  it('covers the real tools too: a read for another tenant is refused before it reads', async () => {
    const out = JSON.parse(await getToolHandler('list_project_documents')!({ program_id: THEIRS }, CTX as never));
    expect(out.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
  });

  // Since b602ecad97 (2026-10-30) an RBM tool is admitted by RBM's own gate first
  // (rbm-access.ts rbmToolAdmissionRefusal: an identified member, the RBM
  // entitlement, the program's admission). Another tenant's program is not found there.
  it("an RBM read for another tenant's program is refused by RBM's own admission, before it reads", async () => {
    const out = JSON.parse(await getToolHandler('get_rbm_attention')!({ programId: THEIRS }, CTX as never));
    expect(out.code).toBe('PROJECT_NOT_FOUND');
    const anonymous = JSON.parse(await getToolHandler('get_rbm_attention')!({ programId: THEIRS }, { organizationId: 7 } as never));
    expect(anonymous.code).toBe('RBM_ACTOR_REQUIRED');
  });
});

describe('foreignRecordRefusal — record ids other than programs', () => {
  const found = { rows: [{ one: 1 }] };
  const none = { rows: [] };

  it('asks the ownership query for the named record, with the caller as organization', async () => {
    const query = vi.fn(async () => found);
    expect(await foreignRecordRefusal('log_study_ae', { study_id: 4, site_id: 9 }, 7, query)).toBeNull();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('clinical_study_sites'), [9, 7]);
  });

  it("refuses another tenant's record", async () => {
    const out = await foreignRecordRefusal('add_risk_control', { risk_item_id: 1, new_risk_item_id: 99 }, 7, async () => none);
    expect(out?.code).toBe('RECORD_NOT_IN_ORGANIZATION');
    expect(JSON.parse(out!.result).error).toMatch(/new_risk_item_id does not name one of this organization's records/);
  });

  it('checks an assessment through the package that owns it', async () => {
    const query = vi.fn(async () => none);
    const out = await foreignRecordRefusal('simulate_reviewer_challenges', { package_id: 1, assessment_id: 5 }, 7, query);
    expect(out?.code).toBe('RECORD_NOT_IN_ORGANIZATION');
    expect((query.mock.calls as unknown as Array<[string]>)[0][0]).toMatch(/JOIN c2c_submission_packages p ON p\.id = a\.package_id[\s\S]*p\.org_id = \$2/);
  });

  it('ignores an absent id and a tool with no scopes', async () => {
    const query = vi.fn(async () => none);
    expect(await foreignRecordRefusal('log_study_ae', { study_id: 4 }, 7, query)).toBeNull();
    expect(await foreignRecordRefusal('list_vault_documents', { site_id: 9 }, 7, query)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses when the check cannot run', async () => {
    const out = await foreignRecordRefusal('qms_change_create', { qms_document_id: 3 }, 7, async () => {
      throw new Error('db down');
    });
    expect(out?.code).toBe('RECORD_CHECK_UNAVAILABLE');
  });

  it('every scoped tool is registered and still declares the field it scopes', () => {
    for (const [tool, scopes] of Object.entries(RECORD_SCOPES)) {
      expect(getToolHandler(tool), tool).toBeTypeOf('function');
      const def = ALL_ANA_TOOLS.find(t => t.name === tool);
      for (const { field } of scopes) {
        expect(Object.keys(def?.input_schema.properties ?? {}), `${tool}.${field}`).toContain(field);
      }
    }
  });
});
