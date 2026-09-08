-- Parent-scoped isolation delegates must exist — the tooth behind the coverage
-- gate's parent-scope clause (ledger L170).
--
-- scripts/db/rls-coverage-check.sql accepts a SELECT policy delegating to
-- core.can_access_program / core.can_write_program as tenant isolation. That is
-- only true while those functions actually decide something. Their body is:
--
--     IF v_has_identity THEN RETURN identity.can_access_program(p_program_id);
--     ELSIF v_has_auth  THEN RETURN auth.can_access_program(p_program_id);
--     END IF;
--     RETURN TRUE;          -- <<< fail OPEN
--
-- The delegate is looked up at CALL time from pg_proc, so a database that never
-- provisioned identity.* (or that later dropped it) does not error and does not
-- warn: every core.can_access_program call returns TRUE and all twenty-two
-- parent-scoped tables — the vault, labeling, registry, signing, discovery and
-- site_intel — become readable across tenants, while the coverage gate reports
-- full coverage. Nothing asserted this before.
--
-- So: for every core.* parent-scope helper that any live policy depends on, a
-- delegate must exist. Emits one row per unsatisfied helper (empty = sound).
SELECT 'core.' || needed.fn || ' has no identity.* or auth.* delegate — it returns TRUE for every row' AS unsound
FROM (
  SELECT DISTINCT substring(p.qual  from 'can_(?:access|write)_(?:program|org)') AS fn
    FROM pg_policies p
   WHERE p.qual ~ '\mcan_(access|write)_(program|org)\M'
  UNION
  SELECT DISTINCT substring(p.with_check from 'can_(?:access|write)_(?:program|org)')
    FROM pg_policies p
   WHERE p.with_check ~ '\mcan_(access|write)_(program|org)\M'
) AS needed
WHERE needed.fn IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'core' AND p.proname = needed.fn
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('identity', 'auth') AND p.proname = needed.fn
  )
ORDER BY 1;
