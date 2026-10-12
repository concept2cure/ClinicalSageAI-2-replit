/**
 * The programme-configuration register: the branch of the ONE commit path
 * that writes a `project_setup` interview onto the programme record
 * (task #15).
 *
 * The projection is tested in services/c2c/__tests__; this is the execution —
 * which write it calls, under whose tenant, against which actor, and what it
 * refuses before writing anything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  applied: [] as Array<Record<string, unknown>>,
  isProgramme: true,
}));

vi.mock('../../c2c/programme-profile-write.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../c2c/programme-profile-write')>();
  return {
    ...actual,
    applyProgrammeProfilePatch: async (_deps: unknown, params: Record<string, unknown>) => {
      H.applied.push(params);
      return { fields: Object.keys(params.patch as object), auditDetails: {} };
    },
  };
});
vi.mock('../../c2c/program-access.js', () => ({
  programInOrganization: async () => H.isProgramme,
}));
vi.mock('../../../db.js', () => ({ db: {}, getPool: () => ({}) }));
vi.mock('../../auditService.js', () => ({ default: { logAction: async () => ({ persisted: true }) } }));

import { productionRegisterValidator, productionRegisterWriter } from '../interview-commit';
import type { InterviewCommitPlanEntry } from '../interview-commit';

const ENTRY: InterviewCommitPlanEntry = {
  key: 'programme_configuration:project_setup',
  register: 'programme_configuration',
  body: { deviceClass: 'II', priority: 'high' },
  source: { nodeIds: ['project_setup'], fieldIds: ['deviceClass', 'priority'] },
};

const SCOPE = { organizationId: 9, projectId: 'b1f0c9de-5a22-4f3e-9c10-2d6a7e4b8c31', userId: 7 };

beforeEach(() => {
  H.applied = [];
  H.isProgramme = true;
});

describe('the writer', () => {
  it('configures the SESSION’s programme, never one the plan names', async () => {
    const result = await productionRegisterWriter({ ...ENTRY, body: { ...ENTRY.body, programId: 'someone-else' } }, SCOPE);
    expect(H.applied).toHaveLength(1);
    expect(H.applied[0]!.programId).toBe(SCOPE.projectId);
    expect(H.applied[0]!.organizationId).toBe(9);
    expect(result.id).toBe(SCOPE.projectId);
  });

  it('records its own action, so the interview’s write is not read as the device panel’s', async () => {
    await productionRegisterWriter(ENTRY, SCOPE);
    expect(H.applied[0]!.action).toBe('PROGRAMME_CONFIGURED_BY_INTERVIEW');
  });

  it('refuses a session with no user rather than auditing against nobody', async () => {
    /* Part 11 §11.10(e): an inspector asks WHO configured the programme. The
       commit reports the write failure like any other. */
    await expect(productionRegisterWriter(ENTRY, { ...SCOPE, userId: null })).rejects.toThrow(/has no user/);
    expect(H.applied, 'and nothing was written').toEqual([]);
  });
});

describe('the validator, which runs over the whole plan before the first write', () => {
  it('passes a configuration the record accepts', async () => {
    expect(await productionRegisterValidator(ENTRY, SCOPE)).toBeNull();
  });

  it('refuses one it does not, naming the fields', async () => {
    const refusal = await productionRegisterValidator(
      { ...ENTRY, body: { deviceClass: 'IIa' } },
      SCOPE,
    );
    expect(refusal, 'the MDR class has no column and must not be coerced').toMatch(/deviceClass/);
  });

  it('refuses an empty configuration', async () => {
    expect(await productionRegisterValidator({ ...ENTRY, body: {} }, SCOPE)).toMatch(/not one the record accepts/);
  });

  it('refuses a session bound to a legacy project rather than a programme', async () => {
    /* `projectBelongsToTenant` admits either, because the CMC registers hang
       off both. The configuration goes onto the PROGRAMME record, so a legacy
       id would update nothing while the commit reported success. */
    H.isProgramme = false;
    expect(await productionRegisterValidator(ENTRY, SCOPE)).toMatch(/legacy project/);
  });
});
