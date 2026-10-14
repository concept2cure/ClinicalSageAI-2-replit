/**
 * W1 / D2: credentials and their chained audit rows commit together. A raw
 * key is returned once, only after that transaction commits. Refused revoke
 * attempts change no credential and carry the real recordAuditRow outcome.
 * The route and canonical outcome helper run here; the transaction recorder
 * stages credential state to make rollback assertions meaningful.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

type AuditMode = 'chained' | 'tamper-proof-only' | 'lost' | 'rejected';
type KeyState = 'missing' | 'active' | 'revoked';
type MutationClient = {
  query: (sql: string) => Promise<{ rows: unknown[] }>;
  release: () => void;
  stagedState?: KeyState;
};
const h = vi.hoisted(() => ({
  tenantId: 777 as number | undefined,
  userId: 42 as number | undefined,
  auditMode: 'chained' as AuditMode,
  auditEntries: [] as Array<Record<string, unknown>>,
  chainEntries: [] as Array<{ client: unknown; entry: Record<string, unknown> }>,
  generateCalls: [] as unknown[][],
  revokeCalls: [] as unknown[][],
  listCalls: [] as unknown[][],
  clients: [] as MutationClient[],
  order: [] as string[],
  revoked: true,
  chainFails: false,
  commitFails: false,
  keyState: 'missing' as KeyState,
  logs: [] as Array<{ scope: string; level: string; message: string; context?: unknown }>,
}));

// Deliberately synthetic: this is not a credential or a usable key format.
const SYNTHETIC_KEY = 'synthetic-api-key-for-unit-test-only';
const AUDIT_DRIVER_MARKER = 'SYNTHETIC_AUDIT_DRIVER_ONLY_MARKER relation audit_logs unavailable';
const COMMIT_DRIVER_MARKER = 'SYNTHETIC_COMMIT_DRIVER_ONLY_MARKER';
const ORG = 777;
const CALLER = 42;
const KEY_ID = 31;
const KEY_PREFIX = 'unit-key';
const SCOPES = ['documents:read', 'regulatory:read'];

vi.mock('../../auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.tenantId = h.tenantId; req.userId = h.userId; next();
  },
  requireAdminRole: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../services/api-key-service.js', () => ({
  generateApiKey: vi.fn(async (input: Record<string, unknown>, client: MutationClient) => {
    h.order.push('GENERATE'); h.generateCalls.push([input, client]);
    client.stagedState = 'active';
    return { keyId: KEY_ID, rawKey: SYNTHETIC_KEY, keyPrefix: KEY_PREFIX };
  }),
  revokeApiKey: vi.fn(async (keyId: number, organizationId: number, client: MutationClient) => {
    h.order.push('REVOKE'); h.revokeCalls.push([keyId, organizationId, client]);
    if (h.revoked) client.stagedState = 'revoked';
    return h.revoked;
  }),
  listApiKeys: vi.fn(async (...args: unknown[]) => {
    h.listCalls.push(args);
    return h.keyState === 'missing' ? [] : [{ id: KEY_ID, name: 'Research integration', keyPrefix: KEY_PREFIX, scopes: SCOPES, status: h.keyState }];
  }),
  getApiKeyUsage: vi.fn(),
}));

vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: vi.fn(async (client: unknown, entry: Record<string, unknown>) => {
    h.order.push('AUDIT CHAIN'); h.chainEntries.push({ client, entry });
    if (h.chainFails) throw new Error(AUDIT_DRIVER_MARKER);
  }),
  default: {
    logAction: vi.fn(async (entry: Record<string, unknown>) => {
      h.order.push('AUDIT GENERAL'); h.auditEntries.push(entry);
      if (h.auditMode === 'rejected') throw new Error(AUDIT_DRIVER_MARKER);
      if (h.auditMode === 'lost') return { persisted: false, chained: false, tamperProof: false, error: AUDIT_DRIVER_MARKER };
      return { persisted: true, chained: h.auditMode === 'chained', tamperProof: true };
    }),
  },
}));

function transactionClient(): MutationClient {
  const client: MutationClient = {
    query: vi.fn(async (sql: string) => {
      h.order.push(sql);
      if (sql === 'COMMIT') {
        if (h.commitFails) throw new Error(COMMIT_DRIVER_MARKER);
        if (client.stagedState) h.keyState = client.stagedState;
      }
      if (sql === 'ROLLBACK') delete client.stagedState;
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  h.clients.push(client);
  return client;
}

vi.mock('../../db/runtime', () => ({
  transaction: async (callback: (client: MutationClient) => Promise<unknown>) => {
    const client = transactionClient();
    await client.query('BEGIN');
    try {
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  },
}));

function logger(scope: string) {
  return Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level,
    (message: string, context?: unknown) => h.logs.push({ scope, level, message, context }),
  ]));
}

// Capture before redaction so a raw-key copy cannot hide behind the logger.
vi.mock('../../utils/logger.js', () => ({ createScopedLogger: logger }));
vi.mock('../../utils/logger', () => ({ createScopedLogger: logger }));

let app: express.Express;
beforeEach(async () => {
  h.tenantId = ORG; h.userId = CALLER; h.auditMode = 'chained';
  h.auditEntries = []; h.chainEntries = []; h.generateCalls = []; h.revokeCalls = []; h.listCalls = [];
  h.clients = []; h.order = []; h.logs = []; h.revoked = true;
  h.chainFails = false; h.commitFails = false; h.keyState = 'missing';
  const mod = await import('../api-keys');
  app = express(); app.use(express.json());
  app.use('/api/api-keys', mod.default);
});

const create = (extra: Record<string, unknown> = {}) => request(app).post('/api/api-keys')
  .set('user-agent', 'api-key-onboarding-test').send({ name: 'Research integration', scopes: SCOPES, ...extra });
const revoke = (body = {}) => request(app).delete(`/api/api-keys/${KEY_ID}`)
  .set('user-agent', 'api-key-onboarding-test').send(body);

function expectNoCredentialCopies() {
  expect(JSON.stringify(h.auditEntries)).not.toContain(SYNTHETIC_KEY);
  expect(JSON.stringify(h.chainEntries)).not.toContain(SYNTHETIC_KEY);
  expect(JSON.stringify(h.logs)).not.toContain(SYNTHETIC_KEY);
}

function expectOneTimeCommittedKey(body: Record<string, unknown>) {
  expect(body.apiKey).toBe(SYNTHETIC_KEY);
  expect(JSON.stringify(body).split(SYNTHETIC_KEY)).toHaveLength(2);
  expect(body.auditTrail).toEqual({ persisted: true, chained: true });
  expect(h.generateCalls).toHaveLength(1); expect(h.chainEntries).toHaveLength(1);
  expect(h.auditEntries).toHaveLength(0);
  expect(h.order).toEqual(['BEGIN', 'GENERATE', 'AUDIT CHAIN', 'COMMIT']);
  expect(h.chainEntries[0].client).toBe(h.generateCalls[0][1]);
  expect(h.chainEntries[0].client).toBe(h.clients[0]);
  expect(h.keyState).toBe('active');
  expectNoCredentialCopies();
}

function expectSafeFailure(body: Record<string, unknown>) {
  expect(body.apiKey).toBeUndefined();
  expect(body).not.toMatchObject({ auditTrail: { persisted: true } });
  const text = JSON.stringify(body);
  expect(text).not.toContain(SYNTHETIC_KEY);
  expect(text).not.toContain(AUDIT_DRIVER_MARKER);
  expect(text).not.toContain(COMMIT_DRIVER_MARKER);
  expectNoCredentialCopies();
}

function expectLostAttemptAudit(body: Record<string, unknown>) {
  expect(body.auditTrail).toEqual({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: expect.any(String) });
  expect(JSON.stringify(body)).not.toContain(AUDIT_DRIVER_MARKER);
  expect(JSON.stringify(body)).not.toContain('relation audit_logs');
  expect(h.logs.some(row => row.scope === 'audit-write-outcome' && row.level === 'error')).toBe(true);
}

describe('POST API keys — one-time delivery requires a committed chained audit', () => {
  it('preserves metadata/expiry/rate normalization and records the trimmed reason on the same client', async () => {
    const expiry = '2100-10-14T00:00:00.000Z';
    const metadata = { integration: 'regulated-archive', purpose: 'read-only discovery' };
    const res = await create({ name: '  Research integration  ', expiresAt: expiry, rateLimit: 120, metadata, reason: '  Approved read-only archive integration  ' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ name: 'Research integration', scopes: SCOPES, expiresAt: expiry, keyId: KEY_ID, keyPrefix: KEY_PREFIX });
    expect(h.generateCalls).toEqual([[{ organizationId: ORG, name: 'Research integration', scopes: SCOPES, createdBy: CALLER, expiresAt: new Date(expiry), rateLimit: 120, metadata }, h.clients[0]]]);
    expect(h.chainEntries[0].entry).toMatchObject({
      tenantId: ORG, userId: CALLER, action: 'api_key_created', resourceType: 'api_key', resourceId: String(KEY_ID),
      reason: 'Approved read-only archive integration', userAgent: 'api-key-onboarding-test',
      details: { outcome: 'success', reason: 'Approved read-only archive integration', keyPrefix: KEY_PREFIX, scopes: SCOPES },
    });
    expect(h.chainEntries[0].entry.ipAddress).toMatch(/^(::ffff:)?127\.0\.0\.1$|^::1$/);
    expectOneTimeCommittedKey(res.body);
  });

  it('legacy reason omission and body tenant/actor spoofing preserve authenticated generation and audit scope', async () => {
    const res = await create({ tenantId: '999', organizationId: 999, userId: 99, actorId: 99 });
    expect(res.status).toBe(201); expect(res.body.expiresAt).toBeNull();
    expect(h.generateCalls).toEqual([[{ organizationId: ORG, name: 'Research integration', scopes: SCOPES, createdBy: CALLER, expiresAt: undefined, rateLimit: 60, metadata: undefined }, h.clients[0]]]);
    expect(h.chainEntries[0].entry).toMatchObject({ tenantId: ORG, userId: CALLER });
    expect(h.chainEntries[0].entry.reason).toBeUndefined();
    expectOneTimeCommittedKey(res.body);
  });

  it.each([['blank', '   '], ['over 2000 characters', 'r'.repeat(2001)], ['null', null]])('rejects a %s supplied reason before opening a transaction', async (_label, reason) => {
    const res = await create({ reason });
    expect(res.status).toBe(400); expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'reason' })]));
    expect(h.clients).toHaveLength(0); expect(h.generateCalls).toHaveLength(0);
    expect(h.chainEntries).toHaveLength(0); expect(h.auditEntries).toHaveLength(0);
    expect(res.body.apiKey).toBeUndefined();
  });

  it.each([1, 2, 501, 2000])('keeps the upstream trimmed reason policy: %i characters are accepted', async length => {
    const reason = 'r'.repeat(length);
    const res = await create({ reason: `  ${reason}  ` });
    expect(res.status).toBe(201);
    expect(h.chainEntries[0].entry).toMatchObject({ reason, details: { reason } });
    expectOneTimeCommittedKey(res.body);
  });

  it('a refused chained audit rolls creation back and returns 500 without any credential or mutation claim', async () => {
    h.chainFails = true;
    const res = await create({ reason: 'Approved read-only integration' });
    expect(res.status).toBe(500); expectSafeFailure(res.body);
    expect(h.order).toEqual(['BEGIN', 'GENERATE', 'AUDIT CHAIN', 'ROLLBACK']);
    expect(h.keyState).toBe('missing');
    expect(h.chainEntries[0].client).toBe(h.generateCalls[0][1]);
    expect(h.auditEntries).toHaveLength(0);
    const listed = await request(app).get('/api/api-keys');
    expect(listed.status).toBe(200); expect(listed.body.keys).toEqual([]);
  });

  it('a failed COMMIT returns no key or persisted audit claim even though the chained write was attempted', async () => {
    h.commitFails = true;
    const res = await create();
    expect(res.status).toBe(500); expectSafeFailure(res.body);
    expect(h.order).toEqual(['BEGIN', 'GENERATE', 'AUDIT CHAIN', 'COMMIT', 'ROLLBACK']);
    expect(h.keyState).toBe('missing'); expect(h.auditEntries).toHaveLength(0);
  });

  it('a later list never returns the raw key from a successful committed creation', async () => {
    const created = await create();
    expect(created.status).toBe(201); expectOneTimeCommittedKey(created.body);
    const listed = await request(app).get('/api/api-keys');
    expect(listed.status).toBe(200); expect(listed.body.total).toBe(1);
    expect(h.listCalls).toEqual([[ORG]]);
    expect(JSON.stringify(listed.body)).not.toContain(SYNTHETIC_KEY);
    expect(h.generateCalls).toHaveLength(1); expect(h.chainEntries).toHaveLength(1);
    expectNoCredentialCopies();
  });
});

describe('DELETE API keys — revocation and the chained record commit together', () => {
  it('returns a committed auditTrail and keeps the credential and audit scoped to the authenticated tenant', async () => {
    h.keyState = 'active';
    const res = await revoke({ organizationId: 999, tenantId: '999', userId: 99 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ keyId: KEY_ID, auditTrail: { persisted: true, chained: true } });
    expect(h.revokeCalls).toEqual([[KEY_ID, ORG, h.clients[0]]]);
    expect(h.order).toEqual(['BEGIN', 'REVOKE', 'AUDIT CHAIN', 'COMMIT']);
    expect(h.chainEntries).toHaveLength(1);
    expect(h.chainEntries[0].client).toBe(h.revokeCalls[0][2]);
    expect(h.chainEntries[0].entry).toMatchObject({ tenantId: ORG, userId: CALLER, action: 'api_key_revoked', resourceType: 'api_key', resourceId: String(KEY_ID), details: { outcome: 'success' } });
    expect(h.keyState).toBe('revoked'); expect(h.auditEntries).toHaveLength(0);
    expect(h.generateCalls).toHaveLength(0); expectNoCredentialCopies();
  });

  it('a refused chained audit rolls revocation back, leaves the key active and returns 500', async () => {
    h.keyState = 'active'; h.chainFails = true;
    const res = await revoke();
    expect(res.status).toBe(500); expectSafeFailure(res.body);
    expect(h.revokeCalls).toEqual([[KEY_ID, ORG, h.clients[0]]]);
    expect(h.order).toEqual(['BEGIN', 'REVOKE', 'AUDIT CHAIN', 'ROLLBACK']);
    expect(h.chainEntries[0].client).toBe(h.revokeCalls[0][2]);
    expect(h.keyState).toBe('active'); expect(h.auditEntries).toHaveLength(0);
  });

  it('a failed revocation COMMIT preserves the active key and reports no persisted success', async () => {
    h.keyState = 'active'; h.commitFails = true;
    const res = await revoke();
    expect(res.status).toBe(500); expectSafeFailure(res.body);
    expect(h.order).toEqual(['BEGIN', 'REVOKE', 'AUDIT CHAIN', 'COMMIT', 'ROLLBACK']);
    expect(h.keyState).toBe('active'); expect(h.auditEntries).toHaveLength(0);
  });
});

describe('refused revocation — no credential mutation, real canonical attempt audit outcome', () => {
  it.each(['chained', 'tamper-proof-only', 'lost', 'rejected'] as const)('a missing/foreign/already-revoked key with a %s attempt audit remains 404', async mode => {
    h.auditMode = mode; h.revoked = false;
    const res = await revoke({ organizationId: 999, userId: 99 });
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.error).toBe('API key not found or already revoked');
    expect(h.revokeCalls).toEqual([[KEY_ID, ORG, h.clients[0]]]);
    expect(h.order).toEqual(['BEGIN', 'REVOKE', 'COMMIT', 'AUDIT GENERAL']);
    expect(h.chainEntries).toHaveLength(0); expect(h.auditEntries).toHaveLength(1);
    expect(h.auditEntries[0]).toMatchObject({
      tenantId: ORG, userId: CALLER, action: 'api_key_revoked', resourceId: String(KEY_ID),
      reason: 'not_found_or_already_revoked', details: { outcome: 'failure', reason: 'not_found_or_already_revoked' },
    });
    if (mode === 'lost' || mode === 'rejected') expectLostAttemptAudit(res.body);
    else expect(res.body.auditTrail).toEqual({ persisted: true, chained: mode === 'chained' });
    expect(h.keyState).toBe('missing'); expect(h.generateCalls).toHaveLength(0);
    expectNoCredentialCopies();
  });
});
