-- ============================================================================
-- regulatory_intel — seed the platform tier from precedent-engine's knowledge
-- ============================================================================
--
-- WHAT THIS IS. ADR 0013 made `precedent-engine` authoritative for CRL, RTF and
-- advisory-committee risk on one fact: `regulatory_intel` ships zero rows, so
-- the better-factored module would answer `[]` for every tenant, and "no CRL
-- triggers found" reads as "low risk". That ADR names its own reversal
-- condition — seed data. This is it.
--
-- The 24 patterns below are lifted from the inline arrays in
-- `server/services/precedent-engine.ts` (9 CRL, 7 RTF, 8 advisory-committee).
-- Nothing is invented: every name, description, rate and probability is the
-- value that file already ships and already serves to users today. What changes
-- is that they become rows — updatable without a code deploy, extensible per
-- tenant, and able to carry the provenance the schema has columns for and the
-- TypeScript arrays never could.
--
-- ── The category mappings are judgements, and they are recorded ─────────────
-- Each table constrains `category` to a fixed vocabulary; the inline arrays use
-- free text. The mapping is therefore a domain judgement, made once, here:
--
--   CRL   Efficacy Endpoint Failure          → clinical_efficacy
--         Safety Signal — Hepatotoxicity     → clinical_safety
--         Cardiovascular Risk Signal         → clinical_safety
--         Manufacturing Deficiency (CMC)     → cmc_manufacturing
--         Inadequate Clinical Pharmacology   → pharmacology
--         Labeling Deficiency                → labeling
--         Bioequivalence Failure             → clinical_design   ← imperfect
--         Predicate Device Mismatch          → clinical_design   ← imperfect
--         Insufficient Clinical Data (Device)→ clinical_efficacy
--
-- The two marked imperfect are honest losses: the CRL vocabulary has no
-- bioequivalence category and no device category, so both land on the nearest
-- available term. They are flagged rather than smoothed over because a reader
-- filtering by `clinical_design` will find them there and should know why.
--
--   RTF   Module 3 (CMC) → cmc_data · Pivotal CSR → clinical_data ·
--         Non-CDISC → format_compliance · Labeling → content_completeness ·
--         Environmental Assessment → environmental_assessment ·
--         Patent Certifications → patent_certification ·
--         Pre-submission Minutes → administrative
--
--   AdComm  first-in-class / no-predicate / AI-ML → efficacy_uncertainty ·
--           surrogate endpoint → surrogate_endpoint · safety signal →
--           safety_signal · paediatric extrapolation → pediatric_extrapolation ·
--           REMS ETASU and controversial profile → benefit_risk_balance
--
-- ── What is deliberately NOT filled in ──────────────────────────────────────
-- `committee_type` is NOT NULL on the advisory-committee table and the inline
-- data carries no committee. These patterns are genuinely not committee-specific
-- — "first-in-class mechanism of action" raises AdComm probability at ODAC and
-- at CRDAC alike — so they are seeded as 'ANY'. Assigning them to named
-- committees would be fabricating regulatory data to satisfy a NOT NULL.
--
-- Likewise `typical_fda_language`, `deficiency_signals`, `avg_cycles_to_resolve`,
-- `resolution_success_rate`, `negative_vote_correlation` and `fda_override_rate`
-- are left NULL. The schema has room for them; the source has no values for
-- them; an invented number in a regulatory risk table is worse than a null.
--
-- `resolution_difficulty` IS derived, from the inline `severity` (critical →
-- very_high, high → high, medium → moderate). That is a rename of an existing
-- judgement, not a new one.
--
-- EMA question patterns are not seeded here: that table keys on procedure phase
-- and procedure type with their own constrained vocabularies, and the inline
-- EMA array carries a free-text phase that needs a mapping pass of its own.
--
-- ── Idempotent ──────────────────────────────────────────────────────────────
-- ON CONFLICT DO NOTHING against the partial unique index on (pattern_code)
-- WHERE organization_id = the platform sentinel. Re-running changes nothing,
-- and a pattern an operator has edited keeps their version.
--
-- ROLLBACK
--   DELETE FROM regulatory_intel.crl_trigger_patterns        WHERE organization_id = '00000000-0000-0000-0000-000000000000';
--   DELETE FROM regulatory_intel.rtf_trigger_patterns        WHERE organization_id = '00000000-0000-0000-0000-000000000000';
--   DELETE FROM regulatory_intel.advisory_committee_patterns WHERE organization_id = '00000000-0000-0000-0000-000000000000';
-- The services fall back to their inline arrays, which is where they are today,
-- so rollback loses nothing a user can see.
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('regulatory_intel.crl_trigger_patterns') IS NULL THEN
    RAISE NOTICE 'regulatory_intel tables absent — platform seed skipped';
    RETURN;
  END IF;

  INSERT INTO regulatory_intel.crl_trigger_patterns
    (organization_id, pattern_code, pattern_name, category, trigger_description,
     frequency_rate, resolution_difficulty, submission_types)
  VALUES
    ('00000000-0000-0000-0000-000000000000', 'EFFICACY_ENDPOINT_FAILURE', 'Efficacy Endpoint Failure', 'clinical_efficacy',
     'Primary endpoint did not meet statistical significance (p > 0.05)',
     0.34, 'very_high', ARRAY['NDA','BLA','MAA']::TEXT[]),
    ('00000000-0000-0000-0000-000000000000', 'SAFETY_SIGNAL_HEPATOTOXICITY', 'Safety Signal — Hepatotoxicity', 'clinical_safety',
     'Drug-induced liver injury (DILI) signals detected in pivotal trials',
     0.18, 'very_high', ARRAY['NDA','BLA','ANDA','505(b)(2)']::TEXT[]),
    ('00000000-0000-0000-0000-000000000000', 'CARDIOVASCULAR_RISK_SIGNAL', 'Cardiovascular Risk Signal', 'clinical_safety',
     'CV event imbalance (MACE) or QTc prolongation concerns',
     0.22, 'high', ARRAY['NDA','BLA','ANDA']::TEXT[]),
    ('00000000-0000-0000-0000-000000000000', 'MANUFACTURING_DEFICIENCY_CMC', 'Manufacturing Deficiency (CMC)', 'cmc_manufacturing',
     'Incomplete or inadequate CMC data — process validation, stability, specifications',
     0.28, 'high', ARRAY['NDA','BLA','ANDA','505(b)(2)','MAA']::TEXT[]),
    ('00000000-0000-0000-0000-000000000000', 'INADEQUATE_CLINICAL_PHARMACOLOGY', 'Inadequate Clinical Pharmacology', 'pharmacology',
     'Missing PK/PD data, drug-drug interaction studies, or special population studies',
     0.15, 'moderate', ARRAY['NDA','505(b)(2)','ANDA']::TEXT[]),
    ('00000000-0000-0000-0000-000000000000', 'LABELING_DEFICIENCY', 'Labeling Deficiency', 'labeling',
     'Proposed labeling not supported by submitted data or inconsistent with clinical findings',
     0.12, 'moderate', ARRAY['NDA','BLA','ANDA','505(b)(2)']::TEXT[]),
    ('00000000-0000-0000-0000-000000000000', 'BIOEQUIVALENCE_FAILURE', 'Bioequivalence Failure', 'clinical_design',
     'Failed to demonstrate bioequivalence to reference listed drug (RLD)',
     0.41, 'very_high', ARRAY['ANDA','505(b)(2)']::TEXT[]),
    ('00000000-0000-0000-0000-000000000000', 'PREDICATE_DEVICE_MISMATCH', 'Predicate Device Mismatch', 'clinical_design',
     'Substantial equivalence argument not supported — different intended use or technology',
     0.19, 'high', ARRAY['510(k)','PMA','De Novo']::TEXT[]),
    ('00000000-0000-0000-0000-000000000000', 'INSUFFICIENT_CLINICAL_DATA_DEVICE', 'Insufficient Clinical Data (Device)', 'clinical_efficacy',
     'Clinical evidence insufficient to demonstrate safety and effectiveness',
     0.31, 'very_high', ARRAY['PMA','De Novo']::TEXT[])
  ON CONFLICT DO NOTHING;
  
  INSERT INTO regulatory_intel.rtf_trigger_patterns
    (organization_id, pattern_code, pattern_name, category, trigger_description, frequency_rate)
  VALUES
    ('00000000-0000-0000-0000-000000000000', 'MISSING_OR_INCOMPLETE_MODULE_3_CMC', 'Missing or Incomplete Module 3 (CMC)', 'cmc_data',
     'CMC deficiencies are the #1 cause of RTF actions across NDA/BLA/ANDA', 0.35),
    ('00000000-0000-0000-0000-000000000000', 'ABSENT_PIVOTAL_STUDY_CSR', 'Absent Pivotal Study CSR', 'clinical_data',
     'Pivotal clinical study report not included or grossly incomplete', 0.22),
    ('00000000-0000-0000-0000-000000000000', 'NON_CDISC_DATASETS', 'Non-CDISC Datasets', 'format_compliance',
     'Clinical datasets not submitted in SDTM/ADaM format per FDA binding guidance', 0.18),
    ('00000000-0000-0000-0000-000000000000', 'INCOMPLETE_LABELING_PACKAGE', 'Incomplete Labeling Package', 'content_completeness',
     'Draft prescribing information not provided or inconsistent with data', 0.12),
    ('00000000-0000-0000-0000-000000000000', 'MISSING_ENVIRONMENTAL_ASSESSMENT', 'Missing Environmental Assessment', 'environmental_assessment',
     'Neither EA nor categorical exclusion provided', 0.08),
    ('00000000-0000-0000-0000-000000000000', 'INCORRECT_PATENT_CERTIFICATIONS', 'Incorrect Patent Certifications', 'patent_certification',
     'Para IV certification without required notification or incorrect patent listing (ANDA)', 0.15),
    ('00000000-0000-0000-0000-000000000000', 'MISSING_PRE_SUBMISSION_MEETING_MINUTES', 'Missing Pre-submission Meeting Minutes', 'administrative',
     'No reference to Type A/B/C meeting agreements in cover letter', 0.06)
  ON CONFLICT DO NOTHING;
  
  INSERT INTO regulatory_intel.advisory_committee_patterns
    (organization_id, pattern_code, pattern_name, committee_type, risk_category, historical_frequency)
  VALUES
    ('00000000-0000-0000-0000-000000000000', 'FIRST_IN_CLASS_MECHANISM_OF_ACTION', 'First-in-class mechanism of action', 'ANY', 'efficacy_uncertainty', 0.85),
    ('00000000-0000-0000-0000-000000000000', 'ACCELERATED_APPROVAL_WITH_SURROGATE_ENDPOINT', 'Accelerated Approval with surrogate endpoint', 'ANY', 'surrogate_endpoint', 0.75),
    ('00000000-0000-0000-0000-000000000000', 'SIGNIFICANT_SAFETY_SIGNAL_IN_PIVOTAL_TRIAL', 'Significant safety signal in pivotal trial', 'ANY', 'safety_signal', 0.8),
    ('00000000-0000-0000-0000-000000000000', 'PEDIATRIC_INDICATION_WITH_EXTRAPOLATED_EFFICACY', 'Pediatric indication with extrapolated efficacy', 'ANY', 'pediatric_extrapolation', 0.65),
    ('00000000-0000-0000-0000-000000000000', 'REMS_WITH_ETASU_ELEMENTS', 'REMS with ETASU elements', 'ANY', 'benefit_risk_balance', 0.6),
    ('00000000-0000-0000-0000-000000000000', 'CONTROVERSIAL_BENEFIT_RISK_PROFILE', 'Controversial benefit-risk profile', 'ANY', 'benefit_risk_balance', 0.7),
    ('00000000-0000-0000-0000-000000000000', 'NOVEL_DEVICE_WITH_NO_PREDICATE_DE_NOVO', 'Novel device with no predicate (De Novo)', 'ANY', 'efficacy_uncertainty', 0.55),
    ('00000000-0000-0000-0000-000000000000', 'PMA_WITH_NOVEL_AI_ML_ALGORITHM', 'PMA with novel AI/ML algorithm', 'ANY', 'efficacy_uncertainty', 0.7)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'regulatory_intel platform knowledge seeded';
END
$do$;
