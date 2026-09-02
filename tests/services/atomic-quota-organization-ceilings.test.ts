/**
 * Contract: the atomic quota service decides every ceiling from the
 * ORGANIZATION row — organizations.max_projects / max_users — locked inside
 * the creating transaction. It never consults `licenses` or `license_users`.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * atomicCreateProject, atomicCreateUser and atomicAcceptInvitation each locked
 * `licenses WHERE organization_id = $1 AND status = 'active'` and answered
 * NO_LICENSE when no row came back. Nothing ever wrote an organization-keyed
 * licence row, and the member path then counted `license_users`, a table no
 * migration creates. Result, verified live on a fully provisioned database:
 *
 *     POST /api/projects       → 400 {"error":"NO_LICENSE"}
 *     POST /api/tenant-users   → 400 {"error":"NO_LICENSE"}
 *
 * on every organization, fresh install or paying tenant. These tests drive the
 * real service through a recording pool and fail if any statement touches the
 * licence tables, if the organization ceiling is not the one enforced, or if
 * the creator is not recorded on the project row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Answer = (sql: string, params: unknown[]) => { rows: Row[] } | Error;

const state = vi.hoisted(() => ({
  executed: [] as Array<{ sql: string; params: unknown[] }>,
  answer: null as null | Answer,
  released: 0,
}));

vi.mock('../../server/db.js', () => ({
  pool: {
    connect: async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        state.executed.push({ sql, params });
        const out = state.answer ? state.answer(sql, params) : { rows: [] };
        if (out instanceof Error) throw out;
        return out;
      },
      release: () => {
        state.released += 1;
      },
    }),
  },
}));

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const ran = (re: RegExp) => state.executed.filter(q => re.test(norm(q.sql)));

/** A fixture organization + counts; `null` organization means "no such row". */
function answerWith(opts: {
  organization: { max_projects?: number | null; max_users?: number | null } | null;
  projects?: number;
  members?: number;
  existingUserId?: number | null;
  invitation?: Row | null;
  insertFails?: boolean;
}): Answer {
  return (sql, params) => {
    const q = norm(sql);
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(q)) return { rows: [] };
    if (/FROM organizations WHERE id = \$1 FOR UPDATE/.test(q)) {
      return { rows: opts.organization ? [opts.organization] : [] };
    }
    if (/COUNT\(\*\) as count FROM projects WHERE organization_id/.test(q)) {
      return { rows: [{ count: String(opts.projects ?? 0) }] };
    }
    if (/COUNT\(\*\) as count FROM organization_users WHERE organization_id/.test(q)) {
      return { rows: [{ count: String(opts.members ?? 0) }] };
    }
    if (/^SELECT id FROM users WHERE email/.test(q)) {
      return { rows: opts.existingUserId ? [{ id: opts.existingUserId }] : [] };
    }
    if (/^SELECT id FROM organization_users WHERE user_id/.test(q)) return { rows: [] };
    if (/^SELECT id FROM organization_invitations/.test(q)) return { rows: [] };
    if (/FROM organization_invitations WHERE id = \$1 FOR UPDATE/.test(q)) {
      return { rows: opts.invitation ? [opts.invitation] : [] };
    }
    if (/^INSERT INTO projects/.test(q)) {
      if (opts.insertFails) return new Error('relation "projects" does not exist');
      return { rows: [{ id: 555, name: params[0], created_by_id: params[8], owner_id: params[9] }] };
    }
    if (/^INSERT INTO users/.test(q)) return { rows: [{ id: 901 }] };
    if (/^INSERT INTO organization_invitations/.test(q)) return { rows: [{ id: 31 }] };
    if (/^INSERT INTO organization_users/.test(q)) return { rows: [] };
    if (/^UPDATE organization_invitations/.test(q)) return { rows: [] };
    throw new Error(`unexpected SQL in test: ${q}`);
  };
}

beforeEach(() => {
  state.executed.length = 0;
  state.answer = null;
  state.released = 0;
});

