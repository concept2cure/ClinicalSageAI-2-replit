/**
 * When the connector cannot read an account's standing, it refuses — it never
 * admits (row D8; the fail-closed half of mcp-account-standing.dbtest.ts).
 *
 * The real-database suite proves the refusals for an account that IS out of
 * use. What it cannot arrange is the read itself failing, and that is the case
 * a check like this gets wrong in the direction that matters: a `catch` that
 * falls through to "no finding" turns an outage into admission. So the
 * standing read is made to throw here, and each place the connector asks
 * — /mcp, the consent POST, both /token exchanges — must refuse, as an outage
 * (5xx: try again) rather than a bad token (which would send the user back
 * through consent), and without issuing, rotating or redeeming anything.
 *
 * Every refusal is read against a control in which the same call, with the
 * standing readable, succeeds: a test that passes because the call was broken
 * for some other reason proves nothing.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const standing = vi.hoisted(() => ({ readable: true }));
const grants = vi.hoisted(() => ({
  issueRefreshToken: vi.fn(async () => '7.issued-refresh-token-issued-refresh-token-issued-refresh'),
  revokeRefreshToken: vi.fn(async () => {}),
  redeemAuthorizationCode: vi.fn(async () => true),
  issueAuthorizationCode: vi.fn(async () => '7.issued-code-issued-code-issued-code-issued-code-issued'),
}));

vi.mock('../../services/account-standing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/account-standing')>();
  const outage = () => Promise.reject(new Error('connection terminated unexpectedly'));
  const live = { active: true, passwordChangedAtSeconds: null };
  return {
    ...actual,
    readAccountStandingBeforeTenant: vi.fn(() => (standing.readable ? Promise.resolve(live) : outage())),
    isAccountActiveBeforeTenant: vi.fn(() => (standing.readable ? Promise.resolve(true) : outage())),
  };
});

vi.mock('../auth/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/store')>();
  const membership = { membershipId: 11, organizationId: 7, userId: 3, role: 'admin', organizationUuid: null, email: null };
  const grant = {
    clientId: 'client-1',
    organizationId: 7,
    userId: 3,
    membershipId: 11,
    scopes: ['c2c:read'],
    resource: null,
  };
  return {
    ...actual,
    findMembership: vi.fn(async () => membership),
    readRefreshToken: vi.fn(async () => ({ ...grant, expired: false, revoked: false, issuedAt: new Date() })),
    readAuthorizationCode: vi.fn(async () => ({
      ...grant,
      codeChallenge: 'x',
      redirectUri: 'http://localhost:5300/cb',
      expired: false,
      redeemed: false,
      issuedAt: new Date(),
    })),
    ...grants,
  };
});

const PUBLIC_URL = 'http://localhost:5300';
const client = { client_id: 'client-1', redirect_uris: ['http://localhost:5300/cb'] } as never;

let app: express.Express;
let sessionToken: string;
let provider: import('../auth/provider').ConceptToCureOAuthProvider;
let assertion: string;

beforeAll(async () => {
  const { createMcpRouter } = await import('../index');
  const { resolveMcpConfig } = await import('../config');
  const config = resolveMcpConfig({ ...process.env, MCP_ENABLED: 'true', MCP_PUBLIC_URL: PUBLIC_URL });
  app = express();
  app.use(createMcpRouter(config));

  const jwt = (await import('jsonwebtoken')).default;
  const { activeJwtSecret } = await import('../../utils/jwtVerify');
  sessionToken = jwt.sign(
    { userId: '3', organizationId: '7', role: 'admin', type: 'access' },
    activeJwtSecret(),
    { expiresIn: '5m', algorithm: 'HS256' },
  );
  const { ConceptToCureOAuthProvider } = await import('../auth/provider');
  provider = new ConceptToCureOAuthProvider(config);
  const { signPendingAuthorization } = await import('../auth/platform-token');
  assertion = signPendingAuthorization(
    { clientId: 'client-1', clientName: null, redirectUri: 'http://localhost:5300/cb', codeChallenge: 'x', scopes: ['c2c:read'], state: null, resource: null },
    300,
  );
});

beforeEach(() => {
  standing.readable = true;
  for (const fn of Object.values(grants)) fn.mockClear();
});

const initialize = () =>
  request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${sessionToken}`)
    .set('Accept', 'application/json, text/event-stream')
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'unreadable', version: '1' } },
    });

const consent = () =>
  request(app)
    .post('/oauth/consent')
    .type('form')
    .send({ request: assertion, access_token: sessionToken, decision: 'allow' });

describe('/mcp', () => {
  it('control: with the standing readable, the session opens the connector', async () => {
    expect((await initialize()).status).toBe(200);
  });

  it('refuses as an outage when the standing cannot be read — never admits, never "bad token"', async () => {
    standing.readable = false;
    const res = await initialize();
    expect(res.status, 'an unreadable standing admitted the session').toBe(500);
    expect(res.headers['www-authenticate'] ?? '').not.toContain('invalid_token');
    expect(JSON.stringify(res.body)).toContain('could not be checked');
  });
});

describe('the consent POST', () => {
  it('control: with the standing readable, consent issues a code', async () => {
    const res = await consent();
    expect(res.status).toBe(302);
    expect(grants.issueAuthorizationCode).toHaveBeenCalledTimes(1);
  });

  it('answers 503 and issues no code when the standing cannot be read', async () => {
    standing.readable = false;
    const res = await consent();
    expect(res.status, 'an unreadable standing authorised a client').toBe(503);
    expect(res.body.error).toBe('temporarily_unavailable');
    expect(res.headers.location).toBeUndefined();
    expect(grants.issueAuthorizationCode).not.toHaveBeenCalled();
  });
});

describe('the /token exchanges', () => {
  it('control: with the standing readable, a refresh rotates and issues', async () => {
    const tokens = await provider.exchangeRefreshToken(client, '7.presented');
    expect(tokens.access_token).toBeTruthy();
    expect(grants.revokeRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('a refresh refuses as an outage, and neither rotates nor issues', async () => {
    standing.readable = false;
    await expect(provider.exchangeRefreshToken(client, '7.presented')).rejects.toMatchObject({
      name: 'ServerError',
      errorCode: 'server_error',
    });
    // The grant is left exactly as it was: the client retries the same token.
    expect(grants.revokeRefreshToken).not.toHaveBeenCalled();
    expect(grants.issueRefreshToken).not.toHaveBeenCalled();
  });

  it('control: with the standing readable, a code exchange issues', async () => {
    const tokens = await provider.exchangeAuthorizationCode(client, '7.code');
    expect(tokens.access_token).toBeTruthy();
  });

  it('a code exchange refuses as an outage and issues nothing', async () => {
    standing.readable = false;
    await expect(provider.exchangeAuthorizationCode(client, '7.code')).rejects.toMatchObject({
      name: 'ServerError',
      errorCode: 'server_error',
    });
    expect(grants.issueRefreshToken).not.toHaveBeenCalled();
  });
});
