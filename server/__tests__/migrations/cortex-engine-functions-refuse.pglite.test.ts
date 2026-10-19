/**
 * No cortex engine function stores a figure that no model computed.
 *
 * db/migrations/074_gcc_regulatory_intuition_engine.sql and
 * 076_gcc_causal_inference_engine.sql (install-fresh only; db:provision runs
 * them against production) created SECURITY DEFINER functions that wrote fixed
 * priors as model output, and nothing calls them:
 *   - generate_intuition_prediction stored approval 0.7 / CRL 0.2 / RTF 0.05
 *     and a constant 0.7 "confidence" as model 'v1.0.0';
 *   - estimate_causal_effect stored an effect of 0.15 ± 1.96 × 0.05, jittered
 *     by random() when conditioned, labelled an 'aipw' estimate;
 *   - generate_counterfactual stored a 0.5 base probability, 0.05 per
 *     intervention with no estimated effect, and a 0.6 "confidence", as
 *     'analyzed';
 *   - extract_regulatory_signals answered "no signals" for an extraction it
 *     never performed.
 * Each now raises feature_not_supported and runs as its caller. Both creators
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

/** What 074 and 076 need from earlier files: the policy helper, the core schema, an atom store. */
const PRELUDE = `
  CREATE SCHEMA identity;
  CREATE SCHEMA core;
  CREATE SCHEMA cortex;
  CREATE FUNCTION identity.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE TABLE cortex.atoms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, content text, metadata jsonb);
`;

const ORG = '00000000-0000-4000-8000-0000000000a1';

async function withCreators(fn: (pg: PGlite) => Promise<void>) {
  const pg = new PGlite();
  try {
    await pg.exec(PRELUDE);
    for (let deploy = 0; deploy < 2; deploy++) {
      await pg.exec(withoutPgvector(read('db/migrations/074_gcc_regulatory_intuition_engine.sql')));
      await pg.exec(withoutPgvector(read('db/migrations/076_gcc_causal_inference_engine.sql')));
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
];

describe('074 and 076, as they create the engine functions', () => {
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
    approval_probability numeric, overall_confidence numeric, model_version text);
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
`;

const CALLS = [
  `SELECT cortex.generate_intuition_prediction('00000000-0000-4000-8000-000000000001', '${ORG}')`,
  `SELECT cortex.estimate_causal_effect('00000000-0000-4000-8000-000000000002', 'trial_size', 'approval')`,
  `SELECT cortex.generate_counterfactual('${ORG}', '{}', '[]')`,
  `SELECT * FROM cortex.extract_regulatory_signals('00000000-0000-4000-8000-000000000003', '${ORG}', 'ir')`,
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
      await pg.exec(`TRUNCATE cortex.intuition_predictions, cortex.causal_effects, cortex.counterfactual_scenarios`);

      await pg.exec(REPLACEMENT());
      await pg.exec(REPLACEMENT());

      for (const call of CALLS) await expect(pg.query(call)).rejects.toThrow(/computes no|extracts no/);
      for (const t of ['cortex.intuition_predictions', 'cortex.causal_effects', 'cortex.counterfactual_scenarios']) {
        expect(await count(pg, t)).toBe(0);
      }
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
