-- =============================================================================
-- 20261019 — a regulatory commitment's fulfilment names what met it, and a PMR, PMC or REMS is fulfilled only by a signature
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (11.10(e) audit trail, 11.50/11.70 signature
--             manifestation and linking, 11.200 signature components),
--             21 CFR 314.81(b)(2)(vii) and 601.70 (postmarketing study status),
--             FD&C 505(o)(3) and 505-1, ALCOA+ principles
-- Purpose: A regulatory commitment's fulfilment records the dispatched sequence
--          the agency received and/or the Vault version (with its sha256) that
--          met it, who recorded it and when. A PMR, PMC or REMS commits as
--          fulfilled only in the transaction that writes its Part 11 signature,
--          and a recorded fulfilment cannot change afterwards.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (postmarketing requirement and commitment
--     correspondence; the annual status report); the sequence named is any
--     dispatched eCTD sequence of the program
--   - Integrity Risk Addressed: an obligation taken off the overdue register
--     and the annual status report on a sentence, unsigned, naming nothing
--
-- Determinism Contract:
--   - What a fulfilment signature binds is commitmentFulfilmentDigest, recipe
--     'commitment-fulfilment/v1' (server/services/ha-interactions/ha-logic.ts),
--     read through one reader (fulfilment-record.ts) by the binder and the list.
--   - Any change to the digest recipe requires a new recipe version.
-- =============================================================================
-- 20261019_commitment_fulfilment_evidence.sql
--
-- Rows D2 (Communication, Meetings & commitments) and D5 (Part 11). Decision
-- P-40 (docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-18 decisions). Evidence
-- docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/.
--
-- WHAT IT ADDS to public.regulatory_commitments
-- (migrations/20260610_ha_interactions_commitments.sql, 20261018b):
--   fulfilment_sequence_id        the eCTD sequence that met it (same organisation,
--                                 composite FK; a sequence the agency received)
--   fulfilment_vault_document_id  the Vault version that met it
--   fulfilment_vault_sha256       that version's content_hash, pinned (lower hex)
--   fulfilment_recorded_by        who recorded the fulfilment
--   fulfilment_recorded_at        when
-- All NULL on existing rows: a commitment fulfilled before this file named
-- nothing, and nothing is inferred for it. The screen says so.
--
-- WHAT THE DATABASE HOLDS (and what it does not). Two triggers:
--
--  1. regulatory_commitments_fulfilment_record_guard (BEFORE INSERT OR UPDATE):
--     - a commitment is inserted with no fulfilment columns set;
--     - an UPDATE that moves status into 'fulfilled' names its recorder and
--       time (COMMITMENT_FULFILMENT_UNATTRIBUTED otherwise);
--     - the fulfilment_* columns go from NULL to a value only in that UPDATE,
--       and only from a status that was not terminal: evidence cannot be
--       attached to a row fulfilled earlier, or added after the signature;
--     - a Vault version named is this organisation's, not removed, at its own
--       content_hash; a sequence named is this organisation's, not removed,
--       and the agency received it (dispatch_status 'sent' or 'acknowledged',
--       the platform's filed rule, submission-service/filed-dispatch.ts)
--       (COMMITMENT_EVIDENCE_INVALID otherwise);
--     - a commitment's type is fixed from its INSERT, on every row: the type
--       is the rule its fulfilment is held to, so a PMR retyped while open
--       (alone, or in the update that fulfils it) would reach COMMIT as an
--       'other' the guard below does not sign (IMMUTABILITY_VIOLATION);
--     - once fulfilment_recorded_at is set, the commitment's identity, type,
--       words, dates, status, evidence and deleted_at are fixed
--       (IMMUTABILITY_VIOLATION): a recorded fulfilment is not hidden by an
--       UPDATE;
--     - deleted_at is written once, for every row.
--  2. regulatory_commitments_signed_fulfilment_guard (AFTER INSERT/UPDATE,
--     DEFERRABLE INITIALLY DEFERRED, checked at COMMIT on the row as it then
--     stands): a fulfilled PMR, PMC or REMS names evidence
--     (COMMITMENT_EVIDENCE_REQUIRED) and has a live electronic_signatures row
--     written by the same transaction (created_at = LOCALTIMESTAMP, as
--     20261001_qms_document_signature_required.sql) on
--     'regulatory-commitment:<id>', of type 'governed-action', with the basis
--     'commitment-fulfilment-content-sha256' (a ledger-fallback binding fails
--     closed), by the recorder, meaning approval or responsibility, not
--     withdrawn (isSignatureWithdrawn: superseded, invalid, revoked, voided),
--     whose manifest act names the same sequence, Vault version, sha256 and
--     date as the row (COMMITMENT_SIGNATURE_REQUIRED otherwise).
--
--  Held by the routes only: that the sequence and the version belong to the
--  project's program on the project door, and to a program the person can
--  open on the organisation's; that the signer re-entered a password (the
--  ceremony, governed-signed-act.ts). The database proves a matching signature
--  row was written with the fulfilment, not how it was written.
--  Not held: a hard DELETE. The runtime role may DELETE a commitment (the
--  tenant purge runs as it, and project_id has no cascade); a DELETE guard
--  needs a purge door with it. Correcting a fulfilment signed in error
--  (§11.70 supersession, or a reopen) is owed. Both are in the evidence README.
--
--  Amended 2026-10-19, before first commit, by the review of this change
--  (docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/README.md, "Review"):
--  the type was fixed only on a terminal row, so an open PMR could be retyped
--  to 'other' and fulfilled unsigned; it is now fixed on every row. deleted_at
--  joined the columns a recorded fulfilment fixes.
--
-- WHY DROP TRIGGER IF EXISTS + CREATE for the two constraint triggers, and
-- the type list inside the function: as 20261001_qms_document_signature_required
-- does, so a WHEN or a type changes by amending this file in place (Rule 1:
-- it re-runs every deploy), and a trigger someone dropped is re-armed on the
-- next deploy. Triggers are not tracked by ci:migration-drop-safety, and
-- dropping one's own trigger to re-create it is not removing schema.
--
-- Replay-safe (RULE 1): one ALTER TABLE with five ADD COLUMN IF NOT EXISTS (so
-- each deploy takes ACCESS EXCLUSIVE on regulatory_commitments once); every
-- constraint guarded by pg_constraint, the index by IF NOT EXISTS; CREATE OR
-- REPLACE FUNCTION. Drops nothing another file creates. Creates no table, so
-- the tenant sweeps have nothing new to policy. Refuses to arm the signature
-- guard if electronic_signatures lacks a column it reads.
--
-- NOT mirrored in Drizzle: the five columns are SQL-only, as 20261018b's
-- three are; the services read them with SQL.

