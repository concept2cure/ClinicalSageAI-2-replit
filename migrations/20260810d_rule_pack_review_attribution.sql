-- ============================================================================
-- c2c_rule_packs: a sign-off must name someone, and must not survive the
-- content it signed off.
--
-- ── What 20260810c left unfinished ──────────────────────────────────────────
-- That migration gave every pack a `review_status`, and set every one of them
-- to 'unreviewed' — including the packs transcribed verbatim from FDA
-- regulation. Correct, but it left the other half open: nothing stopped a
-- future UPDATE from setting review_status='reviewed' with no record of WHO
-- reviewed it, WHEN, or AGAINST WHAT.
--
-- That matters more than it sounds. 'reviewed' is the only value in this
-- schema that a filer is entitled to rely on. An unattributed 'reviewed' is
-- indistinguishable from a typo, a bulk UPDATE, or a well-meaning developer
-- clearing a warning — and it would carry the full authority of a regulatory
-- professional's judgement while representing nobody's.
--
-- ── The two guarantees ──────────────────────────────────────────────────────
-- 1. ATTRIBUTION. review_status='reviewed' requires reviewed_by and
--    reviewed_at. Enforced by CHECK, so the database refuses the write rather
--    than trusting every future caller to remember.
--
-- 2. BINDING. A review attests to a specific section tree, not to a pack name.
--    reviewed_sections_sha records the digest of required_sections AT REVIEW
--    TIME. If the tree is later edited, the stored digest stops matching and
--    the pack reads as reviewed-but-changed rather than silently continuing to
--    claim a sign-off nobody gave to the new content.
--
--    This is why the digest is stored rather than a boolean: the failure this
--    prevents is not someone lying, it is content drifting out from under an
--    honest review.
--
-- ── What this migration does NOT do ─────────────────────────────────────────
-- It marks nothing as reviewed. No pack in this table has been reviewed by a
-- regulatory professional, and this migration does not change that for a
-- single row. It only makes it possible to record one truthfully when it
-- happens.
--
-- Guarded with to_regclass: c2c_rule_packs originates from drizzle push, so a
-- fresh database may run this before the table exists.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs absent — skipping review-attribution migration.';
    RETURN;
  END IF;

  ALTER TABLE c2c_rule_packs
    ADD COLUMN IF NOT EXISTS reviewed_by            text,
    ADD COLUMN IF NOT EXISTS reviewed_at            timestamptz,
    ADD COLUMN IF NOT EXISTS review_scope           text,
    ADD COLUMN IF NOT EXISTS reviewed_sections_sha  text;

  -- 1 ── Attribution is mandatory for a sign-off, and meaningless without it.
  --      NOT VALID is deliberately NOT used: every existing row is
  --      'unreviewed', so the constraint is satisfiable today and should be
  --      validated now rather than deferred into a state nobody checks.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_rule_packs_review_attribution_check') THEN
    ALTER TABLE c2c_rule_packs ADD CONSTRAINT c2c_rule_packs_review_attribution_check
      CHECK (
        review_status <> 'reviewed'
        OR (
          reviewed_by IS NOT NULL AND length(btrim(reviewed_by)) > 0
          AND reviewed_at IS NOT NULL
          AND reviewed_sections_sha IS NOT NULL AND length(btrim(reviewed_sections_sha)) > 0
        )
      );
  END IF;

  -- 2 ── An unreviewed pack must not carry the residue of a withdrawn review.
  --      Without this, setting review_status back to 'unreviewed' would leave
  --      reviewed_by populated, and a later reader would find a name attached
  --      to a pack nobody currently vouches for.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_rule_packs_unreviewed_is_clean_check') THEN
    ALTER TABLE c2c_rule_packs ADD CONSTRAINT c2c_rule_packs_unreviewed_is_clean_check
      CHECK (
        review_status = 'reviewed'
        OR (reviewed_by IS NULL AND reviewed_at IS NULL AND reviewed_sections_sha IS NULL)
      );
  END IF;

  RAISE NOTICE 'c2c_rule_packs review attribution columns added; 0 packs marked reviewed.';
END $$;

-- 3 ── The digest a review binds to.
--
-- Defined as a function rather than computed at each call site so the review
-- and the staleness check cannot disagree about what was hashed. jsonb's
-- canonical text form is stable for a given value (keys sorted, whitespace
-- normalised), which is what makes this comparable across time.
CREATE OR REPLACE FUNCTION c2c_rule_pack_sections_digest(sections jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(COALESCE(sections, '[]'::jsonb)::text, 'UTF8')), 'hex') $$;

COMMIT;

-- 4 ── Reviewed packs whose tree has moved since the sign-off.
--
-- A view rather than a trigger: a trigger would have to decide what to do
-- about the drift (block the edit? silently clear the review?) and both
-- choices hide information from a human. Reporting it leaves the decision
-- where it belongs, and makes the condition queryable by CI and by the app.
DO $$
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN RETURN; END IF;

  EXECUTE $view$
    CREATE OR REPLACE VIEW c2c_rule_packs_review_state AS
    SELECT
      doc_type,
      agency,
      version,
      review_status,
      reviewed_by,
      reviewed_at,
      review_scope,
      CASE
        WHEN review_status <> 'reviewed' THEN 'unreviewed'
        WHEN reviewed_sections_sha IS DISTINCT FROM
             c2c_rule_pack_sections_digest(required_sections) THEN 'reviewed_but_changed'
        ELSE 'reviewed_current'
      END AS effective_review_state
    FROM c2c_rule_packs
  $view$;

  RAISE NOTICE 'c2c_rule_packs_review_state view created.';
END $$;
