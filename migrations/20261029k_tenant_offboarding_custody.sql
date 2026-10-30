-- =============================================================================
-- 20261029k_tenant_offboarding_custody.sql
--
-- A departing tenant's regulated records leave with the tenant, after custody
-- passes to the customer (P-58, D6, 2026-10-29; docs/LAUNCH_DEFINITION_OF_DONE.md
-- P-58; evidence docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
--
-- WHY. Eighteen tables were held out of the tenant purge on 2026-10-29
-- (PURGE_REFERRERS_NOT_ERASED, docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/),
-- so a tenant holding one signature, audit row or approval could not be purged
-- at all. The founder's decision: every held record is exported, the
-- customer's administrator signs custody of the export
-- (server/services/tenant/offboarding-custody.ts), the platform keeps one
-- certificate of the offboarding, and the records are erased with the tenant.
--
-- WHAT.
--   1. public.tenant_offboarding_certificates: one row per purged tenant. The
--      export's digest and counts, the rows erased per table, the held records
--      erased, the custody signature, who purged and when, and the SHA-256 of
--      those fields. No customer content. Append-only for every role: UPDATE,
--      DELETE and TRUNCATE are refused; an INSERT is refused unless the
--      organization is purged, the export receipt is its own, and the custody
--      signature (when one is named) is its own custody signature on that
--      export. It is a platform record, not residue: the purge does not erase
--      it (PURGE_PLATFORM_RECORDS, server/services/tenant/purge-referrers.ts,
--      read by ci:purge-coverage). In public with organization_id INTEGER NOT
--      NULL, before the final sweep pair, so the sweep policies it.
--   2. tenant_record_purger: a NOLOGIN, NOINHERIT role with no attributes, the
--      pattern of ana_run_events_purger (20261008f). It exists only to own the
--      doors below, so each store's guard recognises a door by current_user.
--      The runtime role is not a member of it and cannot become it.
--   3. The doors. Each is SECURITY DEFINER with search_path pinned, takes the
--      organization alone, and refuses unless the session is in the platform
--      scope, the organization is pending_deletion and no legal hold on it is
--      active (the preconditions of purge_tenant_vault_seals, 20261029d), and,
--      when it would erase a held record, unless the organization holds a
--      valid custody signature on one of its export receipts. The tenant purge
--      (PURGE_DOORS, server/services/tenant/purge-held-doors.ts) checks the
--      custody signature against the very receipt it runs on; the doors hold
--      the database to the same rule without it. Each is on
--      scripts/db/security-definer-allowlist.json with its review.
--        purge_tenant_signed_records    compliance_review_records (a signed
--                                       review's DELETE is refused by its guard),
--                                       electronic_signatures (trigger + grant
--                                       ceiling), document_audit_trail (grant
--                                       ceiling). The custody signatures are kept.
--        purge_tenant_lineage_records   data_lineage_records, evidence_chain_records
--                                       (prevent_lineage_modification)
--        purge_tenant_ivdr_histories    the three IVDR Part 11 histories (grant
--                                       ceiling), by their parent's organization
--        purge_tenant_reg_questions     reg_questions (read-only since 20261019b)
--        purge_tenant_review_routes     the tenant's unified_tasks, review-route
--                                       members included (their guard admits this
--                                       role's DELETE, 20261023), then its
--                                       review_routes
--      Each store's own guard is amended IN PLACE, in its creating file, to
--      admit DELETE by tenant_record_purger and nothing else (Rule 1):
--      db/migrations/20260730_esign_audit_db_level_immutability.sql,
--      migrations/20260327_data_lineage_tracking.sql,
--      migrations/20261019b_reg_questions_read_only.sql,
--      migrations/20261001_compliance_review_records.sql,
--      migrations/20261023_review_routes.sql. Never through a session setting.
--   4. tenant_export_receipts.export_scope (P-58's data return, added the same
--      day): the scope the export was read in, 'organization' (its own tenant
--      id and organization uuid) or 'unrestricted' (nothing filtered the
--      read), written by recordExportReceipt
--      (server/services/tenant-export/tenant-full-export.service.ts). An
--      export read in the platform scope returned none of the organization's
--      Vault documents or knowledge graph and failed nothing
--      (docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-0/), so such an
--      export records no receipt, and a receipt recorded before this column
--      (NULL) authorizes neither custody nor a certificate: the custody check
--      the doors run and the certificate's INSERT guard both require the
--      column. Added nullable with no default, so no existing receipt is
--      claimed to be complete.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent, or is a CREATE OR REPLACE of a function this file alone defines,
-- or a GRANT/REVOKE/owner alignment that is idempotent. No DROP, no backfill,
-- no rewrite of a row.
-- =============================================================================

-- ── 0. The scope each export was read in ─────────────────────────────────────
-- On the receipt (20260813b, 20261018), when the base schema has it. Nullable,
-- no default: a receipt recorded before 2026-10-29 states no scope. The CHECK
-- is created only when absent (by name), and NULL passes it, so a replay
-- never re-validates a narrower rule (Rule 1's corollary); no other file
-- defines it.
DO $mig$
BEGIN
  IF to_regclass('public.tenant_export_receipts') IS NOT NULL THEN
    ALTER TABLE public.tenant_export_receipts ADD COLUMN IF NOT EXISTS export_scope text;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenant_export_receipts'::regclass
                    AND conname = 'tenant_export_receipts_export_scope_known') THEN
      ALTER TABLE public.tenant_export_receipts ADD CONSTRAINT tenant_export_receipts_export_scope_known
        CHECK (export_scope IS NULL OR export_scope IN ('organization', 'unrestricted'));
    END IF;
  END IF;
END
$mig$;

-- ── 1. The offboarding certificate ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_offboarding_certificates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      INTEGER NOT NULL CONSTRAINT tenant_offboarding_certificates_org_positive CHECK (organization_id > 0),
  -- The receipt's digest; the INSERT guard below requires it to be one of the organization's receipts.
  export_digest        text NOT NULL CONSTRAINT tenant_offboarding_certificates_digest_present CHECK (length(btrim(export_digest)) > 0),
  export_table_count   integer NOT NULL CONSTRAINT tenant_offboarding_certificates_tables_nonneg CHECK (export_table_count >= 0),
  export_row_count     bigint NOT NULL CONSTRAINT tenant_offboarding_certificates_rows_nonneg CHECK (export_row_count >= 0),
  -- Rows erased per table, as the purge's transaction counted them: {"table": n}.
  deleted_rows         jsonb NOT NULL CONSTRAINT tenant_offboarding_certificates_deleted_object CHECK (jsonb_typeof(deleted_rows) = 'object'),
  tables_absent        jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT tenant_offboarding_certificates_absent_array CHECK (jsonb_typeof(tables_absent) = 'array'),
  -- The held records erased, per store (server/services/tenant/held-records.ts).
  held_records         jsonb NOT NULL CONSTRAINT tenant_offboarding_certificates_held_object CHECK (jsonb_typeof(held_records) = 'object'),
  held_record_total    integer NOT NULL CONSTRAINT tenant_offboarding_certificates_held_nonneg CHECK (held_record_total >= 0),
  custody_signature_id integer,
  purged_by            integer NOT NULL CONSTRAINT tenant_offboarding_certificates_purger_positive CHECK (purged_by > 0),
  purged_at            timestamptz NOT NULL,
  -- sha256 over the canonical JSON of the fields above (server/services/tenant/offboarding-certificate.ts).
  certificate_sha256   text NOT NULL CONSTRAINT tenant_offboarding_certificates_sha256_hex CHECK (certificate_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_offboarding_certificates_one_per_tenant UNIQUE (organization_id),
  CONSTRAINT tenant_offboarding_certificates_custody_when_held CHECK (held_record_total = 0 OR custody_signature_id IS NOT NULL)
);

-- The organization it certifies (its row survives the purge in status
-- 'purged') and the custody signature it names (kept by the signed-records
-- door), each when the base schema is present. NO ACTION: neither may be
-- removed while the certificate stands.
DO $mig$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_offboarding_certificates_organization_fk'
       AND conrelid = 'public.tenant_offboarding_certificates'::regclass) THEN
    ALTER TABLE public.tenant_offboarding_certificates
      ADD CONSTRAINT tenant_offboarding_certificates_organization_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
  END IF;
  IF to_regclass('public.electronic_signatures') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_offboarding_certificates_custody_signature_fk'
       AND conrelid = 'public.tenant_offboarding_certificates'::regclass) THEN
    ALTER TABLE public.tenant_offboarding_certificates
      ADD CONSTRAINT tenant_offboarding_certificates_custody_signature_fk FOREIGN KEY (custody_signature_id) REFERENCES public.electronic_signatures(id);
  END IF;
END
$mig$;

CREATE OR REPLACE FUNCTION public.tenant_offboarding_certificates_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'OFFBOARDING_CERTIFICATE_IMMUTABLE: an offboarding certificate is never changed or removed (%).', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = NEW.organization_id AND o.status = 'purged') THEN
    RAISE EXCEPTION 'OFFBOARDING_CERTIFICATE_REFUSED: organization % is not purged; a certificate is written by its purge.', NEW.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_export_receipts r WHERE r.organization_id = NEW.organization_id AND r.digest = NEW.export_digest) THEN
    RAISE EXCEPTION 'OFFBOARDING_CERTIFICATE_REFUSED: % is not an export receipt of organization %.', NEW.export_digest, NEW.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Only an export read in the organization's own scope (section 0, P-58's data return).
  IF NOT EXISTS (SELECT 1 FROM public.tenant_export_receipts r WHERE r.organization_id = NEW.organization_id AND r.digest = NEW.export_digest
                    AND to_jsonb(r)->>'export_scope' IN ('organization', 'unrestricted')) THEN
    RAISE EXCEPTION 'OFFBOARDING_CERTIFICATE_REFUSED: the export % of organization % states no complete scope; it may hold none of its Vault documents.', NEW.export_digest, NEW.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Nested, so the signatures are read only for a certificate that names one.
  IF NEW.custody_signature_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.electronic_signatures s
       WHERE s.id = NEW.custody_signature_id AND s.organization_id = NEW.organization_id
         AND s.signed_target = 'tenant-export-custody:' || NEW.export_digest) THEN
      RAISE EXCEPTION 'OFFBOARDING_CERTIFICATE_REFUSED: signature % is not organization %''s custody signature on %.',
        NEW.custody_signature_id, NEW.organization_id, NEW.export_digest
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_offboarding_certificates_guard_row'
                    AND tgrelid = 'public.tenant_offboarding_certificates'::regclass) THEN
    CREATE TRIGGER tenant_offboarding_certificates_guard_row
      BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_offboarding_certificates
      FOR EACH ROW EXECUTE FUNCTION public.tenant_offboarding_certificates_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_offboarding_certificates_guard_truncate'
                    AND tgrelid = 'public.tenant_offboarding_certificates'::regclass) THEN
    CREATE TRIGGER tenant_offboarding_certificates_guard_truncate
      BEFORE TRUNCATE ON public.tenant_offboarding_certificates
      FOR EACH STATEMENT EXECUTE FUNCTION public.tenant_offboarding_certificates_guard();
  END IF;
