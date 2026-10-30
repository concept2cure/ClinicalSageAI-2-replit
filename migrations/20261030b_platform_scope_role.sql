-- =============================================================================
-- 20261030b — platform scope is a role: the pre-auth lookups (P-72 slice 1a)
-- =============================================================================
-- Rows D1 (the deploy) and D6 (tenant isolation). Decision P-72
-- (docs/LAUNCH_DEFINITION_OF_DONE.md, "### P-72" and its amendment). Design:
-- docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md, §1, §3.5 and §4.2. This
-- is the design's converge file; its later slices extend it in place.
-- Evidence: docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/
--
-- ── What was open ────────────────────────────────────────────────────────────
-- Three SECURITY DEFINER functions entered the platform scope through a SET
-- clause, `SET app.current_user_role = 'app_super_admin'`, stored in
-- pg_proc.proconfig:
--   - public.user_id_for_email(text) and public.user_id_for_reset_token(text)
--     (migrations/20260928_users_membership_rls.sql), the sign-in and
--     password-reset lookups;
--   - public.invitations_for_member(integer)
--     (migrations/20260928_invitations_for_member.sql).
-- PostgreSQL 15 and later refuse a SET clause that names a custom setting to
-- any creator that is not a superuser ("permission denied to set parameter").
-- So deploy-migrate halted at migrations/20260928_users_membership_rls.sql when
-- its applier was the RDS master, a CREATEROLE non-superuser: measured in slice
-- 0 (docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-0/item1-deploy-replay.txt)
-- and again, red then green, in slice 1a. CI's applier is a superuser and never
-- showed it. P-70's assertion (20261029j) reads function bodies (prosrc), not
-- proconfig, and did not see the three either. Their creators are amended in
-- place the same day: no SET clause, and the policies the three read admit
-- their new owner.
--
-- ── What this does ───────────────────────────────────────────────────────────
--   1. Creates the NOLOGIN role c2c_platform_scope if it is absent. It refuses
--      a role that already exists with any attribute beyond NOLOGIN NOINHERIT.
--      It makes a non-superuser applier a member with the privileges of the
--      role (INHERIT) and, on PostgreSQL 16+, the SET option: ALTER FUNCTION …
--      OWNER TO needs SET (membership on 15), and the creating files' CREATE OR
--      REPLACE on the next deploy needs the owner's privileges. It is the
--      installer idiom of 20261008f and 20261029k. Nothing grants the role to
--      the runtime role, and step 4 fails the deploy if anything has.
--   2. Re-creates each of the three whose stored SET clause still names a
--      custom setting from its own stored definition, with that clause
--      removed, as 20261029j re-creates the identity helpers. The creating
--      files already do this on every run (CREATE OR REPLACE), so this step
--      acts only on a database whose creator skipped. CREATE OR REPLACE keeps
--      the signature, SECURITY DEFINER, the pinned search_path, the owner and
--      the grants, so the definer allowlist entries
--      (scripts/db/security-definer-allowlist.json) still name them. A
--      definition the edit cannot clean fails the deploy.
--   3. Grants c2c_platform_scope SELECT on only the columns the three read and
--      their policies test, and hands the three to it. CREATE on schema public
--      is held only for the hand-off (a non-superuser may give a function to a
--      role only when that role may create in its schema) and revoked after
--      it. The policies the three read admit CURRENT_USER = 'c2c_platform_scope'
--      (the creating files). CURRENT_USER is that role only inside a SECURITY
--      DEFINER function it owns, so no session can set it, and nothing else
--      passes the arm. Every run first checks that those policies admit the
--      role, and fails the deploy if one does not: owned by the role without
--      the arm, the lookups answer NULL and sign-in finds no account.
--   4. Fails the deploy, naming each offender:
--      - if any function outside pg_catalog and information_schema, other than
--        an extension's own, names a custom setting in its SET clause, whatever
--        created it;
--      - if a function c2c_platform_scope owns is not SECURITY DEFINER, has no
--        pinned search_path, or is executable by PUBLIC;
--      - if c2c_platform_scope itself still holds CREATE on schema public;
--      - if the runtime role app_service is a member of c2c_platform_scope by
--        any path.
--
-- Creates no table, column, constraint or policy. Every step is conditional on
-- the stored state, so a second run changes nothing.
-- =============================================================================

