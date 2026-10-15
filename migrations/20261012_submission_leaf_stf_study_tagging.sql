-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A submission leaf can name the study it belongs to and the STF
--          file-tag it is referenced under, so an eCTD sequence can satisfy FDA
--          validation 1789 instead of being refused by it
--          (D2; docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
--          g-stf-1789-fail-closed-facts.md).
--
-- eCTD/CTD Context:
--   - Module(s): 4 and 5. Every file submitted in a study section must be
--     referenced by a Study Tagging File; FDA validation 1789 fires when one is
--     not, and it is a high-severity Technical Rejection Criterion (effective
--     2021-09-15). The exempt sections are 4.3 Literature references,
--     5.2 Tabular listings, 5.3.6 Postmarketing reports and 5.4 Literature
--     references.
--   - Integrity Risk Addressed: a sequence that is built, transmitted and then
--     technically rejected, with no record of which files were untagged.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261012_submission_leaf_stf_study_tagging.sql
--
-- WHY. The packager refuses a US sequence whose Module 4/5 study files would be
-- referenced by no Study Tagging File, because FDA rejects that sequence. The
-- refusal was unsatisfiable on the canonical path: `submission_leaves` recorded
-- the section, the title, the document and the lifecycle operation, and nothing
-- about which study a leaf belongs to. A compile over the submission spine had
-- no way to supply what the refusal asks for, so every US sequence with a study
-- report in it would have dead-ended. A refusal nobody can satisfy is not a
-- gate; it is a wall.
--
-- WHAT.
--   * study_id TEXT on submission_leaves: the sponsor's study identifier, as
--     the STF will carry it ("DPL-301"). NULL means the leaf names no study —
--     a fact, never a stand-in. (The lifecycle operator was being read as a
--     study id before this; see the -facts.md.)
--   * stf_file_tag TEXT: the STF file-tag this leaf is referenced under
--     ("study-report-body", "legacy-data-tabulation-dataset-send"). NULL means
--     the leaf names no tag.
--   Both nullable and unconstrained here: the value set is the FDA STF
--   specification's, which the application validates (ectd/stf-generator.ts),
--   and a CHECK in the database would have to be amended in place every time
--   that specification gains a tag.
--
-- WHO WRITES THEM. The leaf-authoring paths that already write a leaf's section
-- and document. They stay NULL until one does, and a NULL leaf in a 1789 study
-- section is exactly what the packager refuses, by name.
--
-- RULE 1: replayed on every deploy. Both statements are ADD COLUMN IF NOT
-- EXISTS, so a replay is a no-op; nothing here drops or rewrites. Removing
-- either column later means amending THIS file, not appending a DROP.
--
-- TENANCY. submission_leaves is in `public` and already carries
-- organization_id INTEGER NOT NULL with its RLS policy; adding a column does
-- not change its scoping, and the tenant sweeps at the end of the set still see
-- the table.
-- =============================================================================

ALTER TABLE submission_leaves
  ADD COLUMN IF NOT EXISTS study_id TEXT,
  ADD COLUMN IF NOT EXISTS stf_file_tag TEXT;

COMMENT ON COLUMN submission_leaves.study_id IS
  'The sponsor study identifier this leaf belongs to, as the Study Tagging File carries it. NULL means the leaf names no study; it is never inferred.';

COMMENT ON COLUMN submission_leaves.stf_file_tag IS
  'The FDA STF file-tag this leaf is referenced under. NULL means the leaf names no tag; FDA validation 1789 refuses a Module 4/5 study file that has neither.';

-- A sequence's study files are read together when the STFs are generated.
CREATE INDEX IF NOT EXISTS idx_submission_leaves_sequence_study
  ON submission_leaves (sequence_id, study_id)
  WHERE study_id IS NOT NULL;
