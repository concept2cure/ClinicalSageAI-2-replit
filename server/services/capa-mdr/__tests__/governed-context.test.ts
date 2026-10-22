/** Transaction uncertainty, actor admission and critical-audit contract.
 * Native domain SQL/rollback/concurrency proof is kept in the DB test lane. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapaCaller } from '../governed-context';

const state = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn(), actor: vi.fn(), authorize: vi.fn(), scope: undefined as { tenantId: string } | undefined }));
vi.mock('../../../db', () => ({ pool: { connect: state.connect } }));
vi.mock('../../../db/tenantStore', () => ({ getTenantScope: () => state.scope }));
vi.mock('../../csr/project-scope', () => ({ readCsrProjectActor: state.actor }));
vi.mock('../../authoring/authoring-program-access', async importOriginal => ({
  ...(await importOriginal<typeof import('../../authoring/authoring-program-access')>()), authorizeAuthoringProgram: state.authorize,
}));
import { authorizeCapaProgram, capaContext, CapaAccessError, CapaPersistenceError, mutateCapa, readCapa, visibleCapaPrograms } from '../governed-context';
import { AuthoringProgramAccessError } from '../../authoring/authoring-program-access';

beforeEach(() => {
  state.query.mockReset(); state.release.mockReset(); state.connect.mockReset(); state.actor.mockReset(); state.authorize.mockReset();
  state.query.mockImplementation(async sql => ({ rows: /SELECT id FROM (regulatory_programs|projects)/.test(sql) ? [{ id: 1 }] : [] }));
  state.connect.mockResolvedValue({ query: state.query, release: state.release });
  state.actor.mockResolvedValue({ userId: 7, role: 'member' });
  state.authorize.mockResolvedValue({ role: 'member', projectId: 1 });
  state.scope = { tenantId: '1' };
});

const auditedAction = async () => {
  const active = capaContext();
  active.auditWrites++;
  active.recovery = { recordId: 'record-1', recoveryUrl: '/api/capa-mdr/capa/record-1' };
  return { id: 'record-1', state: 'open' };
};

describe('CAPA transaction completion and current authority', () => {
  it.each([undefined, { userId: NaN }, { userId: 0 }, { userId: 1.1 }])('refuses a missing or malformed trusted actor before connecting: %j', async caller => {
    await expect(mutateCapa(1, caller as CapaCaller, auditedAction)).rejects.toBeInstanceOf(CapaAccessError);
    expect(state.connect).not.toHaveBeenCalled();
  });

  it('uses the verified caller/current role rather than a stale or supplied role', async () => {
    state.actor.mockResolvedValueOnce({ userId: 7, role: 'viewer' });
    const action = vi.fn(auditedAction);
    await expect(mutateCapa(1, { userId: 7 }, action)).rejects.toBeInstanceOf(CapaAccessError);
    expect(action).not.toHaveBeenCalled();
    expect(state.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('refuses a caller from another active tenant scope and does not run the action', async () => {
    state.scope = { tenantId: '2' };
    const action = vi.fn(auditedAction);
    await expect(mutateCapa(1, { userId: 7 }, action)).rejects.toBeInstanceOf(CapaAccessError);
    expect(action).not.toHaveBeenCalled();
    expect(state.actor).not.toHaveBeenCalled();
  });

  it('cannot commit a mutation that omitted its critical audit write', async () => {
    await expect(mutateCapa(1, { userId: 7 }, async () => ({ id: 'unrecorded' })))
      .rejects.toMatchObject({ code: 'CAPA_AUDIT_UNAVAILABLE' });
    expect(state.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('returns the truthful success receipt only after confirmed commit', async () => {
    const result = await mutateCapa(1, { userId: 7 }, auditedAction);
    expect(result).toEqual({ id: 'record-1', state: 'open', auditTrail: { persisted: true, chained: true } });
    expect(state.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(state.release).toHaveBeenCalledWith(false);
  });

  it('does not claim rollback after a lost commit completion and supplies record readback', async () => {
    state.query.mockImplementation(async sql => {
      if (sql === 'COMMIT') throw Object.assign(new Error('Synthetic completion loss'), { code: 'ECONNRESET' });
      return { rows: [] };
    });
    await expect(mutateCapa(1, { userId: 7 }, auditedAction)).rejects.toMatchObject({
      status: 503, code: 'CAPA_COMMIT_UNCONFIRMED', recovery: { recordId: 'record-1', recoveryUrl: '/api/capa-mdr/capa/record-1' },
    });
    expect(state.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(state.release).toHaveBeenCalledWith(true);
  });

  it('rolls back a known critical-audit refusal before any commit attempt', async () => {
    await expect(mutateCapa(1, { userId: 7 }, async () => { throw new CapaPersistenceError('CAPA_AUDIT_UNAVAILABLE'); }))
      .rejects.toMatchObject({ code: 'CAPA_AUDIT_UNAVAILABLE' });
    expect(state.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('contains a failed connection without running business code or leaking store details', async () => {
    state.connect.mockRejectedValueOnce(new Error('Synthetic sensitive connection target'));
    await expect(mutateCapa(1, { userId: 7 }, auditedAction)).rejects.toMatchObject({ code: 'CAPA_PERSISTENCE_UNAVAILABLE' });
    expect(state.query).not.toHaveBeenCalled();
  });

  it('allows a current viewer to read but never adds a mutation audit receipt', async () => {
    state.actor.mockResolvedValueOnce({ userId: 7, role: 'viewer' });
    expect(await readCapa(1, { userId: 7 }, async () => [{ id: 'readable' }])).toEqual([{ id: 'readable' }]);
    expect(state.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'COMMIT']);
  });

  it('uses canonical private-program authority on the same transaction before locking the programme', async () => {
    const result = await mutateCapa(1, { userId: 7 }, async () => {
      await authorizeCapaProgram('33333333-3333-4333-8333-333333333333');
      return auditedAction();
    });
    expect(result.auditTrail.chained).toBe(true);
    expect(state.authorize).toHaveBeenCalledWith(expect.objectContaining({ query: state.query }), {
      tenantId: 1, actor: { id: '7', email: '' }, programId: '33333333-3333-4333-8333-333333333333', forWrite: true,
    });
    expect(state.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', expect.stringContaining('regulatory_programs'),
      expect.stringContaining('FROM projects'), expect.stringContaining('project_visibility_settings'),
      expect.stringContaining('project_members'), expect.stringContaining('concept2cure_review_assignments'), 'COMMIT']);
    expect(state.authorize).toHaveBeenCalledTimes(2);
  });

  it('propagates canonical unresolved-anchor refusal and does not substitute a programme policy', async () => {
    state.authorize.mockRejectedValueOnce(new AuthoringProgramAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', 'Canonical project relationship required.'));
    await expect(mutateCapa(1, { userId: 7 }, async () => { await authorizeCapaProgram('unanchored'); return auditedAction(); }))
      .rejects.toMatchObject({ status: 409, code: 'PROJECT_ANCHOR_UNRESOLVED' });
    expect(state.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('does not disguise a lost actor during list admission as an empty queue', async () => {
    state.query.mockImplementation(async sql => ({ rows: /SELECT id::text/.test(sql) ? [{ id: '33333333-3333-4333-8333-333333333333' }] : [] }));
    state.authorize.mockRejectedValueOnce(new AuthoringProgramAccessError(403, 'IMPORT_WRITE_PERMISSION_DENIED', 'Current member no longer admitted.'));
    await expect(readCapa(1, { userId: 7 }, () => visibleCapaPrograms())).rejects.toMatchObject({ status: 403, code: 'IMPORT_WRITE_PERMISSION_DENIED' });
    expect(state.query.mock.calls.map(call => call[0])).not.toContain('COMMIT');
  });
});