ALTER TABLE public.regulatory_commitments
  ADD COLUMN IF NOT EXISTS fulfilment_sequence_id INTEGER,
  ADD COLUMN IF NOT EXISTS fulfilment_vault_document_id UUID,
  ADD COLUMN IF NOT EXISTS fulfilment_vault_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS fulfilment_recorded_by INTEGER,
  ADD COLUMN IF NOT EXISTS fulfilment_recorded_at TIMESTAMPTZ;

-- The same-organisation key the composite FK below needs (the precedent is
-- regulatory_programs_id_org_uq). ectd_sequences.id is already unique, so this
-- admits every existing row.
CREATE UNIQUE INDEX IF NOT EXISTS ectd_sequences_id_org_uq ON public.ectd_sequences (id, organization_id);

DO $mig$
DECLARE
  t regclass := 'public.regulatory_commitments'::regclass;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'regulatory_commitments_fulfilment_sequence_same_org_fk') THEN
    ALTER TABLE public.regulatory_commitments
      ADD CONSTRAINT regulatory_commitments_fulfilment_sequence_same_org_fk
      FOREIGN KEY (fulfilment_sequence_id, organization_id) REFERENCES public.ectd_sequences (id, organization_id);
  END IF;
  -- NO ACTION: evidence does not vanish under a recorded fulfilment. The tenant
  -- purge deletes commitments before Vault versions (tenant-offboarding.ts
  -- PURGE_CHILD_TABLES); vault.documents has no (id, organization_id) key, so
  -- the same-organisation check is the guard below.
  IF to_regclass('vault.documents') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'regulatory_commitments_fulfilment_vault_fkey') THEN
    ALTER TABLE public.regulatory_commitments
      ADD CONSTRAINT regulatory_commitments_fulfilment_vault_fkey
      FOREIGN KEY (fulfilment_vault_document_id) REFERENCES vault.documents (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'regulatory_commitments_fulfilment_recorded_by_fkey') THEN
    ALTER TABLE public.regulatory_commitments
      ADD CONSTRAINT regulatory_commitments_fulfilment_recorded_by_fkey
      FOREIGN KEY (fulfilment_recorded_by) REFERENCES public.users (id);
  END IF;
  -- A version and its pin go together; a recorder and a time go together;
  -- evidence is recorded, and only on a fulfilled commitment. Every existing
  -- row has all five NULL and passes.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'regulatory_commitments_fulfilment_coherent') THEN
    ALTER TABLE public.regulatory_commitments
      ADD CONSTRAINT regulatory_commitments_fulfilment_coherent CHECK (
        (fulfilment_vault_document_id IS NULL) = (fulfilment_vault_sha256 IS NULL)
        AND (fulfilment_vault_sha256 IS NULL OR fulfilment_vault_sha256 ~ '^[0-9a-f]{64}$')
        AND (fulfilment_recorded_by IS NULL) = (fulfilment_recorded_at IS NULL)
        AND ((fulfilment_sequence_id IS NULL AND fulfilment_vault_document_id IS NULL) OR fulfilment_recorded_at IS NOT NULL)
        AND (status = 'fulfilled' OR fulfilment_recorded_at IS NULL)
      );
  END IF;
