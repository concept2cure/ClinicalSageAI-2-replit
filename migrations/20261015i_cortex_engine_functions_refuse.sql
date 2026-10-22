-- =============================================================================
-- 20261015i — the cortex engine functions store no figure no model computed
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Replace seven placeholder engine functions on databases that have them.
--
-- eCTD/CTD Context:
--   - Module(s): none directly (submission-outcome predictions about any program)
--   - Integrity Risk Addressed: fixed priors and random jitter stored as model output
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No table, row or column is created, changed or removed.
--   - Idempotent; each replacement is conditional on its function existing.
-- =============================================================================
--
-- db/migrations/074_gcc_regulatory_intuition_engine.sql and
-- 076_gcc_causal_inference_engine.sql — applied by install-fresh, never by a
-- deploy — created these as SECURITY DEFINER functions:
--   - cortex.generate_intuition_prediction stored approval 0.7 / CRL 0.2 /
--     RTF 0.05 and a constant 0.7 "confidence" as model 'v1.0.0' output;
--   - cortex.extract_regulatory_signals answered an empty set ("no signals")
--     for an extraction it never performed;
--   - cortex.estimate_causal_effect stored a fixed 0.15 effect, jittered by
--     random(), labelled an 'aipw' estimate;
--   - cortex.generate_counterfactual stored a 0.5 base probability, 0.05 per
--     intervention with no estimated effect and a 0.6 "confidence".
-- Extended the same day (2026-10-15) with three more, from 074 and
-- db/migrations/078_gcc_cross_domain_transfer.sql (also install-fresh only):
--   - cortex.record_prediction_outcome stored 0.25 as the prediction error of
--     any outcome other than approval, CRL or RTF;
--   - cortex.compute_domain_similarity stored 0.5 for a missing embedding
--     similarity or concept overlap, weighted 0.6 / 0.4, and cached it;
--   - cortex.suggest_transfer_mapping graded risk into fixed bands (0.7 / 0.5 /
--     0.3 / 0.1) and recommended a transfer from them.
-- Nothing calls them. 074, 076 and 078 are amended in place the same day, which
-- reaches only databases installed after it; this file is in the deploy set
-- and replaces the functions wherever an earlier install created them. Each now
-- raises feature_not_supported and runs as its caller (SECURITY INVOKER), the
-- same definitions 074, 076 and 078 now create. The signatures and parameter
-- defaults are kept: CREATE OR REPLACE cannot change them. CLAUDE.md RULE 2:
-- this removes fabricated output; it builds nothing.

DO $cortex_engine_functions$
BEGIN
  IF to_regprocedure('cortex.generate_intuition_prediction(uuid, uuid, text)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION cortex.generate_intuition_prediction(
        p_submission_id UUID,
        p_org_id UUID,
        p_prediction_type TEXT DEFAULT 'during_review'
      ) RETURNS UUID
      LANGUAGE plpgsql
      SECURITY INVOKER
      AS $body$
      BEGIN
        RAISE EXCEPTION 'cortex.generate_intuition_prediction computes no prediction: no model exists'
          USING ERRCODE = 'feature_not_supported';
      END;
      $body$
    $fn$;
    EXECUTE $fn$
      COMMENT ON FUNCTION cortex.generate_intuition_prediction(uuid, uuid, text) IS
      'Refuses (feature_not_supported): no prediction model exists. It used to store fixed
priors (approval 0.7, CRL 0.2, RTF 0.05) and a 0.7 confidence as a prediction.'
    $fn$;
  END IF;

  IF to_regprocedure('cortex.extract_regulatory_signals(uuid, uuid, text, jsonb)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION cortex.extract_regulatory_signals(
        p_atom_id UUID,
        p_org_id UUID,
        p_document_type TEXT,
        p_extraction_config JSONB DEFAULT '{}'
      ) RETURNS TABLE(signal_id UUID, signal_type TEXT, signal_text TEXT, severity TEXT, confidence NUMERIC)
      LANGUAGE plpgsql
      SECURITY INVOKER
      AS $body$
      BEGIN
        RAISE EXCEPTION 'cortex.extract_regulatory_signals extracts no signals: no extractor exists'
          USING ERRCODE = 'feature_not_supported';
      END;
      $body$
    $fn$;
    EXECUTE $fn$
      COMMENT ON FUNCTION cortex.extract_regulatory_signals(uuid, uuid, text, jsonb) IS
      'Refuses (feature_not_supported): no signal extractor exists. It used to answer an
