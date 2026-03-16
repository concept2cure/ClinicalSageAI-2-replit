-- ═══════════════════════════════════════════════════════════════════════════════
-- IVDR Schema Hardening — Add audit-critical columns
--
-- Closes 11 CRITICAL gaps found during regulatory trust audit:
-- 1. Analytical validations: evidence_documents, acceptance_criteria
-- 2. Validation param history: notes/reason
-- 3. Clinical evidence: population_definition, inclusion/exclusion criteria,
--    source_documents
-- 4. CDx workflows: intended_use_statement, biomarker_type, clinical_evidence_ids
--
-- Migration: 20260222_ivdr_schema_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. ANALYTICAL VALIDATIONS ──────────────────────────────────────────────

-- Evidence document links (protocol, dataset, report) per validation
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_analytical_validations' AND column_name = 'evidence_documents')
  THEN
    ALTER TABLE ivdr_analytical_validations
      ADD COLUMN evidence_documents JSONB DEFAULT '[]';
    COMMENT ON COLUMN ivdr_analytical_validations.evidence_documents IS
      'Array of { type: "protocol"|"dataset"|"report"|"publication", title: string, url: string, version: string }';
  END IF;
END $$;

-- Per-parameter acceptance criteria (min/max thresholds)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_analytical_validations' AND column_name = 'acceptance_criteria')
  THEN
    ALTER TABLE ivdr_analytical_validations
      ADD COLUMN acceptance_criteria JSONB DEFAULT '{}';
    COMMENT ON COLUMN ivdr_analytical_validations.acceptance_criteria IS
      'Object keyed by param name: { "lod": { "max": 5, "unit": "pg/mL" }, "precision_cv": { "max": 15, "unit": "%" }, ... }';
  END IF;
END $$;

-- Pass/fail status per parameter, computed against acceptance criteria
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_analytical_validations' AND column_name = 'pass_fail_status')
  THEN
    ALTER TABLE ivdr_analytical_validations
      ADD COLUMN pass_fail_status JSONB DEFAULT '{}';
    COMMENT ON COLUMN ivdr_analytical_validations.pass_fail_status IS
      'Object keyed by param name: { "lod": "pass", "precision_cv": "fail", "sensitivity": "pending", ... }';
  END IF;
END $$;

-- ─── 2. VALIDATION PARAMETER HISTORY ────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_validation_parameter_history' AND column_name = 'reason')
  THEN
    ALTER TABLE ivdr_validation_parameter_history
      ADD COLUMN reason TEXT;
    COMMENT ON COLUMN ivdr_validation_parameter_history.reason IS
      'Audit trail: reason for parameter change (21 CFR Part 11 §11.10(e))';
  END IF;
END $$;

-- ─── 3. CLINICAL EVIDENCE ───────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_clinical_evidence' AND column_name = 'population_definition')
  THEN
    ALTER TABLE ivdr_clinical_evidence
      ADD COLUMN population_definition TEXT;
    COMMENT ON COLUMN ivdr_clinical_evidence.population_definition IS
      'Description of study population (demographics, disease stage, prevalence)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_clinical_evidence' AND column_name = 'inclusion_criteria')
  THEN
    ALTER TABLE ivdr_clinical_evidence
      ADD COLUMN inclusion_criteria TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_clinical_evidence' AND column_name = 'exclusion_criteria')
  THEN
    ALTER TABLE ivdr_clinical_evidence
      ADD COLUMN exclusion_criteria TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_clinical_evidence' AND column_name = 'source_documents')
  THEN
    ALTER TABLE ivdr_clinical_evidence
      ADD COLUMN source_documents JSONB DEFAULT '[]';
    COMMENT ON COLUMN ivdr_clinical_evidence.source_documents IS
      'Array of { type: "protocol"|"dataset"|"publication"|"report", title: string, url: string, version: string }';
  END IF;
END $$;

-- ─── 4. CDx WORKFLOWS ──────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_cdx_workflows' AND column_name = 'intended_use_statement')
  THEN
    ALTER TABLE ivdr_cdx_workflows
      ADD COLUMN intended_use_statement TEXT;
    COMMENT ON COLUMN ivdr_cdx_workflows.intended_use_statement IS
      'Formal IVD intended use per IVDR Art 2(2) — "An IVD medical device intended for..."';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_cdx_workflows' AND column_name = 'biomarker_type')
  THEN
    ALTER TABLE ivdr_cdx_workflows
      ADD COLUMN biomarker_type VARCHAR(50);
    COMMENT ON COLUMN ivdr_cdx_workflows.biomarker_type IS
      'protein | gene | mutation | expression | metabolite | cell_marker';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_cdx_workflows' AND column_name = 'clinical_evidence_ids')
  THEN
    ALTER TABLE ivdr_cdx_workflows
      ADD COLUMN clinical_evidence_ids INTEGER[] DEFAULT '{}';
    COMMENT ON COLUMN ivdr_cdx_workflows.clinical_evidence_ids IS
      'FK references to ivdr_clinical_evidence.id records linked to this CDx';
  END IF;
END $$;

-- ─── 5. EVIDENCE RESULT HISTORY: add reason column ─────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ivdr_evidence_result_history' AND column_name = 'reason')
  THEN
    ALTER TABLE ivdr_evidence_result_history
      ADD COLUMN reason TEXT;
  END IF;
END $$;
