-- 20261025_shadow_review_run_coverage.sql
--
-- A Shadow Review run records which leaves it covered and what it read
-- (2026-10-25, launch row D7; docs/design/AI_PLATFORM_BLUEPRINT_GAP_2026-10-25.md).
--
-- Two columns on shadow_review_runs (migrations/20260604_shadow_review.sql),
-- and nothing else:
--
--   leaf_manifest_digest  The content digest of the sequence's leaves when the
--                         run read them: the sequence identity and every leaf's
--                         section, operation, document pointer and content pin
--                         (server/services/part11/ectd-sequence-binding.ts,
--                         sequenceContentDigest; read through
--                         server/services/shadow-review/shadow-review-coverage.ts).
--                         The dispatch assessor counts a completed run only when
--                         this equals the sequence's current digest, so a review
--                         of earlier leaves no longer clears a changed dossier.
--                         NULL on a run recorded before this file, or when the
--                         leaves changed while the run read them; such a run is
--                         counted as stale, never as current.
--   input_coverage        What the reviewer was given, per leaf: whether its text
--                         was read, how many characters, whether it was cut to
--                         the budget, and why a leaf was not read
--                         (server/services/shadow-review/shadow-review-input.ts).
--                         NULL on a run recorded before the text was sent, when
--                         the reviewer saw section codes and titles only.
--
-- No backfill: what an earlier run covered was never recorded, and inventing it
-- is the fabrication the column prevents.
--
-- Replay-safe (CLAUDE.md RULE 1): additive and IF NOT EXISTS; creates no table,
-- drops nothing, defines no constraint. public + organization_id INTEGER NOT NULL
-- already (20260604), so the tenant sweeps are unaffected and this file sits
-- anywhere above the final pair. Mirrored in shared/schema/shadow-review.ts and
-- server/db/pglite-harness.ts SHADOW_REVIEW_PGLITE_DDL.

ALTER TABLE public.shadow_review_runs
  ADD COLUMN IF NOT EXISTS leaf_manifest_digest TEXT;

ALTER TABLE public.shadow_review_runs
  ADD COLUMN IF NOT EXISTS input_coverage JSONB;
