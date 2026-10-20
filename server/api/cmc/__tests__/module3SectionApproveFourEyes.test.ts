/**
 * The approver of a Module 3 section may not be one of the people who ENTERED
 * the register records it was composed from — at the route, where the
 * signature is made.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * This endpoint checked re-authentication, signing authority, a stated reason,
 * the signature's meaning, the read-before-sign hash, open critical
 * contradictions, completeness, staleness, lineage drift and superseded
 * evidence — and not who wrote the data. One person could record every register
 * row a section cites and then sign the approval that puts it in an IND.
 * URS-007 §3 said so, and said why it could not be fixed: the record-level
 * audit rows naming that writer did not exist. They landed on 2026-10-18
 * (services/cmc/register-audit.ts).
 *
 * And a second, narrower hole: the route accepted the §11.50(a)(3) meaning
 * "authorship", which is precisely the meaning that switches the four-eyes
 * check off (`requiresIndependence`). The platform closed the same hole on
 * freeze/dispatch on 2026-10-05, where a release signer could be the
 * sequence's creator by choosing it.
 *
 * ── What these cases hold ────────────────────────────────────────────────────
 * The rule itself, over a real Postgres and the real audit chain, is
 * services/cmc/__tests__/section-approval-separation-of-duties.pglite.integration.test.ts.
 * Here it is the route's behaviour: which status, and that NOTHING is written.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown[] | undefined]>,
  section: null as Record<string, unknown> | null,
  /** The records the section's lineage cites: [source_type, record id]. */
  cites: [] as Array<[string, string]>,
  /** Who the chain records for each: [register, record id, actor]. */
  recorded: [] as Array<[string, string, number]>,
  auditReadFails: false,
}));
const mockVerifyReauth = vi.fn(async () => ({ ok: true }));
const mockRecordGoverned = vi.fn(async () => ({ actionId: 'act-1', auditId: 'aud-1', sha256Chain: 'chain' }));

vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: async () => true }));
vi.mock('../../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: async () => null }));
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => mockVerifyReauth(...(a as [])),
  recordGovernedAction: (...a: unknown[]) => mockRecordGoverned(...(a as [])),
}));
vi.mock('../../../services/governed-ana-execution.js', () => ({ buildCanonicalGovernedState: async () => ({ ok: true }) }));
vi.mock('../../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedActionSignature: async () => ({ id: 1, signedAt: new Date() }),
}));

/* The governance service is NOT mocked: it is the subject. Its default reader
   is the pool, which it never uses here because the route hands it the
   transaction's client. */
vi.mock('../../../db', () => {
  const query = async (sql: string, params?: unknown[]) => {
    h.calls.push([sql, params]);
    /* The section's cited sources — the lineage read the four-eyes check walks.
       Distinguished from findSectionDrift's lineage read, which selects
       source_hash_at_compile; this one orders by source type. */
    if (/FROM cmc_module3_sections/.test(sql) && /ORDER BY o\.source_type/.test(sql)) {
      return { rows: h.cites.map(([sourceType, id]) => ({ sourceType, sourceKey: `${sourceType}:${id}` })) };
    }
    if (/FROM audit_logs/.test(sql)) {
      if (h.auditReadFails) {
        const e = new Error('relation "audit_logs" does not exist') as Error & { code?: string };
        e.code = '42P01';
        throw e;
      }
      return { rows: h.recorded.map(([register, recordId, actorId]) => ({ register, recordId, actorId })) };
    }
    if (/FROM c2c_ana_actions/.test(sql)) return { rows: [] };
    if (/FROM cmc_module3_sections/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: h.section ? [h.section] : [] };
    if (/MAX\(version_number\)/.test(sql)) return { rows: [{ max_version: 0 }] };
    if (/INSERT INTO cmc_module3_section_versions/.test(sql)) return { rows: [{ id: 'ver-1' }] };
    if (/^\s*UPDATE cmc_module3_sections/.test(sql)) return { rows: [], rowCount: 1 };
    return { rows: [] };
  };
  /* `pool` and `db` are exported because the modules the route now reaches
     import them at module scope: separation-of-duties.ts takes `pool` as its
     DEFAULT authorship reader (never used here — the route hands it the
     transaction's client) and register-audit.ts takes `db` for the register
     insert, which this endpoint never makes. */
  return {
    getPool: () => ({ query, connect: async () => ({ query, release: vi.fn() }) }),
    pool: { query },
    db: {},
  };
});

import router from '../module3OperatingSystemRoutes';

const ORG = 101;
const RECORDER = 1;
const COLLEAGUE = 2;

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = ORG;
  req.tenantContext = { organizationId: ORG };
  req.user = { id: RECORDER, organizationId: ORG };
  next();
});
app.use('/api/cmc/module3-os', router);