-- ── 1. The role ──────────────────────────────────────────────────────────────
DO $platform_scope_role$
DECLARE
  v_role  record;
  v_super boolean;
  v_pg16  constant boolean := current_setting('server_version_num')::int >= 160000;
BEGIN
  -- Roles are cluster-wide and this file re-runs on every deploy: never a plain CREATE ROLE.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'c2c_platform_scope') THEN
    CREATE ROLE c2c_platform_scope
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;
  SELECT * INTO v_role FROM pg_roles WHERE rolname = 'c2c_platform_scope';
  IF v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb OR v_role.rolcreaterole
     OR v_role.rolinherit OR v_role.rolbypassrls OR v_role.rolreplication THEN
    RAISE EXCEPTION 'P-72: role c2c_platform_scope exists with attributes beyond NOLOGIN NOINHERIT (login %, superuser %, createdb %, createrole %, inherit %, bypassrls %, replication %)',
      v_role.rolcanlogin, v_role.rolsuper, v_role.rolcreatedb, v_role.rolcreaterole,
      v_role.rolinherit, v_role.rolbypassrls, v_role.rolreplication
      USING HINT = 'Have a superuser run: ALTER ROLE c2c_platform_scope NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION; then re-run the migration set.';
  END IF;

  -- A non-superuser applier (the RDS master) must be able to hand the functions
  -- to the role and, on the next deploy, replace them as their owner: ask
  -- first, grant itself what it lacks if it can, otherwise fail closed with the
  -- remedy. A superuser needs neither.
  -- CASE, not OR, around the SET test: PostgreSQL 15 (production's version) has no
  -- 'SET' privilege type, and OR does not promise to evaluate left to right.
  SELECT rolsuper INTO v_super FROM pg_roles WHERE rolname = current_user;
  IF COALESCE(v_super, false)
     OR (pg_has_role(current_user, 'c2c_platform_scope', 'USAGE')
         AND CASE WHEN v_pg16 THEN pg_has_role(current_user, 'c2c_platform_scope', 'SET') ELSE true END) THEN
    RETURN;
  END IF;
  BEGIN
    IF v_pg16 THEN
      EXECUTE format('GRANT c2c_platform_scope TO %I WITH INHERIT TRUE, SET TRUE', current_user);
    ELSE
      EXECUTE format('GRANT c2c_platform_scope TO %I', current_user);
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION '[platform_scope_role] % cannot become a member of c2c_platform_scope and so cannot hand the pre-auth lookups to it', current_user
      USING HINT = format('Have a superuser run: GRANT c2c_platform_scope TO %I; then re-run the migration set.', current_user);
  END;
  IF NOT (pg_has_role(current_user, 'c2c_platform_scope', 'USAGE')
          AND CASE WHEN v_pg16 THEN pg_has_role(current_user, 'c2c_platform_scope', 'SET') ELSE true END) THEN
    RAISE EXCEPTION '[platform_scope_role] % is a member of c2c_platform_scope without its privileges (INHERIT) or the SET option', current_user
      USING HINT = format('Have a superuser run: GRANT c2c_platform_scope TO %I%s; on PostgreSQL 15 the applier role itself must be INHERIT. Then re-run the migration set.',
                          current_user, CASE WHEN v_pg16 THEN ' WITH INHERIT TRUE, SET TRUE' ELSE '' END);
  END IF;
END
$platform_scope_role$;

-- ── 2. No custom setting in a stored SET clause ──────────────────────────────
DO $platform_scope_lookups$
DECLARE
  v_fn  text;
  v_def text;
  v_new text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.user_id_for_email(text)',
    'public.user_id_for_reset_token(text)',
    'public.invitations_for_member(integer)'
  ] LOOP
    CONTINUE WHEN to_regprocedure(v_fn) IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p CROSS JOIN LATERAL unnest(p.proconfig) AS c(setting)
       WHERE p.oid = to_regprocedure(v_fn) AND split_part(c.setting, '=', 1) LIKE '%.%');
    v_def := pg_get_functiondef(to_regprocedure(v_fn));
    -- pg_get_functiondef writes each SET clause on its own line, a custom
    -- setting's name double-quoted for its dot: ` SET "app.x" TO 'value'`.
    v_new := regexp_replace(v_def, '\n[ \t]*SET[ \t]+"[^"\n]*\.[^"\n]*"[ \t]+TO[ \t]+[^\n]*', '', 'g');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'P-72: % names a custom setting in its SET clause and its stored definition is not the shape pg_get_functiondef writes; replace it by hand.', v_fn;
    END IF;
    EXECUTE v_new;
    IF EXISTS (
      SELECT 1 FROM pg_proc p CROSS JOIN LATERAL unnest(p.proconfig) AS c(setting)
       WHERE p.oid = to_regprocedure(v_fn) AND split_part(c.setting, '=', 1) LIKE '%.%') THEN
      RAISE EXCEPTION 'P-72: % still names a custom setting in its SET clause after the edit; replace it by hand.', v_fn;
    END IF;
    RAISE NOTICE '[platform_scope_role] % re-created without its custom SET clause', v_fn;
  END LOOP;
