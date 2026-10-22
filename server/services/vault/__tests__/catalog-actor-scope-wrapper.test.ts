import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn(), role: vi.fn(), admit: vi.fn(), revalidate: vi.fn(), ambient: { tenantId: '42', role: 'owner' } as any }));
vi.mock('../../../db.js', () => ({ pool: { connect: h.connect } }));
vi.mock('../../../db/tenantStore.js', () => ({ getTenantScope: () => h.ambient }));
vi.mock('../../ana/project-scope-admission.js', async importActual => ({ ...(await importActual<any>()), readActiveAnaActorRole: h.role }));
vi.mock('../../ana/source-read-scope.js', async importActual => ({ ...(await importActual<any>()), admitAnaSourceReadScope: h.admit, revalidateAnaSourceReadScope: h.revalidate }));
import { AnaProjectScopeError } from '../../ana/project-scope-admission.js';
import { withAnaSourceReadScope, revalidateActorSourceScope } from '../document-catalog-actor-access.js';
const program = '10000000-0000-4000-8000-000000000001';
const input = () => ({ organizationId: 42, userId: 7, projectId: 101, projectRef: program });
const scope = () => ({ organizationId: 42, userId: 7, role: 'viewer', projectId: 101, programId: program, accessibleProgramIds: [program], actorFiltered: true as const });
beforeEach(() => {
  vi.resetAllMocks(); h.ambient = { tenantId: '42', role: 'owner' };
  h.query.mockResolvedValue({ rows: [] }); h.connect.mockResolvedValue({ query: h.query, release: h.release });
  h.role.mockResolvedValue('viewer'); h.admit.mockResolvedValue(scope()); h.revalidate.mockResolvedValue(scope());
});
describe('pooled interactive actor source reads', () => {
  it('uses one stamped connection and current persisted viewer role, then re-admits before success', async () => {
    const run = vi.fn(async (q, admitted) => { await q.query('SELECT protected_source'); return admitted.role; });
    expect(await withAnaSourceReadScope(input(), run)).toBe('viewer');
    expect(h.query.mock.calls[0][0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(h.query.mock.calls.find(c => c[0].includes('app.current_tenant_id'))?.[1]).toEqual(['42']);
    expect(h.query.mock.calls.find(c => c[0].includes('app.current_user_role'))?.[1]).toEqual(['viewer']);
    expect(h.role).toHaveBeenCalledWith(expect.objectContaining({ query: h.query }), input());
    expect(h.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(h.revalidate).toHaveBeenCalledOnce(); expect(h.release).toHaveBeenCalledOnce();
  });
  it.each(['missing_actor', 'wrong_tenant', 'no_tenant'])('does not acquire a pool connection without admitted serving identity: %s', async kind => {
    const actor: any = input(); if (kind === 'missing_actor') actor.userId = null;
    if (kind === 'wrong_tenant') h.ambient.tenantId = '8'; if (kind === 'no_tenant') h.ambient = null;
    await expect(withAnaSourceReadScope(actor, vi.fn())).rejects.toMatchObject({ code: 'ANA_SOURCE_ACCESS_DENIED' });
    expect(h.connect).not.toHaveBeenCalled();
  });
  it('inactive actor refuses before protected source callback and rolls back', async () => {
    h.role.mockRejectedValue(new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'Inactive'));
    const run = vi.fn(); await expect(withAnaSourceReadScope(input(), run)).rejects.toMatchObject({ code: 'ANA_PROJECT_ACCESS_DENIED' });
    expect(run).not.toHaveBeenCalled(); expect(h.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK'); expect(h.release).toHaveBeenCalledOnce();
  });
  it('revocation after the protected read refuses the loaded result', async () => {
    h.revalidate.mockRejectedValue(new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_CHANGED', 'Revoked'));
    await expect(withAnaSourceReadScope(input(), async () => 'private source')).rejects.toMatchObject({ code: 'ANA_SOURCE_SCOPE_CHANGED' });
    expect(h.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('role changing between the tenant stamp and canonical admission refuses before the protected read', async () => {
    h.admit.mockResolvedValue({ ...scope(), role: 'member' });
    const run = vi.fn();
    await expect(withAnaSourceReadScope(input(), run)).rejects.toMatchObject({ code: 'ANA_SOURCE_SCOPE_CHANGED' });
    expect(run).not.toHaveBeenCalled();
  });
  it('unknown pool/SQL failure returns named unavailable and never empty', async () => {
    h.connect.mockRejectedValue(new Error('driver credentials should not be output'));
    await expect(withAnaSourceReadScope(input(), vi.fn())).rejects.toMatchObject({ code: 'ANA_SOURCE_ACCESS_UNAVAILABLE' });
  });
  it('copies actor input before any await', async () => {
    const actor = input(); h.role.mockImplementation(async (_q, copy) => { actor.organizationId = 8; actor.userId = 9; actor.projectRef = 'bad'; expect(copy.organizationId).toBe(42); return 'viewer'; });
    await withAnaSourceReadScope(actor, async () => undefined);
    expect(h.admit.mock.calls[0][1]).toEqual(input());
  });
  it('composite result cannot use a newly widened or changed role scope as its old authorization', async () => {
    h.admit.mockResolvedValue({ ...scope(), role: 'member' });
    await expect(revalidateActorSourceScope(input(), scope())).rejects.toMatchObject({ code: 'ANA_SOURCE_SCOPE_CHANGED' });
  });
  it('same pinned scope can finish a composite read', async () => {
    await expect(revalidateActorSourceScope(input(), scope())).resolves.toBeUndefined();
    expect(h.revalidate).toHaveBeenCalledTimes(2);
  });
});
