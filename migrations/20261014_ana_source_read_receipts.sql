-- D2 exact-source host-budget admission metadata, 2026-10-14.
-- New public integer-tenant ledger. No source/user/program FK or cascade.
-- Legacy Vault receipts are deliberately not changed or backfilled.
-- This file replays on every deploy; retain historical rows and identities.

CREATE TABLE IF NOT EXISTS public.ana_source_read_receipts (
  id uuid PRIMARY KEY,
  organization_id integer NOT NULL,
  receipt_version smallint NOT NULL,
  checkpoint text NOT NULL,
  actor_user_id integer NOT NULL,
  admitted_role text NOT NULL,
  program_id uuid NOT NULL,
  document_id uuid NOT NULL,
  original_sha256 char(64) NOT NULL,
  extraction_sha256 char(64) NOT NULL,
  total_chars integer NOT NULL,
  ranges jsonb NOT NULL,
  payload_sha256 char(64) NOT NULL,
  tool_use_id text,
  thread_id text,
  receipt_sha256 char(64) NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Shape checks complement the canonical shared descriptor/fingerprint engine.
-- They do not attest actor access, source contents or provider delivery.
CREATE OR REPLACE FUNCTION public.ana_source_receipt_text_valid(value text, maximum integer)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT value IS NOT NULL AND char_length(value) BETWEEN 1 AND maximum
    AND char_length(btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0
    -- Unicode Cc: NUL cannot be stored in PostgreSQL text; reject the rest.
    AND value !~ ('[' || chr(1) || '-' || chr(31) || chr(127) || '-' || chr(159) || ']');
$fn$;

CREATE OR REPLACE FUNCTION public.ana_source_receipt_ranges_valid(value jsonb, total integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
DECLARE
  item jsonb;
  range_start bigint;
  range_end bigint;
  previous_end bigint := -1;
BEGIN
  IF value IS NULL OR total IS NULL OR total < 1 OR jsonb_typeof(value) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(value) NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;
  FOR item IN SELECT r.value FROM jsonb_array_elements(value) WITH ORDINALITY r(value,n) ORDER BY r.n LOOP
    IF jsonb_typeof(item) <> 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> 3 OR NOT (item ?& ARRAY['start','end','sha256']) THEN RETURN false; END IF;
    IF jsonb_typeof(item->'start') <> 'number' OR jsonb_typeof(item->'end') <> 'number'
       OR jsonb_typeof(item->'sha256') <> 'string' THEN RETURN false; END IF;
    IF item->>'start' !~ '^[0-9]{1,10}$' OR item->>'end' !~ '^[0-9]{1,10}$'
       OR item->>'sha256' !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
    range_start := (item->>'start')::bigint;
    range_end := (item->>'end')::bigint;
    IF range_start < previous_end OR range_end <= range_start OR range_end > total THEN RETURN false; END IF;
    previous_end := range_end;
  END LOOP;
  RETURN true;
END;
$fn$;

-- Conditional ADD rather than DROP/ADD: replay preserves populated history.
DO $checks$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('ana_source_receipt_org_positive','organization_id > 0'),
    ('ana_source_receipt_actor_positive','actor_user_id > 0'),
    ('ana_source_receipt_version','receipt_version = 2'),
    ('ana_source_receipt_checkpoint','checkpoint = ''host_budget_admitted'''),
    ('ana_source_receipt_role','public.ana_source_receipt_text_valid(admitted_role,128) AND admitted_role = lower(admitted_role) AND admitted_role = btrim(admitted_role,U&''\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'')'),
    ('ana_source_receipt_original_hash','original_sha256 ~ ''^[0-9a-f]{64}$'''),
    ('ana_source_receipt_extraction_hash','extraction_sha256 ~ ''^[0-9a-f]{64}$'''),
    ('ana_source_receipt_payload_hash','payload_sha256 ~ ''^[0-9a-f]{64}$'''),
    ('ana_source_receipt_fingerprint','receipt_sha256 ~ ''^[0-9a-f]{64}$'''),
    ('ana_source_receipt_total_chars','total_chars > 0'),
    ('ana_source_receipt_ranges','public.ana_source_receipt_ranges_valid(ranges,total_chars)'),
    ('ana_source_receipt_tool_context','tool_use_id IS NULL OR public.ana_source_receipt_text_valid(tool_use_id,2000)'),
    ('ana_source_receipt_thread_context','thread_id IS NULL OR public.ana_source_receipt_text_valid(thread_id,2000)')
  ) AS checks(name,expression) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ana_source_read_receipts'::regclass AND conname=c.name) THEN
      EXECUTE format('ALTER TABLE public.ana_source_read_receipts ADD CONSTRAINT %I CHECK (%s)',c.name,c.expression);
    END IF;
  END LOOP;
END;
$checks$;

CREATE INDEX IF NOT EXISTS ana_source_read_receipts_actor_history_idx
  ON public.ana_source_read_receipts(organization_id,actor_user_id,program_id,accepted_at,id);

CREATE OR REPLACE FUNCTION public.ana_source_read_receipts_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog,public
AS $fn$
BEGIN
  IF TG_LEVEL='ROW' AND TG_OP='DELETE' AND current_user='ana_record_purger' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: source read admission metadata cannot be changed, deleted or truncated.'
    USING ERRCODE='raise_exception';
END;
$fn$;
DO $guards$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.ana_source_read_receipts'::regclass AND tgname='trg_ana_source_read_receipts_append_only') THEN
    CREATE TRIGGER trg_ana_source_read_receipts_append_only BEFORE UPDATE OR DELETE ON public.ana_source_read_receipts
      FOR EACH ROW EXECUTE FUNCTION public.ana_source_read_receipts_append_only();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.ana_source_read_receipts'::regclass AND tgname='trg_ana_source_read_receipts_no_truncate') THEN
    CREATE TRIGGER trg_ana_source_read_receipts_no_truncate BEFORE TRUNCATE ON public.ana_source_read_receipts
      FOR EACH STATEMENT EXECUTE FUNCTION public.ana_source_read_receipts_append_only();
  END IF;
END;
$guards$;

-- Canonical tenant predicate. Application facades separately enforce current
-- actor/private-project scope; this is not an actor-sharing RLS policy.
-- The final tenant sweep recognises this name and preserves its canonical form.
ALTER TABLE public.ana_source_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ana_source_read_receipts FORCE ROW LEVEL SECURITY;
DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ana_source_read_receipts' AND policyname='tenant_isolation_policy') THEN
    CREATE POLICY tenant_isolation_policy ON public.ana_source_read_receipts FOR ALL
      USING (
        NULLIF(current_setting('app.rls_enforce',true),'') IS DISTINCT FROM 'on'
        OR organization_id=NULLIF(current_setting('app.current_tenant_id',true),'')::integer
        OR organization_id=substring(current_setting('app.current_org_id',true) from '^[0-9]+$')::integer
        OR current_setting('app.current_user_role',true)='app_super_admin'
      ) WITH CHECK (
        NULLIF(current_setting('app.rls_enforce',true),'') IS DISTINCT FROM 'on'
        OR organization_id=NULLIF(current_setting('app.current_tenant_id',true),'')::integer
        OR organization_id=substring(current_setting('app.current_org_id',true) from '^[0-9]+$')::integer
        OR current_setting('app.current_user_role',true)='app_super_admin'
      );
  END IF;
END;
$policy$;

-- Existing narrow NOLOGIN erasure owner. Runtime receives EXECUTE, not membership.
DO $purger$
DECLARE is_super boolean; can_set boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ana_record_purger') THEN
    CREATE ROLE ana_record_purger NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ana_record_purger' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
    RAISE EXCEPTION 'SOURCE_READ_RECEIPT_PURGE_REFUSED: unsafe record-purger role attributes.';
  END IF;
  SELECT rolsuper INTO is_super FROM pg_roles WHERE rolname=current_user;
  IF NOT COALESCE(is_super,false) THEN
    IF current_setting('server_version_num')::integer >= 160000 THEN
      can_set := pg_has_role(current_user,'ana_record_purger','SET');
    ELSE
      can_set := pg_has_role(current_user,'ana_record_purger','MEMBER');
    END IF;
    IF NOT can_set THEN EXECUTE format('GRANT ana_record_purger TO %I',current_user); END IF;
  END IF;
  GRANT USAGE,CREATE ON SCHEMA public TO ana_record_purger;
  GRANT SELECT,DELETE ON public.ana_source_read_receipts TO ana_record_purger;
  IF to_regclass('public.organizations') IS NOT NULL THEN
    GRANT SELECT ON public.organizations TO ana_record_purger;
    -- SELECT FOR SHARE needs UPDATE privilege on at least one column. The
    -- fixed door only reserves status; it never updates organization data.
    GRANT UPDATE(status) ON public.organizations TO ana_record_purger;
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA vault TO ana_record_purger;
    -- SHARE table locks require a table UPDATE/DELETE/TRUNCATE privilege;
    -- column UPDATE does not suffice (held-out 42501 probe). Grant UPDATE
    -- only to this NOLOGIN owner for the fixed lock. The door never updates
    -- holds and runtime has no membership in this role.
    GRANT SELECT,UPDATE ON vault.legal_holds TO ana_record_purger;
  END IF;
END;
$purger$;

CREATE OR REPLACE FUNCTION public.purge_tenant_source_read_receipts(p_org integer)
RETURNS TABLE(receipts integer) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public
AS $fn$
DECLARE organization_status text; held integer; erased integer;
BEGIN
  IF p_org IS NULL OR p_org < 1 OR current_setting('app.current_user_role',true) IS DISTINCT FROM 'app_super_admin' THEN
    RAISE EXCEPTION 'SOURCE_READ_RECEIPT_PURGE_REFUSED: an identified platform purge scope and positive target are required.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF to_regclass('public.organizations') IS NULL OR to_regclass('vault.legal_holds') IS NULL THEN
    RAISE EXCEPTION 'SOURCE_READ_RECEIPT_PURGE_REFUSED: organization or legal-hold records are unavailable.';
  END IF;
  SELECT o.status INTO organization_status FROM public.organizations o WHERE o.id=p_org FOR SHARE;
  IF organization_status IS DISTINCT FROM 'pending_deletion' THEN
    RAISE EXCEPTION 'SOURCE_READ_RECEIPT_PURGE_REFUSED: target is not pending deletion.';
  END IF;
  LOCK TABLE vault.legal_holds IN SHARE MODE;
  SELECT count(*)::integer INTO held FROM vault.legal_holds h WHERE h.organization_id=p_org AND h.lifted_at IS NULL;
  IF held > 0 THEN RAISE EXCEPTION 'SOURCE_READ_RECEIPT_PURGE_REFUSED: active legal hold prevents erasure.'; END IF;
  DELETE FROM public.ana_source_read_receipts r WHERE r.organization_id=p_org;
  GET DIAGNOSTICS erased=ROW_COUNT;
  RETURN QUERY SELECT erased;
END;
$fn$;

DO $grants$
BEGIN
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.purge_tenant_source_read_receipts(integer)'::regprocedure) <> 'ana_record_purger' THEN
    ALTER FUNCTION public.purge_tenant_source_read_receipts(integer) OWNER TO ana_record_purger;
  END IF;
  REVOKE ALL ON FUNCTION public.purge_tenant_source_read_receipts(integer) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_service') THEN
    GRANT SELECT,INSERT ON public.ana_source_read_receipts TO app_service;
    GRANT EXECUTE ON FUNCTION public.purge_tenant_source_read_receipts(integer) TO app_service;
    IF pg_has_role('app_service','ana_record_purger','MEMBER') THEN
      RAISE EXCEPTION 'SOURCE_READ_RECEIPT_PURGE_REFUSED: runtime must not be a member of the record-purger role.';
    END IF;
  END IF;
END;
$grants$;