END
$mig$;

COMMENT ON TABLE public.tenant_offboarding_certificates IS
  'One per purged tenant (P-58): the export digest and counts, rows erased per table, held records erased, the custody signature, who purged and when. No customer content. Append-only for every role; outlives the tenant as the platform''s record of the offboarding.';

-- ── 2. The doors' owner ──────────────────────────────────────────────────────
DO $purger$
DECLARE
  v_applier_is_super boolean;
  v_applier_can_set  boolean;
  v_table text;
BEGIN
  -- Roles are cluster-wide and this file re-runs on every deploy: never a plain CREATE ROLE.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_record_purger') THEN
    CREATE ROLE tenant_record_purger
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;

  -- A non-superuser applier (the RDS master) must be able to SET ROLE to the
  -- owner it hands the doors to: ask first, grant itself membership if it can,
  -- otherwise fail closed with the remedy (20261008f's pattern).
  SELECT rolsuper INTO v_applier_is_super FROM pg_roles WHERE rolname = current_user;
  IF NOT COALESCE(v_applier_is_super, false) THEN
    IF current_setting('server_version_num')::int >= 160000 THEN
      v_applier_can_set := pg_has_role(current_user, 'tenant_record_purger', 'SET');
    ELSE
      v_applier_can_set := pg_has_role(current_user, 'tenant_record_purger', 'MEMBER');
    END IF;
    IF NOT v_applier_can_set THEN
      BEGIN
        EXECUTE format('GRANT tenant_record_purger TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION '[tenant_offboarding] % cannot become a member of tenant_record_purger and so cannot install the purge doors', current_user
          USING HINT = format('Have a superuser run: GRANT tenant_record_purger TO %I; then re-run the migration set.', current_user);
      END;
    END IF;
  END IF;

  -- What the doors read and erase, and nothing more.
  GRANT USAGE ON SCHEMA public TO tenant_record_purger;
  FOREACH v_table IN ARRAY ARRAY[
    'compliance_review_records', 'electronic_signatures', 'document_audit_trail', 'data_lineage_records', 'evidence_chain_records',
    'ivdr_validation_parameter_history', 'ivdr_evidence_result_history', 'ivdr_cdx_status_history', 'reg_questions',
    'unified_tasks', 'review_routes'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, DELETE ON public.%I TO tenant_record_purger', v_table);
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY[
    'organizations', 'tenant_export_receipts', 'ivdr_analytical_validations', 'ivdr_clinical_evidence', 'ivdr_cdx_workflows'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO tenant_record_purger', v_table);
    END IF;
  END LOOP;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA vault TO tenant_record_purger;
    GRANT SELECT ON vault.legal_holds TO tenant_record_purger;
  END IF;
END
$purger$;

-- ── 3. What every door checks first ──────────────────────────────────────────
-- The purge's preconditions, restated at the database so the runtime role's
-- credentials alone cannot open a door: the platform scope, the organization
-- pending deletion, no active legal hold. Invoker rights: inside a door it
-- runs as the door's owner. Raises; returns nothing.
CREATE OR REPLACE FUNCTION public.tenant_purge_door_preconditions(p_org integer, p_door text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
  v_holds  integer := 0;
BEGIN
  IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
     AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
    RAISE EXCEPTION '%_PURGE_REFUSED: the tenant purge runs in the platform scope, not a tenant scope (organization %).', p_door, p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.status INTO v_status FROM public.organizations o WHERE o.id = p_org;
  IF v_status IS DISTINCT FROM 'pending_deletion' THEN
    RAISE EXCEPTION '%_PURGE_REFUSED: organization % is not pending deletion (status %).', p_door, p_org, COALESCE(v_status, 'not found')
      USING ERRCODE = 'raise_exception';
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM vault.legal_holds WHERE organization_id = $1 AND lifted_at IS NULL' INTO v_holds USING p_org;
  END IF;
  IF v_holds > 0 THEN
    RAISE EXCEPTION '%_PURGE_REFUSED: organization % has % active legal hold(s); records under hold cannot be destroyed.', p_door, p_org, v_holds
      USING ERRCODE = 'raise_exception';
  END IF;
END;
$fn$;

-- Whether the organization holds a valid custody signature on one of its own
-- export receipts (P-58). The purge checks it against the receipt it runs on;
-- a door holds the database to it before erasing a held record. Invoker rights.
-- plpgsql, not sql: its body is planned when it runs, so a schema without one
-- of its tables (a test fixture) still installs it.
CREATE OR REPLACE FUNCTION public.tenant_export_custody_signed(p_org integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF to_regclass('public.electronic_signatures') IS NULL OR to_regclass('public.tenant_export_receipts') IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.tenant_export_receipts r
      JOIN public.electronic_signatures s
        ON s.organization_id = r.organization_id AND s.signed_target = 'tenant-export-custody:' || r.digest
     WHERE r.organization_id = p_org
       AND to_jsonb(r)->>'export_scope' IN ('organization', 'unrestricted')
       AND s.signature_type = 'governed-action'
       AND s.superseded_by IS NULL
       AND s.is_valid IS DISTINCT FROM false
       AND COALESCE(s.verification_status, '') NOT IN ('revoked', 'voided'));
END;
$fn$;

-- Refuse when the door would erase `p_held` held records and no custody is signed.
CREATE OR REPLACE FUNCTION public.tenant_purge_door_custody(p_org integer, p_door text, p_held bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF p_held > 0 AND NOT public.tenant_export_custody_signed(p_org) THEN
    RAISE EXCEPTION 'CUSTODY_ATTESTATION_REQUIRED: % door: organization % holds % regulated record(s) and no administrator has signed custody of its export.', p_door, p_org, p_held
      USING ERRCODE = 'raise_exception';
  END IF;
END;
$fn$;

-- ── 4. The doors ─────────────────────────────────────────────────────────────
-- Erase one store's rows of the organization when this database has the store
-- (`p_where` is a fixed predicate of the door, `$1` the organization). A
-- lineage without a store has nothing in it to erase; a door's own table is
-- always present (the purge opens a door only when its first table exists).
CREATE OR REPLACE FUNCTION public.tenant_purge_door_erase(p_table text, p_where text, p_org integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer := 0;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN 0; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE %s', p_table, p_where) USING p_org;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- How many of the organization's rows a store holds; 0 when this database lacks it.
CREATE OR REPLACE FUNCTION public.tenant_purge_door_count(p_table text, p_where text, p_org integer)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count bigint := 0;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN 0; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', p_table, p_where) INTO v_count USING p_org;
  RETURN v_count;
END;
$fn$;

-- A signed compliance review, the tenant's electronic signatures (but its
-- custody signatures, which the certificate names) and the legacy documents'
-- audit trail. Before `document_versions` in the purge: each names a document
-- or a version with no delete action, and a review names its signature.
CREATE OR REPLACE FUNCTION public.purge_tenant_signed_records(p_org integer)
RETURNS TABLE (signatures integer, reviews integer, audit_entries integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  c_signatures CONSTANT text := 'organization_id = $1 AND COALESCE(signed_target, '''') NOT LIKE ''tenant-export-custody:%''';
  c_own        CONSTANT text := 'organization_id = $1';
  v_signatures integer;
  v_reviews    integer;
  v_audit      integer;
BEGIN
  PERFORM public.tenant_purge_door_preconditions(p_org, 'SIGNED_RECORDS');
  PERFORM public.tenant_purge_door_custody(p_org, 'SIGNED_RECORDS',
      public.tenant_purge_door_count('compliance_review_records', c_own, p_org)
    + public.tenant_purge_door_count('electronic_signatures', c_signatures, p_org)
    + public.tenant_purge_door_count('document_audit_trail', c_own, p_org));
  v_reviews    := public.tenant_purge_door_erase('compliance_review_records', c_own, p_org);
  v_signatures := public.tenant_purge_door_erase('electronic_signatures', c_signatures, p_org);
  v_audit      := public.tenant_purge_door_erase('document_audit_trail', c_own, p_org);
  RETURN QUERY SELECT v_signatures, v_reviews, v_audit;
END;
$fn$;

-- Data lineage and evidence chains (append-only by prevent_lineage_modification). Before `projects`.
CREATE OR REPLACE FUNCTION public.purge_tenant_lineage_records(p_org integer)
RETURNS TABLE (lineage integer, evidence_chains integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  c_own    CONSTANT text := 'organization_id = $1';
  v_lineage integer;
  v_chains  integer;
BEGIN
  PERFORM public.tenant_purge_door_preconditions(p_org, 'LINEAGE_RECORDS');
  PERFORM public.tenant_purge_door_custody(p_org, 'LINEAGE_RECORDS',
      public.tenant_purge_door_count('data_lineage_records', c_own, p_org)
    + public.tenant_purge_door_count('evidence_chain_records', c_own, p_org));
  v_lineage := public.tenant_purge_door_erase('data_lineage_records', c_own, p_org);
  v_chains  := public.tenant_purge_door_erase('evidence_chain_records', c_own, p_org);
  RETURN QUERY SELECT v_lineage, v_chains;
END;
$fn$;

-- The IVDR module's Part 11 change histories, by the parent and key of each
-- one's tenant policy (the predicates of PURGE_PARENT_SCOPED,
-- server/services/tenant/purge-parent-scope.ts). Before their parents.
CREATE OR REPLACE FUNCTION public.purge_tenant_ivdr_histories(p_org integer)
RETURNS TABLE (validation_parameters integer, evidence_results integer, cdx_statuses integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  c_parameters CONSTANT text := 'validation_id IN (SELECT id FROM public.ivdr_analytical_validations WHERE organization_id = $1)';
  c_results    CONSTANT text := 'evidence_id IN (SELECT id FROM public.ivdr_clinical_evidence WHERE organization_id = $1)';
  c_statuses   CONSTANT text := 'workflow_id IN (SELECT id FROM public.ivdr_cdx_workflows WHERE organization_id = $1)';
  v_parameters integer;
  v_results    integer;
  v_statuses   integer;
BEGIN
  PERFORM public.tenant_purge_door_preconditions(p_org, 'IVDR_HISTORY');
  PERFORM public.tenant_purge_door_custody(p_org, 'IVDR_HISTORY',
      public.tenant_purge_door_count('ivdr_validation_parameter_history', c_parameters, p_org)
    + public.tenant_purge_door_count('ivdr_evidence_result_history', c_results, p_org)
    + public.tenant_purge_door_count('ivdr_cdx_status_history', c_statuses, p_org));
  v_parameters := public.tenant_purge_door_erase('ivdr_validation_parameter_history', c_parameters, p_org);
  v_results    := public.tenant_purge_door_erase('ivdr_evidence_result_history', c_results, p_org);
  v_statuses   := public.tenant_purge_door_erase('ivdr_cdx_status_history', c_statuses, p_org);
  RETURN QUERY SELECT v_parameters, v_results, v_statuses;
END;
$fn$;

-- The legacy agency questions, read-only since 20261019b. After their messages
-- and responses, before `reg_attachments` and `agency_correspondence`.
CREATE OR REPLACE FUNCTION public.purge_tenant_reg_questions(p_org integer)
RETURNS TABLE (questions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  c_own CONSTANT text := 'organization_id = $1';
BEGIN
  PERFORM public.tenant_purge_door_preconditions(p_org, 'REG_QUESTION');
  PERFORM public.tenant_purge_door_custody(p_org, 'REG_QUESTION', public.tenant_purge_door_count('reg_questions', c_own, p_org));
  RETURN QUERY SELECT public.tenant_purge_door_erase('reg_questions', c_own, p_org);
END;
$fn$;

-- The tenant's tasks, a review route's members among them, then its review
-- routes. A route member's DELETE is refused to every role but this one
-- (unified_tasks_route_rows_guard, 20261023, amended 2026-10-29): the route's
-- writer path never deletes a member, and the purge does it here. Where
-- `unified_tasks` stands in the purge, after the task links and dependencies.
-- A lineage without review routes (no review_routes, no review_route_id) has
-- only ordinary tasks, which this deletes as the purge did.
CREATE OR REPLACE FUNCTION public.purge_tenant_review_routes(p_org integer)
RETURNS TABLE (tasks integer, routes integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  c_own   CONSTANT text := 'organization_id = $1';
  v_routed boolean;
  v_tasks  integer;
  v_routes integer;
BEGIN
  PERFORM public.tenant_purge_door_preconditions(p_org, 'REVIEW_ROUTE');
  v_routed := EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.unified_tasks')
                        AND attname = 'review_route_id' AND NOT attisdropped);
  PERFORM public.tenant_purge_door_custody(p_org, 'REVIEW_ROUTE',
      CASE WHEN v_routed THEN public.tenant_purge_door_count('unified_tasks', 'organization_id = $1 AND review_route_id IS NOT NULL', p_org) ELSE 0 END
    + public.tenant_purge_door_count('review_routes', c_own, p_org));
  v_tasks  := public.tenant_purge_door_erase('unified_tasks', c_own, p_org);
  v_routes := public.tenant_purge_door_erase('review_routes', c_own, p_org);
  RETURN QUERY SELECT v_tasks, v_routes;
END;
$fn$;

-- Each door is owned by tenant_record_purger, callable by the runtime role
-- alone, and verified in that shape: a door in any other shape is no door.
DO $door$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.purge_tenant_signed_records(integer)',
    'public.purge_tenant_lineage_records(integer)',
    'public.purge_tenant_ivdr_histories(integer)',
    'public.purge_tenant_reg_questions(integer)',
    'public.purge_tenant_review_routes(integer)'
  ] LOOP
    IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = v_fn::regprocedure) <> 'tenant_record_purger' THEN
      EXECUTE format('ALTER FUNCTION %s OWNER TO tenant_record_purger', v_fn);
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_service', v_fn);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
       WHERE oid = v_fn::regprocedure AND prosecdef AND pg_get_userbyid(proowner) = 'tenant_record_purger'
    ) THEN
      RAISE EXCEPTION '[tenant_offboarding] % is not SECURITY DEFINER owned by tenant_record_purger', v_fn;
    END IF;
    IF has_function_privilege('public', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '[tenant_offboarding] % is executable by PUBLIC', v_fn;
    END IF;
  END LOOP;
END
$door$;

-- The doors' helpers run with their caller's rights (invoker) and carry no
-- privilege of their own; only the doors' owner calls them.
DO $helpers$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.tenant_purge_door_preconditions(integer,text)',
    'public.tenant_export_custody_signed(integer)',
    'public.tenant_purge_door_custody(integer,text,bigint)',
    'public.tenant_purge_door_erase(text,text,integer)',
    'public.tenant_purge_door_count(text,text,integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO tenant_record_purger', v_fn);
  END LOOP;
END
$helpers$;
