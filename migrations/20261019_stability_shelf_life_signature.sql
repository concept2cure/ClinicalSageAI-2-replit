-- =============================================================================
-- 20261019 — the signer and date of a stability study's shelf-life close-out
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure CMC — Module 3 stability register
-- Compliance: 21 CFR Part 11 §11.10(a) (only authorised changes to a regulated
--             record), §11.50 (signature manifestation), §11.70 (the signature
--             linked to its record), ALCOA+ (attributable)
-- Purpose: Give stability_studies the two columns a governed close-out writes,
--          so the shelf life a dossier claims names the person who signed for
--          it and when.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — 3.2.S.7.1 / 3.2.P.8.1 (the stability conclusion),
--     3.2.S.7.3 / 3.2.P.8.3 (the data the claim rests on)
--   - Integrity Risk Addressed: the shelf-life claim §3.2.S.7 / §3.2.P.8 prints
--     — and the value the ICH Q1E rule judges a programme against — was set by
--     an ordinary PUT: `{"shelfLife":"36 months at 25C/60%RH","status":
--     "COMPLETED"}` answered 200 with no signature row, no reason and no
--     re-authentication (docs/evidence/CMC-M3-GA/2026-10-19/
--     11-stability-close-out/). It was the last ungoverned signed state in the
--     CMC registers after the 2026-10-18 ceremony generalisation.
--
-- Determinism Contract:
--   - Additive only: two nullable columns, IF NOT EXISTS. Replay-safe on every
--     deploy (CLAUDE.md RULE 1) and drops nothing. No backfill: a study closed
--     out before this migration has no signer, and inventing one would be the
--     fabrication the columns exist to prevent. Those rows read as "closed out
--     before the signature was required", which is what they are.
--   - public, and the table already carries organization_id INTEGER NOT NULL,
--     so the tenant-isolation sweep at the end of the set polices it.
-- =============================================================================

-- Who signed the close-out. An integer, as every other signer column in the
-- register layer is, referencing users(id) — the ceremony writes the signer's
-- own session id (services/part11/resolve-signer-identity.ts resolves the
-- printed name separately, for the sections that print one).
--
-- No FOREIGN KEY, deliberately and consistently with `qualified_by`,
-- `validated_by` and `approved_by` on the sibling registers: a tenant purge
-- that deletes a user must not cascade into, or be blocked by, a Part 11
-- signature record. The §11.70 link is electronic_signatures, not this column.
ALTER TABLE IF EXISTS public.stability_studies
  ADD COLUMN IF NOT EXISTS shelf_life_signed_by integer;

-- When. `timestamp without time zone`, matching created_at/updated_at on this
-- table rather than the timestamptz the newer tables use: a mixed pair on one
-- row is read by the same code path and the inconsistency is the bug.
ALTER TABLE IF EXISTS public.stability_studies
  ADD COLUMN IF NOT EXISTS shelf_life_signed_at timestamp without time zone;

-- The studies a signed close-out can be found by. Partial, because the column
-- is NULL for every study still running and for every one closed out before
-- 2026-10-19.
CREATE INDEX IF NOT EXISTS idx_stability_studies_shelf_life_signed
  ON public.stability_studies (organization_id, shelf_life_signed_at)
  WHERE shelf_life_signed_by IS NOT NULL;

COMMENT ON COLUMN public.stability_studies.shelf_life_signed_by IS
  'The user who signed the shelf-life close-out (POST /api/cmc/stability-studies/:id/close-out). NULL while the study runs, and for a study closed out before 2026-10-19, when the close-out was an ordinary edit.';
COMMENT ON COLUMN public.stability_studies.shelf_life_signed_at IS
  'When the shelf-life close-out was signed. Written only by the ceremony; an ordinary edit cannot set it.';
