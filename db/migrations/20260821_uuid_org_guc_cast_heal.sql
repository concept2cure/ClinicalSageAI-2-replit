-- 20260821_uuid_org_guc_cast_heal.sql
--
-- Repoint every existing policy that casts `app.current_org_id` straight to UUID
-- at the guarded helper identity.current_org_id().
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- Policies across the non-public schemas inline
--
--     org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id)
--     organization_id = current_setting('app.current_org_id', true)::UUID
--
-- and that GUC is set to the EMPTY STRING on the scopes the application uses
-- most: systemSessionVars() (the cross-tenant super-admin scope),
-- tenantSessionVars() whenever `orgUuid` is null, and the reset paths in
-- lazyRequestDbClient, withTenantConnection and poolInstrumentation. `''::uuid`
-- does not yield NULL — it raises
--
--     ERROR: invalid input syntax for type uuid: ""
--
-- so on the 19 policies that inline the cast without a NULLIF, every read on
-- those scopes died. Measured on a provisioned database: reading
-- cortex.knowledge_gaps as app_service with app.current_org_id = '' errors,
-- while the same read with the GUC unset returns rows.
--
-- This is the integer-side defect from migrations/0021_enable_rls_everywhere.sql
-- in the other direction, and it was invisible for the same reason: the
-- application connects as the owner, a superuser for whom RLS is inert.
--
-- ── The fix ──────────────────────────────────────────────────────────────────
-- identity.current_org_id() now EXTRACTS a uuid instead of casting whatever is
-- there (db/migrations/053_gcc_rls_policies.sql), so it returns NULL for '' and
-- for anything that is not a uuid. Every source policy is rewritten to call it,
-- which also collapses 25 inline copies of the same expression down to one.
--
-- Behaviour is preserved exactly:
--   • COALESCE(helper, col) with no context still falls through to col = col,
--     i.e. "no tenant scope, see everything" — the documented context-less-safe
--     path for background jobs;
--   • a bare `col = helper` with no context still matches nothing;
--   • a real uuid still resolves to that tenant.
-- The only change is that '' and other non-uuid values stop raising.
--
-- ── Why a heal migration ─────────────────────────────────────────────────────
-- The fixed policy text lives in the governed-content tree (db/migrations/*_gcc_*),
-- which install-fresh applies but deploy-migrate deliberately does NOT. An
-- already-provisioned database therefore keeps the old inline casts forever
-- unless something rewrites them. This does, surgically: it reads each policy's
-- current expressions with pg_get_expr, replaces only the cast fragment, and
-- uses ALTER POLICY so the policy's name, roles and command are untouched. Any
-- policy whose expressions do not contain the fragment is left alone.
--
-- Idempotent: after the rewrite the fragment is gone, so a re-run matches nothing.

-- ── The guarded helper, re-asserted here on purpose ──────────────────────────
-- db/migrations/053_gcc_rls_policies.sql is the source of truth for this
-- function and defines it identically. It is repeated here because 053 lives in
-- the governed-content tree, which install-fresh applies and deploy-migrate
-- deliberately does not — so on an already-provisioned database the function
-- would still carry the unguarded `NULLIF(...)::UUID` body while the policies
-- below were being repointed AT it, and '' would keep raising, one call deeper.
-- The two definitions are byte-identical CREATE OR REPLACEs; if you change one,
-- change the other.
--
-- Guarded on the SCHEMA, not just the function. A bare CREATE OR REPLACE here
-- aborts with `schema "identity" does not exist` on any database that never
-- provisioned the governed-content tree — which includes the PGlite fixture
-- tests/schema-contract/tenant-isolation-sweep.contract.test.ts applies the
-- whole ordered set to. That is the same mistake this file exists to fix, one
-- level up: assuming a thing is there rather than checking. Where the schema is
-- absent there is nothing to repoint either, because the inline casts this
-- migration rewrites are written by that same tree.
DO $$
BEGIN
  IF to_regnamespace('identity') IS NULL THEN
    RAISE NOTICE '[uuid-guc-heal] schema "identity" is absent; nothing to guard or repoint here.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION identity.current_org_id()
    RETURNS UUID
    LANGUAGE SQL
    STABLE
    SECURITY DEFINER
    AS $body$
        SELECT substring(current_setting('app.current_org_id', TRUE) from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')::UUID;
    $body$;
  $fn$;
END $$;

DO $$
DECLARE
  rec           RECORD;
  new_qual      TEXT;
  new_check     TEXT;
  healed_count  INT := 0;
  -- The deparsed spellings pg_get_expr produces for the two inline forms.
  -- Longest first: the NULLIF form contains the bare form as a substring.
  unsafe_nullif CONSTANT TEXT :=
    '(NULLIF(current_setting(''app.current_org_id''::text, true), ''''::text))::uuid';
  unsafe_bare   CONSTANT TEXT :=
    '(current_setting(''app.current_org_id''::text, true))::uuid';
  safe_call     CONSTANT TEXT := 'identity.current_org_id()';
BEGIN
  IF to_regprocedure('identity.current_org_id()') IS NULL THEN
    RAISE NOTICE '[uuid-guc-heal] identity.current_org_id() is absent; nothing to repoint. '
                 'Apply db/migrations/053_gcc_rls_policies.sql first.';
    RETURN;
  END IF;

  FOR rec IN
    SELECT n.nspname                                   AS schema_name,
           c.relname                                   AS table_name,
           pol.polname                                 AS policy_name,
           pg_get_expr(pol.polqual, pol.polrelid)      AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    -- An UNGUARDED cast only. The guarded form still names the GUC and still
    -- ends in ::uuid, so matching on those alone would sweep up expressions that
    -- are already correct — and then report each one as an unrecognised spelling
    -- needing review, which is noise that trains people to ignore the notice.
    -- The '[0-9a-fA-F]{8}' marker appears only in the extraction pattern.
    WHERE (
           COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '')      LIKE '%current_setting(''app.current_org_id''%::uuid%'
        OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%current_setting(''app.current_org_id''%::uuid%'
      )
      AND COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '')       NOT LIKE '%[0-9a-fA-F]{8}%'
      AND COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '')  NOT LIKE '%[0-9a-fA-F]{8}%'
    ORDER BY 1, 2, 3
  LOOP
    new_qual  := replace(replace(rec.qual,       unsafe_nullif, safe_call), unsafe_bare, safe_call);
    new_check := replace(replace(rec.with_check, unsafe_nullif, safe_call), unsafe_bare, safe_call);

    -- Nothing actually changed (an unrecognised spelling): leave the policy be
    -- rather than rewrite it to itself, and say so.
    IF new_qual IS NOT DISTINCT FROM rec.qual AND new_check IS NOT DISTINCT FROM rec.with_check THEN
      RAISE NOTICE '[uuid-guc-heal] %.% [%] casts the GUC in a spelling this migration does not recognise — left unchanged, review by hand',
        rec.schema_name, rec.table_name, rec.policy_name;
      CONTINUE;
    END IF;

    -- WITH CHECK is only valid on a policy that already has one (and never on a
    -- FOR SELECT policy), so it is included only when the original carried it.
    IF rec.with_check IS NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                     rec.policy_name, rec.schema_name, rec.table_name, new_qual);
    ELSIF rec.qual IS NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     rec.policy_name, rec.schema_name, rec.table_name, new_check);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
                     rec.policy_name, rec.schema_name, rec.table_name, new_qual, new_check);
    END IF;

    healed_count := healed_count + 1;
    RAISE NOTICE '[uuid-guc-heal] repointed %.% [%] at identity.current_org_id()',
      rec.schema_name, rec.table_name, rec.policy_name;
  END LOOP;

  RAISE NOTICE '[uuid-guc-heal] % policy expression(s) repointed at the guarded helper', healed_count;
END $$;