describe('atomicCreateProject — the ceiling is organizations.max_projects', () => {
  it('refuses the create at the organization ceiling, and rolls back', async () => {
    state.answer = answerWith({ organization: { max_projects: 2 }, projects: 2 });
    const { atomicCreateProject } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicCreateProject(7, { name: 'Third', clientWorkspaceId: 1 });
    expect(result).toMatchObject({
      success: false,
      error: 'QUOTA_EXCEEDED',
      details: { current: 2, maximum: 2, remaining: 0 },
    });
    expect(ran(/^INSERT INTO projects/).length).toBe(0);
    expect(ran(/^ROLLBACK$/).length).toBe(1);
    expect(state.released).toBe(1);
  });

  it('creates under the ceiling and records the creator on the row', async () => {
    state.answer = answerWith({ organization: { max_projects: 3 }, projects: 1 });
    const { atomicCreateProject } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicCreateProject(7, {
      name: 'Second',
      clientWorkspaceId: 1,
      createdById: 42,
    });
    expect(result.success).toBe(true);
    expect(result.quotaInfo).toEqual({ used: 2, maximum: 3, remaining: 1 });
    const insert = ran(/^INSERT INTO projects/);
    expect(insert.length).toBe(1);
    expect(norm(insert[0].sql)).toMatch(/created_by_id, owner_id/);
    expect(insert[0].params[8]).toBe(42);
    expect(insert[0].params[9]).toBe(42);
    expect(ran(/^COMMIT$/).length).toBe(1);
  });

  it('a NULL ceiling means the schema default (10), not unlimited and not 20', async () => {
    state.answer = answerWith({ organization: { max_projects: null }, projects: 10 });
    const { atomicCreateProject } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicCreateProject(7, { name: 'Eleventh', clientWorkspaceId: 1 });
    expect(result).toMatchObject({ error: 'QUOTA_EXCEEDED', details: { maximum: 10 } });
  });

  it('an unknown organization is ORGANIZATION_NOT_FOUND, never NO_LICENSE', async () => {
    state.answer = answerWith({ organization: null });
    const { atomicCreateProject } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicCreateProject(404, { name: 'x', clientWorkspaceId: 1 });
    expect(result).toEqual({
      success: false,
      error: 'ORGANIZATION_NOT_FOUND',
      message: 'Organization not found',
    });
    expect(ran(/^ROLLBACK$/).length).toBe(1);
  });

  it('never consults the licence tables', async () => {
    state.answer = answerWith({ organization: { max_projects: 3 }, projects: 0 });
    const { atomicCreateProject } = await import('../../server/services/atomicQuotaService.js');
    await atomicCreateProject(7, { name: 'Any', clientWorkspaceId: 1 });
    expect(ran(/licenses|license_users/i).length).toBe(0);
    expect(ran(/FROM organizations WHERE id = \$1 FOR UPDATE/).length).toBe(1);
  });

  it('a driver failure is DATABASE_ERROR with the driver message kept out of the result', async () => {
    state.answer = answerWith({ organization: { max_projects: 3 }, insertFails: true });
    const { atomicCreateProject } = await import('../../server/services/atomicQuotaService.js');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await atomicCreateProject(7, { name: 'x', clientWorkspaceId: 1 });
    spy.mockRestore();
    expect(result).toEqual({
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Failed to create project atomically',
    });
    expect(JSON.stringify(result)).not.toContain('does not exist');
    expect(ran(/^ROLLBACK$/).length).toBe(1);
  });
});

describe('atomicCreateUser — the ceiling is organizations.max_users', () => {
  it('refuses a new member at the organization ceiling', async () => {
    state.answer = answerWith({ organization: { max_users: 1 }, members: 1 });
    const { atomicCreateUser } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicCreateUser(7, { email: 'new@example.com', name: 'New Member' });
    expect(result).toMatchObject({ error: 'QUOTA_EXCEEDED', details: { current: 1, maximum: 1 } });
    expect(ran(/^INSERT INTO users/).length).toBe(0);
    expect(ran(/^INSERT INTO organization_users/).length).toBe(0);
  });

  it('creates the user and the membership under the ceiling — no licence row required', async () => {
    state.answer = answerWith({ organization: { max_users: 5 }, members: 1 });
    const { atomicCreateUser } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicCreateUser(7, {
      email: 'new@example.com',
      name: 'New Member',
      role: 'member',
    });
    expect(result).toMatchObject({
      success: true,
      data: { id: 901, email: 'new@example.com', createdNewUser: true },
      quotaInfo: { used: 2, maximum: 5, remaining: 3 },
    });
    const insert = ran(/^INSERT INTO users/);
    expect(insert.length).toBe(1);
    // The account cannot sign in until it sets a password: an unusable hash
    // (never a NULL that trips the NOT NULL constraint) and must_change_password.
    expect(norm(insert[0].sql)).toMatch(/password_hash, must_change_password/);
    expect(String(insert[0].params[5])).toMatch(/^invite:[0-9a-f-]{36}$/);
    expect(ran(/^INSERT INTO organization_users/).length).toBe(1);
    expect(ran(/licenses|license_users/i).length).toBe(0);
  });

  it('an unknown organization is ORGANIZATION_NOT_FOUND', async () => {
    state.answer = answerWith({ organization: null });
    const { atomicCreateUser } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicCreateUser(404, { email: 'x@example.com', name: 'X' });
    expect(result).toMatchObject({ success: false, error: 'ORGANIZATION_NOT_FOUND' });
  });
});

describe('atomicAcceptInvitation — re-checks the same organization ceiling at accept time', () => {
  const invitation = {
    id: 31,
    organization_id: 7,
    user_id: 12,
    email: 'invited@example.com',
    role: 'member',
    status: 'pending',
  };

  it('refuses acceptance when the organization is full', async () => {
    state.answer = answerWith({ organization: { max_users: 2 }, members: 2, invitation });
    const { atomicAcceptInvitation } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicAcceptInvitation(31, 12);
    expect(result).toMatchObject({ error: 'QUOTA_EXCEEDED', details: { maximum: 2 } });
    expect(ran(/^INSERT INTO organization_users/).length).toBe(0);
    expect(ran(/^UPDATE organization_invitations/).length).toBe(0);
  });

  it('accepts under the ceiling: membership + accepted status, no licence tables', async () => {
    state.answer = answerWith({ organization: { max_users: 5 }, members: 2, invitation });
    const { atomicAcceptInvitation } = await import('../../server/services/atomicQuotaService.js');
    const result = await atomicAcceptInvitation(31, 12);
    expect(result).toMatchObject({ success: true, data: { organizationId: 7, userId: 12 } });
    expect(ran(/^INSERT INTO organization_users/).length).toBe(1);
    expect(ran(/^UPDATE organization_invitations/).length).toBe(1);
    expect(ran(/licenses|license_users/i).length).toBe(0);
  });
});
