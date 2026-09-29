-- 21 CFR Part 11 audit trail for the authoring loop (ledger C-14 / C-15).
--
-- server/routes/authoring.router.ts:267 has always written a rich audit record —
-- operation, actor, before/after content, content hashes either side, change
-- reason, IP, user agent, session — for every authoring mutation. NOTHING in
-- this repository creates the table it writes to: no migration, and unlike the
-- router's seven ensure*TableExists helpers, no runtime DDL either.
--
-- The write sits inside createAuditTrail's try/catch, which logs
-- "CRITICAL: Failed to create audit trail" and continues, so the loss is silent:
-- every authoring operation appeared to succeed while its Part 11 audit record
-- went nowhere. This migration is code-derived — the column list and order are
-- taken verbatim from that INSERT.
--
-- Deliberately NO foreign keys. An audit trail must outlive the rows it
-- describes; an ON DELETE CASCADE here would let deleting a document destroy the
-- evidence that it existed. Deliberately no UPDATE/DELETE affordances either —
-- the application only ever INSERTs.
--
-- Rollback: DROP TABLE IF EXISTS authoring_audit_trail;
--
-- AMENDED IN PLACE 2026-09-26 (row D5, docs/evidence/D5-ANA-RECORD/2026-09-26-authoring/):
-- "no UPDATE/DELETE affordances" was a promise of the application, not of the
-- engine — the runtime role could rewrite or remove any row, and this table is
-- the only place a comment's body and quoted text, an AI suggestion's proposed
-- text and a reviewer's decision are recorded. Added below, additively:
--   • actor_id — the verified principal id; actor_email alone could not be
--     joined to a person, and the chained row showed such acts as "System";
--   • triggers refusing UPDATE, DELETE and TRUNCATE for every role (the same
--     shape as migrations/20260926_ana_turn_records.sql), created only when
--     absent, and listed on EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS so a boot
--     without them refuses and the daily sweep alarms.
-- Nothing in the repository updates or deletes this table (verified by grep of
-- server/, scripts/ and tests/ on 2026-09-26); the tenant purge does not list it.
-- This file replays on every deploy with the authoring subsystem unit, so the
-- amendment reaches existing databases (CLAUDE.md RULE 1).

CREATE TABLE IF NOT EXISTS authoring_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID,
  section_id UUID,
  operation_type TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT,
  before_content TEXT,
  after_content TEXT,
  content_hash_before TEXT,
  content_hash_after TEXT,
  change_reason TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  session_id TEXT,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The reader pattern is "everything that happened to this document, newest
-- first", always within a tenant.
CREATE INDEX IF NOT EXISTS idx_authoring_audit_trail_doc
  ON authoring_audit_trail (doc_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_authoring_audit_trail_tenant
  ON authoring_audit_trail (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_authoring_audit_trail_section
  ON authoring_audit_trail (section_id, created_at DESC);

-- ── 2026-09-26 amendment (see header) ────────────────────────────────────────
ALTER TABLE authoring_audit_trail ADD COLUMN IF NOT EXISTS actor_id TEXT;

CREATE OR REPLACE FUNCTION authoring_audit_trail_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_LEVEL = 'ROW' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: authoring_audit_trail row cannot be % — it is a retained authoring record (21 CFR Part 11 §11.10(e)).',
      lower(TG_OP)
      USING ERRCODE = 'raise_exception',
            HINT = 'An authoring record is corrected by appending a new entry, never by editing or removing one.';
  END IF;
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: authoring_audit_trail cannot be truncated — it holds retained authoring records (21 CFR Part 11 §11.10(e)).'
    USING ERRCODE = 'raise_exception';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_authoring_audit_trail_append_only'
       AND tgrelid = 'authoring_audit_trail'::regclass
  ) THEN
    CREATE TRIGGER trg_authoring_audit_trail_append_only
      BEFORE UPDATE OR DELETE ON authoring_audit_trail
      FOR EACH ROW EXECUTE FUNCTION authoring_audit_trail_append_only();
  END IF;
  -- A row trigger does not fire on TRUNCATE.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_authoring_audit_trail_no_truncate'
       AND tgrelid = 'authoring_audit_trail'::regclass
  ) THEN
    CREATE TRIGGER trg_authoring_audit_trail_no_truncate
      BEFORE TRUNCATE ON authoring_audit_trail
      FOR EACH STATEMENT EXECUTE FUNCTION authoring_audit_trail_append_only();
  END IF;
END
$$;
