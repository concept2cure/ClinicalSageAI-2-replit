-- =============================================================================
-- 20261029g_submission_filed_baselines.sql
--
-- WHY. An IND already holding sequences filed with another tool could not
-- continue on the Submission Center spine: the platform's first sequence was
-- 0000, an Original Application, and an amendment with no Original
-- Application held here is refused (sequence-spine-fda-identity.ts), because
-- its submission-id would have to be guessed. LMN-201's CSR amendment is that
-- case. MR-10 Stage 9 allows sequences to continue "from a declared baseline
-- the user signs as cumulative" (docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md).
--
-- WHAT.
--   public.submission_filed_baselines: one row per declaration that sequences
--   0000 to last_filed_sequence of a submission's US application were filed
--   outside the platform, and that original_sequence opened its Original
--   Application. In public with organization_id INTEGER NOT NULL, so the
--   tenant sweep at the tail of the set gives it its policy (Rule 1). The
--   latest row for a submission and region is current; a change is a new row.
--   UPDATE and TRUNCATE are refused from every role. DELETE is left to the
--   tenant purge (tenant-offboarding.ts PURGE_CHILD_TABLES). No foreign key.
--
--   A declaration is a signed act, and the database holds it to that: at
--   COMMIT (a deferred constraint trigger, as
--   20261019_commitment_fulfilment_evidence.sql) the row needs a live
--   governed-action electronic signature written by the same transaction, on
--   'submission-filed-baseline:<id>', of basis
--   'filed-sequence-baseline-content-sha256' (a ledger-fallback binding fails
--   closed), by the declarer, meaning approval or responsibility, whose
--   manifest act names the same sequences and evidence. Otherwise
--   FILED_BASELINE_SIGNATURE_REQUIRED.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent, or is a CREATE OR REPLACE of a function this file alone defines.
-- No DROP, no backfill, no rewrite of a row.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.submission_filed_baselines (
  id                         uuid PRIMARY KEY,
  organization_id            INTEGER NOT NULL CONSTRAINT submission_filed_baselines_org_positive CHECK (organization_id > 0),
  submission_id              INTEGER NOT NULL CONSTRAINT submission_filed_baselines_submission_positive CHECK (submission_id > 0),
  -- The canonical region (shared/regulatory/region-identity.ts). US only: the
  -- other regions' sequence relationships are not decided.
  region                     text NOT NULL CONSTRAINT submission_filed_baselines_region_us CHECK (region = 'US'),
  last_filed_sequence        text NOT NULL CONSTRAINT submission_filed_baselines_last_format CHECK (last_filed_sequence ~ '^[0-9]{4}$'),
  original_sequence          text NOT NULL CONSTRAINT submission_filed_baselines_original_format CHECK (original_sequence ~ '^[0-9]{4}$'),
  evidence_vault_document_id uuid NOT NULL,
  evidence_sha256            text NOT NULL CONSTRAINT submission_filed_baselines_evidence_sha256 CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reason                     text NOT NULL CONSTRAINT submission_filed_baselines_reason_stated CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  declared_by                INTEGER NOT NULL CONSTRAINT submission_filed_baselines_declarer_positive CHECK (declared_by > 0),
  declared_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_filed_baselines_original_filed CHECK (original_sequence <= last_filed_sequence)
);

CREATE INDEX IF NOT EXISTS submission_filed_baselines_current_idx
  ON public.submission_filed_baselines (organization_id, submission_id, region, declared_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.submission_filed_baselines_guard()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'SUBMISSION_FILED_BASELINE_IMMUTABLE: a declaration of sequences filed elsewhere is never changed; declare again instead (%).', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

-- At COMMIT: the declaration's own signature, from the same transaction.
CREATE OR REPLACE FUNCTION public.submission_filed_baselines_signed_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.electronic_signatures es
     WHERE es.organization_id = NEW.organization_id
       AND es.signed_target = 'submission-filed-baseline:' || NEW.id::text
       AND es.signature_type = 'governed-action'
       AND es.binding_basis = 'filed-sequence-baseline-content-sha256'
       AND es.signer_id = NEW.declared_by
       AND es.signature_meaning IN ('approval', 'responsibility')
       AND es.superseded_by IS NULL
       AND es.is_valid IS DISTINCT FROM false
       AND COALESCE(es.verification_status, '') NOT IN ('revoked', 'voided')
       AND es.created_at = LOCALTIMESTAMP
       AND (es.signature_manifest -> 'act' ->> 'submissionId') = NEW.submission_id::text
       AND (es.signature_manifest -> 'act' ->> 'lastFiledSequence') = NEW.last_filed_sequence
       AND (es.signature_manifest -> 'act' ->> 'originalSequence') = NEW.original_sequence
       AND (es.signature_manifest -> 'act' ->> 'evidenceSha256') = NEW.evidence_sha256
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION
    'FILED_BASELINE_SIGNATURE_REQUIRED: a declaration that sequences 0000-% of submission % (organization %) were filed elsewhere is recorded only in the transaction that writes its signature, by its declarer, over the sequences and evidence it names (21 CFR Part 11 §11.50/§11.70) — refused.',
    NEW.last_filed_sequence, NEW.submission_id, NEW.organization_id
    USING ERRCODE = 'integrity_constraint_violation',
          HINT = 'Declare it in the Submission Center, which signs it.';
END;
$fn$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'submission_filed_baselines_guard_row'
                    AND tgrelid = 'public.submission_filed_baselines'::regclass) THEN
    CREATE TRIGGER submission_filed_baselines_guard_row
      BEFORE UPDATE ON public.submission_filed_baselines
      FOR EACH ROW EXECUTE FUNCTION public.submission_filed_baselines_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'submission_filed_baselines_guard_truncate'
                    AND tgrelid = 'public.submission_filed_baselines'::regclass) THEN
    CREATE TRIGGER submission_filed_baselines_guard_truncate
      BEFORE TRUNCATE ON public.submission_filed_baselines
      FOR EACH STATEMENT EXECUTE FUNCTION public.submission_filed_baselines_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'submission_filed_baselines_signed'
                    AND tgrelid = 'public.submission_filed_baselines'::regclass) THEN
    CREATE CONSTRAINT TRIGGER submission_filed_baselines_signed
      AFTER INSERT ON public.submission_filed_baselines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.submission_filed_baselines_signed_guard();
  END IF;
END
$mig$;

COMMENT ON TABLE public.submission_filed_baselines IS
  'Signed declarations that a submission''s US sequences 0000-N were filed outside the platform, and which opened the Original Application. Append-only: the latest row per submission and region is current; UPDATE and TRUNCATE are refused; an unsigned row is refused at COMMIT; DELETE is the tenant purge''s.';
