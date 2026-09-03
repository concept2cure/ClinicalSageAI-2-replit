-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give Module 3 the manufacturing-process and characterisation-study sources it composes from, and give the existing manufacturing_processes table the writer it never had.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — 3.2.S.2 (manufacture of the drug substance), 3.2.S.3 (characterisation)
--   - Integrity Risk Addressed: a composer demanding canonical sources nothing produced, and a reconstructed table with two live readers and no writer — so 3.2.S.2 and 3.2.S.3 had nothing to render from
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - manufacturing_processes is ALTERed, not duplicated: it is the FK target of
--     cmc_process_steps and is read by ich-compliance-checker and qbd-analyzer.
--     A second table would leave those readers pointed at an empty one.
--   - Additive and idempotent (ADD COLUMN / CREATE TABLE IF NOT EXISTS).
-- =============================================================================

-- CMC registers for the manufacturing process and characterisation studies.
--
-- ── What was missing ─────────────────────────────────────────────────────────
-- server/services/module3Composer.ts demands two canonical sources that no
-- part of the product produced:
--
--   3.2.S.2   requiredSourceTypes include 'manufacturing_process'
--   3.2.S.3   requiredSourceTypes include 'characterization'
--
-- ── Why manufacturing_processes is ALTERed and not created ───────────────────
-- The table already exists. db/migrations/20260730_manufacturing_processes_
-- reconstruction.sql created it from its READERS -- server/services/cmc/
-- ich-compliance-checker.ts and server/services/cmc/qbd-analyzer.ts both
-- SELECT from it -- because no writer had ever existed. It is also the FK
-- target of cmc_process_steps. Adding a second `cmc_manufacturing_processes`
-- would leave the two live readers pointed at a table nothing fills while the
-- staffer's data sat somewhere else, which is the duplication this repo's
-- working agreement exists to prevent. This file gives that table its writer.
--
-- The columns added here are the ones shared/cmc-schema.ts has declared on
-- `manufacturingProcesses` since it was written and the reconstruction could
-- not know about: it was derived from the two readers' SELECT lists, and those
-- readers ask for six columns. A drizzle insert against the model would have
-- failed on the other six.
--
-- validated_by / validation_date are new: validation_status is the record's
-- lifecycle, and moving it to `validated` is a governed action, so the
-- signature has to land somewhere. The impurity register learned this the
-- expensive way (a governed qualify route writing qualified_by into a table
-- that had no such column, 500 at runtime).
--
-- ── Characterisation ────────────────────────────────────────────────────────
-- cmc_characterization_studies is one row per study, typed by what the study
-- establishes: structure, physicochemical property, or biological activity.
-- 3.2.S.3.1 asks for all three and they come from different experiments, so
-- one row deliberately carries one of them -- the composer's union across
-- matched sources is the correct reading here, unlike the register shapes
-- where a *Complete key had to close it.
--
-- Additive and idempotent. Nothing is dropped or renamed.

ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS process_description text;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS equipment_list jsonb;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS facility_info jsonb;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS batch_size text;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS yield_data jsonb;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS scale_up_data jsonb;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS process_development text;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS reprocessing text;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS validated_by text;
ALTER TABLE manufacturing_processes ADD COLUMN IF NOT EXISTS validation_date timestamp;

CREATE TABLE IF NOT EXISTS cmc_characterization_studies (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id text,
  scope text NOT NULL DEFAULT 'drug_substance',
  study_type text NOT NULL DEFAULT 'structural',
  study_title text NOT NULL,
  technique text,
  attribute text,
  result text,
  result_unit text,
  acceptance_reference text,
  conclusion text,
  study_reference text,
  performed_by text,
  performed_date timestamp,
  supporting_data jsonb,
  status text NOT NULL DEFAULT 'draft',
  qualified_by text,
  qualification_date timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmc_characterization_studies_org
  ON cmc_characterization_studies (organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_characterization_studies_project
  ON cmc_characterization_studies (project_id);

-- organization_id is what every register in this family keys tenancy on, and
-- what manufacturing_processes' own RLS policy compares: a NULL org row is
-- invisible under enforcement, which reads as "no processes recorded" rather
-- than as an error. The reconstruction left it nullable because no writer
-- existed to populate it and said tightening "belongs to whichever change adds
-- the writer". This is that change.
--
-- Guarded on the table being empty so a row from some path this repo cannot
-- see cannot fail the whole migration set on a deploy. The table has never had
-- a writer, so the guard is expected to be a formality.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM manufacturing_processes)
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'manufacturing_processes'
         AND column_name = 'organization_id'
         AND is_nullable = 'YES'
     )
  THEN
    ALTER TABLE manufacturing_processes ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- validation_status: the model has declared DEFAULT 'not-started' since it was
-- written and no migration ever gave the column one, so every process this
-- register creates without an explicit status was stored NULL. The model must
-- not claim what the database does not enforce -- that is the principle the
-- model's own doc block states -- so the database gets the default rather than
-- the model losing it. Existing NULLs are backfilled: a process with no
-- recorded validation state IS not-started, and NULL is how the column said so
-- before it could say it properly.
ALTER TABLE manufacturing_processes
  ALTER COLUMN validation_status SET DEFAULT 'not-started';
UPDATE manufacturing_processes SET validation_status = 'not-started'
  WHERE validation_status IS NULL;
