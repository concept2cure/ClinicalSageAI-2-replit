-- ═══════════════════════════════════════════════════════════════════════════════
-- Add hash chain columns to audit_events for Part 11 chain integrity
--
-- record_hash:    SHA-256 of (sequence_number + event payload + previous_hash)
-- previous_hash:  record_hash of the immediately preceding row (per org)
-- sequence_number: monotonic counter per organization for ordering
--
-- These columns enable the chain integrity verification already exposed
-- via /api/part11/audit-trail/chain-integrity.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add columns (safe to re-run — IF NOT EXISTS equivalent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'record_hash'
  ) THEN
    ALTER TABLE audit_events ADD COLUMN record_hash TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'previous_hash'
  ) THEN
    ALTER TABLE audit_events ADD COLUMN previous_hash TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'sequence_number'
  ) THEN
    ALTER TABLE audit_events ADD COLUMN sequence_number INTEGER;
  END IF;
END;
$$;

-- Index for chain verification queries
CREATE INDEX IF NOT EXISTS audit_events_hash_chain_idx
  ON audit_events (organization_id, sequence_number);

-- Unique constraint prevents duplicate sequence numbers per org (race-condition defense)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_events_org_seq_unique'
  ) THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT audit_events_org_seq_unique UNIQUE (organization_id, sequence_number);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Auto-populate hash chain on INSERT via trigger
-- Uses pg_advisory_xact_lock to serialize per-org inserts within the
-- same transaction, preventing sequence_number collisions under concurrency.
CREATE OR REPLACE FUNCTION audit_events_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash TEXT;
  prev_seq INTEGER;
BEGIN
  -- Advisory lock keyed on org_id serializes concurrent inserts to the
  -- same org. Lock is released automatically at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('audit_events_chain_' || COALESCE(NEW.organization_id, 0)::text));

  -- Get previous row's hash and sequence for this org
  SELECT record_hash, sequence_number INTO prev_hash, prev_seq
  FROM audit_events
  WHERE organization_id = NEW.organization_id
  ORDER BY sequence_number DESC NULLS LAST, id DESC
  LIMIT 1;

  NEW.sequence_number := COALESCE(prev_seq, 0) + 1;
  NEW.previous_hash := prev_hash;
  NEW.record_hash := encode(
    sha256(
      convert_to(
        COALESCE(NEW.sequence_number::text, '') || '|' ||
        COALESCE(NEW.event_type, '') || '|' ||
        COALESCE(NEW.entity_type, '') || '|' ||
        COALESCE(NEW.entity_id::text, '') || '|' ||
        COALESCE(NEW.user_id::text, '') || '|' ||
        COALESCE(NEW.user_name, '') || '|' ||
        COALESCE(NEW.timestamp::text, '') || '|' ||
        COALESCE(NEW.reason, '') || '|' ||
        COALESCE(prev_hash, 'GENESIS'),
        'UTF8'
      )
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_hash_chain ON audit_events;

CREATE TRIGGER trg_audit_events_hash_chain
  BEFORE INSERT ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION audit_events_hash_chain();

-- ═══════════════════════════════════════════════════════════════════════════════
-- THE BACKFILL WAS REMOVED. 2026-09-10, when this file was added to
-- C2C_MIGRATION_FILES. Two independent reasons, either sufficient.
--
-- 1. A BACKFILLED CHAIN IS NOT EVIDENCE, IT IS THE APPEARANCE OF EVIDENCE.
--    The removed block walked every row with a NULL record_hash and computed a
--    hash from that row's CURRENT contents. A hash chain proves that a row has
--    not changed SINCE IT WAS HASHED. Hashing history today proves nothing
--    about that history: if a row was altered at any point before the backfill,
--    the backfill hashes the altered content and stamps the chain valid. The
--    result verifies as 'intact' and attests to nothing — which is exactly the
--    class of defect this trigger exists to prevent.
--
--    Rows written before this trigger is installed are OUTSIDE the chain, and
--    that is the truth about them. server/services/audit/signedAuditExport.ts
--    reports it: it counts hashedEntries and unhashedEntries separately and
--    returns 'unverified' — not 'intact' — while any unhashed row is in range,
--    naming how many links could not be checked.
--
-- 2. IT WOULD HAVE FAILED THE DEPLOY. The backfill issued
--    `UPDATE audit_events SET ...`, and 20260222_audit_events_immutability.sql
--    installs `trg_audit_events_no_update`, a BEFORE UPDATE FOR EACH ROW
--    trigger that raises P0A01 unconditionally — no session-GUC bypass, no
--    pg_trigger_depth() exemption. That trigger is already present on every
--    deployed database, so ordering this file before it in the set would not
--    have helped: the first deploy carrying this migration would have raised
--    IMMUTABILITY_VIOLATION on the first historical row and aborted.
--
-- What remains is INSERT-time chaining, which is idempotent under RULE 1's
-- unconditional replay: the columns are guarded, the index and constraint are
-- guarded, the function is CREATE OR REPLACE, and the trigger is dropped and
-- recreated. On a database whose audit_events rows are all unhashed, the
-- trigger's lookup finds prev_seq NULL and starts the chain at 1 with a GENESIS
-- predecessor — a clean chain from the first row written after this deploys,
-- with the prior rows honestly outside it.
-- ═══════════════════════════════════════════════════════════════════════════════
