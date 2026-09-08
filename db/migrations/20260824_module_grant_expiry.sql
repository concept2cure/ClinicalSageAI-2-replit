-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — time-limited module grants (trials and expiry)
-- Compliance: 21 CFR Part 11 (§11.10(e) audit trail on the governed act that
--             sets or clears an expiry), multi-tenant commercial packaging
-- Purpose: `module_subscriptions` could grant a module to an organization and
--          take it away. It could not grant one UNTIL A DATE. Sales therefore
--          had two options for a 30-day trial: give the module away
--          permanently, or set a personal calendar reminder to revoke it by
--          hand. This adds the expiry instant the grant path was missing.
--
-- ── WHAT AN EXPIRY MEANS, PRECISELY ─────────────────────────────────────────
--
-- `expires_at` bounds THE OVERRIDE, not the entitlement.
--
-- Entitlement resolution reads, in order: master admin → the
-- `module_subscriptions` row → tier + industry → no catalog row means not
-- licensable. An `enabled` row is an override that outranks tier. When its
-- `expires_at` has passed, the OVERRIDE stops applying and resolution
-- continues to tier + industry exactly as if the row had never been written.
--
-- So an organization on the `standard` plan whose trial of a `standard`
-- module lapses still holds that module — through its plan. A lapsed trial is
-- not a denial; it is the removal of a bonus. Any implementation that turns an
-- expired grant into a hard "not licensed" repossesses capability the customer
-- is paying for, which is the single most expensive way to get this wrong.
--
-- ── WHY THERE IS NO SWEEPER ─────────────────────────────────────────────────
--
-- Nothing flips these rows. Expiry is evaluated at READ time from the stored
-- instant, everywhere the grant is read. A grant that has passed its date is
-- expired whether or not a job has run; a resolution that depends on a sweeper
-- having run is a resolution that lies for as long as the sweeper is down —
-- and it lies in the direction of serving a module nobody is paying for, which
-- is exactly the state this feature exists to end.
--
-- ── WHY timestamptz WHEN THE NEIGHBOURS ARE timestamp ───────────────────────
--
-- `enabled_at` / `disabled_at` are `timestamp` (no zone) — they record when
-- something happened and are read by humans. `expires_at` is compared against
-- "now" to decide whether a paying customer may open a module, and a
-- comparison against a zoneless instant is only correct while the server, the
-- database and the operator who typed the date all agree about the offset.
-- They do not. This column is an instant, so it is stored as one.
--
-- Determinism Contract:
--   - Strictly additive: three nullable columns + two indexes. No existing row
--     is rewritten, no existing column changes type, and every pre-existing
--     grant keeps `expires_at IS NULL` — perpetual, behaving exactly as before.
--   - Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS,
--     wrapped in a to_regclass guard so the file is a no-op on a database that
--     has not provisioned the table yet.
--   - NOT applied by any packaging or provisioning path. Setting an expiry is
--     an explicit, audited, per-tenant act; re-tiering a module must never
--     attach one as a side effect. This file writes no data for that reason.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.module_subscriptions') IS NULL THEN
    RAISE NOTICE 'module_subscriptions is not provisioned — skipping grant-expiry columns';
    RETURN;
  END IF;

  -- The instant this grant stops overriding tier + industry. NULL = perpetual.
  -- Meaningful only on an `enabled` row: a `disabled` row is a revocation, and
  -- a revocation with an end date is a different feature nobody has asked for.
  ALTER TABLE module_subscriptions
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

  -- Who set (or cleared) the expiry, and when. Mirrors the existing
  -- enabled_by / disabled_by `text` convention on this table so the row can be
  -- read on its own; the reason-for-change lives in the audit trail, which is
  -- the tamper-evident record and the only place it belongs.
  ALTER TABLE module_subscriptions
    ADD COLUMN IF NOT EXISTS expiry_set_by TEXT;
  ALTER TABLE module_subscriptions
    ADD COLUMN IF NOT EXISTS expiry_set_at TIMESTAMPTZ;

  COMMENT ON COLUMN module_subscriptions.expires_at IS
    'Instant this grant stops overriding tier + industry. NULL = perpetual. Evaluated at read time; nothing sweeps these rows. An expired grant falls through to the tier/industry answer underneath, never to a denial.';
END $$;

-- Partial index: the operator-facing lists ("expiring soon", "lapsed") scan
-- only rows that carry a date, which is a small minority of grants forever.
CREATE INDEX IF NOT EXISTS module_subscriptions_expires_at_idx
  ON module_subscriptions (expires_at)
  WHERE expires_at IS NOT NULL;

-- Entitlement resolution reads one organization's grants and then asks, per
-- row, whether the expiry has passed. This is the covering shape for that.
CREATE INDEX IF NOT EXISTS module_subscriptions_org_expiry_idx
  ON module_subscriptions (organization_id, expires_at)
  WHERE expires_at IS NOT NULL;
