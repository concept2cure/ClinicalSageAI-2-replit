import { afterEach, describe, it, expect, vi } from 'vitest';

// vi.hoisted to set env vars before any module load (see authSurfaceSecurity.test.ts).
vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV = process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

/**
 * The rows the session and /me routes read, keyed by SQL table name. The db
 * stub below answers each `select().from(table)` chain from here, so a test
 * states the organization role the database holds and asserts what the route
 * tells the client it is.
 */
const rows = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  organization_users: [] as Array<Record<string, unknown>>,
  organizations: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../db', async () => {
  const { getTableName } = await import('drizzle-orm');
  const answer = (table: unknown) => {
    const name = getTableName(table as never) as keyof typeof rows;
    return rows[name] ?? [];
  };
  const chain = (table: unknown): any => {
    const data = answer(table);
    const q: any = {
      where: () => q,
      limit: async () => data,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(data).then(resolve, reject),
    };
    return q;
  };
  const fakeDb = { select: () => ({ from: (table: unknown) => chain(table) }) };
  const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
  return { db: fakeDb, pool, getPool: () => pool, getDb: () => fakeDb };
});

// The token's live checks (revocation, standing, inactivity) are not under test:
// the claims are verified with the same secret and nothing else.
vi.mock('../../services/token-revocation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/token-revocation')>();
  const jwt = await import('jsonwebtoken');
  return {
    ...actual,
    verifyLiveToken: async (token: string) => jwt.default.verify(token, process.env.JWT_SECRET as string),
  };
});

vi.mock('../../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../../services/emailService', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendLoginOtpEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  isEmailConfigured: () => false,
}));
vi.mock('../../services/industry-context/signup-profile', () => ({
  primaryIndustryForIndustryMode: vi.fn(),
  pathwaysForUseCases: vi.fn(),
}));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../auth/dev-auth-policy', () => ({
  isDevAuthAllowed: () => false,
  devAuthDenialReason: () => 'disabled',
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import authRoutes from '../auth';

const ORG = 1;
const USER_ID = 4;
const SECRET = process.env.JWT_SECRET as string;

function accessTokenFor(claims: { organizationId?: string } = { organizationId: String(ORG) }): string {
  return jwt.sign(
    { userId: String(USER_ID), email: 'emily.watson@concept2cure.pro', ...claims, role: 'member', type: 'access', sid: 'sid-roles-test', sst: Math.floor(Date.now() / 1000), idl: 900 },
    SECRET,
    { expiresIn: '5m' },
  );
}

/** Seed the database for one user holding `orgRole` in ORG. */
function seed(orgRole: string) {
  rows.users = [{ id: USER_ID, email: 'emily.watson@concept2cure.pro', name: 'Emily Watson', status: 'active', mustChangePassword: false, mfaEnabled: false, mfaMethod: 'email', preferences: {} }];
  rows.organization_users = [{ role: orgRole, organizationId: ORG }];
  rows.organizations = [{ id: ORG, name: 'Concept2Cure Therapeutics' }];
}

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

const bearer = () => ({ Authorization: `Bearer ${accessTokenFor()}` });

// Roles that the client's Vault gate (VaultLifecycle.tsx AUTHOR_ROLES) admits.
const AUTHOR_ROLES = ['admin', 'owner', 'manager', 'member', 'editor', 'regulatory-author'];

describe('GET /api/v1/auth/session: roles match what sign-in issues', () => {
  it('a member is told the member role, as sign-in tells them', async () => {
    seed('member');
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.user.roles).toContain('member');
    expect(res.body.user.permissions).toContain('governed:write');
  });

  it('a manager is told the manager role, not only "user"', async () => {
    seed('manager');
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.user.roles).toContain('manager');
  });

  it('an admin keeps the admin role (unchanged)', async () => {
    seed('admin');
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.body.user.roles).toEqual(expect.arrayContaining(['admin', 'user']));
  });

  it('a viewer is still refused: no authoring role is granted', async () => {
    seed('viewer');
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.user.roles).not.toEqual(expect.arrayContaining(AUTHOR_ROLES));
    expect(res.body.user.roles.some((r: string) => AUTHOR_ROLES.includes(r))).toBe(false);
    expect(res.body.user.permissions).not.toContain('governed:write');
  });
});

