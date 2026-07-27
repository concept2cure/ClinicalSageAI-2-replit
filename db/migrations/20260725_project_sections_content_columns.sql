-- The eCTD compile surface reads three columns project_sections never had (C-16).
--
-- db/migrations/20260220_ind_section_tracking.sql is the ONLY definition of
-- project_sections, and it carries tracking fields only — status, assignee,
-- deadline, hours. But all three eCTD compile endpoints select `content`,
-- `word_count` and `required` from it:
--
--   POST /api/ectd-compile/:projectId/compile    (ectd-compile.ts:119)
--   POST /api/ectd-compile/:projectId/validate   (ectd-compile.ts:380)
--   GET  /api/ectd-compile/:projectId/status     (word_count, :262)
--
-- and those values are load-bearing, not decorative:
--
--   · runPreCompileValidation flags a locked section whose content is under 50
--     characters, and a section under a per-module word-count minimum;
--   · the eCTD XML backbone's <ectd:total-files> counts sections that have
--     content;
--   · each DocumentStatus reports hasContent / wordCount / required.
--
-- Consequence before this migration: the compile SELECT is UNGUARDED, so
-- "column content does not exist" reached the handler's catch and POST /compile
-- returned 500 every time. /status and /validate wrap theirs in an inner catch,
-- so they silently reported an empty dossier — a submission-readiness dashboard
-- that always said "nothing is ready" regardless of the work done.
--
-- NOTE on `content`: this is a tracking SNAPSHOT for compile-time validation and
-- backbone assembly, not a second authoring store. Authored text remains
-- canonical in the authoring/artifact tables; nothing here writes it back.
--
-- Rollback:
--   ALTER TABLE project_sections DROP COLUMN IF EXISTS content;
--   ALTER TABLE project_sections DROP COLUMN IF EXISTS word_count;
--   ALTER TABLE project_sections DROP COLUMN IF EXISTS required;

ALTER TABLE IF EXISTS project_sections
  ADD COLUMN IF NOT EXISTS content TEXT;

ALTER TABLE IF EXISTS project_sections
  ADD COLUMN IF NOT EXISTS word_count INTEGER NOT NULL DEFAULT 0;

-- Whether this section is required for the submission. The authoritative
-- required-section list for validation lives in ECTD_MODULE_DEFS; this flag is
-- the per-project override the compile surface reports per document.
ALTER TABLE IF EXISTS project_sections
  ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT FALSE;
