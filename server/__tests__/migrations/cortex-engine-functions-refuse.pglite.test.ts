/**
 * No cortex engine function stores a figure that no model computed.
 *
 * db/migrations/074_gcc_regulatory_intuition_engine.sql,
 * 076_gcc_causal_inference_engine.sql and 078_gcc_cross_domain_transfer.sql
 * (install-fresh only; db:provision runs them against production) created
 * SECURITY DEFINER functions that wrote fixed priors as model output, and
 * nothing calls them:
 *   - generate_intuition_prediction stored approval 0.7 / CRL 0.2 / RTF 0.05
 *     and a constant 0.7 "confidence" as model 'v1.0.0';
 *   - estimate_causal_effect stored an effect of 0.15 ± 1.96 × 0.05, jittered
 *     by random() when conditioned, labelled an 'aipw' estimate;
 *   - generate_counterfactual stored a 0.5 base probability, 0.05 per
 *     intervention with no estimated effect, and a 0.6 "confidence", as
 *     'analyzed';
 *   - extract_regulatory_signals answered "no signals" for an extraction it
 *     never performed;
 *   - record_prediction_outcome stored 0.25 as the prediction error of any
 *     outcome other than approval, CRL or RTF;
 *   - compute_domain_similarity cached 0.5 for a missing embedding similarity
 *     or concept overlap, weighted 0.6 / 0.4;
 *   - suggest_transfer_mapping graded risk into fixed bands (0.7 / 0.5 / 0.3 /
 *     0.1) and recommended a transfer from them.
 * Each now raises feature_not_supported and runs as its caller. The creators
 * are amended in place; migrations/20261015i_… replaces the functions on
 * databases installed before that. All of it runs here, against PGlite.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** pgvector is not available to PGlite: its columns become real[] and its indexes are left out. */
const withoutPgvector = (sql: string) =>
  sql
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;/gi, '')
    .replace(/CREATE INDEX[^;]*USING\s+(?:hnsw|ivfflat)[^;]*;/gi, '')
    .replace(/\bvector\s*\(\s*\d+\s*\)/gi, 'real[]');

/** What 074, 076 and 078 need from earlier files: the policy helper, the core schema, an atom store. */
const PRELUDE = `
  CREATE SCHEMA identity;
  CREATE SCHEMA core;
  CREATE SCHEMA cortex;
  CREATE FUNCTION identity.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE TABLE cortex.atoms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, content text, metadata jsonb);
  -- pgvector's cosine distance over the real[] stand-in, so 078's functions plan
  -- as they do on Postgres (their search_path is cortex, pg_catalog).
  CREATE FUNCTION cortex.cosine_distance(a real[], b real[]) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
    SELECT 1 - sum(x * y) / (sqrt(sum(x * x)) * sqrt(sum(y * y))) FROM unnest(a, b) AS t(x, y) $$;
  CREATE OPERATOR cortex.<=> (LEFTARG = real[], RIGHTARG = real[], FUNCTION = cortex.cosine_distance);
`;

const ORG = '00000000-0000-4000-8000-0000000000a1';

async function withCreators(fn: (pg: PGlite) => Promise<void>) {
  const pg = new PGlite();
  try {
    await pg.exec(PRELUDE);
    for (let deploy = 0; deploy < 2; deploy++) {
      await pg.exec(withoutPgvector(read('db/migrations/074_gcc_regulatory_intuition_engine.sql')));
      await pg.exec(withoutPgvector(read('db/migrations/076_gcc_causal_inference_engine.sql')));
      await pg.exec(withoutPgvector(read('db/migrations/078_gcc_cross_domain_transfer.sql')));
    }
    await fn(pg);
  } finally {
    await pg.close();
  }
}

