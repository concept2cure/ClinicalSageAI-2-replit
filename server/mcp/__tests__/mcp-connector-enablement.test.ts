/**
 * The connector for Claude opens only for an organization whose owner or
 * administrator has enabled it (ADR-0014 §10, plan P1-47), and the decision is read live, from
 * the organization row the verifier already reads on every request. This is the
 * no-database half of mcp-connector-enablement.dbtest.ts: every place the
 * connector admits someone — /mcp, the consent POST, both /token exchanges —
 * against each stored shape of the setting, and against a read that fails.
 *
 *   absent, null, `enabled: false`, `enabled: "true"`  → refused (absent = disabled)
 *   `enabled: true`                                    → admitted (the control)
 *   the organization row cannot be read                → refused as an outage, never admitted
 *
 * A refusal is read against a control in which the same call, with the
 * connector enabled, succeeds: a test that passes because the call was broken
 * for some other reason proves nothing.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const org = vi.hoisted(() => ({
  settings: { claudeConnector: { enabled: true } } as unknown,
  readable: true,
}));
const grants = vi.hoisted(() => ({
  issueRefreshToken: vi.fn(async () => '7.issued-refresh-token-issued-refresh-token-issued-refresh'),
  revokeRefreshToken: vi.fn(async () => {}),
  redeemAuthorizationCode: vi.fn(async () => true),
  issueAuthorizationCode: vi.fn(async () => '7.issued-code-issued-code-issued-code-issued-code-issued'),
}));

vi.mock('../../services/account-standing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/account-standing')>();
  return {
    ...actual,
    readAccountStandingBeforeTenant: vi.fn(async () => ({ active: true, passwordChangedAtSeconds: null })),
    isAccountActiveBeforeTenant: vi.fn(async () => true),
  };
});

vi.mock('../auth/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/store')>();
  // issuedAt: the exchanges compare it with the account's standing (provider.ts, liveGrantorMembership).
  const grant = { clientId: 'client-1', organizationId: 7, userId: 3, membershipId: 11, scopes: ['c2c:read'], resource: null, issuedAt: new Date() };
  return {
    ...actual,
    // The membership read is the organization read: it joins organizations and
    // returns its settings, so the connector setting arrives with it.
    findMembership: vi.fn(async () => {
      if (!org.readable) throw new Error('connection terminated unexpectedly');
      return { membershipId: 11, organizationId: 7, userId: 3, role: 'member', organizationUuid: null, email: null, organizationSettings: org.settings };
    }),
    readRefreshToken: vi.fn(async () => ({ ...grant, expired: false, revoked: false })),
    readAuthorizationCode: vi.fn(async () => ({
      ...grant,
      codeChallenge: 'x',
      redirectUri: 'http://localhost:5300/cb',
      expired: false,
      redeemed: false,
    })),
    ...grants,
  };
});

const PUBLIC_URL = 'http://localhost:5300';
const client = { client_id: 'client-1', redirect_uris: ['http://localhost:5300/cb'] } as never;

let app: express.Express;
let sessionToken: string;
let connectorToken: string;
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
  sessionToken = jwt.sign({ userId: '3', organizationId: '7', role: 'member', type: 'access' }, activeJwtSecret(), {
    expiresIn: '5m',
    algorithm: 'HS256',
  });
  const { mintAccessToken, signPendingAuthorization } = await import('../auth/platform-token');
  connectorToken = (
    await mintAccessToken({
      membership: { membershipId: 11, organizationId: 7, userId: 3, role: 'member', organizationUuid: null, email: null },
      clientId: 'client-1',
      scopes: ['c2c:read'],
      resource: `${PUBLIC_URL}/mcp`,
      ttlSeconds: 300,
    })
  ).token;
  const { ConceptToCureOAuthProvider } = await import('../auth/provider');
  provider = new ConceptToCureOAuthProvider(config);
  assertion = signPendingAuthorization(
    { clientId: 'client-1', clientName: null, redirectUri: 'http://localhost:5300/cb', codeChallenge: 'x', scopes: ['c2c:read'], state: null, resource: null },
    300,
  );
});

beforeEach(() => {
  org.settings = { claudeConnector: { enabled: true } };
  org.readable = true;
  for (const fn of Object.values(grants)) fn.mockClear();
});

const initialize = (bearer: string) =>
  request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${bearer}`)
    .set('Accept', 'application/json, text/event-stream')
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'enablement', version: '1' } },
    });

const consent = () =>
  request(app).post('/oauth/consent').type('form').send({ request: assertion, access_token: sessionToken, decision: 'allow' });

/** Every stored shape that is not an explicit `enabled: true`. */
const NOT_ENABLED: Array<[string, unknown]> = [
  ['no settings at all', null],
  ['settings without the connector', { security: { mfaRequired: true } }],
  ['enabled: false', { claudeConnector: { enabled: false } }],
  ['enabled: "true" (a string, not true)', { claudeConnector: { enabled: 'true' } }],
  ['the connector stored as a bare true', { claudeConnector: true }],
];

