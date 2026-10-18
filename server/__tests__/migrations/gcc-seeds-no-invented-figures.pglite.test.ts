/**
 * The provisioning seeds carry no invented figures, and a database installed
 * earlier loses the ones it was given.
 *
 * install-fresh step 6 applies every db/migrations/*_gcc_*.sql, and
 * db:provision runs it against production. These files seeded statistics and
 * claims that nothing records a source for:
 *   - 059: six embedding models, all is_active, with per-1k-token prices;
 *   - 067: "SEED SAMPLE DATA": four sample FHIR validation rules, and an active
 *     RANDOM_FOREST risk model that was never trained;
 *   - 074: thirteen soft signals "discovered by" 'human_expert', no expert named;
 *   - 076: ten causal mechanisms, 'established' / 'supported' from 'literature'
 *     or 'data_mining', with no citation;
 *   - 078: complexity and data-richness scores for nine domains, and success
 *     rates for three transfer templates;
 *   - 050: agency gateway URLs and review clocks (EUA 14 days, CTA 60/30) with
 *     no source.
 * The creators are amended in place. migrations/20261015j_… withdraws what an
 * earlier install wrote, matching every seeded value, and leaves anything
 * someone changed, added or refers to. All of it runs here, against PGlite.
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
    .replace(/COMMENT ON EXTENSION vector IS\s*'[^']*';/gi, 'NULL;')
    .replace(/CREATE INDEX[^;]*USING\s+(?:hnsw|ivfflat)[^;]*;/gi, '')
    .replace(/\bvector\s*\(\s*\d+\s*\)/gi, 'real[]');

/** What the six files need from earlier gcc files, reduced to the keys they reference. */
const PRELUDE = `
  CREATE SCHEMA identity; CREATE SCHEMA core; CREATE SCHEMA product_master; CREATE SCHEMA global_dossier;
  CREATE SCHEMA agent_runtime; CREATE SCHEMA ectd_v4;
  CREATE TABLE identity.organizations (id uuid PRIMARY KEY);
  CREATE TABLE identity.users (id uuid PRIMARY KEY);
  CREATE FUNCTION identity.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION identity.can_access_org(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT FALSE $$;
  CREATE FUNCTION identity.can_write_org(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT FALSE $$;
  CREATE TABLE product_master.products (id uuid PRIMARY KEY);
  CREATE TABLE global_dossier.dossier_instances (id uuid PRIMARY KEY);
  CREATE TABLE agent_runtime.agent_definitions (id uuid PRIMARY KEY);
  CREATE TABLE agent_runtime.agent_threads (thread_id uuid PRIMARY KEY);
  CREATE TABLE ectd_v4.regulatory_submissions (id uuid PRIMARY KEY);
`;

const CREATORS = [
  'db/migrations/050_gcc_ectd_v4_domain_registry.sql',
  'db/migrations/059_gcc_vector_embeddings.sql',
  'db/migrations/067_gcc_federated_learning_intelligence.sql',
  'db/migrations/074_gcc_regulatory_intuition_engine.sql',
  'db/migrations/076_gcc_causal_inference_engine.sql',
  'db/migrations/078_gcc_cross_domain_transfer.sql',
];

const SEEDED_TABLES = [
  'ai.embedding_models',
  'ai.fhir_validation_rules',
  'ai.predictive_risk_models',
  'cortex.soft_signals',
  'cortex.mechanism_library',
  'cortex.domain_knowledge',
  'cortex.transfer_templates',
];

const CLEANUP = () => read('migrations/20261015j_gcc_seed_invented_figures_withdrawn.sql');

async function provisioned(fn: (pg: PGlite) => Promise<void>) {
  const pg = new PGlite();
  try {
    await pg.exec(PRELUDE);
    for (let run = 0; run < 2; run++) {
      for (const file of CREATORS) await pg.exec(withoutPgvector(read(file)));
    }
    await fn(pg);
  } finally {
    await pg.close();
  }
}

