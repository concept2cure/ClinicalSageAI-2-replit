/**
 * eCTD sequence-continuity gate — schema + resilience contract (ledger C-31,
 * closing the "recorded, not fixed" note under C-16).
 *
 * server/services/ectd/ectd-validator-hardening.ts detectSequenceGaps() is step 5
 * of validateEctdPackageHardened, the hardened gateway-readiness gate. It reads
 * the prior submission sequences for an application from
 *
 *     SELECT sequence_number FROM ectd_compilations WHERE application_number = $1
 *     UNION
 *     SELECT sequence_number FROM ectd_submissions  WHERE application_number = $1
 *
 * Two defects made that unrunnable on a real deploy:
 *   1. ectd_compilations carried NEITHER column in any definition — the query
 *      threw `column "application_number" does not exist`.
 *   2. ectd_submissions is a separately deploy-dead table (082_ectd_submission_
 *      agent.sql, on no durable apply path) — absent, the same UNION threw 42P01.
 * Either way the catch reported SEQ_QUERY_FAILED "submission tracking database is
 * unreachable", blocking EVERY submission — a schema gap misattributed as an
 * outage, the swallowed-cause pattern C-16 itself flagged.
 *
 * This proves the fix end-to-end against real (PGlite) Postgres:
 *   • the C-31 migration adds application_number + sequence_number to
 *     ectd_compilations, so the validator's real SQL executes;
 *   • with ectd_submissions ABSENT the gate still runs off ectd_compilations
 *     alone (no SEQ_QUERY_FAILED) and the sequence rules fire correctly;
 *   • with ectd_submissions PRESENT its sequences join the history (the UNION);
 *   • a genuine DB outage STILL produces SEQ_QUERY_FAILED — the "outage must not
 *     be swallowed as no-history" invariant is preserved.
 *
 * @compliance 21 CFR Part 11 — a gateway gate that cannot execute is not a
 *             control; a control that misreports its own failure cause is worse.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = 120_000;

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

let pg: PGlite;
let detectSequenceGaps: (
  applicationNumber: string,
  newSequenceNumber: string,
  organizationId: number,
) => Promise<Array<{ code: string }>>;

/* The tenant every seeded row below belongs to. `organizationId` became a
   REQUIRED parameter when the history read was tenant-scoped, and this file is
   outside tsconfig's `include` (client/src, server, shared, agents), so the
   compiler could not name these call sites the way it named the four in
   server/. Passing it explicitly is the point: an omitted tenant now blocks
   with SEQ_TENANT_SCOPE_MISSING and issues no query at all, which is the right
   behaviour and would make every assertion below vacuous. */
const ORG = 1;

/** A pg-Pool-shaped shim: every query in detectSequenceGaps is single-statement. */
function poolShim(db: PGlite) {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params);
      return { rows: r.rows, rowCount: r.rows.length };
    },
  };
}

beforeAll(async () => {
  pg = new PGlite();
  // Minimal ectd_compilations, then the C-31 ALTER that adds the two columns.
  await pg.exec(`
    CREATE TABLE ectd_compilations (
      id               SERIAL PRIMARY KEY,
      organization_id  INTEGER,
      compilation_name TEXT,
      status           TEXT
    );
  `);
  await pg.exec(
    fs.readFileSync(
      path.join(REPO_ROOT, 'db/migrations/20260730_ectd_compilations_sequence_columns.sql'),
      'utf8',
    ),
  );
  // Seed prior sequences for IND-1 in compilations only (submissions table absent).
  await pg.exec(`
    INSERT INTO ectd_compilations (organization_id, compilation_name, status, application_number, sequence_number)
    VALUES (1, 'c0', 'completed', 'IND-1', '0000'),
           (1, 'c1', 'completed', 'IND-1', '0001');
  `);

  h.pool = poolShim(pg);
  ({ detectSequenceGaps } = await import('../../server/services/ectd/ectd-validator-hardening'));
}, T);

afterAll(async () => {
  await pg.close();
});

const codes = (fs: Array<{ code: string }>) => fs.map((f) => f.code);

