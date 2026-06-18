-- ═══════════════════════════════════════════════════════════════════════════════
-- Additive HMAC-seal column for audit_events (finding F1)
--
-- ⚠️  REQUIRES REVIEW BEFORE DEPLOY — produced by the security swarm for finding
--     F1 (SECURITY_SWARM_AUDIT_2026-06-17.md / AUDIT_INTEGRITY_HMAC_PLAN.md).
--     ADDITIVE ONLY. Do NOT auto-apply without DBA / compliance sign-off.
--
-- REGULATORY BASIS: 21 CFR Part 11 §11.10(e) / §11.70 — audit-record integrity
-- and record/signature linking. `audit_events` is the SIEM / export-facing audit
-- table. It is SHA-256 hash-chained (record_hash / previous_hash / sequence_number,
-- via the BEFORE INSERT trigger audit_events_hash_chain — 20260222_audit_events_
-- hash_chain.sql), which makes tampering *detectable*. But, unlike `audit_logs`,
-- it has NO secret-keyed HMAC seal, so an attacker who can rewrite the whole
-- table could recompute every public SHA-256 chain value and forge a self-
-- consistent ledger. `audit_logs` already closes this gap with an `hmac_seal`
-- column (HMAC-SHA256 under AUDIT_HMAC_KEY, held outside the DB). This migration
-- brings `audit_events` to parity at the SCHEMA level — step 1 of the rollout
-- in docs/AUDIT_INTEGRITY_HMAC_PLAN.md §4.
--
-- SCOPE — SCHEMA ONLY (column add). This migration:
--   * ADDs a single nullable `hmac_seal TEXT` column. Nullable on purpose: a
--     half-rolled-out seal must NEVER block an INSERT, and rows written before
--     sealing is enabled are validly unsealed (still SHA-256 chained). This
--     mirrors audit_logs.hmac_seal semantics exactly.
--   * Performs NO backfill. Historical rows stay NULL-sealed (they are immutable
--     under 20260222_audit_events_immutability.sql and cannot be back-sealed in
--     place anyway). The tolerant verifier skips NULL seals — never flags them
--     `broken` — so exports/attestations are unaffected (plan §4 step 2).
--   * Does NOT add/modify the writer. Populating hmac_seal on INSERT is
--     DEFERRED (plan §4 step 4) because the chain fields (record_hash /
--     previous_hash / sequence_number) are assigned by the existing BEFORE
--     INSERT trigger and are only known after insert — sealing them safely
--     requires moving chain derivation into the app writer, a breaking change
--     across the many audit_events writers + the signed-export / SIEM path.
--     Deferred to avoid a production regression; the SHA-256 chain remains the
--     active tamper-detection control in the interim.
--
-- ADDITIVITY / SAFETY:
--   * Idempotent: ADD COLUMN guarded by IF NOT EXISTS (DO block), no-op if the
--     column or the table is absent.
--   * Does NOT alter/drop any existing column, the table, or any trigger.
--   * No NOT NULL, no DEFAULT, no constraint — zero impact on existing reads,
--     writes, exports, or the audit_events immutability triggers.
--
-- Migration: 20260617_audit_events_hmac_seal.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add nullable hmac_seal column (safe to re-run via IF NOT EXISTS guard).
-- Mirrors the column-add pattern in 20260222_audit_events_hash_chain.sql (lines 13-36).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'audit_events'
  ) THEN
    RAISE NOTICE 'audit_events not present — skipping hmac_seal column.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'hmac_seal'
  ) THEN
    ALTER TABLE audit_events ADD COLUMN hmac_seal TEXT;
    COMMENT ON COLUMN audit_events.hmac_seal IS
      '21 CFR Part 11 §11.70: HMAC-SHA256 seal over (sequence_number, record_hash, previous_hash) under AUDIT_HMAC_KEY (held outside the DB). Nullable: NULL = unsealed (pre-rollout) but still SHA-256 chained. Mirrors audit_logs.hmac_seal.';
    RAISE NOTICE 'audit_events.hmac_seal column added (nullable, unsealed by default).';
  ELSE
    RAISE NOTICE 'audit_events.hmac_seal already present — no change.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION: confirm the column exists and is nullable.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  is_nullable_val TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'audit_events'
  ) THEN
    RETURN; -- table absent; nothing to verify
  END IF;

  SELECT is_nullable INTO is_nullable_val
  FROM information_schema.columns
  WHERE table_name = 'audit_events' AND column_name = 'hmac_seal';

  IF is_nullable_val IS NULL THEN
    RAISE WARNING 'audit_events.hmac_seal column was not created';
  ELSIF is_nullable_val <> 'YES' THEN
    RAISE WARNING 'audit_events.hmac_seal must be NULLABLE (found is_nullable=%)', is_nullable_val;
  ELSE
    RAISE NOTICE 'audit_events.hmac_seal present and nullable — additive seal column ready.';
  END IF;
END;
$$;