const counts = async (pg: PGlite) => {
  const out: Record<string, number> = {};
  for (const t of SEEDED_TABLES) {
    out[t] = (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  return out;
};

const registry = async (pg: PGlite) => ({
  ...(await pg.query<{ authorities: number; urls: number }>(
    `SELECT count(*)::int AS authorities, count(submission_gateway_url)::int AS urls
       FROM common_standards.global_regulatory_authorities`)).rows[0],
  ...(await pg.query<{ types: number; clocks: number }>(
    `SELECT count(*)::int AS types, (count(standard_review_days) + count(priority_review_days))::int AS clocks
       FROM common_standards.submission_types`)).rows[0],
});

/** The rows the six files wrote on a database installed before 2026-10-15, verbatim. */
const AS_FIRST_INSTALLED = `
  INSERT INTO ai.embedding_models (id, model_type, display_name, provider, dimensions, max_tokens, is_active, is_default, cost_per_1k_tokens)
  VALUES
      ('openai-ada-002', 'OPENAI_ADA_002', 'OpenAI Ada 002', 'openai', 1536, 8191, TRUE, FALSE, 0.0001),
      ('openai-3-small', 'OPENAI_3_SMALL', 'OpenAI Embedding 3 Small', 'openai', 1536, 8191, TRUE, TRUE, 0.00002),
      ('openai-3-large', 'OPENAI_3_LARGE', 'OpenAI Embedding 3 Large', 'openai', 3072, 8191, TRUE, FALSE, 0.00013),
      ('voyage-2', 'VOYAGE_2', 'Voyage AI v2', 'voyage', 1024, 4000, TRUE, FALSE, 0.0001),
      ('bge-large', 'BGE_LARGE', 'BGE Large EN v1.5', 'self-hosted', 1024, 512, TRUE, FALSE, 0.0),
      ('kimi-embed', 'KIMI_EMBEDDING', 'Kimi AI Embedding', 'moonshot', 1024, 8192, TRUE, FALSE, 0.00005)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO ai.fhir_validation_rules (
      rule_code, rule_name, rule_version, fhir_resource_type,
      implementation_guide, rule_type, severity,
      rule_expression, rule_description, error_message, effective_from
  ) VALUES
      ('PQCMC-001', 'Product Name Required', '1.0', 'MedicinalProductDefinition',
       'PQ-CMC', 'BUSINESS', 'ERROR',
       'name.exists() and name.productName.exists()',
       'MedicinalProductDefinition must have at least one name with productName',
       'Product name is required for CMC submissions',
       CURRENT_DATE),
      ('PQCMC-002', 'Drug Substance Characterization', '1.0', 'SubstanceDefinition',
       'PQ-CMC', 'BUSINESS', 'WARNING',
       'structure.exists() or molecularFormula.exists()',
       'SubstanceDefinition should include structural information',
       'Consider adding molecular structure or formula',
       CURRENT_DATE),
      ('PQCMC-003', 'Batch Formula Completeness', '1.0', 'Ingredient',
       'PQ-CMC', 'SCHEMA', 'ERROR',
       'substance.exists() and strength.exists()',
       'Each ingredient must specify substance and strength',
       'Ingredient missing substance or strength information',
       CURRENT_DATE),
      ('SPL-001', 'NDC Format Validation', '1.0', 'MedicinalProductDefinition',
       'SPL', 'BUSINESS', 'ERROR',
       'identifier.where(system=''http://hl7.org/fhir/sid/ndc'').value.matches(''[0-9]{4,5}-[0-9]{3,4}-[0-9]{1,2}'')',
       'NDC must follow FDA format (XXXXX-XXXX-XX or similar)',
       'Invalid NDC format',
       CURRENT_DATE)
  ON CONFLICT (rule_code) DO NOTHING;
  INSERT INTO ai.predictive_risk_models (
      model_code, model_name, model_purpose, version_number,
      applicable_submission_types, applicable_product_types,
      model_type, feature_definitions, output_definitions,
      is_active
  ) VALUES
      ('KASA_BCS_RISK', 'KASA Biopharmaceutics Classification Risk', 'BIOPHARMACEUTICS_RISK', '1.0',
       ARRAY['ANDA', 'NDA', '505B2'],
       ARRAY['SOLID_ORAL'],
       'RANDOM_FOREST',
       '[{"name": "bcs_class", "type": "categorical"}, {"name": "dissolution_f2", "type": "numeric"}, {"name": "api_solubility", "type": "numeric"}]'::JSONB,
       '[{"name": "bioequivalence_risk", "type": "score"}, {"name": "dissolution_risk", "type": "category"}]'::JSONB,
       TRUE)
  ON CONFLICT (model_code) DO NOTHING;
  INSERT INTO cortex.soft_signals (signal_category, signal_name, signal_description, discovered_by, is_active)
  VALUES
      ('reviewer_word_choice', 'Hedging Language', 'Increased use of words like "may", "could", "potentially" indicating uncertainty', 'human_expert', TRUE),
      ('reviewer_word_choice', 'Definitive Language', 'Use of "must", "required", "essential" indicating firm positions', 'human_expert', TRUE),
      ('tone_shift', 'Formality Increase', 'Shift from casual to formal language mid-review', 'human_expert', TRUE),
      ('tone_shift', 'Urgency Markers', 'Language indicating time pressure or escalation', 'human_expert', TRUE),
      ('question_depth', 'Follow-up Depth', 'Number of follow-up questions on single topic', 'human_expert', TRUE),
      ('question_depth', 'Technical Granularity', 'Level of technical detail requested', 'human_expert', TRUE),
      ('response_timing', 'Rapid Response', 'Unusually quick agency response (within 24-48 hours)', 'human_expert', TRUE),
      ('response_timing', 'Extended Silence', 'Unusually long gap between communications', 'human_expert', TRUE),
      ('safety_language_intensity', 'Safety Emphasis', 'Frequency and intensity of safety-related concerns', 'human_expert', TRUE),
      ('efficacy_skepticism', 'Efficacy Questioning', 'Depth of questioning around efficacy claims', 'human_expert', TRUE),
      ('statistical_scrutiny', 'Statistical Deep Dive', 'Requests for additional statistical analyses', 'human_expert', TRUE),
      ('precedent_citation', 'Negative Precedent', 'Citation of cases where similar approaches failed', 'human_expert', TRUE),
      ('precedent_citation', 'Positive Precedent', 'Citation of successful precedent cases', 'human_expert', TRUE)
  ON CONFLICT DO NOTHING;
  INSERT INTO cortex.mechanism_library (
      mechanism_name, mechanism_description, mechanism_category,
      cause_variable, effect_variable, effect_direction, effect_magnitude,
      evidence_strength, discovered_by, is_active
  ) VALUES
      ('Trial Size Effect', 'Larger trials provide more statistical power and regulatory confidence',
       'efficacy_evidence', 'trial_size', 'approval_probability', 'positive', 'moderate',
       'established', 'literature', TRUE),
      ('Endpoint Robustness', 'Well-validated clinical endpoints increase regulatory confidence',
       'efficacy_evidence', 'endpoint_validation', 'approval_probability', 'positive', 'strong',
       'established', 'literature', TRUE),
      ('Safety Signal Impact', 'Serious adverse events reduce approval probability',
       'safety_evidence', 'serious_ae_rate', 'approval_probability', 'negative', 'strong',
       'established', 'literature', TRUE),
      ('Active Comparator Advantage', 'Superiority vs active comparator strengthens evidence',
       'study_design', 'active_comparator', 'evidence_strength', 'positive', 'moderate',
       'established', 'literature', TRUE),
      ('Breakthrough Designation Effect', 'Breakthrough designation accelerates review and increases approval rate',
       'regulatory_pathway', 'breakthrough_designation', 'approval_probability', 'positive', 'moderate',
       'supported', 'data_mining', TRUE),
      ('Pre-Submission Meeting Impact', 'Productive pre-submission meetings align expectations',
       'agency_dynamics', 'pre_sub_alignment', 'approval_probability', 'positive', 'moderate',
       'supported', 'expert', TRUE),
      ('Historical Precedent Effect', 'Similar approved products create favorable precedent',
       'precedent_effects', 'similar_approvals', 'approval_probability', 'positive', 'moderate',
       'supported', 'data_mining', TRUE),
      ('Submission Timing Effect', 'End-of-year submissions may face resource constraints',
       'timing_effects', 'q4_submission', 'review_delay_probability', 'positive', 'weak',
       'hypothesized', 'data_mining', TRUE),
      ('Unmet Need Impact', 'High unmet need increases regulatory flexibility',
       'external_factors', 'unmet_need_severity', 'approval_probability', 'positive', 'moderate',
       'established', 'literature', TRUE),
      ('Complete Response Impact', 'Prior CRL reduces probability of subsequent approval',
       'precedent_effects', 'prior_crl', 'approval_probability', 'negative', 'moderate',
       'supported', 'data_mining', TRUE)
  ON CONFLICT DO NOTHING;
  INSERT INTO cortex.domain_knowledge (domain_type, domain_value, domain_hierarchy, key_concepts, complexity_score, data_richness_score)
  VALUES
      ('therapeutic_area', 'oncology', ARRAY['oncology'],
       ARRAY['tumor response', 'overall survival', 'progression-free survival', 'biomarkers', 'combination therapy'],
       0.85, 0.9),
      ('therapeutic_area', 'neurology', ARRAY['neurology'],
       ARRAY['cognitive endpoints', 'neuroimaging', 'biomarkers', 'disease modification', 'symptomatic treatment'],
       0.9, 0.7),
      ('therapeutic_area', 'cardiology', ARRAY['cardiology'],
       ARRAY['MACE', 'cardiovascular outcomes', 'heart failure', 'arrhythmia', 'lipid endpoints'],
       0.75, 0.8),
      ('therapeutic_area', 'immunology', ARRAY['immunology'],
       ARRAY['autoimmune', 'inflammation markers', 'disease activity scores', 'remission', 'flare rates'],
       0.8, 0.7),
      ('therapeutic_area', 'rare_disease', ARRAY['rare_disease'],
       ARRAY['natural history', 'patient registries', 'biomarkers', 'functional endpoints', 'caregiver burden'],
       0.85, 0.4),
      ('submission_type', 'nda', ARRAY['submission', 'nda'],
       ARRAY['efficacy', 'safety', 'CMC', 'labeling', 'risk-benefit'],
       0.7, 0.9),
      ('submission_type', 'bla', ARRAY['submission', 'bla'],
       ARRAY['immunogenicity', 'manufacturing', 'potency', 'comparability', 'lot consistency'],
       0.8, 0.7),
      ('regulatory_pathway', 'accelerated_approval', ARRAY['pathway', 'accelerated'],
       ARRAY['surrogate endpoint', 'post-marketing', 'confirmatory trial', 'withdrawal risk'],
       0.75, 0.6),
      ('regulatory_pathway', 'breakthrough_therapy', ARRAY['pathway', 'breakthrough'],
       ARRAY['substantial improvement', 'intensive guidance', 'rolling review', 'organizational commitment'],
       0.7, 0.5)
  ON CONFLICT DO NOTHING;
  INSERT INTO cortex.transfer_templates (
      template_name, template_description,
      source_domain_types, target_domain_types, task_types,
      adaptation_steps, avg_success_rate, is_active
  ) VALUES
      (
          'Oncology to Rare Oncology',
          'Transfer knowledge from common cancers to rare/orphan oncology indications',
          ARRAY['therapeutic_area'], ARRAY['therapeutic_area'], ARRAY['prediction', 'recommendation'],
          '[
              {"step": 1, "action": "extract_efficacy_patterns", "params": {"endpoint_types": ["ORR", "PFS", "OS"]}},
              {"step": 2, "action": "adjust_sample_size_expectations", "params": {"reduction_factor": 0.5}},
              {"step": 3, "action": "apply_rare_disease_regulatory_context", "params": {}}
          ]'::JSONB,
          0.75, TRUE
      ),
      (
          'NDA to BLA Adaptation',
          'Transfer NDA submission knowledge to BLA submissions with biologics adjustments',
          ARRAY['submission_type'], ARRAY['submission_type'], ARRAY['analysis', 'recommendation'],
          '[
              {"step": 1, "action": "map_cmc_concepts", "params": {"add_biologics_specific": true}},
              {"step": 2, "action": "add_immunogenicity_context", "params": {}},
              {"step": 3, "action": "adjust_manufacturing_expectations", "params": {}}
          ]'::JSONB,
          0.7, TRUE
      ),
      (
          'Standard to Accelerated Pathway',
          'Adapt standard approval knowledge to accelerated approval contexts',
          ARRAY['regulatory_pathway'], ARRAY['regulatory_pathway'], ARRAY['prediction', 'analysis'],
          '[
              {"step": 1, "action": "identify_surrogate_endpoints", "params": {}},
              {"step": 2, "action": "add_post_marketing_requirements", "params": {}},
              {"step": 3, "action": "adjust_timeline_expectations", "params": {"factor": 0.7}}
          ]'::JSONB,
          0.65, TRUE
      )
  ON CONFLICT DO NOTHING;
  UPDATE common_standards.global_regulatory_authorities a SET submission_gateway_url = s.url
    FROM (VALUES ('US_FDA', 'https://esg.fda.gov'), ('EU_EMA', 'https://esubmission.ema.europa.eu'),
      ('JP_PMDA', 'https://gateway.pmda.go.jp'), ('CA_HC', 'https://submissions.hc-sc.gc.ca'),
      ('AU_TGA', 'https://esubmission.tga.gov.au'), ('KR_MFDS', 'https://ectd.mfds.go.kr'),
      ('CH_SWISSMEDIC', 'https://esubmission.swissmedic.ch'), ('UK_MHRA', 'https://submissions.mhra.gov.uk')
    ) AS s(id, url) WHERE a.id = s.id;
  UPDATE common_standards.submission_types t SET standard_review_days = s.std, priority_review_days = s.pri
    FROM (VALUES ('US_FDA', 'IND', 30, 30), ('US_FDA', 'NDA', 365, 180), ('US_FDA', 'BLA', 365, 180),
      ('US_FDA', 'ANDA', 365, NULL), ('US_FDA', '510K', 90, NULL), ('US_FDA', 'PMA', 180, NULL),
      ('US_FDA', 'DE_NOVO', 150, NULL), ('US_FDA', 'HDE', 75, NULL), ('US_FDA', '510K_IVD', 90, NULL),
      ('US_FDA', 'EUA', 14, NULL), ('EU_EMA', 'CTA', 60, 30), ('EU_EMA', 'MAA', 210, 150),
      ('JP_PMDA', 'CTN', 30, 30), ('JP_PMDA', 'JNDA', 365, 180), ('CA_HC', 'CTA_CA', 30, 30),
      ('CA_HC', 'NDS', 300, 180)
    ) AS s(authority_id, type_code, std, pri)
   WHERE t.authority_id = s.authority_id AND t.type_code = s.type_code;
`;

describe('the provisioning creators, applied twice', () => {
  it('seed none of the invented rows', () =>
    provisioned(async (pg) => {
      expect(await counts(pg)).toEqual(Object.fromEntries(SEEDED_TABLES.map((t) => [t, 0])));
    }), 180_000);

  it('050 keeps its authorities and submission types, with no gateway URL or review clock it has no source for', () =>
    provisioned(async (pg) => {
      expect(await registry(pg)).toEqual({ authorities: 11, urls: 0, types: 16, clocks: 0 });
    }), 180_000);
});

describe('migrations/20261015j_gcc_seed_invented_figures_withdrawn.sql (deploy set)', () => {
  it('withdraws every seeded row and value when nothing refers to them, and a second run finds nothing', () =>
    provisioned(async (pg) => {
      await pg.exec(AS_FIRST_INSTALLED);
      await pg.exec(CLEANUP());
      expect(await counts(pg)).toEqual(Object.fromEntries(SEEDED_TABLES.map((t) => [t, 0])));
      expect(await registry(pg)).toEqual({ authorities: 11, urls: 0, types: 16, clocks: 0 });
      await pg.exec(CLEANUP());
      expect(await counts(pg)).toEqual(Object.fromEntries(SEEDED_TABLES.map((t) => [t, 0])));
    }), 180_000);

  it('keeps what someone changed, added or refers to', () =>
    provisioned(async (pg) => {
      await pg.exec(AS_FIRST_INSTALLED);
      expect(await counts(pg)).toEqual({
        'ai.embedding_models': 6, 'ai.fhir_validation_rules': 4, 'ai.predictive_risk_models': 1,
        'cortex.soft_signals': 13, 'cortex.mechanism_library': 10, 'cortex.domain_knowledge': 9,
        'cortex.transfer_templates': 3,
      });
      expect(await registry(pg)).toEqual({ authorities: 11, urls: 8, types: 16, clocks: 25 });

      // Someone's own domain, mapped from a seeded one; an embedding made with a
      // seeded model; an assessment run on the seeded risk model; a mechanism
      // someone sourced; a gateway URL someone recorded.
      await pg.exec(`
        INSERT INTO cortex.domain_knowledge (domain_type, domain_value, complexity_score)
          VALUES ('therapeutic_area', 'oncology', 0.5);
        INSERT INTO cortex.transfer_mappings (source_domain_id, target_domain_id, transfer_strength, transfer_type, concept_alignments)
          SELECT s.id, t.id, 0.4, 'analogical', '{}'
            FROM cortex.domain_knowledge s, cortex.domain_knowledge t
           WHERE s.domain_value = 'nda' AND t.complexity_score = 0.5;
        INSERT INTO ai.document_embeddings (source_type, chunk_text, content_hash, model_id)
          VALUES ('GUIDANCE', 'text', md5('text'), 'openai-3-small');
        INSERT INTO ai.risk_assessments (model_id, model_version, input_features, overall_risk_score, risk_category)
          SELECT id, '1.0', '{}', 0.2, 'LOW' FROM ai.predictive_risk_models WHERE model_code = 'KASA_BCS_RISK';
        UPDATE cortex.mechanism_library SET evidence_strength = 'supported',
               supporting_literature = '[{"citation": "a reviewed source"}]' WHERE mechanism_name = 'Trial Size Effect';
        UPDATE common_standards.global_regulatory_authorities
           SET submission_gateway_url = 'https://verified.example/esg' WHERE id = 'US_FDA';
      `);

      await pg.exec(CLEANUP());
      await pg.exec(CLEANUP());

      expect(await counts(pg)).toEqual({
        'ai.embedding_models': 1, // openai-3-small: an embedding refers to it
        'ai.fhir_validation_rules': 0,
        'ai.predictive_risk_models': 1, // an assessment refers to it
        'cortex.soft_signals': 0,
        'cortex.mechanism_library': 1, // someone changed it
        'cortex.domain_knowledge': 2, // someone's own row, and the seeded 'nda' a mapping refers to
        'cortex.transfer_templates': 0,
      });
      const kept = await pg.query<{ domain_value: string; complexity_score: string }>(
        `SELECT domain_value, complexity_score::text FROM cortex.domain_knowledge ORDER BY domain_value`);
      expect(kept.rows).toEqual([
        { domain_value: 'nda', complexity_score: '0.7000' },
        { domain_value: 'oncology', complexity_score: '0.5000' },
      ]);
      expect(await registry(pg)).toEqual({ authorities: 11, urls: 1, types: 16, clocks: 0 });
    }), 180_000);

  it('creates nothing, and fails nothing, on a database the gcc tree never reached', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(CLEANUP());
      const schemas = await pg.query(
        `SELECT nspname FROM pg_namespace WHERE nspname IN ('ai', 'cortex', 'common_standards')`);
      expect(schemas.rows).toEqual([]);
    } finally {
      await pg.close();
    }
  }, 120_000);
});
