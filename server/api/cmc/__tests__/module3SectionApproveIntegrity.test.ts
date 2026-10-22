/**
 * Section approval integrity (GA plan item 4, decision 2026-10-05).
 *
 * - The reason is the signer's: the route used to record "Approved Module 3
 *   section <key>" when none was stated.
 * - What the signature depends on is read inside the transaction, with the
 *   section locked: the critical-contradiction check ran before BEGIN.
 * - What the signer read is what is signed: a recompile since then refuses.
 * - The idempotency key is the organisation's: the column is globally unique,
 *   so another tenant's key made the signature fail; a retry replays.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown[] | undefined]>,
  section: null as Record<string, unknown> | null,
  prior: null as Record<string, unknown> | null,
}));
const mockVerifyReauth = vi.fn(async () => ({ ok: true }));
const mockRecordGoverned = vi.fn(async () => ({ actionId: 'act-1', auditId: 'aud-1', sha256Chain: 'chain' }));

vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: async () => true }));
/* One signing-authority policy (services/part11/signing-authority-gate,
   P-27, 2026-10-08): null admits the signer. Whether the gate itself refuses a
   viewer, and fails closed when the role cannot be read, is its own suite's. */
vi.mock('../../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: async () => null }));
/* Four-eyes on a section approval — the signer may not be one of the people who
   ENTERED the register records the section cites — is a control with its own
   suite, against a real Postgres and the real audit chain
   (services/cmc/__tests__/section-approval-separation-of-duties.pglite.integration.test.ts),
   and its own route cases (module3SectionApproveFourEyes.test.ts). Here it is a
   pass-through, because these cases drive the SQL and audit sequence and would
   otherwise all refuse on a fixture that cites no recorded source. */
vi.mock('../../../services/governance/separation-of-duties', () => ({
  assertSignerIsNotAuthor: async () => ({ checked: true, reason: 'stubbed in this suite' }),
  cmcModule3SectionTarget: (projectId: string, sectionKey: string) =>
    `cmc-module3-section:${projectId}:${sectionKey}`,
  separationOfDutiesRefusal: () => null,
}));
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => mockVerifyReauth(...(a as [])),
  recordGovernedAction: (...a: unknown[]) => mockRecordGoverned(...(a as [])),
}));
vi.mock('../../../services/governed-ana-execution.js', () => ({ buildCanonicalGovernedState: async () => ({ ok: true }) }));
vi.mock('../../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedActionSignature: async () => ({ id: 1, signedAt: new Date() }),
}));
vi.mock('../../../db', () => {
  const query = async (sql: string, params?: unknown[]) => {
    h.calls.push([sql, params]);
    if (/FROM c2c_ana_actions/.test(sql)) return { rows: h.prior ? [h.prior] : [] };
    if (/FROM cmc_module3_sections/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: h.section ? [h.section] : [] };
    if (/MAX\(version_number\)/.test(sql)) return { rows: [{ max_version: 0 }] };
    if (/INSERT INTO cmc_module3_section_versions/.test(sql)) return { rows: [{ id: 'ver-1' }] };
    if (/^\s*UPDATE cmc_module3_sections/.test(sql)) return { rows: [], rowCount: 1 };
    return { rows: [] };
  };
  return { getPool: () => ({ query, connect: async () => ({ query, release: vi.fn() }) }) };
});

import router from '../module3OperatingSystemRoutes';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = 101;
  req.tenantContext = { organizationId: 101 };
  req.user = { id: 1, organizationId: 101 };
  next();
});
app.use('/api/cmc/module3-os', router);

const COMPLETE = { completeness: 100, missingInputs: [] as string[], tables: [] as unknown[] };
const URL = '/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve';
const REASON = 'Reviewed against the executed batch record and CoA.';
const sqls = () => h.calls.map(([s]) => s.replace(/\s+/g, ' ').trim());

beforeEach(() => {
  h.calls = [];
  h.prior = null;
  h.section = { id: 'sec-1', deterministic_json: COMPLETE, narrative_text: 'n', approval_state: 'draft', stale: false, compiled_hash: 'hash-A' };
  mockVerifyReauth.mockClear();
  mockRecordGoverned.mockClear();
});

describe('section approval: the reason is the signer’s', () => {
  it('refuses an approval with no stated reason — before the password, before any SQL', async () => {
    for (const reason of [undefined, '', 'ok']) {
      const res = await request(app).post(URL).send({ reason, meaning: 'approval', reauth: { password: 'pw' } });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'REASON_REQUIRED', field: 'reason' });
    }
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it('records exactly the reason the signer stated', async () => {
    const res = await request(app).post(URL).send({ reason: REASON, meaning: 'approval', reauth: { password: 'pw' } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((mockRecordGoverned.mock.calls[0] as unknown[])[1]).toMatchObject({ reason: REASON });
  });
});

describe('section approval: what it depends on is read inside the transaction', () => {
  it('locks the section, then reads the blocking contradictions, after BEGIN', async () => {
    await request(app).post(URL).send({ reason: REASON, meaning: 'approval', reauth: { password: 'pw' } });
    const order = sqls();
    const begin = order.indexOf('BEGIN');
    const lock = order.findIndex((s) => /FROM cmc_module3_sections .*FOR UPDATE/.test(s));
    const blocking = order.findIndex((s) => /FROM cmc_contradictions/.test(s));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(blocking).toBeGreaterThan(lock);
  });

  it('refuses when the section was recompiled after the signer read it, and signs nothing', async () => {
    const res = await request(app).post(URL).send({ reason: REASON, meaning: 'approval', compiledHash: 'hash-OLD', reauth: { password: 'pw' } });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SECTION_CHANGED');
    expect(mockRecordGoverned).not.toHaveBeenCalled();
    expect(sqls()).toContain('ROLLBACK');
  });

  it('guards the state flip on the hash it read', async () => {
    await request(app).post(URL).send({ reason: REASON, meaning: 'approval', compiledHash: 'hash-A', reauth: { password: 'pw' } });
    const flip = h.calls.find(([s]) => /^\s*UPDATE cmc_module3_sections/.test(s));
    expect(flip?.[0]).toMatch(/compiled_hash IS NOT DISTINCT FROM \$3/);
    expect(flip?.[1]).toEqual(['ver-1', 'sec-1', 'hash-A']);
  });
});

describe('section approval: the idempotency key is the organisation’s', () => {
  it('namespaces the key by organisation on the ledger', async () => {
    await request(app).post(URL).send({ reason: REASON, meaning: 'approval', idempotencyKey: 'k-1', reauth: { password: 'pw' } });
    expect((mockRecordGoverned.mock.calls[0] as unknown[])[1]).toMatchObject({ idempotencyKey: 'cmc-m3-approve:101:k-1' });
    const lookup = h.calls.find(([s]) => /FROM c2c_ana_actions/.test(s));
    expect(lookup?.[1]).toEqual([101, 'cmc-m3-approve:101:k-1']);
  });

  it('a retry with the same key replays the approval it made, and signs nothing new', async () => {
    h.prior = { id: 'act-earlier', payload: { versionNumber: 4, approvedVersionId: 'ver-4' } };
    const res = await request(app).post(URL).send({ reason: REASON, meaning: 'approval', idempotencyKey: 'k-1', reauth: { password: 'pw' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ replayed: true, versionNumber: 4, approvedVersionId: 'ver-4', governance: { actionId: 'act-earlier' } });
    expect(mockRecordGoverned).not.toHaveBeenCalled();
    expect(sqls().some((s) => /INSERT INTO cmc_module3_section_versions/.test(s))).toBe(false);
  });
});
