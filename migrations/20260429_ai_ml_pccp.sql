-- AI/ML Predetermined Change Control Plan (PCCP)
-- Migration: 20260429_ai_ml_pccp.sql
--
-- Models the FDA 2025 final guidance on PCCPs for AI-enabled device software
-- functions. One ai_ml_pccp_plans row per plan version; one
-- ai_ml_modifications row per anticipated modification.

CREATE TABLE IF NOT EXISTS ai_ml_pccp_plans (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                   integer NOT NULL,
  program_id                        uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  code                              varchar(64) NOT NULL,
  version                           integer NOT NULL DEFAULT 1,
  previous_plan_id                  uuid,

  title                             text NOT NULL,
  device_subject_name               text,
  intended_use                      text,

  description_summary               text,

  data_management_practices         text,
  retraining_practices              text,
  performance_evaluation_protocol   text,
  update_procedures                 text,
  transparency_commitments          text,

  benefits_narrative                text,
  risks_narrative                   text,
  mitigations_narrative             text,
  comparison_to_current_device      text,

  monitoring_plan                   text,
  drift_detection_plan              text,
  bias_subgroup_analysis_plan       text,
  cybersecurity_impact_narrative    text,
  labeling_impact_narrative         text,
  rollback_strategy_narrative       text,

  status                            varchar(32) NOT NULL DEFAULT 'draft',

  approved_by                       text,
  approved_at                       timestamp,
  signature_id                      uuid,
  locked                            boolean NOT NULL DEFAULT false,

  guidance_version                  varchar(32) DEFAULT 'FDA-PCCP-2024',

  metadata                          json,

  created_by                        text,
  updated_by                        text,
  created_at                        timestamp NOT NULL DEFAULT now(),
  updated_at                        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pccp_plans_program_idx ON ai_ml_pccp_plans (program_id);
CREATE INDEX IF NOT EXISTS pccp_plans_org_idx     ON ai_ml_pccp_plans (organization_id);
CREATE INDEX IF NOT EXISTS pccp_plans_status_idx  ON ai_ml_pccp_plans (status);
CREATE UNIQUE INDEX IF NOT EXISTS pccp_plans_code_version_idx
  ON ai_ml_pccp_plans (organization_id, code, version);

CREATE TABLE IF NOT EXISTS ai_ml_modifications (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                         uuid NOT NULL REFERENCES ai_ml_pccp_plans(id) ON DELETE CASCADE,

  code                            varchar(64) NOT NULL,
  ordering                        integer NOT NULL DEFAULT 0,
  title                           text NOT NULL,

  modification_type               varchar(64) NOT NULL,

  boundary                        text NOT NULL,
  boundary_delta_limit            text,
  rationale                       text NOT NULL,

  retraining_data_criteria        text,

  performance_metric              varchar(64),
  performance_comparator          varchar(8),
  performance_threshold_value     text,
  performance_test_set            text,

  rollback_strategy               text NOT NULL,

  cybersecurity_impact            text,
  labeling_impact                 text,
  bias_subgroup_analysis          text,

  status                          varchar(32) NOT NULL DEFAULT 'draft',

  metadata                        json,

  created_at                      timestamp NOT NULL DEFAULT now(),
  updated_at                      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pccp_modifications_plan_idx ON ai_ml_modifications (plan_id);
CREATE INDEX IF NOT EXISTS pccp_modifications_type_idx ON ai_ml_modifications (modification_type);
CREATE UNIQUE INDEX IF NOT EXISTS pccp_modifications_plan_code_idx
  ON ai_ml_modifications (plan_id, code);
