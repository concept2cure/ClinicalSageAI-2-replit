-- =============================================================================
-- 20261029j — no session setting lifts row-level security (P-70, D6)
-- =============================================================================
-- Evidence: docs/evidence/D6-NO-SESSION-RLS-BYPASS/2026-10-29/
--
-- ── What was open ────────────────────────────────────────────────────────────
-- app.bypass_rls and app.is_admin are custom settings, and PostgreSQL lets any
-- role set a custom setting. So the runtime role could switch tenant isolation
-- off from inside its own connection: as app_service in tenant A's scope,
-- `SET app.bypass_rls = 'true'` read and updated tenant B's Vault version
-- (red.txt). The readers, on a database built by install-fresh + deploy-migrate:
--
--   - identity.can_access_org, can_write_org, can_access_program and
--     can_write_program (SECURITY DEFINER) returned TRUE first thing when
--     app.bypass_rls was 'true'. 146 policies on 69 tables in 12 schemas decide
--     through them (through core.can_access_program / can_write_program for the
--     Vault), vault.documents, signing.signatures and ectd_v4 among them, and
--     none of those policies has any other arm. Their creators,
--     db/migrations/053_gcc_rls_policies.sql and
--     069_gcc_multitenant_rls_expansion.sql, run on install-fresh only and are
--     amended in place the same day; no file of this set redefines them, so a
--     database installed before today keeps the bypass until this file runs.
--   - Three policies read app.is_admin. federated_admin
--     (cortex.federated_learning_state) and guidance_docs_admin
--     (innovation.guidance_documents) are that switch and nothing else;
--     workspace_analytics_policy (innovation.workspace_analytics) is the user's
--     own rows OR the switch. Their creators, 072_gcc_innovation_platform_core.sql
--     and 077_gcc_self_evolving_intelligence.sql, run on install-fresh only and
--     are amended in place the same day.
--   - Sixteen policies read app.bypass_rls directly (evidence.*, intelligent_docs.*,
--     predicate.*). Their creators are in this set, before this file, and amend
--     themselves in place.
--
-- ── What this does ──────────────────────────────────────────────────────────
--   - Each helper whose stored body still reads app.bypass_rls is re-created
--     from its own stored definition with that one IF block (and the comment
--     above it) removed, so whatever else the database's version holds is
--     kept. CREATE OR REPLACE keeps the signature, SECURITY DEFINER, the pinned
--     search_path, the owner and the grants, so the definer allowlist entries
--     (scripts/db/security-definer-allowlist.json) still name them. A body the
--     edit cannot clean fails the deploy rather than keep the bypass.
--   - federated_admin and guidance_docs_admin are dropped, and
--     workspace_analytics_policy is altered to its own-rows arm, each only while
--     its stored expression reads app.is_admin. The drop is replay-safe
--     (CLAUDE.md Rule 1): no file on any applier creates either policy any
--     more (072 and 077 are amended), so nothing re-creates them. No server
--     code reads or writes either table.
--   - No term is replaced by a "platform scope". The scope the purge doors
--     require is itself two session settings (app.rls_enforce not 'on', or
--     app.current_user_role = 'app_super_admin'), and the Vault has no platform
--     arm by design (20260926_vault_documents_record_immutability.sql): the
--     purge reaches it through its doors, which run as their owner and erase
--     inside the purged organization's own scope.
--   - Last, the deploy fails if any policy, or any function outside
--     pg_catalog, still reads either setting.
--
-- Creates no table, column or constraint. Replays: every step is conditional
-- on the stored text, so a second run changes nothing (green.txt).
-- =============================================================================

DO $no_session_bypass$
DECLARE
  v_fn text;
  v_def text;
  v_new text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'identity.can_access_org(uuid)',
    'identity.can_write_org(uuid)',
    'identity.can_access_program(uuid)',
    'identity.can_write_program(uuid)'
  ] LOOP
    CONTINUE WHEN to_regprocedure(v_fn) IS NULL;
    CONTINUE WHEN position('bypass_rls' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure(v_fn))) = 0;
    v_def := pg_get_functiondef(to_regprocedure(v_fn));
    -- The block as 053 and 069 wrote it: an optional "-- System/admin bypass"
    -- comment line, then IF current_setting(<the bypass>, TRUE) = 'true' THEN
    -- RETURN TRUE; END IF;
    v_new := regexp_replace(
      v_def,
      '([ \t]*--[^\n]*bypass[^\n]*\n)?[ \t]*IF\s+current_setting\([^)]*bypass_rls[^)]*\)\s*=\s*''true''\s+THEN\s+RETURN\s+TRUE;\s*END\s+IF;[ \t]*\n',
      '',
      'gi');
    IF position('bypass_rls' IN v_new) > 0 THEN
      RAISE EXCEPTION 'P-70: % still reads app.bypass_rls after the edit; its stored body is not the shape 053/069 wrote. Replace it by hand.', v_fn;
    END IF;
    EXECUTE v_new;
  END LOOP;

  IF to_regclass('cortex.federated_learning_state') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = to_regclass('cortex.federated_learning_state') AND polname = 'federated_admin'
                    AND coalesce(pg_get_expr(polqual, polrelid), '') LIKE '%app.is_admin%') THEN
    DROP POLICY federated_admin ON cortex.federated_learning_state;
  END IF;

  IF to_regclass('innovation.guidance_documents') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = to_regclass('innovation.guidance_documents') AND polname = 'guidance_docs_admin'
                    AND coalesce(pg_get_expr(polqual, polrelid), '') LIKE '%app.is_admin%') THEN
    DROP POLICY guidance_docs_admin ON innovation.guidance_documents;
  END IF;

  IF to_regclass('innovation.workspace_analytics') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = to_regclass('innovation.workspace_analytics') AND polname = 'workspace_analytics_policy'
                    AND coalesce(pg_get_expr(polqual, polrelid), '') LIKE '%app.is_admin%') THEN
    ALTER POLICY workspace_analytics_policy ON innovation.workspace_analytics
      USING (user_id::text = current_setting('app.current_user_id', true));
  END IF;
END
$no_session_bypass$;

-- Fail the deploy on any reader left, whatever created it.
DO $no_session_bypass_assert$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(r, ', ' ORDER BY r) INTO v_left FROM (
    SELECT format('policy %s on %s', pol.polname, pol.polrelid::regclass) AS r
      FROM pg_policy pol
     WHERE coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'app\.(bypass_rls|is_admin)'
    UNION ALL
    SELECT format('function %s', p.oid::regprocedure)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'c')
       AND p.prosrc ~ 'app\.(bypass_rls|is_admin)'
  ) readers;
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'P-70: a session setting still lifts row-level security here: %', v_left
      USING HINT = 'docs/evidence/D6-NO-SESSION-RLS-BYPASS/2026-10-29/README.md; remove the term in the creating file (CLAUDE.md Rule 1).';
  END IF;
END
$no_session_bypass_assert$;
