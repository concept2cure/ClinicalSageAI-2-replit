/**
 * fetchNonclinicalRows reads a CTD program's nonclinical studies only when the
 * program is the organization's, and refuses one that is not on record for it
 * (CTD_PROGRAM_NOT_FOUND) — it never answers that refusal as "no studies".
 *
 * What the loader used to do (until 2026-10-15): it joined the studies to
 * ctd_programs on the organization, so a program id of another organization's,
 * or one that does not exist, returned [] — the same answer as a program on
 * record with no studies. The reviewer simulator's preclinical persona then
 * raised critical "no pivotal toxicology" questions against a program nobody
 * in the organization owns, and load_nonclinical_program told AnA "no
 * nonclinical studies are ingested for this program".
 *
 * Real tables on PGlite (ctd_nonclinical_studies from its drizzle definition);
 * the reviewer flag is on.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { ctdNonclinicalStudies } from '../../../../shared/schema/csr-knowledge-db';

const H = vi.hoisted(() => ({ pg: null as any, db: null as any }));
vi.mock('../../../db', () => ({ get db() { return H.db; } }));
vi.mock('../feature-flags', () => ({ PRECLINICAL_REVIEWER_ENABLED: true, PRECLINICAL_INGEST_ENABLED: false }));

import { fetchNonclinicalRows, loadNonclinicalProgram } from '../nonclinical-program-loader';
import { loadPreclinicalIntel } from '../preclinical-intel-loader';

const ALPHA = 1;
const BETA = 2;
const ALPHA_PROGRAM = 10;
const ALPHA_EMPTY_PROGRAM = 11;
const BETA_PROGRAM = 20;
const NO_SUCH_PROGRAM = 999;

/** CREATE TABLE from the drizzle definition: columns and types. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

beforeAll(async () => {
  H.pg = new PGlite();
  H.db = drizzle(H.pg);
  // The columns of ctd_programs the loader reads (its enum columns are not).
  await H.pg.exec(`CREATE TABLE ctd_programs (id serial PRIMARY KEY, organization_id integer NOT NULL, program_name text NOT NULL)`);
  await H.pg.exec(ddlOf(ctdNonclinicalStudies as PgTable));
  await H.pg.query(
    `INSERT INTO ctd_programs (id, organization_id, program_name) VALUES ($1, $2, 'Alpha AX-1'), ($3, $2, 'Alpha AX-2'), ($4, $5, 'Beta BX-990')`,
    [ALPHA_PROGRAM, ALPHA, ALPHA_EMPTY_PROGRAM, BETA_PROGRAM, BETA],
  );
  await H.pg.query(
    `INSERT INTO ctd_nonclinical_studies (program_id, study_type, study_title, species, duration_weeks, glp_compliant, noael) VALUES
       ($1, 'repeat_dose_tox', '13-week rat toxicity', 'rat', 13, true, '50 mg/kg/day'),
       ($2, 'repeat_dose_tox', 'BX-990 26-week dog toxicity', 'dog', 26, true, '5 mg/kg/day')`,
    [ALPHA_PROGRAM, BETA_PROGRAM],
  );
}, 60_000);

afterAll(async () => {
  await H.pg?.close();
});

describe('fetchNonclinicalRows', () => {
  it("refuses another organization's CTD program, rather than answering it has no studies", async () => {
    await expect(
      fetchNonclinicalRows(BETA_PROGRAM, ALPHA),
      "another organization's program read as one with no studies",
    ).rejects.toMatchObject({ name: 'CtdProgramNotFoundError', code: 'CTD_PROGRAM_NOT_FOUND' });
  });

  it('refuses a CTD program that does not exist', async () => {
    await expect(fetchNonclinicalRows(NO_SUCH_PROGRAM, ALPHA)).rejects.toMatchObject({ code: 'CTD_PROGRAM_NOT_FOUND' });
  });

  it("reads the organization's own program's studies, and only its own", async () => {
    const rows = await fetchNonclinicalRows(ALPHA_PROGRAM, ALPHA);
    expect(rows!.map((r) => r.studyTitle)).toEqual(['13-week rat toxicity']);
  });

  it('answers a program of its own with no studies as no studies', async () => {
    expect(await fetchNonclinicalRows(ALPHA_EMPTY_PROGRAM, ALPHA)).toEqual([]);
  });
});

describe('the loaders that read through it refuse the same program', () => {
  it('loadPreclinicalIntel (the reviewer simulator)', async () => {
    await expect(loadPreclinicalIntel(BETA_PROGRAM, ALPHA)).rejects.toMatchObject({ code: 'CTD_PROGRAM_NOT_FOUND' });
  });

  it('loadNonclinicalProgram (load_nonclinical_program, the M2.4 inputs)', async () => {
    await expect(loadNonclinicalProgram(BETA_PROGRAM, ALPHA)).rejects.toMatchObject({ code: 'CTD_PROGRAM_NOT_FOUND' });
  });
});
