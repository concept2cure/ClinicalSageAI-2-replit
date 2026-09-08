-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — governed platform settings (route enforcement mode)
-- Compliance: 21 CFR Part 11 §11.10(e) — the act of changing this setting is
--             written to the tamper-evident audit chain by the API that writes
--             it; this table additionally carries the actor and the reason of
--             the LAST change so the current state can be read without
--             reconstructing it from the chain.
-- Purpose: route-level module entitlement enforcement has three states — not
--          checking, observing, refusing — and the only place that decision
--          could be expressed was a process environment variable. So the
--          platform owner could read the enforcement report on a screen and
--          could not act on it there: executing the decision required an
--          engineer and a redeploy. This table is where the decision is
--          recorded so it can be made where it is made.
--
-- ── WHY NOT feature_toggles ─────────────────────────────────────────────────
--
-- feature_toggles is the platform's existing deployment-wide configuration
-- store and it was evaluated first. It does not fit, for three reasons, and
-- forcing it would have produced a worse defect than the one being fixed:
--
--   1. IT IS BOOLEAN. `enabled` is one bit; enforcement is a three-state
--      ladder (off -> report -> enforce). Representing it as two rows makes
--      the pair (report=false, enforce=true) representable and meaningless,
--      turns one decision into two writes with an incoherent state between
--      them, and puts that ambiguity in the exact setting whose ambiguity
--      refuses paying customers' requests.
--   2. IT CANNOT SAY WHO OR WHY. It has no actor, no reason-for-change. Both
--      are required here, and reading "who put this platform into refusing
--      mode, and why" should not require walking the audit chain.
--   3. ITS DOCUMENTED CONTRACT IS THE OPPOSITE OF THIS ONE. The capability
--      resolver states it plainly: toggles may only GRANT, never revoke —
--      "absence of a toggle never disables". A flag whose ON position starts
--      denying requests inverts the one invariant that store is built around.
--
-- So this is a second store, deliberately, with a boundary stated rather than
-- implied: feature_toggles remains canonical for boolean capability flags.
-- platform_settings is for governed, non-boolean, platform-scoped settings.
-- The enforcement mode is the first; nothing else moves here as a side effect.
--
-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
--
-- It seeds NO row. An empty table means nothing is stored, which means the
-- deployment's own configuration continues to decide — so applying this
-- migration changes the behaviour of no existing deployment. Enforcement moves
-- only when a human moves it, on the console, with a reason.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────────
--
-- Platform-scoped by construction: there is no organization_id here and there
-- must not be. These rows are not tenant data, are readable only through the
-- master-admin router (platform-admin guarded), and are never returned on a
-- tenant-facing path. A per-organization enforcement mode is a different
-- feature and would need a different table.
--
-- Determinism Contract:
--   - Strictly additive: one new table, one trigger-free design, no existing
--     object altered and no existing row rewritten.
--   - Idempotent and re-runnable: CREATE TABLE IF NOT EXISTS plus guarded
--     ADD COLUMN steps, so a database that already has the table converges
--     rather than failing.
--   - Writes no data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  -- The setting's stable identifier. Text rather than an enum so adding a
  -- second governed setting is an INSERT, not a migration.
  setting_key   text PRIMARY KEY,
  -- The value, as text. Readers parse and validate it: a stored value that is
  -- not one this build understands must be treated as unreadable rather than
  -- coerced, so a rollback to an older build cannot silently reinterpret it.
  setting_value text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- The platform user who made the change. Nullable because a value written by
  -- an operational script has no user, and recording 0 or a sentinel would be
  -- a fabricated actor in a Part 11 context.
  updated_by    integer,
  -- The reason-for-change captured at the console. Nullable for the same
  -- reason; the API refuses a change without one.
  reason        text
);

-- Converge a database that already created the table from an earlier shape.
DO $$
BEGIN
  IF to_regclass('public.platform_settings') IS NOT NULL THEN
    ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS setting_value text;
    ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS updated_by integer;
    ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS reason text;
  END IF;
END $$;

COMMENT ON TABLE platform_settings IS
  'Governed, platform-scoped settings that are not boolean capability flags. '
  'Boolean flags live in feature_toggles; this table exists for settings with '
  'more than two states and a required reason-for-change. Not tenant data: no '
  'organization_id, read only through the platform-admin router.';

COMMENT ON COLUMN platform_settings.setting_value IS
  'Opaque text. Readers validate against the values their build understands '
  'and treat an unrecognized value as unreadable rather than coercing it.';
