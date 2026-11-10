/**
 * POST /tasks with moduleData.vaultDocumentCode (S12 gap 5, slice 2): a work project assigned to produce a Vault family.
 * The route asks the one shared check (vault-citation-changes.ts requireAssignedVaultFamily, pinned on PGlite in
 * vault-family-in-program.pglite.test.ts) on the request's transaction, after the task's project is admitted. Its
 * refusal is 409 VAULT_FAMILY_NOT_IN_PROGRAM in its own words, with nothing written. Same harness as the
 * governed-write tests; the check itself is stood in here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../db', async () => (await import('./_task-management-governed-harness')).dbModule());
vi.mock('../c2c/actions', async () => (await import('./_task-management-governed-harness')).ledgerModule());
vi.mock('../../services/tasking/task-side-effects', async () => (await import('./_task-management-governed-harness')).sideEffectsModule());
vi.mock('../../services/notifications/notification-service', async () => (await import('./_task-management-governed-harness')).notificationModule());
vi.mock('../../services/tasking/task-signoff', async () => (await import('./_task-management-governed-harness')).signoffModule());
vi.mock('../../services/tasking/task-planning', async () => (await import('./_task-management-governed-harness')).planningModule());
const check = vi.hoisted(() => ({ fn: vi.fn(async (..._a: unknown[]): Promise<unknown> => null) }));
vi.mock('../../services/clinical-regulatory-evidence/vault-citation-changes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/clinical-regulatory-evidence/vault-citation-changes')>()),
  requireAssignedVaultFamily: check.fn,
}));

import taskManagementRoutes from '../taskManagement.routes';
import { VaultFamilyRefusal } from '../../services/clinical-regulatory-evidence/vault-citation-changes';
import { h, appFactory, BASE, wrote, resetHarness } from './_task-management-governed-harness';

const makeApp = appFactory(taskManagementRoutes);
const PROGRAM = '6065271c-d4b0-4936-aad1-02855423a738';
const assignment = {
  title: 'Deliver: Drug substance CMC', moduleType: 'Plan', moduleSource: 'project-work-projects', category: 'work-project',
  taskType: 'work-project', projectId: 14, sourceEntityType: 'work_project', sourceEntityId: `${PROGRAM}:101`,
  moduleData: { programId: PROGRAM, workProjectId: 101, workKind: 'cmc', vaultDocumentCode: 'DS-SPEC' },
};

beforeEach(() => { resetHarness(); check.fn.mockReset(); check.fn.mockResolvedValue({ id: 'v2', version: '2.0', title: 'Spec', documentCode: 'DS-SPEC' }); });

describe('POST /tasks — a work project assigned to produce a Vault family (S12 gap 5)', () => {
  it('asks the shared check on the request\'s transaction, with the admitted project and the body\'s moduleData', async () => {
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(assignment);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(check.fn).toHaveBeenCalledOnce();
    const [, orgId, projectId, moduleData] = check.fn.mock.calls[0];
    expect([orgId, projectId, moduleData]).toEqual([2, 14, assignment.moduleData]);
    expect(h.log[0]).toBe('BEGIN');
    expect(h.log.at(-1)).toBe('COMMIT');
  });

  it('refuses a family that is not in the project\'s program: 409 in its own words, nothing written', async () => {
    check.fn.mockRejectedValue(new VaultFamilyRefusal());
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(assignment);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, code: 'VAULT_FAMILY_NOT_IN_PROGRAM',
      error: 'That Vault document is not in this project’s Vault. Nothing was assigned.' });
    expect(wrote()).toEqual([]);
    expect(h.log).toEqual(['BEGIN', 'ROLLBACK']);
  });
});