END
$platform_scope_lookups$;

-- ── 3. What the role reads, and the three handed to it ───────────────────────
DO $platform_scope_lookups_owner$
DECLARE
  v_owner   oid := (SELECT oid FROM pg_roles WHERE rolname = 'c2c_platform_scope');
  v_fn      text;
  v_cols    text;
  v_missing text;
  v_grant   record;
  v_handoff regprocedure[];
BEGIN
  GRANT USAGE ON SCHEMA public TO c2c_platform_scope;
  -- Column by column, and only the columns that exist: the lookups' WHERE and
  -- result columns, and the columns their tables' policies test.
  FOR v_grant IN
    SELECT * FROM (VALUES
      ('users',                    ARRAY['id', 'email', 'reset_token']),
      ('organization_users',       ARRAY['user_id', 'organization_id']),
      ('organization_invitations', ARRAY['id', 'organization_id', 'user_id', 'email', 'role', 'status',
                                         'invited_by_id', 'created_at', 'responded_at'])
    ) AS g(tbl, cols)
  LOOP
    CONTINUE WHEN to_regclass('public.' || v_grant.tbl) IS NULL;
    SELECT string_agg(quote_ident(c.column_name::text), ', ' ORDER BY c.ordinal_position) INTO v_cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name::text = v_grant.tbl AND c.column_name::text = ANY (v_grant.cols);
    CONTINUE WHEN v_cols IS NULL;
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO c2c_platform_scope', v_cols, v_grant.tbl);
  END LOOP;
  -- A GRANT by a role without the grant option only warns. Verify instead.
  SELECT string_agg(format('%s.%s', c.table_name, c.column_name), ', ') INTO v_missing
    FROM information_schema.columns c
    JOIN (VALUES ('users', ARRAY['id', 'email', 'reset_token']),
                 ('organization_users', ARRAY['user_id', 'organization_id']),
                 ('organization_invitations', ARRAY['id', 'organization_id', 'user_id', 'email', 'role', 'status',
                                                    'invited_by_id', 'created_at', 'responded_at'])) AS g(tbl, cols)
      ON c.table_schema = 'public' AND c.table_name::text = g.tbl AND c.column_name::text = ANY (g.cols)
   WHERE NOT has_column_privilege('c2c_platform_scope', format('public.%I', c.table_name), c.column_name, 'SELECT');
  IF v_missing IS NOT NULL OR NOT has_schema_privilege('c2c_platform_scope', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'P-72: c2c_platform_scope could not be granted what the pre-auth lookups read (schema public usage %, columns missing: %)',
      has_schema_privilege('c2c_platform_scope', 'public', 'USAGE'), COALESCE(v_missing, 'none')
      USING HINT = 'The applier must own these tables and schema public (on RDS, the master user owns the database). Then re-run the migration set.';
  END IF;

  -- Owned by the role, the lookups read through their tables' policies. Without
  -- a policy that admits the role they answer NULL, silently: sign-in finds no
  -- account (measured, slice 1a). Their creators (20260928_*) add the arm and
  -- run earlier in the set; refuse to hand off, every run, if one is missing.
  SELECT string_agg(format('public.%I', c.relname), ', ') INTO v_missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relname IN ('users', 'organization_users', 'organization_invitations')
     AND c.relrowsecurity
     AND NOT EXISTS (
       SELECT 1 FROM pg_policy p
        WHERE p.polrelid = c.oid AND p.polpermissive AND p.polcmd IN ('r', '*')
          AND (p.polroles = '{0}' OR v_owner = ANY (p.polroles))
          AND (pg_get_expr(p.polqual, p.polrelid) ~ 'c2c_platform_scope'
               OR pg_get_expr(p.polqual, p.polrelid) = 'true'));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'P-72: no read policy on % admits c2c_platform_scope, so the pre-auth lookups it owns would find nothing', v_missing
      USING HINT = 'The creating files (migrations/20260928_users_membership_rls.sql, migrations/20260928_invitations_for_member.sql) add CURRENT_USER = ''c2c_platform_scope'' to those policies and must run before this file.';
  END IF;

  SELECT array_agg(to_regprocedure(f)) INTO v_handoff
    FROM unnest(ARRAY['public.user_id_for_email(text)', 'public.user_id_for_reset_token(text)',
                      'public.invitations_for_member(integer)']) AS f
   WHERE to_regprocedure(f) IS NOT NULL
     AND (SELECT proowner FROM pg_proc WHERE oid = to_regprocedure(f)) IS DISTINCT FROM v_owner;
  IF v_handoff IS NOT NULL THEN
    -- Held for the hand-off only: a non-superuser may give a function to a role
    -- only when that role may create in the function's schema.
    GRANT CREATE ON SCHEMA public TO c2c_platform_scope;
    FOREACH v_fn IN ARRAY v_handoff::text[] LOOP
      EXECUTE format('ALTER FUNCTION %s OWNER TO c2c_platform_scope', v_fn);
      RAISE NOTICE '[platform_scope_role] % now owned by c2c_platform_scope', v_fn;
    END LOOP;
  END IF;
  REVOKE CREATE ON SCHEMA public FROM c2c_platform_scope;
END
$platform_scope_lookups_owner$;

-- ── 4. Fail the deploy on a custom setting in any SET clause, and on a role out of shape ─
DO $platform_scope_assert$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(format('function %s sets %s', p.oid::regprocedure, split_part(c.setting, '=', 1)), '; '
                    ORDER BY p.oid::regprocedure::text)
    INTO v_left
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(p.proconfig) AS c(setting)
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND split_part(c.setting, '=', 1) LIKE '%.%'
     -- An extension's own functions are its installer's, not this set's.
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'P-72: a function''s SET clause names a custom setting: %', v_left
      USING HINT = 'A custom setting in a SET clause enters a scope through a session setting, and PostgreSQL 15+ refuses it to a non-superuser applier (the RDS master). Remove the clause in the creating file (CLAUDE.md Rule 1); a cross-tenant read goes through a definer owned by c2c_platform_scope. docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/README.md';
  END IF;

  SELECT string_agg(format('%s (%s)', p.oid::regprocedure,
                           concat_ws(', ',
                             CASE WHEN NOT p.prosecdef THEN 'not SECURITY DEFINER' END,
                             CASE WHEN NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS c(setting)
                                                    WHERE c.setting LIKE 'search\_path=%')
                                  THEN 'no pinned search_path' END,
                             CASE WHEN p.proacl IS NULL
                                    OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
                                  THEN 'executable by PUBLIC' END)), '; ')
    INTO v_left
    FROM pg_proc p
   WHERE p.proowner = (SELECT oid FROM pg_roles WHERE rolname = 'c2c_platform_scope')
     AND (NOT p.prosecdef
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS c(setting) WHERE c.setting LIKE 'search\_path=%')
          OR p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'));
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'P-72: a function owned by c2c_platform_scope is out of shape: %', v_left
      USING HINT = 'A platform door is SECURITY DEFINER, pins search_path, and is executable only by the roles granted it (REVOKE ALL … FROM PUBLIC). Design §3, (D).';
  END IF;

  -- A grant to the role itself, not CREATE that PUBLIC may hold on an older database.
  IF EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
              WHERE n.nspname = 'public' AND a.privilege_type = 'CREATE'
                AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'c2c_platform_scope')) THEN
    RAISE EXCEPTION 'P-72: c2c_platform_scope holds CREATE on schema public'
      USING HINT = 'The role needs CREATE only while a function is handed to it (step 3). Have the schema owner REVOKE CREATE ON SCHEMA public FROM c2c_platform_scope; then re-run the migration set.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service')
     AND pg_has_role('app_service', 'c2c_platform_scope', 'MEMBER') THEN
    RAISE EXCEPTION 'P-72: the runtime role app_service is a member of c2c_platform_scope'
      USING HINT = 'Platform scope is a role the runtime role cannot become (P-72). Have a superuser REVOKE c2c_platform_scope FROM app_service (and from any role app_service belongs to); then re-run the migration set.';
  END IF;
END
$platform_scope_assert$;