/** A second app whose session is a colleague, not the recorder. */
const colleagueApp = express();
colleagueApp.use(express.json());
colleagueApp.use((req: any, _res, next) => {
  req.tenantId = ORG;
  req.tenantContext = { organizationId: ORG };
  req.user = { id: COLLEAGUE, organizationId: ORG };
  next();
});
colleagueApp.use('/api/cmc/module3-os', router);

const COMPLETE = { completeness: 100, missingInputs: [] as string[], tables: [] as unknown[] };
const URL = '/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve';
const REASON = 'Reviewed against the executed batch record and CoA.';
const sqls = () => h.calls.map(([s]) => s.replace(/\s+/g, ' ').trim());
const wroteNothing = () => {
  expect(mockRecordGoverned, 'a governed action was recorded').not.toHaveBeenCalled();
  expect(sqls().some((s) => /INSERT INTO cmc_module3_section_versions/.test(s)), 'a version was written').toBe(false);
  expect(sqls().some((s) => /^UPDATE cmc_module3_sections/.test(s)), 'the state was flipped').toBe(false);
};

beforeEach(() => {
  h.calls = [];
  h.section = { id: 'sec-1', deterministic_json: COMPLETE, narrative_text: 'n', approval_state: 'draft', stale: false, compiled_hash: 'hash-A' };
  h.cites = [['specification', '11'], ['method', '22']];
  h.recorded = [['specification', '11', RECORDER], ['analytical_method', '22', RECORDER]];
  h.auditReadFails = false;
  mockVerifyReauth.mockClear();
  mockRecordGoverned.mockClear();
});

describe('an approval is not an authorship signature', () => {
  it('refuses the authorship meaning before the password and before any SQL', async () => {
    const res = await request(app)
      .post(URL)
      .send({ reason: REASON, meaning: 'authorship', reauth: { password: 'pw' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('APPROVAL_IS_NOT_AUTHORSHIP');
    expect(res.body.detail).toMatch(/review, approval or responsibility/);
    expect(res.body.detail).toMatch(/Nothing was signed/);
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it.each(['approval', 'review', 'responsibility'])('still accepts %s', async (meaning) => {
    const res = await request(colleagueApp).post(URL).send({ reason: REASON, meaning, reauth: { password: 'pw' } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe('the person who entered the records cannot approve the section', () => {
  it('refuses the recorder with 403, rolls back, and writes nothing', async () => {
    const res = await request(app).post(URL).send({ reason: REASON, meaning: 'approval', reauth: { password: 'pw' } });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toBe('SEPARATION_OF_DUTIES');
    expect(res.body.detail).toMatch(/you are an author of this record/);
    expect(sqls()).toContain('ROLLBACK');
    wroteNothing();
  });

  it('admits a colleague, and the approval lands', async () => {
    const res = await request(colleagueApp).post(URL).send({ reason: REASON, meaning: 'approval', reauth: { password: 'pw' } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.approvedVersionId).toBe('ver-1');
    expect(mockRecordGoverned).toHaveBeenCalled();
  });

  it('checks only AFTER the section row is locked, and before anything is written', async () => {
    await request(colleagueApp).post(URL).send({ reason: REASON, meaning: 'approval', reauth: { password: 'pw' } });
    const order = sqls();
    const lock = order.findIndex((s) => /FROM cmc_module3_sections .*FOR UPDATE/.test(s));
    const lineage = order.findIndex((s) => /ORDER BY o\.source_type/.test(s));
    const insert = order.findIndex((s) => /INSERT INTO cmc_module3_section_versions/.test(s));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lineage).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(lineage);
  });

  it('refuses with 409 when a cited record has no recorded operator, and names it', async () => {
    h.recorded = [['specification', '11', RECORDER]];
    const res = await request(colleagueApp).post(URL).send({ reason: REASON, meaning: 'approval', reauth: { password: 'pw' } });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SEPARATION_OF_DUTIES_AUTHOR_UNRESOLVED');
    expect(res.body.detail).toContain('method:22');
    wroteNothing();
  });

  it('refuses with 409 when the section cites no recorded source', async () => {
    h.cites = [];
    h.recorded = [];
    const res = await request(colleagueApp).post(URL).send({ reason: REASON, meaning: 'approval', reauth: { password: 'pw' } });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.detail).toMatch(/cites no recorded source/);
    wroteNothing();
  });

  it('answers 503 — not 200 — when the check could not run', async () => {
    h.auditReadFails = true;
    const res = await request(colleagueApp).post(URL).send({ reason: REASON, meaning: 'approval', reauth: { password: 'pw' } });
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error).toBe('SEPARATION_OF_DUTIES_UNVERIFIED');
    /* The failed lookup's cause is internal and stays in the log. */
    expect(res.body.detail).not.toMatch(/audit_logs/);
    wroteNothing();
  });
});
