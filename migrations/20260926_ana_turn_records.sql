-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 §11.10(b), (c), (e); EU Annex 11 §9; ALCOA+
-- Purpose: One immutable record per AnA turn — what the person asked, what the
--          model was given, what AnA did, what she answered — kept so that it
--          can be produced for an inspector later and shown to be unchanged.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (every AnA drafting, research and review turn)
--   - Integrity Risk Addressed: an AI-assisted regulatory record that could be
--     edited, deleted with its thread, or was never written in full
--
-- Determinism Contract:
--   - The record is stored as the exact canonical JSON text that was hashed
--     (record_text), not as JSONB: JSONB re-serialises, and a hash is only
--     verifiable over the bytes it was computed from.
--   - Additive and idempotent. No DROP (RULE 1).
--
-- Notes:
--   - Row D5, 2026-09-26. Evidence: docs/evidence/D5-ANA-RECORD/2026-09-26/.
--   - Writer: server/services/ana/turn-record.ts (writeTurnRecord), one
--     transaction with the chained audit_logs row whose details carry
--     record_sha256 — the chain proves the record existed, when, and that
--     it has not changed since.
--   - Written by every door into AnA's agentic loop: the stream
--     (POST /api/ana-ri/stream, also mounted at /api/chat/stream),
--     POST /api/chat/send-message, POST /api/claude/agent and the /ana
--     socket (services/ana/turn-record-loop.ts). A background deep
--     investigation is started by a recorded turn's tool call; its own model
--     calls are not turn records.
--   - Read, verified and exported by server/routes/ana-ri/turn-records.ts.
-- =============================================================================
--
-- What existed before this file, measured 2026-09-26 at 33e16e7a9:
--
--   chat_messages / chat_threads   the working transcript. The user's text and
--       the final answer only; no model, no files, no tool inputs, no author on
--       the message row. The runtime role may UPDATE and DELETE them, no
--       trigger stops it, and DELETE /api/chat/thread/:id and
--       DELETE /api/cortex/threads/:id remove a thread and its messages with no
--       audit row.
--   ai_threads / ai_messages / ai_generation_runs (20260224_ai_trace_chain)
--       a per-model-call retrieval → claim → citation provenance overlay,
--       written by /api/chat/send-message, evidence-ask and the submission
--       chat — not by the AnA stream, which is what the product uses. It keeps
--       an answer HASH, not the answer, and cascades away with its thread. It
--       answers "which chunk supports which claim"; this table answers "what
--       happened in this turn". They are not two stores of one thing.
--   audit_logs                     the tenant hash chain. Before this file it
--       held nothing about a turn beyond a prompt-injection detection, Live
--       Drive screen actions and governed-action signatures.
--
-- The working transcript stays as it is — the conversation UI reads it and a
-- person may still remove a conversation from their list. This table is the
-- record of what happened, and it does not go with the thread: thread_id is a
-- reference, not a foreign key.
--
-- Append-only, enforced by the engine for every role: UPDATE, DELETE and
-- TRUNCATE are refused. A correction is a new record, never an edit.
--
-- AMENDED 2026-10-01 (rows D5/D6,
-- docs/evidence/D5-ANA-RECORD/2026-10-01-erasure-and-grants/), in place per
-- CLAUDE.md Rule 1: the tenant purge erases a tenant's turn records, and
-- nothing else can.
--   - Why. A turn record's body (record_text and the blobs it names) is
--     Customer Data: the customer's prompts, documents and AnA's answers.
--     MSA §10.2 and DPA §3.5 delete Customer Data after the export window and
--     retain only audit-trail records. Each turn's audit-trail record is its
--     chained audit_logs row (record_sha256, actor, time), which the purge
--     keeps. The body goes back to the customer in the tenant export first
--     (tenant-full-export.service.ts discovers both tables by their tenant
--     column), so the exported copy stays verifiable against the retained
--     chain. Before this, a purge left every turn record behind, which
--     ci:purge-coverage reported as new residue.
--   - How. A row DELETE passes the append-only trigger only when current_user
--     is ana_record_purger: a NOLOGIN, NOINHERIT, NOBYPASSRLS role created here
--     (the audit_archiver pattern of 20260617_audit_logs_immutability.sql). The
--     only thing that runs as it is public.purge_tenant_turn_records(integer),
--     SECURITY DEFINER, search_path pinned, EXECUTE revoked from PUBLIC. It
--     restates at the database the purge's own preconditions, as VR-07's
--     purge_tenant_vault_records does: the platform scope, the organization
--     pending_deletion, no active legal hold. A table owner or superuser
--     DELETE is still refused, and TRUNCATE is refused for everyone.
--   - Called by purgeTurnRecords in server/services/tenant/tenant-offboarding.ts,
--     inside the purge's transaction. Pinned by
--     tests/db/turn-record-purge-door.dbtest.ts.
--   - Nothing is dropped. Replays: CREATE OR REPLACE, the role and triggers
--     only when absent.
--
-- A superuser or the table owner can still DISABLE TRIGGER. The two triggers
-- are on EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS
-- (server/services/audit/audit-immutability-triggers.ts): a production boot
-- refuses without them, and the daily sweep alarms.
--
-- Tenant isolation: both tables are public with organization_id INTEGER NOT
-- NULL, so the tenant sweep at the end of C2C_MIGRATION_FILES gives each its
-- policy (CLAUDE.md RULE 1, third corollary).
--
-- Pinned by server/services/ana/__tests__/turn-record.pglite.test.ts (the
-- triggers refuse UPDATE, DELETE and TRUNCATE; a record and its chained audit
-- row commit together or not at all).
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.ana_turn_records') IS NULL THEN
    CREATE TABLE public.ana_turn_records (
      id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       INTEGER     NOT NULL,
      -- chat_threads.id; a reference, not a foreign key — see the header.
      thread_id             TEXT,
      -- ana_runs.id of the run that served the turn.
      run_id                TEXT,
      -- chat_messages.id of the question and the answer, when they were saved.
      user_message_id       INTEGER,
      assistant_message_id  INTEGER,
      -- users.id of the person who asked.
      actor_user_id         INTEGER,
      outcome               TEXT        NOT NULL
        CHECK (outcome IN ('answered', 'stopped', 'failed')),
      started_at            TIMESTAMPTZ NOT NULL,
      ended_at              TIMESTAMPTZ NOT NULL,
      schema_version        TEXT        NOT NULL,
      -- The canonical JSON text, byte for byte as hashed.
      record_text           TEXT        NOT NULL,
      -- The engine checks the hash: a record stored under a hash that is not
      -- its own is refused, whoever writes it.
      record_sha256         TEXT        NOT NULL
        CHECK (record_sha256 = encode(sha256(convert_to(record_text, 'UTF8')), 'hex')),
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
  -- The texts a record references, each stored once per tenant under its own
  -- SHA-256. A record lists hashes; this table holds what they hash. Turn 40
  -- of a thread references the history by hash instead of copying it again.
  IF to_regclass('public.ana_record_blobs') IS NULL THEN
    CREATE TABLE public.ana_record_blobs (
      organization_id INTEGER     NOT NULL,
      sha256          TEXT        NOT NULL
        CHECK (sha256 = encode(sha256(convert_to(text, 'UTF8')), 'hex')),
      text            TEXT        NOT NULL,
      chars           INTEGER     NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, sha256)
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ana_turn_records_thread
  ON public.ana_turn_records (organization_id, thread_id, started_at);
CREATE INDEX IF NOT EXISTS idx_ana_turn_records_actor
  ON public.ana_turn_records (organization_id, actor_user_id, started_at);
-- Added 2026-09-26, same change set (D5 slice 1 follow-up): a client whose
-- connection closed before the turn ended (Stop, a dropped network) asks for
-- the record by the run it was served under. Additive, IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_ana_turn_records_run
  ON public.ana_turn_records (organization_id, run_id);

CREATE OR REPLACE FUNCTION public.ana_turn_records_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 2026-10-01: the tenant purge's door, and only it. current_user is
  -- ana_record_purger inside public.purge_tenant_turn_records alone.
  IF TG_LEVEL = 'ROW' AND TG_OP = 'DELETE' AND current_user = 'ana_record_purger' THEN
    RETURN OLD;
  END IF;
  IF TG_LEVEL = 'ROW' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: % row cannot be % — it is part of a retained AnA turn record (21 CFR Part 11 §11.10(e)).',
      -- 2026-09-29: "changed"/"deleted", not lower(TG_OP) ("cannot be update").
      TG_TABLE_NAME, CASE TG_OP WHEN 'DELETE' THEN 'deleted' ELSE 'changed' END
      USING ERRCODE = 'raise_exception',
            HINT = 'A turn record is corrected by appending a new record, never by editing or removing one.';
  END IF;
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: % cannot be truncated — it holds retained AnA turn records (21 CFR Part 11 §11.10(e)).',
    TG_TABLE_NAME
    USING ERRCODE = 'raise_exception';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_turn_records_append_only'
       AND tgrelid = 'public.ana_turn_records'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_turn_records_append_only
      BEFORE UPDATE OR DELETE ON public.ana_turn_records
      FOR EACH ROW EXECUTE FUNCTION public.ana_turn_records_append_only();
  END IF;
  -- A row trigger does not fire on TRUNCATE; without this one a single
  -- statement would erase every turn of every tenant past the row guard.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_turn_records_no_truncate'
       AND tgrelid = 'public.ana_turn_records'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_turn_records_no_truncate
      BEFORE TRUNCATE ON public.ana_turn_records
      FOR EACH STATEMENT EXECUTE FUNCTION public.ana_turn_records_append_only();
  END IF;
  -- The texts are as fixed as the records that reference them. Writing the
  -- same text twice is an INSERT … ON CONFLICT DO NOTHING, which fires no
  -- UPDATE, so identical content never needs an edit.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_record_blobs_append_only'
       AND tgrelid = 'public.ana_record_blobs'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_record_blobs_append_only
      BEFORE UPDATE OR DELETE ON public.ana_record_blobs
      FOR EACH ROW EXECUTE FUNCTION public.ana_turn_records_append_only();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_record_blobs_no_truncate'
       AND tgrelid = 'public.ana_record_blobs'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_record_blobs_no_truncate
      BEFORE TRUNCATE ON public.ana_record_blobs
      FOR EACH STATEMENT EXECUTE FUNCTION public.ana_turn_records_append_only();
  END IF;
END
$$;

-- =============================================================================
-- The tenant purge's door (2026-10-01; see the AMENDED note in the header).
-- =============================================================================
DO $purge$
DECLARE
  v_applier_is_super boolean;
  v_applier_can_set  boolean;
BEGIN
  -- NOLOGIN, no attributes, no inheritance: it exists only to own the door, so
  -- the trigger can recognise the door by current_user. Roles are cluster-wide
  -- and this file re-runs on every deploy, so never a plain CREATE ROLE.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ana_record_purger') THEN
    CREATE ROLE ana_record_purger
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;

  -- A non-superuser applier (the RDS master) must be able to SET ROLE to the
  -- owner it hands the function to. As in 20260617_audit_logs_immutability.sql:
  -- ask first, grant itself membership if it created the role, and otherwise
  -- fail closed with the remedy rather than install a door it cannot hand over.
  SELECT rolsuper INTO v_applier_is_super FROM pg_roles WHERE rolname = current_user;
  IF NOT COALESCE(v_applier_is_super, false) THEN
    IF current_setting('server_version_num')::int >= 160000 THEN
      v_applier_can_set := pg_has_role(current_user, 'ana_record_purger', 'SET');
    ELSE
      v_applier_can_set := pg_has_role(current_user, 'ana_record_purger', 'MEMBER');
    END IF;
    IF NOT v_applier_can_set THEN
      BEGIN
        EXECUTE format('GRANT ana_record_purger TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION '[ana_turn_records] % cannot become a member of ana_record_purger and so cannot install the purge door', current_user
          USING HINT = format('Have a superuser run: GRANT ana_record_purger TO %I; then re-run the migration set.', current_user);
      END;
    END IF;
  END IF;

  -- What the door reads and deletes, and nothing more. CREATE on public is the
  -- ALTER … OWNER TO rule for a non-superuser applier; nothing runs as this
  -- role except the fixed body below.
  GRANT USAGE, CREATE ON SCHEMA public TO ana_record_purger;
  GRANT SELECT, DELETE ON public.ana_turn_records, public.ana_record_blobs TO ana_record_purger;
  -- Both are read by the door's preconditions; a harness without them gets a
  -- door that refuses (no organization is pending deletion where none exist).
  IF to_regclass('public.organizations') IS NOT NULL THEN
    GRANT SELECT ON public.organizations TO ana_record_purger;
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA vault TO ana_record_purger;
    GRANT SELECT ON vault.legal_holds TO ana_record_purger;
  END IF;
END
$purge$;

-- The preconditions are purge_tenant_vault_records' (VR-07), restated here so
-- a caller holding only the runtime role's credentials cannot erase a tenant
-- that is not being offboarded. The role is subject to RLS. Both tables'
-- tenant policies, organizations' and vault.legal_holds' admit the platform
-- scope this function requires, so the hold count it reads is the whole count.
CREATE OR REPLACE FUNCTION public.purge_tenant_turn_records(p_org integer)
RETURNS TABLE (records integer, blobs integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status  text;
  v_holds   integer := 0;
  v_records integer;
  v_blobs   integer;
BEGIN
  IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
     AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
    RAISE EXCEPTION 'TURN_RECORD_PURGE_REFUSED: the tenant purge runs in the platform scope, not a tenant scope (organization %).', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.status INTO v_status FROM public.organizations o WHERE o.id = p_org;
  IF v_status IS DISTINCT FROM 'pending_deletion' THEN
    RAISE EXCEPTION 'TURN_RECORD_PURGE_REFUSED: organization % is not pending deletion (status %).', p_org, COALESCE(v_status, 'not found')
      USING ERRCODE = 'raise_exception';
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM vault.legal_holds WHERE organization_id = $1 AND lifted_at IS NULL'
      INTO v_holds USING p_org;
  END IF;
  IF v_holds > 0 THEN
    RAISE EXCEPTION 'TURN_RECORD_PURGE_REFUSED: organization % has % active legal hold(s); records under hold cannot be destroyed.', p_org, v_holds
      USING ERRCODE = 'raise_exception';
  END IF;
  DELETE FROM public.ana_turn_records t WHERE t.organization_id = p_org;
  GET DIAGNOSTICS v_records = ROW_COUNT;
  DELETE FROM public.ana_record_blobs b WHERE b.organization_id = p_org;
  GET DIAGNOSTICS v_blobs = ROW_COUNT;
  RETURN QUERY SELECT v_records, v_blobs;
END;
$fn$;

DO $door$
BEGIN
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
       WHERE oid = 'public.purge_tenant_turn_records(integer)'::regprocedure) <> 'ana_record_purger' THEN
    ALTER FUNCTION public.purge_tenant_turn_records(integer) OWNER TO ana_record_purger;
  END IF;
  REVOKE ALL ON FUNCTION public.purge_tenant_turn_records(integer) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT EXECUTE ON FUNCTION public.purge_tenant_turn_records(integer) TO app_service;
  END IF;

  -- Verify what was installed; a door in any other shape is no door.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = 'public.purge_tenant_turn_records(integer)'::regprocedure
       AND prosecdef
       AND pg_get_userbyid(proowner) = 'ana_record_purger'
  ) THEN
    RAISE EXCEPTION '[ana_turn_records] the purge door is not SECURITY DEFINER owned by ana_record_purger';
  END IF;
  IF has_function_privilege('public', 'public.purge_tenant_turn_records(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '[ana_turn_records] the purge door is executable by PUBLIC';
  END IF;
END
$door$;
