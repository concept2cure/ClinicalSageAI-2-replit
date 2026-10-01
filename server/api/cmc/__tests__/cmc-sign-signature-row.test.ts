/**
 * P0-10b (DP-02): the three CMC signatures that re-authenticate the signer must
 * also write the electronic_signatures row, on the same transaction as the
 * ledger `sign`.
 *
 * Until 2026-10-01 a batch release (batchRecordRoutes.ts), a specification
 * approval (specificationRoutes.ts) and a register qualification
 * (routes.ts, qualifyRegisterRecord) ran verifyReauth and recorded
 * `command='sign'` on the governed ledger, and wrote nothing else. An inspector
 * querying electronic_signatures found no 11.50 manifestation (printed name,
 * time, meaning) and no 11.70 binding for any of them. The Module 3 section
 * approval in module3OperatingSystemRoutes.ts already wrote the row; these did
 * not.
 *
 * The real handlers run against a fake transaction client that records the
 * order of writes; the ledger, the signature row and re-verification are
 * stubbed at their module boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const GOOD = 'correct horse battery staple';

const h = vi.hoisted(() => {
  const state = { log: [] as string[], sigFail: null as unknown };
  const ROW = { id: 9, status: 'draft', approval_status: 'draft', project_id: null, tenant_id: '7', organization_id: 7 };
  const client = {
    query: async (sql: string) => {
      const word = sql.trim().split(/\s+/)[0].toUpperCase();
      if (word === 'BEGIN' || word === 'COMMIT' || word === 'ROLLBACK') state.log.push(word);
      if (word === 'UPDATE') {
        state.log.push('DOMAIN');
        return { rows: [ROW], rowCount: 1 };
      }
      if (word === 'SELECT') return { rows: [ROW], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  /* routes.ts re-reads a qualified record through Drizzle after COMMIT. */
  const drizzleRead = { select: () => ({ from: () => ({ where: async () => [{ id: 9 }] }) }) };
  return Object.assign(state, { client, drizzleRead });
});

vi.mock('../../../db', () => ({
  getPool: () => ({ connect: async () => h.client, query: h.client.query }),
  pool: { connect: async () => h.client, query: h.client.query },
  db: h.drizzleRead,
}));
vi.mock('../../../services/cmc/link-to-module3', () => ({
  linkToModule3: async () => ({ module3Linked: true }),
}));

const verifyReauth = vi.fn(async (_userId: number, reauth?: { password?: string }) => {
  if (!reauth?.password) return { ok: false, error: 'REAUTH_PASSWORD_REQUIRED' };
  return reauth.password === GOOD ? { ok: true } : { ok: false, error: 'REAUTH_PASSWORD_INVALID' };
});
const ledgerClients: unknown[] = [];
const recordGovernedAction = vi.fn(async (c: unknown, p: { command: string; target: string }) => {
  ledgerClients.push(c);
  h.log.push(`LEDGER:${p.command}:${p.target}`);
  return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' };
});
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => verifyReauth(...(a as [number, { password?: string }])),
  recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...(a as [unknown, { command: string; target: string }])),
}));

interface SigParams {
  target: string;
  payload: { meaning?: unknown };
  actionId: string;
  auditId: string;
  authenticationMethod: string;
  binding: { digest: string | null; basis: string; note: string };
}
const signatureClients: unknown[] = [];
const persistGovernedActionSignature = vi.fn(async (c: unknown, p: SigParams) => {
  if (h.sigFail) throw h.sigFail;
  signatureClients.push(c);
  h.log.push(`SIGNATURE:${p.target}`);
  return { id: 271, signedAt: new Date('2026-10-01T00:00:00Z') };
});
vi.mock('../../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedActionSignature: (...a: unknown[]) => persistGovernedActionSignature(...(a as [unknown, SigParams])),
}));

import batchRecordRouter from '../batchRecordRoutes';
import specificationRouter from '../specificationRoutes';
import cmcRouter from '../routes';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const r = req as unknown as Record<string, unknown>;
  r.user = { id: 42, organizationId: 7 };
  r.userId = 42;
  r.tenantId = 7;
  r.tenantContext = { organizationId: 7 };
  next();
});
app.use('/api/cmc/batch-records', batchRecordRouter);
app.use('/api/cmc/specifications', specificationRouter);
app.use('/api/cmc', cmcRouter);

const REASON = 'Signed after review of the executed record';
const CASES = [
  {
    name: 'batch release',
    path: '/api/cmc/batch-records/9/release',
    body: { decision: 'approved', releasedBy: 'QA Head', releaseTesting: { assay: 'pass' }, reason: REASON },
    target: 'batch:9',
    meaning: 'release',
  },
  {
    name: 'specification approval',
    path: '/api/cmc/specifications/9/approve',
    body: { reason: REASON, meaning: 'approval' },
    target: 'specification:9',
    meaning: 'approval',
  },
  {
    name: 'container-closure qualification',
    path: '/api/cmc/container-closures/9/qualify',
    body: { reason: REASON, meaning: 'review' },
    target: 'container_closure:9',
    meaning: 'review',
  },
];

beforeEach(() => {
  h.log = [];
  h.sigFail = null;
  ledgerClients.length = 0;
  signatureClients.length = 0;
  vi.clearAllMocks();
});

describe.each(CASES)('CMC $name writes the electronic_signatures row with its ledger sign', (c) => {
  it('records the signature row on the ledger\'s own client, before COMMIT', async () => {
    const res = await request(app).post(c.path).send({ ...c.body, reauth: { password: GOOD } });
    expect(res.status).toBe(200);
    const ledger = h.log.indexOf(`LEDGER:sign:${c.target}`);
    const signature = h.log.indexOf(`SIGNATURE:${c.target}`);
    expect(ledger).toBeGreaterThan(h.log.indexOf('DOMAIN'));
    expect(signature).toBeGreaterThan(ledger);
    expect(h.log.indexOf('COMMIT')).toBeGreaterThan(signature);
    expect(signatureClients[0]).toBe(ledgerClients[0]);

    const sig = persistGovernedActionSignature.mock.calls[0][1];
    expect(sig.actionId).toBe('act_1');
    expect(sig.auditId).toBe('aud_1');
    expect(sig.payload.meaning).toBe(c.meaning);
    expect(sig.authenticationMethod).toBe('password');
    // No content basis is registered for this record, and none is claimed.
    expect(sig.binding).toMatchObject({ digest: null, basis: 'governed-action-sha256-chain' });
  });

  it('a signature row that cannot be written rolls the signed act back', async () => {
    h.sigFail = new Error('signer identity unresolvable');
    const res = await request(app).post(c.path).send({ ...c.body, reauth: { password: GOOD } });
    expect(res.status).toBe(500);
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    expect(JSON.stringify(res.body)).not.toContain('signer identity unresolvable');
  });

  it('a request with no credentials is refused and writes nothing', async () => {
    const res = await request(app).post(c.path).send(c.body);
    expect(res.status).toBe(401);
    expect(h.log.filter((e) => e === 'BEGIN' || e === 'DOMAIN' || e.startsWith('LEDGER') || e.startsWith('SIGNATURE'))).toEqual([]);
  });
});
