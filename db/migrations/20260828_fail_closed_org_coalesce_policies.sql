-- ═══════════════════════════════════════════════════════════════════════════
-- Make 46 tenant policies FAIL CLOSED. They currently fail OPEN.
--
-- The shape, as PostgreSQL renders it:
--
--     (org_id = COALESCE(identity.current_org_id(), org_id))
--     (org_id = COALESCE(("substring"(current_setting('app.current_org_id', true),
--                        '^…uuid…$'))::uuid, org_id)) OR (org_id IS NULL)
--
-- The regex extraction is a correct CAST guard — it cannot raise 22P02 on an
-- empty GUC, unlike the bare `::uuid` that 20260821_uuid_org_guc_cast_heal.sql
-- defused. But the COALESCE turns a failed match into the row's OWN org_id, so
-- the predicate collapses to `org_id = org_id`, which is TRUE for every row in
-- the table. The guard and the failure mode are inverted: a scope that cannot
-- be resolved grants EVERYTHING instead of nothing.
--
-- ── Measured, not reasoned ─────────────────────────────────────────────────
-- Two rows seeded in cortex.knowledge_gaps under different org_ids, read as the
-- non-superuser app_service role with app.rls_enforce=on:
--
--     app.current_org_id unset            -> 2 rows  (BOTH tenants)
--     app.current_org_id = <tenant A uuid> -> 1 row   (correct)
--     app.current_org_id = '42'            -> 2 rows  (BOTH tenants)
--
-- Both failing cases are reachable. server/middleware/establishRequestTenantScope.ts
-- sets the GUC as `orgUuid ?? ''` — an identity with no org uuid writes the
-- empty string — and '42' is precisely what an INTEGER org id looks like when
-- it reaches a UUID-keyed schema. Note the contrast with the fail-closed helper
-- these policies bypass: identity.can_access_org() begins
-- `IF v_current_org_id IS NULL THEN RETURN FALSE`.
--
-- ── The change ─────────────────────────────────────────────────────────────
-- Drop the COALESCE fallback and keep the resolver alone. An unresolved scope
-- is then NULL, `org_id = NULL` is NULL, and NULL is not TRUE — no rows. Same
-- predicate for a scope that resolves, so a correctly scoped read is unchanged.
--
-- `OR (org_id IS NULL)` is deliberately LEFT ALONE. Those are unattributed
-- rows, treated as shared reference data; whether that is right is a separate
-- product decision with its own blast radius, and widening this migration to
-- take it would mix a security fix with a behaviour change.
--
-- Rewrites the rendered expression by exact substring replacement (five shapes,
-- all machine-generated) rather than by policy name, so it repairs whatever the
-- policy is called. Idempotent: once the COALESCE is gone nothing matches.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uuid_re  CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  r         record;
  col       text;
  resolver  text;
  shadow    text;
  expr      text;
  fixed     int := 0;
BEGIN
  -- Same shadow clause the 793 public-schema policies already carry: when
  -- app.rls_enforce is not 'on', the policy does not filter.
  shadow := '(NULLIF(current_setting(' || quote_literal('app.rls_enforce') ||
            '::text, true), ' || quote_literal('') || '::text) IS DISTINCT FROM ' ||
            quote_literal('on') || '::text)';

  FOR r IN
    SELECT p.polname, p.polrelid, p.polcmd, n.nspname, c.relname
      FROM pg_policy p
      JOIN pg_class c     ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     -- BOTH expressions, not just USING. An INSERT policy (polcmd='a') has a
     -- WITH CHECK and NO qual at all, so a filter that reads only polqual skips
     -- it entirely — which is how cortex.learning_experiences::learning_exp_write
     -- survived the first pass of this migration and was caught only by
     -- provisioning a blank database and running deploy-smoke-assert against it.
     -- A fail-open WITH CHECK is the worse half of the pair: it lets an
     -- unscoped caller INSERT rows under ANY tenant's org_id.
     WHERE (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
            COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ 'current_org_id'
       AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
            COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) !~ 'app\.rls_enforce'
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
      RAISE NOTICE '[fail-closed] %.% has no tenant column - left unchanged.', r.nspname, r.relname;
      CONTINUE;
    END IF;

    -- Inline rather than identity.current_org_id(): this runs on the deploy
    -- path, where the governed-content tree defining that function is not
    -- applied. Same reasoning the non-public sweep already documents.
    resolver := 'substring(current_setting(' || quote_literal('app.current_org_id') ||
                '::text, true) from ' || quote_literal(uuid_re) || ')::uuid';

    expr := shadow || ' OR (' || quote_ident(col) || ' = ' || resolver || ')'
                   || ' OR (' || quote_ident(col) || ' IS NULL)';

    -- SELECT and DELETE accept only USING; INSERT accepts only WITH CHECK;
    -- ALL and UPDATE accept both. Getting this wrong aborts the whole sweep.
    IF r.polcmd IN ('r', 'd') THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                     r.polname, r.nspname, r.relname, expr);
    ELSIF r.polcmd = 'a' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     r.polname, r.nspname, r.relname, expr);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
                     r.polname, r.nspname, r.relname, expr, expr);
    END IF;
    fixed := fixed + 1;
  END LOOP;

  RAISE NOTICE '[fail-closed] % non-public tenant policy(ies) now filter strictly under app.rls_enforce=on.', fixed;
END $$;
