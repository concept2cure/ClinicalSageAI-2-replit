-- Reviewer Simulation Runs
-- Migration: 20260429_reviewer_simulation.sql
--
-- Persists deterministic red-team simulations against regulatory programs.
-- One row per (program × run); each carries the persona scope, question
-- list, and counts as JSONB for audit-grade replay.

CREATE TABLE IF NOT EXISTS reviewer_simulation_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          integer NOT NULL,
  program_id               uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  triggered_by             varchar(64),
  trigger                  varchar(64) NOT NULL DEFAULT 'manual',

  persona_scope            json NOT NULL,
  inputs_hash              varchar(64),

  questions                json NOT NULL,
  question_count           integer NOT NULL DEFAULT 0,
  critical_count           integer NOT NULL DEFAULT 0,
  warning_count            integer NOT NULL DEFAULT 0,
  info_count               integer NOT NULL DEFAULT 0,

  per_persona_counts       json,
  defense_packet_id        uuid,

  summary                  json,

  created_at               timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reviewer_sim_program_idx
  ON reviewer_simulation_runs (program_id);
CREATE INDEX IF NOT EXISTS reviewer_sim_org_idx
  ON reviewer_simulation_runs (organization_id);
CREATE INDEX IF NOT EXISTS reviewer_sim_created_idx
  ON reviewer_simulation_runs (created_at);
CREATE INDEX IF NOT EXISTS reviewer_sim_trigger_idx
  ON reviewer_simulation_runs (trigger);
