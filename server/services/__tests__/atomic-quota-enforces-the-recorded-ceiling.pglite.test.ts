/**
 * The atomic create paths enforce the ceiling the organization row RECORDS:
 * a recorded 0 is zero, and an unrecorded (NULL) ceiling refuses.
 *
 * What the code used to do (until 2026-10-15): atomicCreateProject,
 * atomicCreateUser and atomicAcceptInvitation read `max_projects || 10` and
 * `max_users || 5`, so an organization whose recorded limit was 0 (a suspended
 * organization, a lapsed trial) could still create 10 projects and add 5
 * members, and a NULL limit was enforced as those same defaults.
 * license-manager.ts reads these columns as recorded (null when not recorded,
 * 0 when zero) and reports a NULL limit as undecided (withinQuota null); a
 * create cannot be undecided, so it refuses.
 *
 * The real service runs its real SQL — the row lock, the counts, the inserts,
 * the transaction — against PGlite. Only the invitation-consent audit writer is
 * replaced, and only the accept-under-the-ceiling control reaches it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ pg: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> } }));

vi.mock('../../db.js', () => ({
  pool: {
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => {
        if (!h.pg) throw new Error('PGlite fixture not ready');
        return h.pg.query(sql, params);
      },
      release: () => undefined,
    }),
  },
}));
const consent = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../tenant/invitation-consent.js', () => ({ recordInvitationConsent: consent }));

import { atomicAcceptInvitation, atomicCreateProject, atomicCreateUser } from '../atomicQuotaService.js';

let pg: PGlite;

const SCHEMA = `
  CREATE TABLE organizations (
    id serial PRIMARY KEY, name text NOT NULL,
    max_projects integer DEFAULT 10, max_users integer DEFAULT 5
  );
  CREATE TABLE projects (
    id serial PRIMARY KEY, name text NOT NULL, description text, type text, priority text,
    target_end_date timestamptz, organization_id integer NOT NULL, client_workspace_id integer,
    status text, created_by_id integer, owner_id integer, created_at timestamptz, updated_at timestamptz
  );
  CREATE TABLE users (
    id serial PRIMARY KEY, email text NOT NULL UNIQUE, name text, title text, department text,
    status text, password_hash text NOT NULL, must_change_password boolean,
    created_at timestamptz, updated_at timestamptz
  );
  CREATE TABLE organization_users (
    id serial PRIMARY KEY, user_id integer NOT NULL, organization_id integer NOT NULL, role text,
    created_at timestamptz, updated_at timestamptz, UNIQUE (user_id, organization_id)
  );
  CREATE TABLE organization_invitations (
    id serial PRIMARY KEY, organization_id integer NOT NULL, user_id integer, email text NOT NULL,
    role text, invited_by_id integer, status text NOT NULL, created_at timestamptz, responded_at timestamptz
  );
  -- As migrations/20260928_users_membership_rls.sql exposes it: the id, nothing else.
  CREATE FUNCTION public.user_id_for_email(p_email text) RETURNS integer
    LANGUAGE sql STABLE AS $$ SELECT id FROM public.users WHERE lower(email) = lower(p_email) $$;
`;

/** A fresh organization with the given recorded ceilings (null = not recorded). */
async function org(limits: { max_projects?: number | null; max_users?: number | null }): Promise<number> {
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO organizations (name, max_projects, max_users) VALUES ('org', $1, $2) RETURNING id`,
    [limits.max_projects === undefined ? 10 : limits.max_projects, limits.max_users === undefined ? 5 : limits.max_users],
  );
  return rows[0].id;
}

async function count(table: string, orgId: number): Promise<number> {
  const { rows } = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE organization_id = $1`,
    [orgId],
  );
  return rows[0].n;
}

async function member(orgId: number, email: string): Promise<number> {
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
    [email],
  );
  await pg.query(`INSERT INTO organization_users (user_id, organization_id, role) VALUES ($1, $2, 'member')`, [rows[0].id, orgId]);
  return rows[0].id;
}

/** A pending invitation for a user who exists but is not yet a member. */
async function invitation(orgId: number, email: string): Promise<{ id: number; userId: number }> {
  const user = await pg.query<{ id: number }>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
    [email],
  );
  const inv = await pg.query<{ id: number }>(
    `INSERT INTO organization_invitations (organization_id, user_id, email, role, status)
     VALUES ($1, $2, $3, 'member', 'pending') RETURNING id`,
    [orgId, user.rows[0].id, email],
  );
  return { id: inv.rows[0].id, userId: user.rows[0].id };
}

async function invitationStatus(id: number): Promise<string> {
  const { rows } = await pg.query<{ status: string }>(`SELECT status FROM organization_invitations WHERE id = $1`, [id]);
  return rows[0].status;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(SCHEMA);
  h.pg = pg;
});

afterAll(async () => {
  h.pg = null;
  await pg.close();
});

