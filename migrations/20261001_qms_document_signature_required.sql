-- ============================================================================
-- 20261001_qms_document_signature_required.sql
--
-- 21 CFR Part 11 §11.50 / §11.70; 21 CFR 820.40; ISO 13485 §4.2.4: a QMS
-- controlled document becomes effective, or is retired, only in the transaction
-- that writes the electronic signature for that act — held by the database, not
-- only by the routes.
--
-- WHY (P0-18, DP-01 residual of the security audit 2026-09-24; row D6; evidence
-- docs/evidence/D6/2026-10-01-tranche-4/P0-18/): e1c224f6 closed the routes —
-- `effective` is reached only through approveQmsDocumentSigned and `retired`
-- only through retireQmsDocumentSigned (server/services/qms/
-- document-approval-signature.ts) — but nothing in the database held it.
-- Reproduced on PostgreSQL 16.13 as app_service (NOSUPERUSER NOBYPASSRLS), under
-- RLS, in its own tenant: `UPDATE qms_documents SET status = 'effective'` and
-- `… SET status = 'retired'` each committed with no electronic_signatures row.
--
-- THE RULE. A row event that puts qms_documents.status INTO 'effective' (an
-- INSERT, or an UPDATE from any other status) commits only if the same
-- transaction wrote an electronic_signatures row with
--   organization_id = the document's organization_id,
--   signed_target   = 'qms-document:' || the document's id,
--   signature_type  = 'qms-document-approval'   ('qms-document-retirement' for 'retired'),
-- that is not withdrawn (superseded_by IS NULL, is_valid not false,
-- verification_status not 'revoked' — isSignatureWithdrawn in
-- server/services/part11/signature-persistence.ts). That is exactly what the two
-- signed functions write, on the route's one transaction.
--
-- WHY "THE SAME TRANSACTION", NOT "ANY SUCH ROW". A revised document returns to
-- draft with its earlier approval still live (revise does not revoke it). With
-- an existence check a later bare UPDATE would put the unsigned new version
-- back to effective on the strength of the old signature. "Written by this
-- transaction" is `created_at = LOCALTIMESTAMP`: electronic_signatures.created_at
-- is `timestamp without time zone DEFAULT now()` and no writer sets it
-- (persistGovernedActionSignature's INSERT omits it), so a row this transaction
-- wrote carries this transaction's start time, read here in the same session.
-- Savepoints do not change it.
--
-- WHY DEFERRED. The governed path UPDATEs the status FIRST and INSERTs the
-- signature after it (applyApproval → recordGovernedAction →
-- persistGovernedActionSignature; the same for retirement). A per-statement
-- check would refuse every approval, so this is a CONSTRAINT TRIGGER,
-- DEFERRABLE INITIALLY DEFERRED: checked at COMMIT, when both rows exist. A
-- refusal there fails the COMMIT, the route's catch rolls back and answers 500
-- (serverError, no error text). Pinned by tests/db/
-- qms-document-signature-required.dbtest.ts, which also shows that the same
-- check made IMMEDIATE refuses the real approval.
--
-- EXISTING ROWS. A trigger validates nothing that is already stored, and the
-- WHEN clauses fire only on a change INTO 'effective'/'retired': a document
-- effective before this file, signed or not, stays effective, and an edit that
-- leaves its status alone is not checked. So no deploy breaks on legacy rows.
-- 'superseded' is not covered: nothing in server/ writes it.
--
-- SECURITY INVOKER on purpose: the lookup reads electronic_signatures under the
-- caller's own RLS scope — the scope its qms_documents write already passed.
--
-- Idempotent and replay-safe (CLAUDE.md Rule 1: every file in the set re-runs on
-- every deploy): CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS of this
-- file's own two names, then CREATE CONSTRAINT TRIGGER — so each deploy also
-- re-arms a trigger someone dropped. Guarded with to_regclass (an edition with
-- no qms_documents gets a NOTICE). Raises if electronic_signatures lacks a
-- column the check reads: arming it then would refuse every approval. No DROP
-- of anything another file creates; creates no table, so the tenant sweep has
-- nothing new to policy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.qms_documents_signed_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  required_type text;
BEGIN
  IF NEW.status = 'effective' THEN
    required_type := 'qms-document-approval';
  ELSIF NEW.status = 'retired' THEN
    required_type := 'qms-document-retirement';
  ELSE
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.electronic_signatures es
     WHERE es.organization_id = NEW.organization_id
       AND es.signed_target = 'qms-document:' || NEW.id::text
       AND es.signature_type = required_type
       AND es.superseded_by IS NULL
       AND es.is_valid IS DISTINCT FROM false
       AND es.verification_status IS DISTINCT FROM 'revoked'
       AND es.created_at = LOCALTIMESTAMP
  ) THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION
    'QMS_SIGNATURE_REQUIRED: qms_documents % (organization %) may become ''%'' only in the transaction that writes its ''%'' electronic signature (21 CFR Part 11 §11.50/§11.70) — refused.',
    NEW.id, NEW.organization_id, NEW.status, required_type
    USING ERRCODE = 'integrity_constraint_violation',
          HINT = 'Approve or retire the document through POST /api/mdx/qms/documents/:id/approve or /retire.';
END;
$$;

COMMENT ON FUNCTION public.qms_documents_signed_status_guard() IS
  'P0-18: refuses, at COMMIT, a qms_documents row becoming effective/retired without a live qms-document-approval/-retirement electronic_signatures row written by the same transaction. migrations/20261001_qms_document_signature_required.sql';

DO $$
DECLARE
  missing text;
BEGIN
  IF to_regclass('public.qms_documents') IS NULL THEN
    RAISE NOTICE '[qms-document-signature-required] public.qms_documents not present — nothing to guard.';
    RETURN;
  END IF;

  SELECT string_agg(c, ', ') INTO missing
    FROM unnest(ARRAY['organization_id', 'signed_target', 'signature_type', 'superseded_by',
                      'is_valid', 'verification_status', 'created_at']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'electronic_signatures' AND column_name = c
   );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '[qms-document-signature-required] public.electronic_signatures lacks %; the guard would refuse every approval.', missing;
  END IF;

  DROP TRIGGER IF EXISTS trg_qms_documents_signed_status_ins ON public.qms_documents;
  CREATE CONSTRAINT TRIGGER trg_qms_documents_signed_status_ins
    AFTER INSERT ON public.qms_documents
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (NEW.status IN ('effective', 'retired'))
    EXECUTE FUNCTION public.qms_documents_signed_status_guard();

  DROP TRIGGER IF EXISTS trg_qms_documents_signed_status_upd ON public.qms_documents;
  CREATE CONSTRAINT TRIGGER trg_qms_documents_signed_status_upd
    AFTER UPDATE ON public.qms_documents
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (NEW.status IN ('effective', 'retired') AND OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.qms_documents_signed_status_guard();
END;
$$;
