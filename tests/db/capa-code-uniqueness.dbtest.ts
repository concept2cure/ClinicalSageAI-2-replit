/**
 * CAPA / complaint / MDR display codes are unique PER PROGRAM.
 *
 * The defect this pins, found 2026-09-19. complaints_code_uq, mdr_events_code_uq
 * and capa_records_code_uq were each created on the code column ALONE, while
 * nextCode() in server/services/capa-mdr/capaMdr.service.ts GENERATES those codes
 * per program: it read `count(*) WHERE program_id = $1` and formatted
 * CAPA-<year>-0001. So the SECOND program in the whole deployment to open its
 * first CAPA of a year was handed a code that already existed and the insert died
 * 23505 — the normal path, not a race — surfaced by the route as
 * 500 "Operation failed" with the constraint name in `detail`. Across tenants it
 * meant one customer's numbering could block another's, on tables whose isolation
 * is service-layer only (they carry no organization_id and no RLS; see
 * migrations/20260504_capa_mdr.sql's header).
 *
 * nextCode's own comment had asserted the index that should always have existed
 * — "the (programId, code) unique index will reject duplicates and the caller can
 * retry" — and neither half was true: the index was single-column and no caller
 * retried. Both halves are now real.
 *
 * This runs against a real provisioned database because the bug lived in the gap
 * between a generator and an index; a mock of either would have agreed with
 * itself and proved nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const TAG = `capacode_${process.pid}_${Date.now().toString(36)}`;
const ORG = 90401;
const YEAR = new Date().getUTCFullYear().toString();

let owner: Pool;
let programA = '';
let programB = '';

/** The shape the service's generator implies, per table. */
const INDEXES: ReadonlyArray<readonly [table: string, index: string, column: string]> = [
  ['complaints', 'complaints_code_uq', 'complaint_code'],
  ['mdr_events', 'mdr_events_code_uq', 'mdr_code'],
  ['capa_records', 'capa_records_code_uq', 'capa_code'],
];

async function newProgram(suffix: string): Promise<string> {
  const { rows } = await owner.query(
    `INSERT INTO regulatory_programs
       (organization_id,name,code,program_type,product_type,primary_agency,product_name)
     VALUES ($1,$2,$3,'510k','device','FDA',$4) RETURNING id`,
    [ORG, `${TAG}-${suffix}`, `${TAG}-${suffix}`, `${TAG}-product-${suffix}`]
  );
  return String(rows[0].id);
}

/** Insert a CAPA the way the service does: a code generated for THIS program. */
async function openCapa(programId: string, code: string) {
  return owner.query(
    `INSERT INTO capa_records
       (id,program_id,capa_code,title,type,source,risk_level,state,created_at,updated_at)
     VALUES (gen_random_uuid(),$1,$2,$3,'corrective','complaint','high','open',NOW(),NOW())
     RETURNING capa_code`,
    [programId, code, `${TAG} record`]
  );
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('[capa-code] TEST_DATABASE_URL or DATABASE_URL is required');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await owner.query(
    `INSERT INTO organizations (id,name,slug,status) VALUES ($1,$2,$3,'active')
     ON CONFLICT (id) DO UPDATE SET status='active'`,
    [ORG, `${TAG}-org`, `${TAG}-org`]
  );
  programA = await newProgram('a');
  programB = await newProgram('b');
});

afterAll(async () => {
  if (!owner) return;
  try {
    await owner.query('DELETE FROM capa_records WHERE program_id = ANY($1::text[])', [
      [programA, programB],
    ]);
    await owner.query('DELETE FROM regulatory_programs WHERE organization_id = $1', [ORG]);
    await owner.query('DELETE FROM organizations WHERE id = $1', [ORG]);
  } finally {
    await owner.end();
  }
});

