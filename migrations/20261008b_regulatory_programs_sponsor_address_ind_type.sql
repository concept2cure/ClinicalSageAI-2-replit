-- 20261008b_regulatory_programs_sponsor_address_ind_type.sql
--
-- The sponsor's address and the IND type, held on the program (P-20 follow-up,
-- docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08).
--
-- Form FDA 1571 requires both (sponsor_address; ind_type: Commercial /
-- Research / Emergency Use / Treatment IND, server/config/FDAFormsRegistry.ts).
-- Until now no column held either: the IND forms panel sent them with each
-- build request, so the program record never knew them and a 1571 built from
-- anywhere else had neither. The forms panel now saves them here
-- (PUT /api/ind-forms/program-facts) and the 1571 build reads them from the
-- record (form-context-assembler programToFormMetadata), as it already reads
-- the sponsor name, product, indication and application number.
--
-- Nullable on purpose. NULL is "not stated", and the build reports the field
-- as missing; nothing is defaulted. The IND type is validated against the
-- registry's options by the route that writes it, not by a CHECK here: the
-- option list is the registry's, and a CHECK copied into SQL would be a second
-- list that drifts from it.
--
-- Replay-safe (CLAUDE.md RULE 1): additive and IF NOT EXISTS; re-running is a
-- no-op. regulatory_programs is public with organization_id INTEGER NOT NULL
-- (20260524_program_workbench_schema.sql), so the tenant sweeps already cover
-- it. No data migration: existing programs simply have neither stated yet.

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS sponsor_address TEXT;

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS ind_type TEXT;

COMMENT ON COLUMN regulatory_programs.sponsor_address IS
  'Sponsor address as Form FDA 1571 (and 356h) carries it. NULL until stated; never defaulted.';

COMMENT ON COLUMN regulatory_programs.ind_type IS
  'IND type for Form FDA 1571 (one of the registry''s ind_type options). NULL until stated; IND programs only.';
