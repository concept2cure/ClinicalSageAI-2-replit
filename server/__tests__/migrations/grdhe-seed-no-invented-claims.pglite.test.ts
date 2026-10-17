/**
 * The GRDHE seed claims no validation, no "current" version and no counts it
 * has no source for.
 *
 * db/migrations/081_grdhe_regulatory_mapping_layer.sql (deploy set) seeded the
 * FDA 3500A and E2B(R3) mapping rules is_validated TRUE with no validation
 * record; fourteen terminology versions with concept/term counts nobody
 * sourced (SNOMED CT US "360000 / 1200000", GUDID "2500000"); and eleven of
 * them is_current — MedDRA 27.1 "current" in 2026. ON CONFLICT DO NOTHING kept
 * every deployed row as first written, so the file also corrects the exact
 * rows it seeded, every deploy, and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/081_grdhe_regulatory_mapping_layer.sql'), 'utf8');

/** What an earlier deploy wrote: the claims as first seeded. */
const AS_FIRST_SEEDED = `
  UPDATE regulatory_harmonization.terminology_versions t
     SET concept_count = s.c, term_count = s.n, is_current = s.cur
    FROM (VALUES
      ('MEDDRA','26.0',83875,92753,FALSE), ('MEDDRA','26.1',84125,93021,FALSE), ('MEDDRA','27.0',84512,93456,FALSE),
      ('MEDDRA','27.1',84823,93892,TRUE), ('SNOMED_CT_US','2024-09',360000,1200000,TRUE),
      ('SNOMED_CT_INT','2024-07',355000,1150000,TRUE), ('GUDID','2024-Q4',2500000,2500000,TRUE),
      ('EMDN','2024-12',12500,12500,TRUE), ('GMDN','2024-12',22000,22000,TRUE), ('ICH_E2B_R3','3.0',500,2500,TRUE),
      ('HL7_FHIR_R4','4.0.1',145,5000,TRUE), ('LOINC','2.76',99000,99000,TRUE), ('RXNORM','2024-01',125000,380000,TRUE),
      ('UNII','2024-01',120000,120000,TRUE)
    ) AS s(sys, ver, c, n, cur)
   WHERE t.terminology_system::text = s.sys AND t.version_code = s.ver;
  UPDATE regulatory_harmonization.mapping_rules SET is_validated = TRUE;`;

const state = async (pg: PGlite) => ({
  versions: (await pg.query<{ n: number; counted: number; current: number }>(
    `SELECT count(*)::int AS n, count(concept_count)::int AS counted, count(*) FILTER (WHERE is_current)::int AS current
       FROM regulatory_harmonization.terminology_versions`)).rows[0],
  validated: (await pg.query<{ is_validated: boolean }>(
    'SELECT is_validated FROM regulatory_harmonization.mapping_rules')).rows.map((r) => r.is_validated),
});

describe('081_grdhe seed, applied on every deploy', () => {
  it('claims nothing it has no record of, on a fresh database', async () => {
    const pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
    try {
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      expect(await state(pg)).toEqual({ versions: { n: 14, counted: 0, current: 0 }, validated: [false, false] });
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('withdraws the claims an earlier deploy seeded, and keeps what someone changed', async () => {
    const pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
    try {
      await pg.exec(SQL);
      await pg.exec(AS_FIRST_SEEDED);
      expect(await state(pg)).toEqual({ versions: { n: 14, counted: 14, current: 11 }, validated: [true, true] });
      // Someone recorded a real count for one version, and validated a rule.
      await pg.exec(`UPDATE regulatory_harmonization.terminology_versions SET concept_count = 27000, term_count = 27000
                      WHERE terminology_system = 'LOINC' AND version_code = '2.76';
                     UPDATE regulatory_harmonization.mapping_rules
                        SET last_validated_at = now(), validation_status = 'valid'
                      WHERE rule_code = 'FDA_AE_3500A_V1'`);
      await pg.exec(SQL);
      const s = await state(pg);
      // The row someone changed is left as they left it, "current" included.
      expect(s.versions).toEqual({ n: 14, counted: 1, current: 1 });
      const rules = (await pg.query<{ rule_code: string; is_validated: boolean }>(
        'SELECT rule_code, is_validated FROM regulatory_harmonization.mapping_rules ORDER BY rule_code')).rows;
      expect(rules).toEqual([
        { rule_code: 'EMA_AE_E2B_R3_V1', is_validated: false },
        { rule_code: 'FDA_AE_3500A_V1', is_validated: true },
      ]);
    } finally {
      await pg.close();
    }
  }, 120_000);
});