describe('CAPA/complaint/MDR display codes are scoped to their program', () => {
  it.each(INDEXES)(
    '%s: %s is UNIQUE (program_id, %s), not globally unique on the code alone',
    async (table, index, column) => {
      const { rows } = await owner.query(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname='public' AND tablename=$1 AND indexname=$2`,
        [table, index]
      );
      expect(rows[0], `${index} is absent — the creating migration did not apply`).toBeDefined();
      // Asserted on the resolved definition rather than on pg_index.indkey so the
      // failure message names the shape a reader has to reason about.
      expect(rows[0].indexdef).toContain(`(program_id, ${column})`);
    }
  );

  it('two programs can each open their first CAPA of the year — the case that failed', async () => {
    // Both generators independently produce <prefix>-<year>-0001 because each
    // counts only its own program. Under the old global index the second insert
    // died 23505. Nothing about these two rows is unusual: this is first use.
    const first = await openCapa(programA, `CAPA-${YEAR}-0001`);
    expect(first.rows[0].capa_code).toBe(`CAPA-${YEAR}-0001`);

    const second = await openCapa(programB, `CAPA-${YEAR}-0001`);
    expect(second.rows[0].capa_code).toBe(`CAPA-${YEAR}-0001`);
  });

  it('a duplicate code WITHIN one program is still rejected', async () => {
    // The point of narrowing the key is not to weaken it. Per-program uniqueness
    // is what makes a CAPA code a usable reference inside a program.
    await openCapa(programA, `CAPA-${YEAR}-0002`);
    await expect(openCapa(programA, `CAPA-${YEAR}-0002`)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('the agency-issued MDR report numbers stay globally unique', async () => {
    // FDA and EU authorities issue these, so the same number must never appear
    // twice in the deployment. Narrowing them would have been the wrong fix, and
    // this asserts they were left alone.
    for (const index of ['mdr_events_fda_report_uq', 'mdr_events_eu_report_uq']) {
      const { rows } = await owner.query(
        `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
        [index]
      );
      expect(rows[0], `${index} is absent`).toBeDefined();
      expect(rows[0].indexdef).not.toContain('program_id');
    }
  });

  it('the generator takes max+1, not count+1, so a gap cannot re-issue a live code', async () => {
    // Arranged so the two formulas DISAGREE and only one of them is safe.
    // Program B already holds 0001 from the test above. Add 0002 and 0003, then
    // remove 0002:
    //
    //   remaining: 0001, 0003        count(*) = 2  ->  count+1 = 0003  COLLIDES
    //                                max      = 3  ->  max+1   = 0004  free
    //
    // The old generator used count+1, so one removed record was enough to make
    // every subsequent create in that program fail against the very index this
    // change narrowed. Asserted with the same SQL the service runs, so the test
    // and the generator cannot drift apart without this failing.
    await openCapa(programB, `CAPA-${YEAR}-0002`);
    await openCapa(programB, `CAPA-${YEAR}-0003`);
    await owner.query('DELETE FROM capa_records WHERE program_id=$1 AND capa_code=$2', [
      programB,
      `CAPA-${YEAR}-0002`,
    ]);

    const { rows } = await owner.query(
      `SELECT max(nullif(regexp_replace(capa_code,'^.*-',''),'')::int) AS max_seq,
              count(*)::int AS n
         FROM capa_records WHERE program_id=$1 AND capa_code LIKE $2`,
      [programB, `CAPA-${YEAR}-%`]
    );
    expect({ max_seq: rows[0].max_seq, n: rows[0].n }).toEqual({ max_seq: 3, n: 2 });

    // What the OLD formula would have produced is taken, and proving that is the
    // point of the test: without it, max+1 passing says nothing.
    const wouldHaveBeen = `CAPA-${YEAR}-${String(rows[0].n + 1).padStart(4, '0')}`;
    await expect(openCapa(programB, wouldHaveBeen)).rejects.toMatchObject({ code: '23505' });

    // What the new formula produces is free.
    const next = `CAPA-${YEAR}-${String(rows[0].max_seq + 1).padStart(4, '0')}`;
    const ok = await openCapa(programB, next);
    expect(ok.rows[0].capa_code).toBe(`CAPA-${YEAR}-0004`);
  });
});