END
$mig$;

-- 1. Before an INSERT or UPDATE: attribution, write-once evidence, a fixed recorded row.
CREATE OR REPLACE FUNCTION public.regulatory_commitments_fulfilment_record_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  o jsonb;
  n jsonb := to_jsonb(NEW);
  col text;
  terminal constant text[] := ARRAY['fulfilled', 'waived', 'released'];
  fulfilling boolean;
BEGIN
  -- A commitment is recorded first, and its fulfilment by the UPDATE that
  -- fulfils it, so the checks below always run on what met it.
  IF TG_OP = 'INSERT' THEN
    IF NEW.fulfilment_sequence_id IS NOT NULL OR NEW.fulfilment_vault_document_id IS NOT NULL
       OR NEW.fulfilment_recorded_by IS NOT NULL OR NEW.fulfilment_recorded_at IS NOT NULL THEN
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: a commitment is recorded before its fulfilment; what met it is written by the update that fulfils it.'
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;
  o := to_jsonb(OLD);

  -- A removal is written once, on every row.
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: regulatory_commitments.deleted_at of commitment % is set once and cannot be changed or cleared (21 CFR 11.10(e)).', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- A commitment keeps the type it was recorded with, on every row. The type is
  -- the rule its fulfilment is held to: a PMR retyped while open, alone or in
  -- the update that fulfils it, would reach COMMIT as a type the signature
  -- guard below does not sign. Nothing in the platform retypes a commitment
  -- (createCommitmentTx is the only writer of the type).
  IF NEW.commitment_type IS DISTINCT FROM OLD.commitment_type THEN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: regulatory_commitments.commitment_type of commitment % is fixed when the commitment is recorded (it is %).', OLD.id, OLD.commitment_type
      USING ERRCODE = 'raise_exception';
  END IF;

  -- A recorded fulfilment is fixed: what the signature binds, the record it is
  -- on, and its presence in the register (deleted_at).
  IF OLD.fulfilment_recorded_at IS NOT NULL THEN
    FOREACH col IN ARRAY ARRAY['id', 'organization_id', 'project_id', 'submission_id', 'commitment_type', 'description',
                               'regulatory_basis', 'due_date', 'status', 'fulfilled_date', 'fulfilment_sequence_id',
                               'fulfilment_vault_document_id', 'fulfilment_vault_sha256', 'fulfilment_recorded_by',
                               'fulfilment_recorded_at', 'deleted_at'] LOOP
      IF (o -> col) IS DISTINCT FROM (n -> col) THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: regulatory_commitments.% of commitment % is recorded with its fulfilment and cannot change (21 CFR 11.10(e)).', col, OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  fulfilling := NEW.status = 'fulfilled' AND NOT (OLD.status = ANY (terminal));

  -- Every move into 'fulfilled' says who recorded it.
  IF fulfilling AND (NEW.fulfilment_recorded_by IS NULL OR NEW.fulfilment_recorded_at IS NULL) THEN
    RAISE EXCEPTION 'COMMITMENT_FULFILMENT_UNATTRIBUTED: commitment % may become fulfilled only with who recorded it and when (21 CFR 11.10(e)).', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Evidence and the recorder are written in the UPDATE that records the
  -- fulfilment, and only then (the CHECK keeps them NULL on an unrecorded row).
  IF (NEW.fulfilment_sequence_id IS NOT NULL OR NEW.fulfilment_vault_document_id IS NOT NULL
      OR NEW.fulfilment_recorded_at IS NOT NULL OR NEW.fulfilment_recorded_by IS NOT NULL)
     AND NOT fulfilling THEN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: commitment % records what met it only in the update that fulfils it; it is %.', OLD.id, OLD.status
      USING ERRCODE = 'raise_exception';
  END IF;

  IF NEW.fulfilment_vault_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM vault.documents d
     WHERE d.id = NEW.fulfilment_vault_document_id
       AND d.organization_id = NEW.organization_id
       AND d.deleted_at IS NULL
       AND lower(btrim(d.content_hash)) = NEW.fulfilment_vault_sha256
  ) THEN
    RAISE EXCEPTION 'COMMITMENT_EVIDENCE_INVALID: commitment % names Vault version % at a sha256 that is not that live version of its organisation.', OLD.id, NEW.fulfilment_vault_document_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.fulfilment_sequence_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ectd_sequences s
     WHERE s.id = NEW.fulfilment_sequence_id
       AND s.organization_id = NEW.organization_id
       AND s.deleted_at IS NULL
       AND s.dispatch_status IN ('sent', 'acknowledged')
  ) THEN
    RAISE EXCEPTION 'COMMITMENT_EVIDENCE_INVALID: commitment % names sequence %, which is not a live sequence of its organisation that the agency received.', OLD.id, NEW.fulfilment_sequence_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.regulatory_commitments_fulfilment_record_guard() IS
  'P-40: a type fixed from INSERT, attribution of a fulfilment, evidence written only with it (this organisation, a sequence the agency received, a Vault version at its own sha256), a recorded fulfilment fixed (deleted_at with it), deleted_at written once. migrations/20261019_commitment_fulfilment_evidence.sql';

