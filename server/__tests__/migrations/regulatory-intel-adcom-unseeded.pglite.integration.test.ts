/**
 * migrations/20260814n no longer seeds advisory-committee platform rows, and on
 * a database it already seeded removes the ones nobody has changed.
 *
 * Those 8 rows carried no submission-type applicability (the table has no
 * column for it), so precedent-engine mapped each to `submissionTypes: []`,
 * matched none of them, and reported "AdComm risk: low, 0 triggers" for every
 * submission. The engine no longer reads the table; this pins what the seed
 * file does to the data, against the real creating migration and platform
 * tier, in the order the deploy set applies them.
 *
 * The file re-runs on every deploy (RULE 1), so the removal must be
 * idempotent, must leave CRL and RTF rows exactly as they were, and must never
 * take a row an operator edited or a tenant's own row.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const sql = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CREATE = sql('db/migrations/20260322_regulatory_precedent_intelligence.sql');
const PLATFORM_TIER = sql('migrations/20260814m_regulatory_intel_platform_tier.sql');
const SEED = sql('migrations/20260814n_seed_regulatory_intel_platform_knowledge.sql');
const PLATFORM = '00000000-0000-0000-0000-000000000000';
const TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';
const T = 120_000;

/** The 8 rows the previous version of the seed inserted, verbatim. */
const PREVIOUSLY_SEEDED = `
  INSERT INTO regulatory_intel.advisory_committee_patterns
    (organization_id, pattern_code, pattern_name, committee_type, risk_category, historical_frequency)
  VALUES
    ('${PLATFORM}', 'FIRST_IN_CLASS_MECHANISM_OF_ACTION', 'First-in-class mechanism of action', 'ANY', 'efficacy_uncertainty', 0.85),
    ('${PLATFORM}', 'ACCELERATED_APPROVAL_WITH_SURROGATE_ENDPOINT', 'Accelerated Approval with surrogate endpoint', 'ANY', 'surrogate_endpoint', 0.75),
    ('${PLATFORM}', 'SIGNIFICANT_SAFETY_SIGNAL_IN_PIVOTAL_TRIAL', 'Significant safety signal in pivotal trial', 'ANY', 'safety_signal', 0.8),
    ('${PLATFORM}', 'PEDIATRIC_INDICATION_WITH_EXTRAPOLATED_EFFICACY', 'Pediatric indication with extrapolated efficacy', 'ANY', 'pediatric_extrapolation', 0.65),
    ('${PLATFORM}', 'REMS_WITH_ETASU_ELEMENTS', 'REMS with ETASU elements', 'ANY', 'benefit_risk_balance', 0.6),
    ('${PLATFORM}', 'CONTROVERSIAL_BENEFIT_RISK_PROFILE', 'Controversial benefit-risk profile', 'ANY', 'benefit_risk_balance', 0.7),
    ('${PLATFORM}', 'NOVEL_DEVICE_WITH_NO_PREDICATE_DE_NOVO', 'Novel device with no predicate (De Novo)', 'ANY', 'efficacy_uncertainty', 0.55),
    ('${PLATFORM}', 'PMA_WITH_NOVEL_AI_ML_ALGORITHM', 'PMA with novel AI/ML algorithm', 'ANY', 'efficacy_uncertainty', 0.7)`;

async function fresh(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(CREATE);
  await pg.exec(PLATFORM_TIER);
  return pg;
}

async function count(pg: PGlite, table: string, org = PLATFORM): Promise<number> {
  const r = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM regulatory_intel.${table} WHERE organization_id = $1`,
    [org],
  );
  return r.rows[0].n;
}

describe('the platform seed', () => {
  it('seeds CRL and RTF, and no advisory-committee rows — idempotently', async () => {
    const pg = await fresh();
    try {
      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(SEED);
        expect(await count(pg, 'crl_trigger_patterns')).toBe(9);
        expect(await count(pg, 'rtf_trigger_patterns')).toBe(7);
        expect(await count(pg, 'advisory_committee_patterns')).toBe(0);
      }
    } finally {
      await pg.close();
    }
  }, T);

  it('removes the rows it once seeded, and only those nobody changed', async () => {
    const pg = await fresh();
    try {
      await pg.exec(PREVIOUSLY_SEEDED);
      // An operator gave one platform row mitigation guidance; a tenant keeps
      // its own row under the same code.
      await pg.exec(`
        UPDATE regulatory_intel.advisory_committee_patterns
           SET mitigation_strategies = ARRAY['Pre-specify the benefit-risk framework in the briefing document']
         WHERE organization_id = '${PLATFORM}' AND pattern_code = 'REMS_WITH_ETASU_ELEMENTS';
        INSERT INTO regulatory_intel.advisory_committee_patterns
          (organization_id, pattern_code, pattern_name, committee_type, risk_category, historical_frequency)
        VALUES ('${TENANT}', 'FIRST_IN_CLASS_MECHANISM_OF_ACTION', 'First-in-class mechanism of action', 'ANY', 'efficacy_uncertainty', 0.85);
      `);
      expect(await count(pg, 'advisory_committee_patterns')).toBe(8);

      await pg.exec(SEED);
      const left = await pg.query<{ pattern_code: string }>(
        `SELECT pattern_code FROM regulatory_intel.advisory_committee_patterns WHERE organization_id = $1`,
        [PLATFORM],
      );
      expect(left.rows.map((r) => r.pattern_code)).toEqual(['REMS_WITH_ETASU_ELEMENTS']);
      expect(await count(pg, 'advisory_committee_patterns', TENANT)).toBe(1);

      // The next deploy changes nothing further.
      await pg.exec(SEED);
      expect(await count(pg, 'advisory_committee_patterns')).toBe(1);
      expect(await count(pg, 'advisory_committee_patterns', TENANT)).toBe(1);
      expect(await count(pg, 'crl_trigger_patterns')).toBe(9);
      expect(await count(pg, 'rtf_trigger_patterns')).toBe(7);
    } finally {
      await pg.close();
    }
  }, T);
});
