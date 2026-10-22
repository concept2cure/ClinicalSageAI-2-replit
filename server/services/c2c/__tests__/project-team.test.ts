/** Projection contract only; HTTP/native suites exercise the real access policy. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectTeam } from '../project-team';
import { ProgramReadAccessError, requireCurrentProgramAccess, type CurrentProgramAccess } from '../current-program-access';

vi.mock('../current-program-access', async original => {
  const real = await original<typeof import('../current-program-access')>();
  return { ...real, requireCurrentProgramAccess: vi.fn() };
});

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const ACCESS: CurrentProgramAccess = {
  actor: { userId: 5, role: 'member' }, programId: PROGRAM, projectId: 11, clientWorkspaceId: 71,
};
const checkAccess = vi.mocked(requireCurrentProgramAccess);
type Row = Record<string, unknown>;

function fixture(options: { roster?: Row[]; members?: Row[]; people?: Row[]; fail?: 'roster' | 'members' | 'accounts' } = {}) {
  const query = vi.fn(async (text: string, _params?: unknown[]) => {
    const part = text.includes('project-team:roster') ? 'roster'
      : text.includes('FROM project_members') ? 'members' : 'accounts';
    if (part === options.fail) throw Object.assign(new Error('private database failure'), { code: '42P01' });
    if (part === 'roster') return { rows: options.roster ?? [{
      lead_user_id: 5, owner_id: 6, created_by_id: 7, team_members: ['Recorded person'], settings: {}, visibility: 'private',
    }] };
    if (part === 'members') return { rows: options.members ?? [{ user_id: 8, role: 'edit', status: 'active' }] };
    const ids = _params?.[1] as number[];
    const people = options.people ?? [5, 6, 7, 8].map(id => ({ id, name: `Person ${id}`, email: `person${id}@example.test` }));
    return { rows: people.filter(person => ids.includes(Number(person.id))).map(person => ({ membership_role: 'member', ...person })) };
  });
  return { query };
}
const ask = (q = fixture()) => readProjectTeam(q, { organizationId: 7, access: ACCESS });

beforeEach(() => { checkAccess.mockReset().mockResolvedValue(ACCESS); });

describe('recorded responsibility and canonical sharing remain separate', () => {
  it('uses each recorded source and never infers contributor, reviewer, approver, or observer', async () => {
    const result = await ask();
    expect(result).toMatchObject({ program_id: PROGRAM, project_id: 11 });
    expect(result.team).toEqual([
      expect.objectContaining({ user_id: 5, role: 'lead', responsibilities: ['project_lead'], sharing_role: null, sources: ['program_lead'] }),
      expect.objectContaining({ user_id: 6, role: null, responsibilities: ['project_owner'], sharing_role: 'owner', sources: ['project_owner'] }),
      expect.objectContaining({ user_id: 7, role: null, responsibilities: [], sharing_role: 'owner', sources: ['project_creator'] }),
      expect.objectContaining({ user_id: 8, role: null, responsibilities: [], sharing_role: 'edit', sources: ['project_member'] }),
      { entry_id: 'recorded-name:0', user_id: null, role: null, name: 'Recorded person', email: null,
        identity: 'recorded_name', label: 'Recorded person', responsibilities: [], sharing_role: null, sources: ['recorded_name'] },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/assigned_at|addedAt|reviewer|approver|observer|contributor/);
  });

  it('deduplicates only IDs while preserving lead, owner, creator, and durable member sources', async () => {
    const q = fixture({ roster: [{ lead_user_id: 5, owner_id: 5, created_by_id: 5, team_members: [], settings: {} }],
      members: [{ user_id: 5, role: 'use', status: 'active' }], people: [{ id: 5, name: 'Same person', email: null }] });
    expect((await ask(q)).team).toEqual([expect.objectContaining({ user_id: 5, role: 'lead',
      responsibilities: ['project_lead', 'project_owner'], sharing_role: 'use',
      sources: ['program_lead', 'project_owner', 'project_creator', 'project_member'] })]);
  });

  it('ignores revoked rows but retains an independent owner or lead reference', async () => {
    const q = fixture({ members: [{ user_id: 8, role: 'edit', status: 'revoked' }, { user_id: 6, role: 'edit', status: 'revoked' }] });
    const result = await ask(q);
    expect(result.team.some(row => row.user_id === 8)).toBe(false);
    expect(result.team.find(row => row.user_id === 6)).toMatchObject({ sharing_role: 'owner', sources: ['project_owner'] });
  });

  it('does not take access roles from legacy JSON sharing when durable membership was read', async () => {
    const q = fixture({ roster: [{ lead_user_id: 5, owner_id: null, created_by_id: null, team_members: [],
      settings: { projectSharing: { members: [{ userId: 5, role: 'owner', status: 'active' }] } } }], members: [] });
    expect((await ask(q)).team[0].sharing_role).toBeNull();
  });
});

describe('current identity and recorded names', () => {
  it('keeps same-name accounts and a same-name legacy entry distinct, without matching email', async () => {
    const q = fixture({ roster: [{ lead_user_id: 5, owner_id: 6, created_by_id: null, team_members: ['Jordan', 'Jordan'], settings: {} }],
      members: [], people: [{ id: 5, name: 'Jordan', email: 'same@example.test' }, { id: 6, name: 'Jordan', email: 'same@example.test' }] });
    const result = await ask(q);
    expect(result.team.map(row => row.entry_id)).toEqual(['user:5', 'user:6', 'recorded-name:0', 'recorded-name:1']);
    expect(result.team[0].label).not.toBe(result.team[1].label);
    expect(result.team.slice(2).every(row => row.user_id === null && row.email === null && row.sharing_role === null)).toBe(true);
  });

  it('retains unconfirmed account references without names, emails, or sharing', async () => {
    const result = await ask(fixture({ people: [] }));
    for (const row of result.team.filter(member => member.user_id !== null)) {
      expect(row).toMatchObject({ identity: 'unconfirmed_account', name: null, email: null, sharing_role: null });
      expect(row.label).toContain('Current membership not confirmed');
      expect(row.label).toContain(String(row.user_id));
    }
    expect(result.team[0]).toMatchObject({ role: 'lead', responsibilities: ['project_lead'] });
  });

  it('uses the shared member label convention for same names with distinct email addresses', async () => {
    const result = await ask(fixture({ people: [
      { id: 5, name: 'Same name', email: 'first@example.test' }, { id: 6, name: 'Same name', email: 'second@example.test' },
    ] }));
    expect(result.team[0].label).toBe('Same name · first@example.test');
    expect(result.team[1].label).toBe('Same name · second@example.test');
  });

  it('uses an account reference when an active member has no display name or email', async () => {
    const result = await ask(fixture({ people: [{ id: 5, name: ' ', email: null }] }));
    expect(result.team[0]).toMatchObject({ identity: 'active_member', name: null, email: null, label: 'Account #5' });
  });

  it('retains canonical profile object names and legacy strings only as unlinked recorded names', async () => {
    const q = fixture({ roster: [{ lead_user_id: null, owner_id: null, created_by_id: null,
      team_members: [{ name: '  Canonical contact  ' }, { userId: 99, name: 'Named contact', role: 'approver', email: 'claim@example.test' },
        { name: ' ' }, '  Legacy contact  ', { name: 99 }, null, [], {}], settings: {} }], members: [], people: [] });
    const result = await ask(q);
    expect(result.team).toEqual([
      { entry_id: 'recorded-name:0', user_id: null, role: null, name: 'Canonical contact', email: null,
        identity: 'recorded_name', label: 'Canonical contact', responsibilities: [], sharing_role: null, sources: ['recorded_name'] },
      { entry_id: 'recorded-name:1', user_id: null, role: null, name: 'Named contact', email: null,
        identity: 'recorded_name', label: 'Named contact', responsibilities: [], sharing_role: null, sources: ['recorded_name'] },
      { entry_id: 'recorded-name:3', user_id: null, role: null, name: 'Legacy contact', email: null,
        identity: 'recorded_name', label: 'Legacy contact', responsibilities: [], sharing_role: null, sources: ['recorded_name'] },
    ]);
    expect(q.query).toHaveBeenCalledTimes(2);
  });

  it('never turns freeform profile roles or matching object identity claims into account assignments', async () => {
    const q = fixture({ roster: [{ lead_user_id: 5, owner_id: null, created_by_id: null, settings: {},
      team_members: [{ name: 'Jordan', role: 'Project owner', userId: 5, email: 'same@example.test', permissions: ['approve'] },
        { name: 'Jordan', role: 'reviewer', userId: 5 }],
    }], members: [], people: [{ id: 5, name: 'Jordan', email: 'same@example.test' }] });
    const result = await ask(q);
    expect(result.team.map(row => row.entry_id)).toEqual(['user:5', 'recorded-name:0', 'recorded-name:1']);
    expect(result.team[0]).toMatchObject({ user_id: 5, role: 'lead', responsibilities: ['project_lead'],
      sharing_role: null, sources: ['program_lead'] });
    for (const member of result.team.slice(1)) expect(member).toMatchObject({ user_id: null, role: null,
      identity: 'recorded_name', email: null, responsibilities: [], sharing_role: null, sources: ['recorded_name'] });
  });

  it('returns an actual empty roster with canonical scope and skips the account lookup', async () => {
    const q = fixture({ roster: [{ lead_user_id: null, owner_id: null, created_by_id: null, team_members: [], settings: {} }], members: [] });
    expect(await ask(q)).toEqual({ program_id: PROGRAM, project_id: 11, team: [] });
    expect(q.query).toHaveBeenCalledTimes(2);
  });
});

describe('request SQL and final canonical admission', () => {
  it('binds the admitted program, organization, project, and subject IDs on the supplied executor', async () => {
    const q = fixture();
    await ask(q);
    expect(q.query.mock.calls[0][0]).toContain('/* project-team:roster */');
    expect(q.query.mock.calls[0][1]).toEqual([PROGRAM, 7, 11]);
    expect(q.query.mock.calls[1][1]).toEqual([11, 7]);
    expect(q.query.mock.calls[2][1]).toEqual([7, [5, 6, 7, 8]]);
    expect(q.query.mock.calls[2][0]).toMatch(/JOIN users u ON u.id\s*=\s*ou.user_id/);
    expect(q.query.mock.calls[2][0]).toMatch(/u.status\s*=\s*'active'/);
    expect(q.query.mock.calls[2][0]).toMatch(/ou.organization_id\s*=\s*\$1/);
    expect(q.query.mock.calls.some(([sql]) => sql.includes('actor_name'))).toBe(false);
    expect(checkAccess).toHaveBeenCalledExactlyOnceWith(q, { organizationId: 7, userId: 5, programId: PROGRAM });
    expect(q.query.mock.invocationCallOrder.at(-1)).toBeLessThan(checkAccess.mock.invocationCallOrder[0]);
  });

  it.each([
    { projectId: 12 }, { clientWorkspaceId: 72 }, { actor: { userId: 5, role: 'viewer' } }, { actor: { userId: 6, role: 'member' } },
  ])('refuses an access snapshot changed during loading: %j', async change => {
    checkAccess.mockResolvedValue({ ...ACCESS, ...change });
    await expect(ask()).rejects.toMatchObject({ status: 503, code: 'PROJECT_ACCESS_CHANGED' });
  });

  it('propagates canonical denial after membership revocation without returning the roster', async () => {
    checkAccess.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Current membership required'));
    await expect(ask()).rejects.toMatchObject({ status: 403, code: 'PROJECT_ACTOR_ACCESS_DENIED' });
  });

  it.each(['roster', 'members', 'accounts'] as const)('reports failed %s verification as unavailable, never an empty team', async fail => {
    await expect(ask(fixture({ fail }))).rejects.toMatchObject({ status: 503, code: 'PROJECT_TEAM_UNAVAILABLE' });
  });

  it('refuses a parent/anchor association that disappeared while loading', async () => {
    await expect(ask(fixture({ roster: [] }))).rejects.toMatchObject({ status: 503, code: 'PROJECT_ACCESS_CHANGED' });
  });

  it('refuses malformed recorded account IDs rather than publishing an invented account', async () => {
    await expect(ask(fixture({ members: [{ user_id: 0, role: 'edit', status: 'active' }] })))
      .rejects.toMatchObject({ status: 503, code: 'PROJECT_TEAM_UNAVAILABLE' });
  });

  it('refuses a malformed durable sharing role', async () => {
    await expect(ask(fixture({ members: [{ user_id: 8, role: 'approver', status: 'active' }] })))
      .rejects.toMatchObject({ status: 503, code: 'PROJECT_TEAM_UNAVAILABLE' });
  });

  it.each([
    { people: [{ id: 5, membership_role: '' }] }, { people: [{ id: 5, membership_role: null }] }, { people: [{ id: 5 }, { id: 5 }] },
  ])('refuses an ambiguous or invalid current membership: %j', async ({ people }) => {
    await expect(ask(fixture({ people }))).rejects.toMatchObject({ status: 503, code: 'PROJECT_TEAM_UNAVAILABLE' });
  });
});