describe('GET /api/v1/auth/me: roles match what sign-in issues', () => {
  it('a member is told the member role', async () => {
    seed('member');
    const res = await request(app).get('/api/v1/auth/me').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.roles).toContain('member');
  });

  it('a viewer gets no authoring role', async () => {
    seed('viewer');
    const res = await request(app).get('/api/v1/auth/me').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.roles.some((r: string) => AUTHOR_ROLES.includes(r))).toBe(false);
  });
});

/**
 * P-25 (2026-10-08): the session names the organisation its record names, or
 * none. GET /session answered "Concept2Cure", and /me "Organization", whenever
 * the token named no organisation or its row was missing, and the account panel
 * printed that as the person's organisation (CLAUDE.md: fail closed, never
 * fabricate).
 */
describe('the session names no organisation it cannot read (P-25)', () => {
  const PLACEHOLDERS = ['Concept2Cure', 'Organization'];

  it('GET /session: a token that names no organisation is told none', async () => {
    seed('member');
    const res = await request(app).get('/api/v1/auth/session').set({ Authorization: `Bearer ${accessTokenFor({})}` });
    expect(res.status).toBe(200);
    expect(res.body.user.organizationName).toBeNull();
  });

  it('GET /session: an organisation whose record is missing is not named', async () => {
    seed('member');
    rows.organizations = [];
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.user.organizationName).toBeNull();
    expect(PLACEHOLDERS).not.toContain(res.body.user.organizationName);
  });

  it('GET /session: a blank recorded name is no name', async () => {
    seed('member');
    rows.organizations = [{ id: ORG, name: '   ' }];
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.body.user.organizationName).toBeNull();
  });

  it('GET /session: control, the recorded name is answered as it is', async () => {
    seed('member');
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.body.user.organizationName).toBe('Concept2Cure Therapeutics');
  });

  it('GET /me: an organisation whose record is missing is not named either', async () => {
    seed('member');
    rows.organizations = [];
    const res = await request(app).get('/api/v1/auth/me').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.organizationName).toBeNull();
  });
});

/**
 * The signing posture (P-25 follow-up, 2026-10-08): the server says whether
 * this account needs an authenticator to sign and whether it has one, from the
 * rule the signing ceremony applies (signerNeedsAuthenticator) and the
 * enrolment it reads (users.mfa_enabled), so a person learns before typing a
 * password.
 */
describe('the session states the signing posture', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const enrol = (mfaEnabled: boolean) => {
    rows.users = rows.users.map((u) => ({ ...u, mfaEnabled, mfaMethod: mfaEnabled ? 'totp' : 'email' }));
  };

  it('GET /session, production, no authenticator: required and not enrolled', async () => {
    seed('member');
    enrol(false);
    vi.stubEnv('NODE_ENV', 'production');
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.user.signing).toEqual({ authenticatorRequired: true, authenticatorEnrolled: false });
  });

  it('GET /session, production, an authenticator: required and enrolled', async () => {
    seed('member');
    enrol(true);
    vi.stubEnv('NODE_ENV', 'production');
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.body.user.signing).toEqual({ authenticatorRequired: true, authenticatorEnrolled: true });
  });

  it('GET /session, a declared test environment: not required', async () => {
    seed('member');
    enrol(false);
    vi.stubEnv('NODE_ENV', 'test');
    const res = await request(app).get('/api/v1/auth/session').set(bearer());
    expect(res.body.user.signing).toEqual({ authenticatorRequired: false, authenticatorEnrolled: false });
  });

  it('GET /me carries the same posture', async () => {
    seed('member');
    enrol(false);
    vi.stubEnv('NODE_ENV', 'staging');
    const res = await request(app).get('/api/v1/auth/me').set(bearer());
    expect(res.status).toBe(200);
    expect(res.body.signing).toEqual({ authenticatorRequired: true, authenticatorEnrolled: false });
  });
});
