-- Evidence Sufficiency Assessments
-- Migration: 20260429_evidence_sufficiency.sql
--
-- Persists the deterministic "is this program approval-ready?" verdict for
-- PMA / De Novo / 510(k) programs. One row per assessment run.

CREATE TABLE IF NOT EXISTS evidence_sufficiency_assessments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     integer NOT NULL,
  program_id          uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  pathway             varchar(16) NOT NULL,
  triggered_by        varchar(64),
  trigger             varchar(64) NOT NULL DEFAULT 'manual',

  inputs_hash         varchar(64),

  verdict             varchar(16) NOT NULL,
  overall_score       integer NOT NULL,

  pillar_scores       json NOT NULL,
  findings            json NOT NULL,
  finding_count       integer NOT NULL DEFAULT 0,
  critical_count      integer NOT NULL DEFAULT 0,
  warning_count       integer NOT NULL DEFAULT 0,

  recommendations     json,
  blocks_approval     boolean NOT NULL DEFAULT false,

  inputs_snapshot     json,
  summary             json,

  created_at          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evid_suff_program_idx ON evidence_sufficiency_assessments (program_id);
CREATE INDEX IF NOT EXISTS evid_suff_org_idx     ON evidence_sufficiency_assessments (organization_id);
CREATE INDEX IF NOT EXISTS evid_suff_pathway_idx ON evidence_sufficiency_assessments (pathway);
CREATE INDEX IF NOT EXISTS evid_suff_verdict_idx ON evidence_sufficiency_assessments (verdict);
CREATE INDEX IF NOT EXISTS evid_suff_created_idx ON evidence_sufficiency_assessments (created_at);
