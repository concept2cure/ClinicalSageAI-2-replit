-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — Reporting & analytics, compliance reports
-- Compliance: EU GMP Annex 11 §9 (audit trails regularly reviewed) and §12;
--             FDA Data Integrity and Compliance With Drug CGMP (2018) Q7;
--             21 CFR Part 11 §11.10(d)(e), §11.50, §11.70;
--             SOC 2 CC6.2–CC6.3; HIPAA 45 CFR 164.308(a)(4); POLICY-AC-002 §4a
-- Purpose: One governed record for an organisation's periodic reviews — the
--          audit-trail review (P1-25, finding DP-21) and the user access review
--          (P1-43) — signed through the platform's ceremony and fixed once
--          signed (ADR-0014 §8).
--
-- eCTD/CTD Context:
--   - Module(s): none (quality system records)
--   - Integrity Risk Addressed: a review that cannot be shown to have happened,
--     or whose decisions, reviewer or sign-off could be rewritten afterwards.
--
-- Determinism Contract:
--   - Additive and replayable (CLAUDE.md Rule 1: every deploy re-runs it):
--     CREATE TABLE / INDEX IF NOT EXISTS; constraints added only when absent;
--     CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS of this file's own
--     trigger names, then CREATE TRIGGER, so each deploy re-arms a trigger
--     someone dropped. No DROP of anything another file creates.
--   - public, organization_id INTEGER NOT NULL, listed above the final
--     tenant-isolation pair in scripts/db/migration-set.mjs, so the integer
--     sweep (db/migrations/20260801_tenant_isolation_sweep.sql) gives it
--     ENABLE + FORCE RLS and tenant_isolation_policy. It carries no policy of
--     its own for that reason.
--
-- Notes:
--   - D6, 2026-10-01. Evidence:
--     docs/evidence/D6/2026-10-01-tranche-4/P1-25-P1-43-review-records/.
--   - Retained at tenant offboarding (fix round DP-70, 2026-10-01; comment
--     only, no schema change). The tenant purge (PURGE_CHILD_TABLES,
--     server/services/tenant/tenant-offboarding.ts) does not reach this table,
--     by decision: a signed review is a quality-system record bound to an
--     electronic signature, which the purge also keeps, and it evidences a
--     regulated action, so it falls under the audit-trail retention of DPA
--     §3.5 (GDPR Art. 17(3)(b); 21 CFR 11.10(c); Annex 11 §17). The tenant
--     export returns it before the purge. docs/reports/purge-coverage-baseline.json
--     lists it, with this reason under "retained".
-- =============================================================================
--
-- THE RECORD. One row per review. `kind` is 'audit_trail' or 'access'. The
-- reviewer drafts it (status 'draft') with the period reviewed, what was in
-- scope, the outcome and the decisions — for an access review one entry per
-- account with its role and keep / reduce / remove, and the change that
-- carried a reduce or remove out; for an audit-trail review the findings and
-- what was done. The reviewer then signs it through signGovernedAct
-- (server/routes/governed-signed-act.ts; target 'compliance-review:<id>',
-- meaning 'review'): that one transaction sets status 'signed', the content
-- hash and signed_at, writes the `sign` ledger pair and the electronic
-- signature, whose manifest carries the content hash.
--
-- THE CONTENT HASH. sha256 over the canonical JSON (keys sorted) of
--   { version: 1, id, organizationId, kind, periodStart, periodEnd, scope,
--     outcome, decisions, reviewerUserId }
-- (server/services/audit/compliance-reviews.ts reviewContentHash). The
-- signature's manifest names it (act.contentHash), and the signature's own
-- hash covers the manifest, so the signature is bound to this content.
--
-- WHAT THE DATABASE HOLDS, whichever path writes:
--   1. A row becomes 'signed' (INSERT, or UPDATE from 'draft') only in the
--      transaction that writes its electronic signature: organisation, target
--      'compliance-review:<id>', signer = reviewer_user_id, meaning 'review',
--      manifest act.contentHash = content_hash, not withdrawn. Checked at
--      COMMIT (a CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED), because
--      the ceremony writes the record first and the signature after it — the
--      P0-18 pattern (20261001_qms_document_signature_required.sql), including
--      "written by this transaction" as created_at = LOCALTIMESTAMP.
--      The same check then writes signature_id: the one change a signed row
--      ever takes, once, to the signature its own transaction wrote.
--   2. A signed row is never updated, deleted or truncated — by any role,
--      the table owner included (BEFORE triggers). A correction is a new
--      review that says what it corrects.
--   3. A draft carries no signature, content hash or signing time (CHECK).
--
-- The guard is not on EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS
-- (server/services/audit/audit-immutability-triggers.ts): that list is pinned
-- to the runtime role's append-only stores (server/db/__tests__/
-- provision-app-role-append-only.test.ts), and a draft here is updatable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.compliance_review_records (
  id                SERIAL PRIMARY KEY,
  organization_id   INTEGER NOT NULL,
  kind              TEXT NOT NULL,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  scope             JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome           TEXT NOT NULL,
  decisions         JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewer_user_id  INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  signature_id      INTEGER,
  content_hash      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS compliance_review_records_latest_idx
  ON public.compliance_review_records (organization_id, kind, signed_at DESC)
  WHERE status = 'signed';

-- Constraints by name, each only when absent, so a replay changes nothing.
DO $mig$
DECLARE
  t CONSTANT regclass := 'public.compliance_review_records'::regclass;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'compliance_review_records_organization_fk') THEN
    ALTER TABLE public.compliance_review_records
      ADD CONSTRAINT compliance_review_records_organization_fk
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'compliance_review_records_reviewer_fk') THEN
    ALTER TABLE public.compliance_review_records
      ADD CONSTRAINT compliance_review_records_reviewer_fk
      FOREIGN KEY (reviewer_user_id) REFERENCES public.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'compliance_review_records_signature_fk') THEN
    ALTER TABLE public.compliance_review_records
      ADD CONSTRAINT compliance_review_records_signature_fk
      FOREIGN KEY (signature_id) REFERENCES public.electronic_signatures(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'compliance_review_records_kind') THEN
    ALTER TABLE public.compliance_review_records
      ADD CONSTRAINT compliance_review_records_kind CHECK (kind IN ('audit_trail', 'access'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'compliance_review_records_status') THEN
    ALTER TABLE public.compliance_review_records
      ADD CONSTRAINT compliance_review_records_status CHECK (status IN ('draft', 'signed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'compliance_review_records_period') THEN
    ALTER TABLE public.compliance_review_records
      ADD CONSTRAINT compliance_review_records_period CHECK (period_end >= period_start);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'compliance_review_records_shapes') THEN
    ALTER TABLE public.compliance_review_records
      ADD CONSTRAINT compliance_review_records_shapes CHECK (
        jsonb_typeof(scope) = 'object' AND jsonb_typeof(decisions) = 'array' AND length(btrim(outcome)) > 0
      );
  END IF;
  -- A draft carries no signature; a signed row carries its hash and time
  -- (its signature_id is written at COMMIT by the guard below).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'compliance_review_records_signed_state') THEN
    ALTER TABLE public.compliance_review_records
      ADD CONSTRAINT compliance_review_records_signed_state CHECK (
        (status = 'draft' AND signature_id IS NULL AND content_hash IS NULL AND signed_at IS NULL)
        OR (status = 'signed' AND content_hash ~ '^[0-9a-f]{64}$' AND signed_at IS NOT NULL)
      );
  END IF;
END
$mig$;

-- The electronic signature that signs a review record: written by the same
-- transaction, by the reviewer, meaning 'review', over this content hash,
-- not withdrawn (isSignatureWithdrawn, server/services/part11/signature-persistence.ts).
-- SECURITY INVOKER: read under the caller's own RLS scope.
CREATE OR REPLACE FUNCTION public.compliance_review_signature_of(
  p_id integer, p_organization_id integer, p_reviewer integer, p_content_hash text
) RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $fn$
  SELECT max(es.id)
    FROM public.electronic_signatures es
   WHERE es.organization_id = p_organization_id
     AND es.signed_target = 'compliance-review:' || p_id::text
     AND es.signer_id = p_reviewer
     AND es.signature_meaning = 'review'
     AND es.superseded_by IS NULL
     AND es.is_valid IS DISTINCT FROM false
     AND es.verification_status IS DISTINCT FROM 'revoked'
     AND es.created_at = LOCALTIMESTAMP
     AND (es.signature_manifest -> 'act' ->> 'contentHash') = p_content_hash
$fn$;

-- 1. At COMMIT: a row that became 'signed' has its signature, and records it.
CREATE OR REPLACE FUNCTION public.compliance_review_records_signed_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  cur public.compliance_review_records%ROWTYPE;
  sig integer;
BEGIN
  SELECT * INTO cur FROM public.compliance_review_records WHERE id = NEW.id;
  IF NOT FOUND OR cur.status <> 'signed' THEN
    RETURN NULL;
  END IF;
  sig := public.compliance_review_signature_of(cur.id, cur.organization_id, cur.reviewer_user_id, cur.content_hash);
  IF sig IS NULL THEN
    RAISE EXCEPTION
      'COMPLIANCE_REVIEW_SIGNATURE_REQUIRED: review record % (organization %) may become signed only in the transaction that writes its review signature over its content hash (21 CFR Part 11 §11.50/§11.70) — refused.',
      cur.id, cur.organization_id
      USING ERRCODE = 'integrity_constraint_violation',
            HINT = 'Sign the review through POST /api/audit/reviews/:id/sign.';
  END IF;
  IF cur.signature_id IS NULL THEN
    UPDATE public.compliance_review_records SET signature_id = sig WHERE id = cur.id AND signature_id IS NULL;
  ELSIF cur.signature_id <> sig THEN
    RAISE EXCEPTION 'COMPLIANCE_REVIEW_SIGNATURE_REQUIRED: review record % names signature %, not the one its transaction wrote — refused.', cur.id, cur.signature_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$fn$;

-- 2. A signed row is fixed: no UPDATE but the binding above, no DELETE.
CREATE OR REPLACE FUNCTION public.compliance_review_records_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'signed' THEN
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review record % is signed and cannot be deleted (21 CFR 11.10(e); Annex 11 §9).', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'signed' THEN
    IF OLD.signature_id IS NULL AND NEW.signature_id IS NOT NULL
       AND (to_jsonb(NEW) - 'signature_id') = (to_jsonb(OLD) - 'signature_id')
       AND NEW.signature_id = public.compliance_review_signature_of(OLD.id, OLD.organization_id, OLD.reviewer_user_id, OLD.content_hash) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review record % is signed and cannot be changed (21 CFR 11.10(e); Annex 11 §9). Record a new review that states the correction.', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review record %''s identity is fixed.', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.compliance_review_records_truncate_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: compliance_review_records holds signed review records and cannot be truncated (21 CFR 11.10(e)).'
    USING ERRCODE = 'raise_exception';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_compliance_review_records_guard ON public.compliance_review_records;
CREATE TRIGGER trg_compliance_review_records_guard
  BEFORE UPDATE OR DELETE ON public.compliance_review_records
  FOR EACH ROW EXECUTE FUNCTION public.compliance_review_records_guard();

DROP TRIGGER IF EXISTS trg_compliance_review_records_no_truncate ON public.compliance_review_records;
CREATE TRIGGER trg_compliance_review_records_no_truncate
  BEFORE TRUNCATE ON public.compliance_review_records
  FOR EACH STATEMENT EXECUTE FUNCTION public.compliance_review_records_truncate_guard();

DROP TRIGGER IF EXISTS trg_compliance_review_records_signed_ins ON public.compliance_review_records;
CREATE CONSTRAINT TRIGGER trg_compliance_review_records_signed_ins
  AFTER INSERT ON public.compliance_review_records
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'signed')
  EXECUTE FUNCTION public.compliance_review_records_signed_guard();

DROP TRIGGER IF EXISTS trg_compliance_review_records_signed_upd ON public.compliance_review_records;
CREATE CONSTRAINT TRIGGER trg_compliance_review_records_signed_upd
  AFTER UPDATE ON public.compliance_review_records
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'signed' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.compliance_review_records_signed_guard();
