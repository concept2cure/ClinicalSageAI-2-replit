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
) => Promise<Array<{ code: string }>>;

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
    const findings = await detectSequenceGaps('IND-1', '0002');
    expect(codes(findings)).not.toContain('SEQ_QUERY_FAILED');
    expect(findings).toHaveLength(0);
  }, T);

  it('a duplicate sequence is caught (history read from compilations)', async () => {
    const findings = await detectSequenceGaps('IND-1', '0000');
    expect(codes(findings)).toContain('SEQ_DUPLICATE');
    expect(codes(findings)).not.toContain('SEQ_QUERY_FAILED');
  }, T);

  it('a gap is caught', async () => {
    const findings = await detectSequenceGaps('IND-1', '0005');
    expect(codes(findings)).toContain('SEQ_GAP');
  }, T);

  it('an application with no history requires 0000 first (not a false outage)', async () => {
    const bad = await detectSequenceGaps('IND-NEW', '0003');
    expect(codes(bad)).toContain('SEQ_FIRST_NOT_0000');
    expect(codes(bad)).not.toContain('SEQ_QUERY_FAILED');

    const ok = await detectSequenceGaps('IND-NEW', '0000');
    expect(ok).toHaveLength(0);
  }, T);
});

describe('C-31: when ectd_submissions IS present its sequences join the history', () => {
  it('a sequence recorded only in ectd_submissions is seen by the UNION', async () => {
    await pg.exec(`
      CREATE TABLE ectd_submissions (
        id                 SERIAL PRIMARY KEY,
        application_number TEXT,
        sequence_number    TEXT
      );
      INSERT INTO ectd_submissions (application_number, sequence_number)
      VALUES ('IND-3', '0000');
    `);
    // No compilations row for IND-3 — history comes entirely from submissions.
    const findings = await detectSequenceGaps('IND-3', '0000');
    expect(codes(findings)).toContain('SEQ_DUPLICATE');
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
      const findings = await detectSequenceGaps('IND-1', '0002');
      expect(codes(findings)).toContain('SEQ_QUERY_FAILED');
    } finally {
      h.pool = saved;
    }
  }, T);
});
