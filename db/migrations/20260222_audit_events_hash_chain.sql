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

-- Auto-populate hash chain on INSERT via trigger
CREATE OR REPLACE FUNCTION audit_events_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash TEXT;
  prev_seq INTEGER;
BEGIN
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

-- Backfill existing rows that have NULL hashes (in sequence order)
DO $$
DECLARE
  r RECORD;
  prev_hash TEXT := NULL;
  seq INTEGER := 0;
  cur_org INTEGER := NULL;
BEGIN
  FOR r IN
    SELECT id, organization_id, event_type, entity_type, entity_id,
           user_id, user_name, timestamp, reason
    FROM audit_events
    WHERE record_hash IS NULL
    ORDER BY organization_id, id
  LOOP
    IF r.organization_id IS DISTINCT FROM cur_org THEN
      -- Reset chain for new org
      SELECT record_hash, sequence_number INTO prev_hash, seq
      FROM audit_events
      WHERE organization_id = r.organization_id AND record_hash IS NOT NULL
      ORDER BY sequence_number DESC
      LIMIT 1;
      cur_org := r.organization_id;
      IF seq IS NULL THEN seq := 0; prev_hash := NULL; END IF;
    END IF;

    seq := seq + 1;
    UPDATE audit_events SET
      sequence_number = seq,
      previous_hash = prev_hash,
      record_hash = encode(
        sha256(
          convert_to(
            seq::text || '|' ||
            COALESCE(r.event_type, '') || '|' ||
            COALESCE(r.entity_type, '') || '|' ||
            COALESCE(r.entity_id::text, '') || '|' ||
            COALESCE(r.user_id::text, '') || '|' ||
            COALESCE(r.user_name, '') || '|' ||
            COALESCE(r.timestamp::text, '') || '|' ||
            COALESCE(r.reason, '') || '|' ||
            COALESCE(prev_hash, 'GENESIS'),
            'UTF8'
          )
        ),
        'hex'
      )
    WHERE id = r.id;

    SELECT record_hash INTO prev_hash FROM audit_events WHERE id = r.id;
  END LOOP;

  RAISE NOTICE 'Backfilled % audit_events rows with hash chain', seq;
END;
$$;