describe('C-31: the C-31 migration makes ectd_compilations carry the validator columns', () => {
  it('application_number and sequence_number exist on ectd_compilations', async () => {
    const { rows } = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ectd_compilations'
         AND column_name IN ('application_number', 'sequence_number')`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(['application_number', 'sequence_number']);
  });
});

describe('C-31: the gate runs off ectd_compilations alone when ectd_submissions is absent', () => {
  it('the expected next sequence produces NO findings — and never SEQ_QUERY_FAILED', async () => {
    const findings = await detectSequenceGaps('IND-1', '0002', ORG);
    expect(codes(findings)).not.toContain('SEQ_QUERY_FAILED');
    expect(findings).toHaveLength(0);
  }, T);

  it('a duplicate sequence is caught (history read from compilations)', async () => {
    const findings = await detectSequenceGaps('IND-1', '0000', ORG);
    expect(codes(findings)).toContain('SEQ_DUPLICATE');
    expect(codes(findings)).not.toContain('SEQ_QUERY_FAILED');
  }, T);

  it('a gap is caught', async () => {
    const findings = await detectSequenceGaps('IND-1', '0005', ORG);
    expect(codes(findings)).toContain('SEQ_GAP');
  }, T);

  it('an application with no history requires 0000 first (not a false outage)', async () => {
    const bad = await detectSequenceGaps('IND-NEW', '0003', ORG);
    expect(codes(bad)).toContain('SEQ_FIRST_NOT_0000');
    expect(codes(bad)).not.toContain('SEQ_QUERY_FAILED');

    const ok = await detectSequenceGaps('IND-NEW', '0000', ORG);
    expect(ok).toHaveLength(0);
  }, T);
});

describe('C-31: when ectd_submissions IS present its sequences join the history', () => {
  /* THE TABLE'S TWO REAL DEPLOY SHAPES, IN THE ORDER A DEPLOY MEETS THEM.
     082_ectd_submission_agent.sql puts organization_id on ectd_submissions only
     on the install-fresh path, so a deploy that predates it has the table
     WITHOUT the tenant column. The scoped read then fails with SQLSTATE 42703,
     and the validator drops the source rather than reading it across tenants.
     That branch is pinned against a mock in
     server/services/ectd/__tests__/sequence-gap-tenant-scope.test.ts; what a
     mock cannot establish is that real Postgres actually raises 42703 for this
     query — and the whole branch turns on that code. This suite exists to run
     the validator's real SQL against real (PGlite) Postgres, so it proves it
     here. */
  it('an ectd_submissions with no organization_id is DROPPED, not read across tenants', async () => {
    await pg.exec(`
      CREATE TABLE ectd_submissions (
        id                 SERIAL PRIMARY KEY,
        application_number TEXT,
        sequence_number    TEXT
      );
      INSERT INTO ectd_submissions (application_number, sequence_number)
      VALUES ('IND-3', '0000');
    `);
    // No compilations row for IND-3, and the only source holding one cannot be
    // scoped — so the history is empty. That must read as "first submission
    // must be 0000", never as a swallowed outage and never as a duplicate
    // matched against another tenant's row.
    const findings = await detectSequenceGaps('IND-3', '0001', ORG);
    expect(codes(findings)).toContain('SEQ_FIRST_NOT_0000');
    expect(codes(findings)).not.toContain('SEQ_QUERY_FAILED');
    // Losing a source can only shrink the history, so it fails toward blocking.
    expect(await detectSequenceGaps('IND-3', '0000', ORG)).toHaveLength(0);
  }, T);

  it('a sequence recorded only in a SCOPABLE ectd_submissions joins the history', async () => {
    await pg.exec(`
      ALTER TABLE ectd_submissions ADD COLUMN organization_id INTEGER;
      UPDATE ectd_submissions SET organization_id = ${ORG};
    `);
    const findings = await detectSequenceGaps('IND-3', '0000', ORG);
    expect(codes(findings)).toContain('SEQ_DUPLICATE');
  }, T);

  it('and it is scoped: another tenant does not inherit that history', async () => {
    // The verdict, not the SQL shape — org 2 has filed nothing for IND-3, so
    // 0000 is its legitimate first sequence rather than a duplicate.
    const findings = await detectSequenceGaps('IND-3', '0000', ORG + 1);
    expect(codes(findings)).not.toContain('SEQ_DUPLICATE');
    expect(findings).toHaveLength(0);
  }, T);
});

describe('C-31: a genuine DB outage still blocks (invariant preserved)', () => {
  it('a query failure produces SEQ_QUERY_FAILED, not a silent empty history', async () => {
    const saved = h.pool;
    h.pool = {
      query: async () => {
        throw Object.assign(new Error('connection terminated'), { code: '08006' });
      },
    };
    try {
      const findings = await detectSequenceGaps('IND-1', '0002', ORG);
      expect(codes(findings)).toContain('SEQ_QUERY_FAILED');
    } finally {
      h.pool = saved;
    }
  }, T);
});
