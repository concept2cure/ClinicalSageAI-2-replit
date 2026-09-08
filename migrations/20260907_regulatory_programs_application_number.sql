-- 20260907_regulatory_programs_application_number.sql
--
-- The agency-assigned application number for a regulatory program: the IND
-- number for an IND, the NDA/BLA number, the EMA procedure number for an MAA.
-- Distinct from `code`, which is the sponsor's own program code (e.g. BX-301).
--
-- Nullable on purpose. A program has no agency number until the agency assigns
-- one, and the product never invents one — NULL renders as "not assigned",
-- never as a placeholder value. Read by the program landing (project-home);
-- the IND forms and the eCTD packager adopt the same column in their own
-- changes, so one fact feeds the screen, Form 1571 and us-regional.xml.
--
-- Replay-safe (CLAUDE.md RULE 1): additive and IF NOT EXISTS; re-running is a
-- no-op. No data migration — existing programs simply have no number yet.

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS application_number TEXT;

COMMENT ON COLUMN regulatory_programs.application_number IS
  'Agency-assigned application number (IND / NDA / BLA / MAA). NULL until assigned; never fabricated.';
