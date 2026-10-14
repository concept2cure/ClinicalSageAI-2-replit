/**
 * W1 / D2: API-key setup carries the canonical audit outcome without losing
 * the key's one-time response when its already-completed creation has no
 * durable audit row. The real route and recordAuditRow run here; credentials,
 * authentication and durable services are explicit recorders.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

type AuditMode = 'chained' | 'tamper-proof-only' | 'lost' | 'rejected';
const h = vi.hoisted(() => ({
  tenantId: 777 as number | undefined,
  userId: 42 as number | undefined,
  auditMode: 'chained' as AuditMode,
  auditEntries: [] as Array<Record<string, unknown>>,
  generateCalls: [] as unknown[][],
  revokeCalls: [] as unknown[][],
  listCalls: [] as unknown[][],
  order: [] as string[],
  revoked: true,
  logs: [] as Array<{ scope: string; level: string; message: string; context?: unknown }>,
}));

// This marker is deliberately not a real credential or a usable key format.
const SYNTHETIC_KEY = 'synthetic-api-key-for-unit-test-only';
const AUDIT_DRIVER_MARKER = 'SYNTHETIC_AUDIT_DRIVER_ONLY_MARKER relation audit_logs unavailable';
const ORG = 777;
const CALLER = 42;
const KEY_ID = 31;
const KEY_PREFIX = 'unit-key';
const SCOPES = ['documents:read', 'regulatory:read'];

vi.mock('../../auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.tenantId = h.tenantId;
    req.userId = h.userId;
    next();
  },
  requireAdminRole: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../services/api-key-service.js', () => ({
  generateApiKey: vi.fn(async (...args: unknown[]) => {
    h.order.push('GENERATE');
    h.generateCalls.push(args);
    return { keyId: KEY_ID, rawKey: SYNTHETIC_KEY, keyPrefix: KEY_PREFIX };
  }),
  revokeApiKey: vi.fn(async (...args: unknown[]) => {
    h.order.push('REVOKE'); h.revokeCalls.push(args);
    return h.revoked;
  }),
  listApiKeys: vi.fn(async (...args: unknown[]) => {
    h.listCalls.push(args);
    return [{ id: KEY_ID, name: 'Research integration', keyPrefix: KEY_PREFIX, scopes: SCOPES, status: 'active' }];
  }),
  validateApiKey: vi.fn(),
  getApiKeyUsage: vi.fn(),
}));

vi.mock('../../services/auditService', () => ({
  default: {
    logAction: vi.fn(async (entry: Record<string, unknown>) => {
      h.order.push('AUDIT'); h.auditEntries.push(entry);
      if (h.auditMode === 'rejected') throw new Error(AUDIT_DRIVER_MARKER);
      if (h.auditMode === 'lost') return { persisted: false, chained: false, tamperProof: false, error: AUDIT_DRIVER_MARKER };
      return { persisted: true, chained: h.auditMode === 'chained', tamperProof: true };
    }),
  },
}));

function logger(scope: string) {
  return Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level,
    (message: string, context?: unknown) => h.logs.push({ scope, level, message, context }),
  ]));
}

// Capture calls before any logger redaction, so the no-key-in-logs assertion
// also detects an accidental raw-key copy that redaction would hide.
vi.mock('../../utils/logger.js', () => ({ createScopedLogger: logger }));
vi.mock('../../utils/logger', () => ({ createScopedLogger: logger }));

let app: express.Express;
beforeEach(async () => {
  h.tenantId = ORG; h.userId = CALLER; h.auditMode = 'chained';
  h.auditEntries = []; h.generateCalls = []; h.revokeCalls = []; h.listCalls = [];
  h.order = []; h.logs = []; h.revoked = true;
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
  expect(JSON.stringify(h.logs)).not.toContain(SYNTHETIC_KEY);
}

function expectOneTimeKey(body: Record<string, unknown>) {
  expect(body.apiKey).toBe(SYNTHETIC_KEY);
  expect(JSON.stringify(body).split(SYNTHETIC_KEY)).toHaveLength(2);
  expect(h.generateCalls).toHaveLength(1);
  expect(h.auditEntries).toHaveLength(1);
  expect(h.order).toEqual(['GENERATE', 'AUDIT']);
  expectNoCredentialCopies();
}

function expectLostAudit(body: Record<string, unknown>) {
  expect(body.auditTrail).toEqual({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: expect.any(String) });
  expect(JSON.stringify(body)).not.toContain(AUDIT_DRIVER_MARKER);
  expect(JSON.stringify(body)).not.toContain('relation audit_logs');
  expect(h.logs.some(row => row.scope === 'audit-write-outcome' && row.level === 'error')).toBe(true);
}

describe('POST API keys — one-time delivery with an honest audit outcome', () => {
  it('preserves metadata/expiry/rate normalization and stores the trimmed creation reason in both audit fields', async () => {
    const expiry = '2100-10-14T00:00:00.000Z';
    const metadata = { integration: 'regulated-archive', purpose: 'read-only discovery' };
    const res = await create({ name: '  Research integration  ', expiresAt: expiry, rateLimit: 120, metadata, reason: '  Approved read-only archive integration  ' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ name: 'Research integration', scopes: SCOPES, expiresAt: expiry, keyId: KEY_ID, keyPrefix: KEY_PREFIX, auditTrail: { persisted: true, chained: true } });
    expect(h.generateCalls).toEqual([[ORG, 'Research integration', SCOPES, CALLER, new Date(expiry), 120, metadata]]);
    expect(h.auditEntries).toEqual([expect.objectContaining({
      tenantId: ORG, userId: CALLER, action: 'api_key_created', resourceType: 'api_key', resourceId: String(KEY_ID),
      reason: 'Approved read-only archive integration', userAgent: 'api-key-onboarding-test',
      details: { outcome: 'success', reason: 'Approved read-only archive integration', keyPrefix: KEY_PREFIX, scopes: SCOPES },
    })]);
    expect(h.auditEntries[0].ipAddress).toMatch(/^(::ffff:)?127\.0\.0\.1$|^::1$/);
    expectOneTimeKey(res.body);
  });

  it('legacy callers may omit reason; tenant/user spoofing never changes the authenticated generation or audit actor', async () => {
    const res = await create({ tenantId: '999', organizationId: 999, userId: 99, actorId: 99 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ apiKey: SYNTHETIC_KEY, expiresAt: null, auditTrail: { persisted: true, chained: true } });
    expect(h.generateCalls).toEqual([[ORG, 'Research integration', SCOPES, CALLER, undefined, 60, undefined]]);
    expect(h.auditEntries[0]).toMatchObject({ tenantId: ORG, userId: CALLER });
    expect(h.auditEntries[0].reason).toBeUndefined();
    expectOneTimeKey(res.body);
  });

  it.each([
    ['blank', '   '], ['too short after trimming', ' ab '], ['too long', 'r'.repeat(501)], ['null', null],
  ])('rejects a %s supplied reason before generating or auditing a key', async (_label, reason) => {
    const res = await create({ reason });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'reason' })]));
    expect(h.generateCalls).toHaveLength(0); expect(h.auditEntries).toHaveLength(0);
    expect(res.body.apiKey).toBeUndefined();
  });

  it.each([3, 500])('accepts the trimmed %i-character reason boundary', async length => {
    const reason = 'r'.repeat(length);
    const res = await create({ reason: `  ${reason}  ` });
    expect(res.status).toBe(201);
    expect(h.auditEntries[0]).toMatchObject({ reason, details: { reason } });
    expectOneTimeKey(res.body);
  });

  it('reports a tamper-proof-only audit as persisted but not chained', async () => {
    h.auditMode = 'tamper-proof-only';
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: false });
    expectOneTimeKey(res.body);
  });

  it.each(['lost', 'rejected'] as const)('a %s audit still returns the already-created key once with 201 and a safe warning', async mode => {
    h.auditMode = mode;
    const res = await create({ reason: 'Approved read-only integration' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectOneTimeKey(res.body); expectLostAudit(res.body);
    expect(h.revokeCalls).toHaveLength(0);
  });

  it('a later list never returns the raw key, including after a rejected creation audit', async () => {
    h.auditMode = 'rejected';
    const created = await create();
    expect(created.status).toBe(201); expectOneTimeKey(created.body);
    const listed = await request(app).get('/api/api-keys');
    expect(listed.status).toBe(200); expect(listed.body.total).toBe(1);
    expect(h.listCalls).toEqual([[ORG]]);
    expect(JSON.stringify(listed.body)).not.toContain(SYNTHETIC_KEY);
    expect(h.generateCalls).toHaveLength(1); expect(h.auditEntries).toHaveLength(1);
    expectNoCredentialCopies();
  });
});

describe('DELETE API keys — the actual audit outcome accompanies the revocation result', () => {
  it.each(['chained', 'tamper-proof-only', 'lost', 'rejected'] as const)('successful revocation with a %s audit remains scoped and 200', async mode => {
    h.auditMode = mode;
    const res = await revoke({ organizationId: 999, tenantId: '999', userId: 99 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.keyId).toBe(KEY_ID);
    expect(h.revokeCalls).toEqual([[KEY_ID, ORG]]);
    expect(h.order).toEqual(['REVOKE', 'AUDIT']);
    expect(h.auditEntries).toHaveLength(1);
    expect(h.auditEntries[0]).toMatchObject({ tenantId: ORG, userId: CALLER, action: 'api_key_revoked', resourceType: 'api_key', resourceId: String(KEY_ID), details: { outcome: 'success' } });
    if (mode === 'lost' || mode === 'rejected') expectLostAudit(res.body);
    else expect(res.body.auditTrail).toEqual({ persisted: true, chained: mode === 'chained' });
    expect(h.generateCalls).toHaveLength(0); expectNoCredentialCopies();
  });

  it.each(['chained', 'tamper-proof-only', 'lost', 'rejected'] as const)('a missing/foreign/already-revoked key with a %s audit remains 404', async mode => {
    h.auditMode = mode; h.revoked = false;
    const res = await revoke({ organizationId: 999, userId: 99 });
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.error).toBe('API key not found or already revoked');
    expect(h.revokeCalls).toEqual([[KEY_ID, ORG]]);
    expect(h.auditEntries).toHaveLength(1);
    expect(h.auditEntries[0]).toMatchObject({
      tenantId: ORG, userId: CALLER, action: 'api_key_revoked', resourceId: String(KEY_ID),
      details: { outcome: 'failure', reason: 'not_found_or_already_revoked' },
    });
    if (mode === 'lost' || mode === 'rejected') expectLostAudit(res.body);
    else expect(res.body.auditTrail).toEqual({ persisted: true, chained: mode === 'chained' });
    expect(h.generateCalls).toHaveLength(0); expectNoCredentialCopies();
  });
});