-- 2. At COMMIT: a fulfilled PMR, PMC or REMS has its signature.
CREATE OR REPLACE FUNCTION public.regulatory_commitments_signed_fulfilment_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  cur public.regulatory_commitments%ROWTYPE;
BEGIN
  -- The row as it stands at COMMIT, not as this event left it.
  SELECT * INTO cur FROM public.regulatory_commitments WHERE id = NEW.id;
  -- The signed types: SIGNED_FULFILMENT_TYPES in ha-logic.ts, pinned equal by
  -- tests/db/commitment-fulfilment-database.dbtest.ts.
  IF NOT FOUND OR cur.status <> 'fulfilled' OR cur.commitment_type NOT IN ('pmr', 'pmc', 'rems') THEN
    RETURN NULL;
  END IF;

  IF cur.fulfilment_sequence_id IS NULL AND cur.fulfilment_vault_document_id IS NULL THEN
    RAISE EXCEPTION
      'COMMITMENT_EVIDENCE_REQUIRED: % commitment % (organization %) may become fulfilled only naming the sequence or Vault version that met it — refused.',
      upper(cur.commitment_type), cur.id, cur.organization_id
      USING ERRCODE = 'integrity_constraint_violation',
            HINT = 'Record the fulfilment in Communication, Meetings & commitments.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.electronic_signatures es
     WHERE es.organization_id = cur.organization_id
       AND es.signed_target = 'regulatory-commitment:' || cur.id::text
       AND es.signature_type = 'governed-action'
       AND es.binding_basis = 'commitment-fulfilment-content-sha256'
       AND es.signer_id = cur.fulfilment_recorded_by
       AND es.signature_meaning IN ('approval', 'responsibility')
       AND es.superseded_by IS NULL
       AND es.is_valid IS DISTINCT FROM false
       AND COALESCE(es.verification_status, '') NOT IN ('revoked', 'voided')
       AND es.created_at = LOCALTIMESTAMP
       AND (es.signature_manifest -> 'act' ->> 'sequenceId') IS NOT DISTINCT FROM cur.fulfilment_sequence_id::text
       AND (es.signature_manifest -> 'act' ->> 'vaultDocumentId') IS NOT DISTINCT FROM cur.fulfilment_vault_document_id::text
       AND (es.signature_manifest -> 'act' ->> 'vaultSha256') IS NOT DISTINCT FROM cur.fulfilment_vault_sha256
       AND (es.signature_manifest -> 'act' ->> 'fulfilledDate') = to_char(cur.fulfilled_date, 'YYYY-MM-DD')
  ) THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION
    'COMMITMENT_SIGNATURE_REQUIRED: % commitment % (organization %) may become fulfilled only in the transaction that writes its fulfilment signature, by its recorder, over the evidence and date it names (21 CFR Part 11 §11.50/§11.70) — refused.',
    upper(cur.commitment_type), cur.id, cur.organization_id
    USING ERRCODE = 'integrity_constraint_violation',
          HINT = 'Record the fulfilment in Communication, Meetings & commitments, which signs it.';