const count = async (pg: PGlite, table: string) =>
  (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

const ENGINE_FUNCTIONS = [
  'extract_regulatory_signals',
  'generate_intuition_prediction',
  'estimate_causal_effect',
  'generate_counterfactual',
  'record_prediction_outcome',
  'compute_domain_similarity',
  'suggest_transfer_mapping',
];

/** Two domains with no embedding and no key concepts: nothing to compare. */
const twoDomains = async (pg: PGlite) =>
  (await pg.query<{ id: string }>(
    `INSERT INTO cortex.domain_knowledge (domain_type, domain_value)
       VALUES ('therapeutic_area', 'oncology'), ('therapeutic_area', 'immunology') RETURNING id`,
  )).rows.map((r) => r.id);

describe('074, 076 and 078, as they create the engine functions', () => {
  it('generate_intuition_prediction refuses, and stores no prediction', () =>
    withCreators(async (pg) => {
      await expect(
        pg.query(`SELECT cortex.generate_intuition_prediction('00000000-0000-4000-8000-000000000001', '${ORG}')`),
      ).rejects.toThrow(/computes no prediction: no model exists/);
      expect(await count(pg, 'cortex.intuition_predictions')).toBe(0);
    }), 120_000);

  it('estimate_causal_effect refuses, and stores no effect', () =>
    withCreators(async (pg) => {
      const graph = (await pg.query<{ id: string }>(
        `INSERT INTO cortex.causal_graphs (graph_name, nodes, edges) VALUES ('g', '[]', '[]') RETURNING id`,
      )).rows[0].id;
      await expect(
        pg.query(`SELECT cortex.estimate_causal_effect('${graph}', 'trial_size', 'approval', '${ORG}', '{"x": 1}')`),
      ).rejects.toThrow(/computes no estimate: no estimator exists/);
      expect(await count(pg, 'cortex.causal_effects')).toBe(0);
    }), 120_000);

  it('generate_counterfactual refuses, and stores no scenario', () =>
    withCreators(async (pg) => {
      await expect(
        pg.query(`SELECT cortex.generate_counterfactual('${ORG}', '{}', '[{"variable": "trial_size"}]')`),
      ).rejects.toThrow(/computes no counterfactual: no causal model exists/);
      expect(await count(pg, 'cortex.counterfactual_scenarios')).toBe(0);
    }), 120_000);

  it('extract_regulatory_signals refuses instead of answering "no signals"', () =>
    withCreators(async (pg) => {
      const atom = (await pg.query<{ id: string }>(
        `INSERT INTO cortex.atoms (org_id, content, metadata) VALUES ('${ORG}', 'IR text', '{}') RETURNING id`,
      )).rows[0].id;
      await expect(
        pg.query(`SELECT * FROM cortex.extract_regulatory_signals('${atom}', '${ORG}', 'ir')`),
      ).rejects.toThrow(/extracts no signals: no extractor exists/);
    }), 120_000);

  it('record_prediction_outcome refuses, and stores no prediction error', () =>
    withCreators(async (pg) => {
      const prediction = (await pg.query<{ id: string }>(
        `INSERT INTO cortex.intuition_predictions (org_id, prediction_type) VALUES ('${ORG}', 'during_review') RETURNING id`,
      )).rows[0].id;
      await expect(
        pg.query(`SELECT cortex.record_prediction_outcome('${prediction}', 'withdrawn')`),
      ).rejects.toThrow(/scores no prediction: no prediction model exists/);
      const row = await pg.query(
        `SELECT actual_outcome, prediction_error FROM cortex.intuition_predictions WHERE id = '${prediction}'`,
      );
      expect(row.rows).toEqual([{ actual_outcome: null, prediction_error: null }]);
    }), 120_000);

  it('compute_domain_similarity refuses, and caches no similarity', () =>
    withCreators(async (pg) => {
      const [a, b] = await twoDomains(pg);
      await expect(
        pg.query(`SELECT cortex.compute_domain_similarity('${a}', '${b}')`),
      ).rejects.toThrow(/computes no similarity: no similarity model exists/);
      expect(await count(pg, 'cortex.domain_similarity_cache')).toBe(0);
    }), 120_000);

  it('suggest_transfer_mapping refuses instead of grading risk into fixed bands', () =>
    withCreators(async (pg) => {
      const [a, b] = await twoDomains(pg);
      await expect(
        pg.query(`SELECT cortex.suggest_transfer_mapping('${a}', '${b}')`),
      ).rejects.toThrow(/suggests no mapping: no transfer model exists/);
      expect(await count(pg, 'cortex.domain_similarity_cache')).toBe(0);
    }), 120_000);

  it('each runs as its caller, not as its owner', () =>
    withCreators(async (pg) => {
      const r = await pg.query<{ proname: string; prosecdef: boolean }>(
        `SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'cortex' AND p.proname = ANY($1::text[]) ORDER BY p.proname`,
        [ENGINE_FUNCTIONS],
      );
      expect(r.rows).toEqual(
        [...ENGINE_FUNCTIONS].sort().map((proname) => ({ proname, prosecdef: false })),
      );
    }), 120_000);
});

/** What databases installed before 2026-10-15 hold: the same signatures, writing fixed priors. */
const AS_FIRST_INSTALLED = `
  CREATE SCHEMA cortex;
  CREATE TABLE cortex.intuition_predictions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid,
    approval_probability numeric, overall_confidence numeric, model_version text,
    actual_outcome text, prediction_error numeric);
  CREATE TABLE cortex.domain_similarity_cache (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), overall_similarity numeric);
  CREATE TABLE cortex.causal_effects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), effect_estimate numeric, estimation_method text);
  CREATE TABLE cortex.counterfactual_scenarios (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), confidence_in_counterfactual numeric);
  CREATE FUNCTION cortex.generate_intuition_prediction(p_submission_id UUID, p_org_id UUID, p_prediction_type TEXT DEFAULT 'during_review')
  RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = cortex, pg_catalog AS $$
  DECLARE v UUID; BEGIN
    INSERT INTO cortex.intuition_predictions (org_id, approval_probability, overall_confidence, model_version)
    VALUES (p_org_id, 0.7, 0.7, 'v1.0.0') RETURNING id INTO v; RETURN v;
  END $$;
  CREATE FUNCTION cortex.estimate_causal_effect(p_graph_id UUID, p_treatment TEXT, p_outcome TEXT, p_org_id UUID DEFAULT NULL, p_conditioning JSONB DEFAULT '{}')
  RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = cortex, pg_catalog AS $$
  DECLARE v UUID; BEGIN
    INSERT INTO cortex.causal_effects (effect_estimate, estimation_method) VALUES (0.15 * (1 + random() * 0.2 - 0.1), 'aipw') RETURNING id INTO v; RETURN v;
  END $$;
  CREATE FUNCTION cortex.generate_counterfactual(p_org_id UUID, p_factual_state JSONB, p_interventions JSONB, p_graph_id UUID DEFAULT NULL, p_submission_id UUID DEFAULT NULL)
  RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = cortex, pg_catalog AS $$
  DECLARE v UUID; BEGIN
    INSERT INTO cortex.counterfactual_scenarios (confidence_in_counterfactual) VALUES (0.6) RETURNING id INTO v; RETURN v;
  END $$;
  CREATE FUNCTION cortex.extract_regulatory_signals(p_atom_id UUID, p_org_id UUID, p_document_type TEXT, p_extraction_config JSONB DEFAULT '{}')
  RETURNS TABLE(signal_id UUID, signal_type TEXT, signal_text TEXT, severity TEXT, confidence NUMERIC)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = cortex, pg_catalog AS $$ BEGIN RETURN; END $$;
  CREATE FUNCTION cortex.record_prediction_outcome(p_prediction_id UUID, p_actual_outcome TEXT, p_actual_date DATE DEFAULT NULL)
  RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = cortex, pg_catalog AS $$ BEGIN
    UPDATE cortex.intuition_predictions SET actual_outcome = p_actual_outcome, prediction_error = 0.25 WHERE id = p_prediction_id;
  END $$;
  CREATE FUNCTION cortex.compute_domain_similarity(p_domain_a_id UUID, p_domain_b_id UUID)
  RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = cortex, pg_catalog AS $$ BEGIN
    INSERT INTO cortex.domain_similarity_cache (overall_similarity) VALUES (0.6 * 0.5 + 0.4 * 0.5); RETURN 0.5;
  END $$;
  CREATE FUNCTION cortex.suggest_transfer_mapping(p_source_domain_id UUID, p_target_domain_id UUID)
  RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = cortex, pg_catalog AS $$ BEGIN
    RETURN jsonb_build_object('estimated_risk', 0.3, 'recommendation', 'consider');
  END $$;
`;

const CALLS = [
  `SELECT cortex.generate_intuition_prediction('00000000-0000-4000-8000-000000000001', '${ORG}')`,
  `SELECT cortex.estimate_causal_effect('00000000-0000-4000-8000-000000000002', 'trial_size', 'approval')`,
  `SELECT cortex.generate_counterfactual('${ORG}', '{}', '[]')`,
  `SELECT * FROM cortex.extract_regulatory_signals('00000000-0000-4000-8000-000000000003', '${ORG}', 'ir')`,
  `SELECT cortex.record_prediction_outcome('00000000-0000-4000-8000-000000000004', 'withdrawn')`,
  `SELECT cortex.compute_domain_similarity('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006')`,
  `SELECT cortex.suggest_transfer_mapping('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006')`,
];

const REFUSED = /computes no|extracts no|scores no|suggests no/;
const STORES = [
  'cortex.intuition_predictions',
  'cortex.causal_effects',
  'cortex.counterfactual_scenarios',
  'cortex.domain_similarity_cache',
];

describe('migrations/20261015i_cortex_engine_functions_refuse.sql (deploy set)', () => {
  const REPLACEMENT = () => read('migrations/20261015i_cortex_engine_functions_refuse.sql');

  it('replaces the definitions an earlier install created, and re-runs as the same replacement', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(AS_FIRST_INSTALLED);
      // The figures this removes: each old definition answers.
      for (const call of CALLS) await expect(pg.query(call)).resolves.toBeDefined();
      expect(await count(pg, 'cortex.intuition_predictions')).toBe(1);
      expect(await count(pg, 'cortex.domain_similarity_cache')).toBe(1);
      await pg.exec(`TRUNCATE ${STORES.join(', ')}`);

      await pg.exec(REPLACEMENT());
      await pg.exec(REPLACEMENT());

      for (const call of CALLS) await expect(pg.query(call)).rejects.toThrow(REFUSED);
      for (const t of STORES) expect(await count(pg, t)).toBe(0);
      const r = await pg.query<{ prosecdef: boolean; proconfig: string[] | null }>(
        `SELECT p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'cortex' AND p.proname = ANY($1::text[])`,
        [ENGINE_FUNCTIONS],
      );
      expect(r.rows).toEqual(ENGINE_FUNCTIONS.map(() => ({ prosecdef: false, proconfig: null })));
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('creates nothing on a database the engines were never installed on', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(REPLACEMENT());
      const schemas = await pg.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'cortex'`);
      expect(schemas.rows).toEqual([]);
    } finally {
      await pg.close();
    }
  }, 120_000);
});

/**
 * The installation qualification lists some of these functions as installed
 * objects (IQ-011), with a Security Definer check. It must say that they are
 * installed and refuse, not that they serve.
 */
describe('docs/validation/IQ-CORTEX-001-INSTALLATION_QUALIFICATION.md', () => {
  it('says each engine function it lists is installed and refuses (feature_not_supported)', () => {
    const lines = read('docs/validation/IQ-CORTEX-001-INSTALLATION_QUALIFICATION.md').split('\n');
    const rows = lines.filter((l) => ENGINE_FUNCTIONS.some((f) => l.startsWith(`| ${f} `)));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toMatch(/installed; refuses/);
    const note = lines.find((l) => l.includes('feature_not_supported') && l.includes('2026-10-15'));
    expect(note, 'a dated note naming the refusal').toBeDefined();
  });
});