beforeEach(() => {
  consent.mockClear();
});

let n = 0;
const email = () => `quota-${++n}@example.com`;

describe('atomicCreateProject', () => {
  it('a recorded limit of 0 creates no project', async () => {
    const orgId = await org({ max_projects: 0 });
    const result = await atomicCreateProject(orgId, { name: 'First', clientWorkspaceId: 1 });
    expect(result).toMatchObject({ success: false, error: 'QUOTA_EXCEEDED', details: { current: 0, maximum: 0 } });
    expect(await count('projects', orgId)).toBe(0);
  });

  it('an unrecorded (NULL) limit creates no project, and says the limit is not recorded', async () => {
    const orgId = await org({ max_projects: null });
    const result = await atomicCreateProject(orgId, { name: 'First', clientWorkspaceId: 1 });
    expect(result).toMatchObject({ success: false, error: 'QUOTA_NOT_RECORDED', details: { current: 0, maximum: null } });
    expect(result.message).toMatch(/project limit is not recorded/);
    expect(await count('projects', orgId)).toBe(0);
  });

  it('creates under a recorded limit and reports it (control)', async () => {
    const orgId = await org({ max_projects: 2 });
    await pg.query(`INSERT INTO projects (name, organization_id) VALUES ('existing', $1)`, [orgId]);
    const result = await atomicCreateProject(orgId, { name: 'Second', clientWorkspaceId: 1, createdById: 42 });
    expect(result).toMatchObject({ success: true, quotaInfo: { used: 2, maximum: 2, remaining: 0 } });
    expect(await count('projects', orgId)).toBe(2);
  });
});

describe('atomicCreateUser', () => {
  it('a recorded limit of 0 adds no member', async () => {
    const orgId = await org({ max_users: 0 });
    const address = email();
    const result = await atomicCreateUser(orgId, { email: address, name: 'New' });
    expect(result).toMatchObject({ success: false, error: 'QUOTA_EXCEEDED', details: { current: 0, maximum: 0 } });
    expect(await count('organization_users', orgId)).toBe(0);
    expect((await pg.query(`SELECT 1 FROM users WHERE email = $1`, [address])).rows).toHaveLength(0);
  });

  it('an unrecorded (NULL) limit adds no member, and says the limit is not recorded', async () => {
    const orgId = await org({ max_users: null });
    const address = email();
    const result = await atomicCreateUser(orgId, { email: address, name: 'New' });
    expect(result).toMatchObject({ success: false, error: 'QUOTA_NOT_RECORDED', details: { current: 0, maximum: null } });
    expect(await count('organization_users', orgId)).toBe(0);
    expect((await pg.query(`SELECT 1 FROM users WHERE email = $1`, [address])).rows).toHaveLength(0);
  });

  it('adds a member under a recorded limit (control)', async () => {
    const orgId = await org({ max_users: 3 });
    await member(orgId, email());
    const result = await atomicCreateUser(orgId, { email: email(), name: 'New', role: 'member' });
    expect(result).toMatchObject({ success: true, quotaInfo: { used: 2, maximum: 3, remaining: 1 } });
    expect(await count('organization_users', orgId)).toBe(2);
  });
});

describe('atomicAcceptInvitation', () => {
  it('a recorded limit of 0 accepts nothing; the invitation stays pending', async () => {
    const orgId = await org({ max_users: 0 });
    const inv = await invitation(orgId, email());
    const result = await atomicAcceptInvitation(inv.id, inv.userId);
    expect(result).toMatchObject({ success: false, error: 'QUOTA_EXCEEDED', details: { current: 0, maximum: 0 } });
    expect(await count('organization_users', orgId)).toBe(0);
    expect(await invitationStatus(inv.id)).toBe('pending');
  });

  it('an unrecorded (NULL) limit accepts nothing; the invitation stays pending', async () => {
    const orgId = await org({ max_users: null });
    const inv = await invitation(orgId, email());
    const result = await atomicAcceptInvitation(inv.id, inv.userId);
    expect(result).toMatchObject({ success: false, error: 'QUOTA_NOT_RECORDED', details: { current: 0, maximum: null } });
    expect(await count('organization_users', orgId)).toBe(0);
    expect(await invitationStatus(inv.id)).toBe('pending');
    expect(consent).not.toHaveBeenCalled();
  });

  it('accepts under a recorded limit (control)', async () => {
    const orgId = await org({ max_users: 2 });
    await member(orgId, email());
    const inv = await invitation(orgId, email());
    const result = await atomicAcceptInvitation(inv.id, inv.userId);
    expect(result).toMatchObject({ success: true, data: { organizationId: orgId, userId: inv.userId, status: 'accepted' } });
    expect(await count('organization_users', orgId)).toBe(2);
    expect(await invitationStatus(inv.id)).toBe('accepted');
  });
});
