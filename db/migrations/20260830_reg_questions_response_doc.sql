-- =============================================================================
-- reg_questions.response_doc_id — the drafted response, findable from the file
--
-- Purpose: "Draft response" on the CMC correspondence card creates a governed
--   authoring document and marks the question DRAFTED — but the document's id
--   was dropped on the floor, so after a reload the correspondence file said
--   DRAFTED while holding no way to open the draft it referred to. This column
--   is the link: the PATCH that records it verifies the document exists in the
--   caller's organization first (cmc-agency-questions.routes.ts). That check is
--   WRITE-TIME only — with no FK (below), a document deleted later (the
--   admin-token UAT cleanup path is the one reachable delete) leaves the id
--   dangling; the editor then states an honest miss rather than opening
--   anything, which is the read-time half of the contract.
--
-- Notes:
--   - Nullable by design: a question without a draft simply carries no link.
--   - No FK to authoring_documents: that table is created lazily by the
--     authoring router's ensure-DDL on first use, so a hard reference would
--     order this migration after a table that may not exist yet. Referential
--     honesty is enforced at write time instead (org-scoped existence check).
--   - No index: the column is read row-wise with the question, never queried by.
--   - Fresh installs get the column from shared/schema.ts via drizzle-kit push;
--     this is the existing-database half. Idempotent, safe to re-run.
--   - Rollback: ALTER TABLE reg_questions DROP COLUMN IF EXISTS response_doc_id;
-- =============================================================================

ALTER TABLE reg_questions
  ADD COLUMN IF NOT EXISTS response_doc_id uuid;
