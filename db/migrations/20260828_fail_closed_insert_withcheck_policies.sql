-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Close the INSERT-shaped hole the fail-closed policy sweep could not
--          see, so an unresolved tenant scope can no longer WRITE a row
--          claiming another tenant's org.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (tenant isolation under all governed content)
--   - Integrity Risk Addressed: cross-tenant write — an unscoped session could
--     insert a row attributed to any organization
--
-- Determinism Contract:
--   - Policy predicates only; no table shape changes, no spec version bump.
--   - Idempotent: once a policy carries app.rls_enforce it no longer matches.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Runs on the deploy path, where identity.current_org_id() may not exist,
--     so the resolver is inlined exactly as the sibling sweep documents.
-- =============================================================================
--
-- 20260828_fail_closed_org_coalesce_policies.sql converted the non-public
-- tenant policies away from
--
--     (org_id = COALESCE(identity.current_org_id(), org_id))
--
-- whose COALESCE turns a FAILED scope resolution into the row's own org_id —
-- `org_id = org_id`, true for every row, so an unresolved scope saw (or wrote)
-- every tenant's data. But that sweep selected policies by `p.polqual`, the
-- USING expression:
--
--     WHERE COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ~ 'current_org_id'
--
-- An INSERT policy has NO USING clause — only WITH CHECK (`polwithcheck`), so
-- `polqual` is NULL, the COALESCE yields '', the regex cannot match, and every
-- INSERT-only policy was skipped in silence. cortex.learning_experiences ::
-- learning_exp_write is the one the deploy-smoke invariant caught: its read
-- side was converted while its write side kept the fallback, so an unscoped
-- caller could still INSERT a row attributed to any organization.
--
-- This sweep is the same conversion keyed on polwithcheck instead. Under
-- enforcement an unresolved scope can now write ONLY an org-less row: it can
-- never name another tenant, which is the property the fallback destroyed.

DO $$
DECLARE
  r        RECORD;
  col      TEXT;
  expr     TEXT;
  shadow   TEXT;
  resolver TEXT;
  uuid_re  TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  fixed    INT  := 0;
BEGIN
  shadow := '(NULLIF(current_setting(' || quote_literal('app.rls_enforce') ||
            '::text, true), ' || quote_literal('') || '::text) IS DISTINCT FROM ' ||
            quote_literal('on') || '::text)';

  FOR r IN
    SELECT p.polname, p.polrelid, p.polcmd, n.nspname, c.relname
      FROM pg_policy p
      JOIN pg_class c     ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'current_org_id'
       AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'app\.rls_enforce'
       AND n.nspname <> 'public'
  LOOP
    SELECT a.attname INTO col
      FROM pg_attribute a
     WHERE a.attrelid = r.polrelid
       AND a.attname IN ('organization_id', 'org_id', 'tenant_id')
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY CASE a.attname WHEN 'organization_id' THEN 1 WHEN 'org_id' THEN 2 ELSE 3 END
     LIMIT 1;

    IF col IS NULL THEN
      RAISE NOTICE '[fail-closed-insert] %.% has no tenant column - left unchanged.', r.nspname, r.relname;
      CONTINUE;
    END IF;

    resolver := 'substring(current_setting(' || quote_literal('app.current_org_id') ||
                '::text, true) from ' || quote_literal(uuid_re) || ')::uuid';

    expr := shadow || ' OR (' || quote_ident(col) || ' = ' || resolver || ')'
                   || ' OR (' || quote_ident(col) || ' IS NULL)';

    -- INSERT ('a') carries only WITH CHECK. ALL/UPDATE reaching this loop have
    -- a with-check that still needs converting; their USING side was already
    -- handled by the polqual sweep, so only the with-check is rewritten here.
    IF r.polcmd = 'a' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     r.polname, r.nspname, r.relname, expr);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     r.polname, r.nspname, r.relname, expr);
    END IF;
    fixed := fixed + 1;
  END LOOP;

  RAISE NOTICE '[fail-closed-insert] % write policy(ies) now refuse an unresolved scope.', fixed;
END $$;