END;
$fn$;

COMMENT ON FUNCTION public.regulatory_commitments_signed_fulfilment_guard() IS
  'P-40: refuses, at COMMIT, a fulfilled PMR/PMC/REMS without evidence, or without a live governed-action signature of basis commitment-fulfilment-content-sha256 written by the same transaction, by its recorder, over the same evidence and date. migrations/20261019_commitment_fulfilment_evidence.sql';

DO $mig$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
    FROM unnest(ARRAY['organization_id', 'signed_target', 'signature_type', 'binding_basis', 'signer_id',
                      'signature_meaning', 'signature_manifest', 'superseded_by', 'is_valid',
                      'verification_status', 'created_at']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'electronic_signatures' AND column_name = c
   );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '[commitment-fulfilment-evidence] public.electronic_signatures lacks %; the guard would refuse every signed fulfilment.', missing;
  END IF;

  DROP TRIGGER IF EXISTS regulatory_commitments_fulfilment_record_guard ON public.regulatory_commitments;
  CREATE TRIGGER regulatory_commitments_fulfilment_record_guard
    BEFORE INSERT OR UPDATE ON public.regulatory_commitments
    FOR EACH ROW EXECUTE FUNCTION public.regulatory_commitments_fulfilment_record_guard();

  DROP TRIGGER IF EXISTS trg_regulatory_commitments_signed_fulfilment_ins ON public.regulatory_commitments;
  CREATE CONSTRAINT TRIGGER trg_regulatory_commitments_signed_fulfilment_ins
    AFTER INSERT ON public.regulatory_commitments
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (NEW.status = 'fulfilled')
    EXECUTE FUNCTION public.regulatory_commitments_signed_fulfilment_guard();

  DROP TRIGGER IF EXISTS trg_regulatory_commitments_signed_fulfilment_upd ON public.regulatory_commitments;
  CREATE CONSTRAINT TRIGGER trg_regulatory_commitments_signed_fulfilment_upd
    AFTER UPDATE ON public.regulatory_commitments
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (NEW.status = 'fulfilled' AND (OLD.status IS DISTINCT FROM NEW.status
                                        OR OLD.commitment_type IS DISTINCT FROM NEW.commitment_type
                                        OR OLD.fulfilment_recorded_at IS DISTINCT FROM NEW.fulfilment_recorded_at))
    EXECUTE FUNCTION public.regulatory_commitments_signed_fulfilment_guard();
END
$mig$;
