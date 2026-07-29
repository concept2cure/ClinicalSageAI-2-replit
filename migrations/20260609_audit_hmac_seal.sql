-- ── audit_logs.hmac_seal ──────────────────────────────────────────────────
--
-- 21 CFR Part 11 §11.70: an HMAC-SHA256 seal over each row's sha256_chain link,
-- making the audit chain non-forgeable by anyone who can write the database but
-- does not hold the AUDIT_HMAC_KEY secret. The seal is computed by
-- server/services/audit/chain.ts → computeAuditChainSealed() and verified by
-- verifyAuditChainSeals().
--
-- Additive and idempotent. The column is nullable: sealing is opt-in (only when
-- AUDIT_HMAC_KEY is configured), and rows written before the key existed remain
-- covered by the sha256 chain, just not by the stronger HMAC seal. No backfill —
-- audit_logs is append-only and may carry immutability triggers in some
-- environments.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'audit_logs'
  ) THEN
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS hmac_seal text;
  ELSE
    RAISE NOTICE 'audit_logs not present in this schema; skipping hmac_seal addition.';
  END IF;
END $$;
