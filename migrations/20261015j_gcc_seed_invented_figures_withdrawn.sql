-- =============================================================================
-- 20261015j — withdraw the invented figures the provisioning seeds wrote
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Remove, from databases installed earlier, seeded statistics and
--          claims that no source, run or reviewer stands behind.
--
-- eCTD/CTD Context:
--   - Module(s): none directly (platform reference tables under ai.*, cortex.*,
--     common_standards.*)
--   - Integrity Risk Addressed: unsourced figures stored as reference data
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No table, column or constraint is created, changed or removed.
--   - Idempotent: each statement matches a row only as first seeded, so a
--     second run finds nothing. Conditional on every table it reads.
-- =============================================================================
--
-- install-fresh step 6 applies every db/migrations/*_gcc_*.sql, and
-- db:provision runs it against production, so a database provisioned before
-- 2026-10-15 holds what these files seeded:
--   - 059: six embedding models, every one is_active, with per-1k-token prices;
--   - 067: four sample FHIR validation rules, and an is_active RANDOM_FOREST
--     risk model ('KASA_BCS_RISK') that was never trained;
--   - 074: thirteen soft signals "discovered by" 'human_expert';
--   - 076: ten causal mechanisms, 'established' / 'supported' with no citation;
--   - 078: complexity and data-richness scores for nine domains, and success
--     rates for three transfer templates;
--   - 050: gateway URLs for eight authorities and review clocks for sixteen
--     submission types, none with a source.
-- The creators are amended in place the same day, which reaches only
-- databases installed after it. This file is in the deploy set and withdraws
-- the rows (050: the values) where an earlier install wrote them.
--
-- A row is touched only while it is exactly as seeded: every seeded value
-- matches, nothing has since recorded a source, validation or tenant for it,
-- and nothing refers to it. A row someone changed, added or uses is left as it
-- is. No tenant writes these tables; the one with a tenant column
-- (cortex.soft_signals.org_id) is matched only where it is NULL, as seeded.
-- Nothing in server/, client/ or shared/ reads any of them.

DO $gcc_seed_withdrawal$
DECLARE
  n INTEGER;
BEGIN
  -- 059: ai.embedding_models — unless an embedding or a logged query used it.
  IF to_regclass('ai.embedding_models') IS NOT NULL
     AND to_regclass('ai.document_embeddings') IS NOT NULL
     AND to_regclass('ai.search_queries') IS NOT NULL THEN
    DELETE FROM ai.embedding_models m
     USING (VALUES
       ('openai-ada-002', 'OPENAI_ADA_002', 'OpenAI Ada 002', 'openai', 1536, 8191, TRUE, FALSE, 0.0001),
       ('openai-3-small', 'OPENAI_3_SMALL', 'OpenAI Embedding 3 Small', 'openai', 1536, 8191, TRUE, TRUE, 0.00002),
       ('openai-3-large', 'OPENAI_3_LARGE', 'OpenAI Embedding 3 Large', 'openai', 3072, 8191, TRUE, FALSE, 0.00013),
       ('voyage-2', 'VOYAGE_2', 'Voyage AI v2', 'voyage', 1024, 4000, TRUE, FALSE, 0.0001),
       ('bge-large', 'BGE_LARGE', 'BGE Large EN v1.5', 'self-hosted', 1024, 512, TRUE, FALSE, 0.0),
       ('kimi-embed', 'KIMI_EMBEDDING', 'Kimi AI Embedding', 'moonshot', 1024, 8192, TRUE, FALSE, 0.00005)
     ) AS s(id, model_type, display_name, provider, dimensions, max_tokens, is_active, is_default, cost)
     WHERE m.id = s.id
       AND m.model_type::text = s.model_type
       AND m.display_name = s.display_name
       AND m.provider = s.provider
       AND m.dimensions = s.dimensions
       AND m.max_tokens IS NOT DISTINCT FROM s.max_tokens
       AND m.is_active IS NOT DISTINCT FROM s.is_active
       AND m.is_default IS NOT DISTINCT FROM s.is_default
       AND m.cost_per_1k_tokens IS NOT DISTINCT FROM s.cost
       AND NOT EXISTS (SELECT 1 FROM ai.document_embeddings e WHERE e.model_id = m.id)
       AND NOT EXISTS (SELECT 1 FROM ai.search_queries q WHERE q.model_id = m.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] ai.embedding_models: % seeded row(s) withdrawn', n;
  END IF;

  -- 067: ai.fhir_validation_rules — unless someone has since cited or coded one.
  IF to_regclass('ai.fhir_validation_rules') IS NOT NULL THEN
    DELETE FROM ai.fhir_validation_rules r
     USING (VALUES
       ('PQCMC-001', 'Product Name Required', '1.0', 'MedicinalProductDefinition', 'PQ-CMC', 'BUSINESS', 'ERROR',
        'name.exists() and name.productName.exists()',
        'MedicinalProductDefinition must have at least one name with productName',
        'Product name is required for CMC submissions'),
       ('PQCMC-002', 'Drug Substance Characterization', '1.0', 'SubstanceDefinition', 'PQ-CMC', 'BUSINESS', 'WARNING',
        'structure.exists() or molecularFormula.exists()',
        'SubstanceDefinition should include structural information',
        'Consider adding molecular structure or formula'),
       ('PQCMC-003', 'Batch Formula Completeness', '1.0', 'Ingredient', 'PQ-CMC', 'SCHEMA', 'ERROR',
        'substance.exists() and strength.exists()',
        'Each ingredient must specify substance and strength',
        'Ingredient missing substance or strength information'),
       ('SPL-001', 'NDC Format Validation', '1.0', 'MedicinalProductDefinition', 'SPL', 'BUSINESS', 'ERROR',
        'identifier.where(system=''http://hl7.org/fhir/sid/ndc'').value.matches(''[0-9]{4,5}-[0-9]{3,4}-[0-9]{1,2}'')',
        'NDC must follow FDA format (XXXXX-XXXX-XX or similar)',
        'Invalid NDC format')
     ) AS s(rule_code, rule_name, rule_version, fhir_resource_type, implementation_guide, rule_type, severity,
            rule_expression, rule_description, error_message)
     WHERE r.rule_code = s.rule_code
       AND r.rule_name = s.rule_name
       AND r.rule_version = s.rule_version
       AND r.fhir_resource_type = s.fhir_resource_type
       AND r.implementation_guide IS NOT DISTINCT FROM s.implementation_guide
       AND r.rule_type = s.rule_type
       AND r.severity = s.severity
       AND r.rule_expression = s.rule_expression
       AND r.rule_description = s.rule_description
       AND r.error_message = s.error_message
       AND r.regulatory_reference IS NULL
       AND r.validation_code IS NULL
       AND r.fhir_profile_url IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] ai.fhir_validation_rules: % seeded row(s) withdrawn', n;
  END IF;

  -- 067: ai.predictive_risk_models — unless trained, validated, accepted or used.
  IF to_regclass('ai.predictive_risk_models') IS NOT NULL
     AND to_regclass('ai.risk_assessments') IS NOT NULL THEN
    DELETE FROM ai.predictive_risk_models p
     WHERE p.model_code = 'KASA_BCS_RISK'
       AND p.model_name = 'KASA Biopharmaceutics Classification Risk'
       AND p.model_purpose = 'BIOPHARMACEUTICS_RISK'
       AND p.version_number = '1.0'
       AND p.applicable_submission_types IS NOT DISTINCT FROM ARRAY['ANDA', 'NDA', '505B2']
       AND p.applicable_product_types IS NOT DISTINCT FROM ARRAY['SOLID_ORAL']
       AND p.model_type = 'RANDOM_FOREST'
       AND p.feature_definitions = '[{"name": "bcs_class", "type": "categorical"}, {"name": "dissolution_f2", "type": "numeric"}, {"name": "api_solubility", "type": "numeric"}]'::jsonb
       AND p.output_definitions = '[{"name": "bioequivalence_risk", "type": "score"}, {"name": "dissolution_risk", "type": "category"}]'::jsonb
       AND p.is_active IS TRUE
       AND p.training_date IS NULL
       AND p.validation_metrics IS NULL
       AND p.regulatory_accepted IS NOT TRUE
       AND NOT EXISTS (SELECT 1 FROM ai.risk_assessments a WHERE a.model_id = p.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] ai.predictive_risk_models: % seeded row(s) withdrawn', n;
  END IF;

  -- 074: cortex.soft_signals — the shared (org-less) rows, unless validated.
  IF to_regclass('cortex.soft_signals') IS NOT NULL THEN
    DELETE FROM cortex.soft_signals g
     USING (VALUES
       ('reviewer_word_choice', 'Hedging Language', 'Increased use of words like "may", "could", "potentially" indicating uncertainty'),
       ('reviewer_word_choice', 'Definitive Language', 'Use of "must", "required", "essential" indicating firm positions'),
       ('tone_shift', 'Formality Increase', 'Shift from casual to formal language mid-review'),
       ('tone_shift', 'Urgency Markers', 'Language indicating time pressure or escalation'),
       ('question_depth', 'Follow-up Depth', 'Number of follow-up questions on single topic'),
       ('question_depth', 'Technical Granularity', 'Level of technical detail requested'),
       ('response_timing', 'Rapid Response', 'Unusually quick agency response (within 24-48 hours)'),
       ('response_timing', 'Extended Silence', 'Unusually long gap between communications'),
       ('safety_language_intensity', 'Safety Emphasis', 'Frequency and intensity of safety-related concerns'),
       ('efficacy_skepticism', 'Efficacy Questioning', 'Depth of questioning around efficacy claims'),
       ('statistical_scrutiny', 'Statistical Deep Dive', 'Requests for additional statistical analyses'),
       ('precedent_citation', 'Negative Precedent', 'Citation of cases where similar approaches failed'),
       ('precedent_citation', 'Positive Precedent', 'Citation of successful precedent cases')
     ) AS s(signal_category, signal_name, signal_description)
     WHERE g.signal_category = s.signal_category
       AND g.signal_name = s.signal_name
       AND g.signal_description IS NOT DISTINCT FROM s.signal_description
       AND g.discovered_by = 'human_expert'
       AND g.is_active IS TRUE
       AND g.org_id IS NULL
       AND g.expert_validated IS NOT TRUE;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] cortex.soft_signals: % seeded row(s) withdrawn', n;
  END IF;

  -- 076: cortex.mechanism_library — unless someone has since cited a source.
  IF to_regclass('cortex.mechanism_library') IS NOT NULL THEN
    DELETE FROM cortex.mechanism_library k
     USING (VALUES
       ('Trial Size Effect', 'Larger trials provide more statistical power and regulatory confidence',
        'efficacy_evidence', 'trial_size', 'approval_probability', 'positive', 'moderate', 'established', 'literature'),
       ('Endpoint Robustness', 'Well-validated clinical endpoints increase regulatory confidence',
        'efficacy_evidence', 'endpoint_validation', 'approval_probability', 'positive', 'strong', 'established', 'literature'),
       ('Safety Signal Impact', 'Serious adverse events reduce approval probability',
        'safety_evidence', 'serious_ae_rate', 'approval_probability', 'negative', 'strong', 'established', 'literature'),
       ('Active Comparator Advantage', 'Superiority vs active comparator strengthens evidence',
        'study_design', 'active_comparator', 'evidence_strength', 'positive', 'moderate', 'established', 'literature'),
       ('Breakthrough Designation Effect', 'Breakthrough designation accelerates review and increases approval rate',
        'regulatory_pathway', 'breakthrough_designation', 'approval_probability', 'positive', 'moderate', 'supported', 'data_mining'),
       ('Pre-Submission Meeting Impact', 'Productive pre-submission meetings align expectations',
        'agency_dynamics', 'pre_sub_alignment', 'approval_probability', 'positive', 'moderate', 'supported', 'expert'),
       ('Historical Precedent Effect', 'Similar approved products create favorable precedent',
        'precedent_effects', 'similar_approvals', 'approval_probability', 'positive', 'moderate', 'supported', 'data_mining'),
       ('Submission Timing Effect', 'End-of-year submissions may face resource constraints',
        'timing_effects', 'q4_submission', 'review_delay_probability', 'positive', 'weak', 'hypothesized', 'data_mining'),
       ('Unmet Need Impact', 'High unmet need increases regulatory flexibility',
        'external_factors', 'unmet_need_severity', 'approval_probability', 'positive', 'moderate', 'established', 'literature'),
       ('Complete Response Impact', 'Prior CRL reduces probability of subsequent approval',
        'precedent_effects', 'prior_crl', 'approval_probability', 'negative', 'moderate', 'supported', 'data_mining')
     ) AS s(mechanism_name, mechanism_description, mechanism_category, cause_variable, effect_variable,
            effect_direction, effect_magnitude, evidence_strength, discovered_by)
     WHERE k.mechanism_name = s.mechanism_name
       AND k.mechanism_description = s.mechanism_description
       AND k.mechanism_category = s.mechanism_category
       AND k.cause_variable = s.cause_variable
       AND k.effect_variable = s.effect_variable
       AND k.effect_direction IS NOT DISTINCT FROM s.effect_direction
       AND k.effect_magnitude IS NOT DISTINCT FROM s.effect_magnitude
       AND k.evidence_strength IS NOT DISTINCT FROM s.evidence_strength
       AND k.discovered_by IS NOT DISTINCT FROM s.discovered_by
       AND k.is_active IS TRUE
       AND k.supporting_literature IS NULL
       AND k.evidence_sources IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] cortex.mechanism_library: % seeded row(s) withdrawn', n;
  END IF;

  -- 078: cortex.domain_knowledge — unless a mapping, a cached similarity or a
  -- child domain refers to it. The seed had no unique key; every copy goes.
  IF to_regclass('cortex.domain_knowledge') IS NOT NULL
     AND to_regclass('cortex.transfer_mappings') IS NOT NULL
     AND to_regclass('cortex.domain_similarity_cache') IS NOT NULL THEN
    DELETE FROM cortex.domain_knowledge d
     USING (VALUES
       ('therapeutic_area', 'oncology', ARRAY['oncology'],
        ARRAY['tumor response', 'overall survival', 'progression-free survival', 'biomarkers', 'combination therapy'], 0.85, 0.9),
       ('therapeutic_area', 'neurology', ARRAY['neurology'],
        ARRAY['cognitive endpoints', 'neuroimaging', 'biomarkers', 'disease modification', 'symptomatic treatment'], 0.9, 0.7),
       ('therapeutic_area', 'cardiology', ARRAY['cardiology'],
        ARRAY['MACE', 'cardiovascular outcomes', 'heart failure', 'arrhythmia', 'lipid endpoints'], 0.75, 0.8),
       ('therapeutic_area', 'immunology', ARRAY['immunology'],
        ARRAY['autoimmune', 'inflammation markers', 'disease activity scores', 'remission', 'flare rates'], 0.8, 0.7),
       ('therapeutic_area', 'rare_disease', ARRAY['rare_disease'],
        ARRAY['natural history', 'patient registries', 'biomarkers', 'functional endpoints', 'caregiver burden'], 0.85, 0.4),
       ('submission_type', 'nda', ARRAY['submission', 'nda'],
        ARRAY['efficacy', 'safety', 'CMC', 'labeling', 'risk-benefit'], 0.7, 0.9),
       ('submission_type', 'bla', ARRAY['submission', 'bla'],
        ARRAY['immunogenicity', 'manufacturing', 'potency', 'comparability', 'lot consistency'], 0.8, 0.7),
       ('regulatory_pathway', 'accelerated_approval', ARRAY['pathway', 'accelerated'],
        ARRAY['surrogate endpoint', 'post-marketing', 'confirmatory trial', 'withdrawal risk'], 0.75, 0.6),
       ('regulatory_pathway', 'breakthrough_therapy', ARRAY['pathway', 'breakthrough'],
        ARRAY['substantial improvement', 'intensive guidance', 'rolling review', 'organizational commitment'], 0.7, 0.5)
     ) AS s(domain_type, domain_value, domain_hierarchy, key_concepts, complexity_score, data_richness_score)
     WHERE d.domain_type = s.domain_type
       AND d.domain_value = s.domain_value
       AND d.domain_hierarchy IS NOT DISTINCT FROM s.domain_hierarchy
       AND d.key_concepts IS NOT DISTINCT FROM s.key_concepts
       AND d.complexity_score IS NOT DISTINCT FROM s.complexity_score
       AND d.data_richness_score IS NOT DISTINCT FROM s.data_richness_score
       AND NOT EXISTS (SELECT 1 FROM cortex.transfer_mappings tm
                        WHERE tm.source_domain_id = d.id OR tm.target_domain_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM cortex.domain_similarity_cache sc
                        WHERE sc.domain_a_id = d.id OR sc.domain_b_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM cortex.domain_knowledge c WHERE c.parent_domain_id = d.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] cortex.domain_knowledge: % seeded row(s) withdrawn', n;
  END IF;

  -- 078: cortex.transfer_templates — unless someone has since validated one.
  IF to_regclass('cortex.transfer_templates') IS NOT NULL THEN
    DELETE FROM cortex.transfer_templates t
     USING (VALUES
       ('Oncology to Rare Oncology',
        'Transfer knowledge from common cancers to rare/orphan oncology indications',
        ARRAY['therapeutic_area'], ARRAY['therapeutic_area'], ARRAY['prediction', 'recommendation'],
        '[{"step": 1, "action": "extract_efficacy_patterns", "params": {"endpoint_types": ["ORR", "PFS", "OS"]}},
          {"step": 2, "action": "adjust_sample_size_expectations", "params": {"reduction_factor": 0.5}},
          {"step": 3, "action": "apply_rare_disease_regulatory_context", "params": {}}]'::jsonb,
        0.75),
       ('NDA to BLA Adaptation',
        'Transfer NDA submission knowledge to BLA submissions with biologics adjustments',
        ARRAY['submission_type'], ARRAY['submission_type'], ARRAY['analysis', 'recommendation'],
        '[{"step": 1, "action": "map_cmc_concepts", "params": {"add_biologics_specific": true}},
          {"step": 2, "action": "add_immunogenicity_context", "params": {}},
          {"step": 3, "action": "adjust_manufacturing_expectations", "params": {}}]'::jsonb,
        0.7),
       ('Standard to Accelerated Pathway',
        'Adapt standard approval knowledge to accelerated approval contexts',
        ARRAY['regulatory_pathway'], ARRAY['regulatory_pathway'], ARRAY['prediction', 'analysis'],
        '[{"step": 1, "action": "identify_surrogate_endpoints", "params": {}},
          {"step": 2, "action": "add_post_marketing_requirements", "params": {}},
          {"step": 3, "action": "adjust_timeline_expectations", "params": {"factor": 0.7}}]'::jsonb,
        0.65)
     ) AS s(template_name, template_description, source_domain_types, target_domain_types, task_types,
            adaptation_steps, avg_success_rate)
     WHERE t.template_name = s.template_name
       AND t.template_description IS NOT DISTINCT FROM s.template_description
       AND t.source_domain_types IS NOT DISTINCT FROM s.source_domain_types
       AND t.target_domain_types IS NOT DISTINCT FROM s.target_domain_types
       AND t.task_types IS NOT DISTINCT FROM s.task_types
       AND t.adaptation_steps = s.adaptation_steps
       AND t.avg_success_rate IS NOT DISTINCT FROM s.avg_success_rate
       AND t.is_active IS TRUE
       AND t.validated IS NOT TRUE;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] cortex.transfer_templates: % seeded row(s) withdrawn', n;
  END IF;

  -- 050: the authorities and submission types stay; only the unsourced values
  -- go, and only where they are still the seeded ones. NULL reads "not recorded".
  IF to_regclass('common_standards.global_regulatory_authorities') IS NOT NULL THEN
    UPDATE common_standards.global_regulatory_authorities a
       SET submission_gateway_url = NULL, updated_at = NOW()
      FROM (VALUES
        ('US_FDA', 'https://esg.fda.gov'),
        ('EU_EMA', 'https://esubmission.ema.europa.eu'),
        ('JP_PMDA', 'https://gateway.pmda.go.jp'),
        ('CA_HC', 'https://submissions.hc-sc.gc.ca'),
        ('AU_TGA', 'https://esubmission.tga.gov.au'),
        ('KR_MFDS', 'https://ectd.mfds.go.kr'),
        ('CH_SWISSMEDIC', 'https://esubmission.swissmedic.ch'),
        ('UK_MHRA', 'https://submissions.mhra.gov.uk')
      ) AS s(id, url)
     WHERE a.id = s.id
       AND a.submission_gateway_url = s.url;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] common_standards.global_regulatory_authorities: % seeded gateway URL(s) withdrawn', n;
  END IF;

  IF to_regclass('common_standards.submission_types') IS NOT NULL THEN
    UPDATE common_standards.submission_types t
       SET standard_review_days = NULL, priority_review_days = NULL, updated_at = NOW()
      FROM (VALUES
        ('US_FDA', 'IND', 30, 30), ('US_FDA', 'NDA', 365, 180), ('US_FDA', 'BLA', 365, 180),
        ('US_FDA', 'ANDA', 365, NULL), ('US_FDA', '510K', 90, NULL), ('US_FDA', 'PMA', 180, NULL),
        ('US_FDA', 'DE_NOVO', 150, NULL), ('US_FDA', 'HDE', 75, NULL), ('US_FDA', '510K_IVD', 90, NULL),
        ('US_FDA', 'EUA', 14, NULL), ('EU_EMA', 'CTA', 60, 30), ('EU_EMA', 'MAA', 210, 150),
        ('JP_PMDA', 'CTN', 30, 30), ('JP_PMDA', 'JNDA', 365, 180), ('CA_HC', 'CTA_CA', 30, 30),
        ('CA_HC', 'NDS', 300, 180)
      ) AS s(authority_id, type_code, standard_days, priority_days)
     WHERE t.authority_id = s.authority_id
       AND t.type_code = s.type_code
       AND t.standard_review_days IS NOT DISTINCT FROM s.standard_days
       AND t.priority_review_days IS NOT DISTINCT FROM s.priority_days;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '[20261015j] common_standards.submission_types: % seeded review clock(s) withdrawn', n;
  END IF;
END
$gcc_seed_withdrawal$;
