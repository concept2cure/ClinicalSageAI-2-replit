-- Connect protocol / study-design (CDISC PRM) to the canonical project key.
--
-- cdisc_prm_studies carried no project key: it is keyed by its own text
-- study_id + tenant_id, and design.programId was coerced into the
-- protocol_id varchar. Every other clinical-spine table (clinical_studies,
-- rbm_*) hangs off program_id uuid — the canonical project id space
-- (regulatory_programs.id). This adds that key to the design table so a
-- project's protocol, its study conduct record and its monitoring share
-- one id.
--
-- Additive and nullable: existing rows and the v2 persist path keep
-- working; the column is populated on the next persist. Idempotent.

ALTER TABLE cdisc_prm_studies
  ADD COLUMN IF NOT EXISTS program_id uuid;

CREATE INDEX IF NOT EXISTS prm_program_idx
  ON cdisc_prm_studies (program_id);

-- Backfill: where protocol_id already holds a UUID (design.programId was a
-- regulatory_programs id), promote it into program_id. Rows whose
-- protocol_id is a non-UUID string are left null rather than guessed — a
-- wrong project link is worse than an absent one.
UPDATE cdisc_prm_studies
   SET program_id = protocol_id::uuid
 WHERE program_id IS NULL
   AND protocol_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