describe('/mcp', () => {
  it('control: enabled, both a connector token and the session open the connector', async () => {
    expect((await initialize(connectorToken)).status).toBe(200);
    expect((await initialize(sessionToken)).status).toBe(200);
  });

  for (const [label, settings] of NOT_ENABLED) {
    it(`${label}: a connector token is refused with invalid_token and the reason`, async () => {
      org.settings = settings;
      const res = await initialize(connectorToken);
      expect(res.status, 'an organization that has not enabled the connector was admitted').toBe(401);
      expect(res.headers['www-authenticate']).toContain('invalid_token');
      expect(res.headers['www-authenticate']).toMatch(/connector for Claude is not enabled/i);
    });
  }

  it('the session token is refused the same way', async () => {
    org.settings = null;
    expect((await initialize(sessionToken)).status).toBe(401);
  });

  it('refuses as an outage when the organization cannot be read: never admits, never "bad token"', async () => {
    org.readable = false;
    const res = await initialize(connectorToken);
    expect(res.status, 'an unreadable organization admitted the token').toBe(500);
    expect(res.headers['www-authenticate'] ?? '').not.toContain('invalid_token');
    expect(JSON.stringify(res.body)).toContain('could not be checked');
  });
});

describe('the consent POST', () => {
  it('control: enabled, consent issues a code', async () => {
    const res = await consent();
    expect(res.status).toBe(302);
    expect(grants.issueAuthorizationCode).toHaveBeenCalledTimes(1);
  });

  for (const [label, settings] of NOT_ENABLED) {
    it(`${label}: 403 access_denied with the reason, and no code`, async () => {
      org.settings = settings;
      const res = await consent();
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('access_denied');
      expect(res.body.error_description).toMatch(/connector for Claude is not enabled/i);
      expect(res.headers.location).toBeUndefined();
      expect(grants.issueAuthorizationCode).not.toHaveBeenCalled();
    });
  }

  it('answers 503 and issues no code when the organization cannot be read', async () => {
    org.readable = false;
    const res = await consent();
    expect(res.status, 'an unreadable organization authorised a client').toBe(503);
    expect(res.body.error).toBe('temporarily_unavailable');
    expect(grants.issueAuthorizationCode).not.toHaveBeenCalled();
  });
});

describe('the /token exchanges', () => {
  it('control: enabled, a refresh rotates and issues, and a code exchange issues', async () => {
    expect((await provider.exchangeRefreshToken(client, '7.presented')).access_token).toBeTruthy();
    expect(grants.revokeRefreshToken).toHaveBeenCalledTimes(1);
    expect((await provider.exchangeAuthorizationCode(client, '7.code')).access_token).toBeTruthy();
  });

  it('not enabled: a refresh is refused (invalid_grant) and the grant is left as it was', async () => {
    org.settings = { claudeConnector: { enabled: false } };
    await expect(provider.exchangeRefreshToken(client, '7.presented')).rejects.toMatchObject({
      errorCode: 'invalid_grant',
      message: expect.stringMatching(/connector for Claude is not enabled/i),
    });
    expect(grants.revokeRefreshToken).not.toHaveBeenCalled();
    expect(grants.issueRefreshToken).not.toHaveBeenCalled();
  });

  it('not enabled: a code exchange is refused and issues nothing', async () => {
    org.settings = null;
    await expect(provider.exchangeAuthorizationCode(client, '7.code')).rejects.toMatchObject({ errorCode: 'invalid_grant' });
    expect(grants.issueRefreshToken).not.toHaveBeenCalled();
  });

  it('a refresh refuses as an outage when the organization cannot be read, and neither rotates nor issues', async () => {
    org.readable = false;
    await expect(provider.exchangeRefreshToken(client, '7.presented')).rejects.toMatchObject({ errorCode: 'server_error' });
    expect(grants.revokeRefreshToken).not.toHaveBeenCalled();
    expect(grants.issueRefreshToken).not.toHaveBeenCalled();
  });
});