empty set, which read as "no signals", for an extraction it never performed.'
    $fn$;
  END IF;

  IF to_regprocedure('cortex.estimate_causal_effect(uuid, text, text, uuid, jsonb)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION cortex.estimate_causal_effect(
        p_graph_id UUID,
        p_treatment TEXT,
        p_outcome TEXT,
        p_org_id UUID DEFAULT NULL,
        p_conditioning JSONB DEFAULT '{}'
      ) RETURNS UUID
      LANGUAGE plpgsql
      SECURITY INVOKER
      AS $body$
      BEGIN
        RAISE EXCEPTION 'cortex.estimate_causal_effect computes no estimate: no estimator exists'
          USING ERRCODE = 'feature_not_supported';
      END;
      $body$
    $fn$;
    EXECUTE $fn$
      COMMENT ON FUNCTION cortex.estimate_causal_effect(uuid, text, text, uuid, jsonb) IS
      'Refuses (feature_not_supported): no causal estimator exists. It used to store a fixed
0.15 effect, jittered by random(), labelled an AIPW estimate.'
    $fn$;
  END IF;

  IF to_regprocedure('cortex.generate_counterfactual(uuid, jsonb, jsonb, uuid, uuid)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION cortex.generate_counterfactual(
        p_org_id UUID,
        p_factual_state JSONB,
        p_interventions JSONB,
        p_graph_id UUID DEFAULT NULL,
        p_submission_id UUID DEFAULT NULL
      ) RETURNS UUID
      LANGUAGE plpgsql
      SECURITY INVOKER
      AS $body$
      BEGIN
        RAISE EXCEPTION 'cortex.generate_counterfactual computes no counterfactual: no causal model exists'
          USING ERRCODE = 'feature_not_supported';
      END;
      $body$
    $fn$;
    EXECUTE $fn$
      COMMENT ON FUNCTION cortex.generate_counterfactual(uuid, jsonb, jsonb, uuid, uuid) IS
      'Refuses (feature_not_supported): no causal model exists. It used to store a 0.5 base
probability, 0.05 per intervention with no estimated effect and a 0.6 confidence.'
    $fn$;
  END IF;

  IF to_regprocedure('cortex.record_prediction_outcome(uuid, text, date)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION cortex.record_prediction_outcome(
        p_prediction_id UUID,
        p_actual_outcome TEXT,
        p_actual_date DATE DEFAULT NULL
      ) RETURNS VOID
      LANGUAGE plpgsql
      SECURITY INVOKER
      AS $body$
      BEGIN
        RAISE EXCEPTION 'cortex.record_prediction_outcome scores no prediction: no prediction model exists'
          USING ERRCODE = 'feature_not_supported';
      END;
      $body$
    $fn$;
    EXECUTE $fn$
      COMMENT ON FUNCTION cortex.record_prediction_outcome(uuid, text, date) IS
      'Refuses (feature_not_supported): no prediction model exists, so there is no prediction
to score. It used to store 0.25 as the prediction error of any outcome other than
approval, CRL or RTF, and counted pattern hits against predictions no model made.'
    $fn$;
  END IF;

  IF to_regprocedure('cortex.compute_domain_similarity(uuid, uuid)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION cortex.compute_domain_similarity(
        p_domain_a_id UUID,
        p_domain_b_id UUID
      ) RETURNS NUMERIC
      LANGUAGE plpgsql
      SECURITY INVOKER
      AS $body$
      BEGIN
        RAISE EXCEPTION 'cortex.compute_domain_similarity computes no similarity: no similarity model exists'
          USING ERRCODE = 'feature_not_supported';
      END;
      $body$
    $fn$;
    EXECUTE $fn$
      COMMENT ON FUNCTION cortex.compute_domain_similarity(uuid, uuid) IS
      'Refuses (feature_not_supported): no similarity model exists. It used to store 0.5 for a
missing embedding similarity or concept overlap, weighted the two 0.6 / 0.4 with no
source, and cached the result.'
    $fn$;
  END IF;

  IF to_regprocedure('cortex.suggest_transfer_mapping(uuid, uuid)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION cortex.suggest_transfer_mapping(
        p_source_domain_id UUID,
        p_target_domain_id UUID
      ) RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY INVOKER
      AS $body$
      BEGIN
        RAISE EXCEPTION 'cortex.suggest_transfer_mapping suggests no mapping: no transfer model exists'
          USING ERRCODE = 'feature_not_supported';
      END;
      $body$
    $fn$;
    EXECUTE $fn$
      COMMENT ON FUNCTION cortex.suggest_transfer_mapping(uuid, uuid) IS
      'Refuses (feature_not_supported): no transfer model exists. It used to grade risk into
fixed bands (0.7 / 0.5 / 0.3 / 0.1) and derive a transfer strength and a
recommendation from them and from compute_domain_similarity''s placeholder 0.5.'
    $fn$;
  END IF;
END
$cortex_engine_functions$;
