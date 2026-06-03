-- Living Record Spine — program-id bridge
-- Migration: 20260603_living_record_program_link.sql
--
-- The platform carries two program namespaces with no native FK between them:
--   evidence_claims.program_id   integer (legacy claims namespace)
--   regulatory_programs.id       uuid    (canonical program the facts are scoped to)
--
-- This explicit, operator/UI-populated link lets reconcileClaimById resolve a
-- claim's uuid program from the claim id alone, so reconcile-on-write works
-- without the caller knowing both ids. Absent a link, reconcile is a no-op — it
-- never guesses a mapping, which would be unsafe in a regulated record.
--
-- Date-prefixed migrations may share a prefix (see
-- scripts/ci/check-migration-prefix-collisions.mjs), so this sits beside
-- 20260603_living_record_spine.sql.
--
-- IDEMPOTENT.

CREATE TABLE IF NOT EXISTS living_record_program_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   integer NOT NULL,
  legacy_program_id integer NOT NULL,
  program_id        uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,
  created_by        integer,
  created_at        timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS living_record_program_links_org_legacy_idx
  ON living_record_program_links (organization_id, legacy_program_id);
CREATE INDEX IF NOT EXISTS living_record_program_links_program_idx
  ON living_record_program_links (program_id);

COMMENT ON TABLE living_record_program_links IS
  'Bridge from integer evidence_claims.program_id to uuid regulatory_programs.id. Operator/UI-populated so a claim can be reconciled from its id alone; absent a link, reconcile no-ops.';
