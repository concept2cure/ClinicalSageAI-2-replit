-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Only a sponsor may grant, change or revoke delegate access to its
--          own programs; a delegate may read the grants that name it.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (vault document store backing all modules)
--   - Integrity Risk Addressed: tenant isolation — any tenant could write itself
--     a delegation from another tenant and read and overwrite that tenant's
--     vault documents
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No table shape change; RLS and policies only. Idempotent.
--
-- Notes:
--   - Row D3, 2026-09-24. Evidence:
--     docs/evidence/D3/2026-09-24-vault-program-ownership/.
-- =============================================================================
--
-- identity.org_relationships is the sponsor → delegate grant table (a CRO
-- working a sponsor's submissions). identity.can_access_program and
-- identity.can_write_program — which every vault.documents and
-- vault.document_chunks policy reaches through core.can_access_program /
-- core.can_write_program — grant access to a program when a live row names the
-- program's owner as sponsor and the current org as delegate.
--
-- The table was created by 051_gcc_multi_tenant_identity.sql with no RLS, and
-- the runtime role may INSERT and UPDATE it. Measured as app_service with
-- app.rls_enforce=on in tenant A's scope: one INSERT naming B as sponsor and A
-- as delegate let A read B's vault documents and rewrite their titles, while B's
-- own view showed the rewritten rows as if nothing had happened. A delegate
-- could also UPDATE a read-only grant it had been given to read-write.
--
-- The rule this states: a grant is the sponsor's to make. So
--   - SELECT: the sponsor and the delegate each see the rows naming them;
--   - INSERT, UPDATE, DELETE: the sponsor only, and an UPDATE cannot hand the
--     row to another sponsor (WITH CHECK).
-- No application code writes this table, so no writer is narrowed by this.
--
-- The authorization functions are SECURITY DEFINER and read this table as
-- their owner. Under FORCE a non-superuser owner is subject to these policies
-- too; that is correct, because the only rows those functions look for name the
-- current org as delegate, which SELECT allows.
--
-- Shape: the same app.rls_enforce shadow clause and extracted (not cast) org
-- GUC as 20260801_uuid_tenant_isolation_nonpublic.sql, which cannot express a
-- two-key rule — that sweep takes one tenant column per table. Converges on
-- every run: ALTER POLICY when the policy exists, CREATE when it does not, so a
-- re-run corrects a hand-edited policy instead of skipping it, and nothing is
-- dropped (Rule 1).

DO $$
DECLARE
  cur  CONSTANT text :=
    $e$substring(current_setting('app.current_org_id', true) from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')::uuid$e$;
  off  CONSTANT text :=
    $e$(NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on')$e$;
  sponsor_only text;
  either_party text;
  p RECORD;
BEGIN
  IF to_regclass('identity.org_relationships') IS NULL THEN
    RAISE NOTICE '[org-relationships-rls] skipped — identity.org_relationships not provisioned';
    RETURN;
  END IF;

  sponsor_only := format('(%s OR sponsor_org_id = %s)', off, cur);
  either_party := format('(%s OR sponsor_org_id = %s OR delegate_org_id = %s)', off, cur, cur);

  ALTER TABLE identity.org_relationships ENABLE ROW LEVEL SECURITY;
  ALTER TABLE identity.org_relationships FORCE ROW LEVEL SECURITY;

  FOR p IN
    SELECT * FROM (VALUES
      ('org_relationships_party_read',    'SELECT', either_party, NULL),
      ('org_relationships_sponsor_insert','INSERT', NULL,         sponsor_only),
      ('org_relationships_sponsor_update','UPDATE', sponsor_only, sponsor_only),
      ('org_relationships_sponsor_delete','DELETE', sponsor_only, NULL)
    ) AS v(name, cmd, using_expr, check_expr)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'identity' AND tablename = 'org_relationships' AND policyname = p.name
    ) THEN
      EXECUTE format('ALTER POLICY %I ON identity.org_relationships%s%s', p.name,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    ELSE
      EXECUTE format('CREATE POLICY %I ON identity.org_relationships FOR %s%s%s', p.name, p.cmd,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    END IF;
  END LOOP;

  RAISE NOTICE '[org-relationships-rls] identity.org_relationships: sponsor writes, parties read';
END
$$;
