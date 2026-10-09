-- ── audit_logs chain order key (WA, 2026-09-21, VSR-001 finding F-1, row D5) ──
--
-- GET /api/c2c/actions/verify-chain reported the audit_logs sha256 chain broken
-- at a LEAF_CREATED row. Two defects in one recipe, diagnosed on the local
-- database (docs/evidence/WA/2026-09-21/F-1-root-cause.json):
--
--   1. The writer read its predecessor on the CALLER'S connection, and under
--      tenant_isolation_policy that connection sees only its own tenant's rows.
--      Every one of the ten rows the verifier could not derive was the first
--      chained row of its tenant and derives from GENESIS; other rows derive
--      from their tenant's head, or from the global head when the connection
--      was unscoped. The chain was therefore a per-tenant chain or a global
--      chain depending on the connection that wrote each row, while the
--      verifier replayed every tenant's rows as one chain.
--   2. The chain had no order key of its own. The writer picked the head by
--      occurred_at and locked that ROW (`… LIMIT 1 FOR UPDATE`): a second,
--      concurrent writer blocked on the same row lock, then re-read the same,
--      now stale, head and chained to it (fork); and a row whose occurred_at
--      was generated before it obtained the lock could commit BEHIND a row
--      with a later occurred_at, which a replay by (occurred_at, id) walks in
--      the wrong order. Both reproduced by
--      server/services/audit/__tests__/chain-concurrency.dbtest.ts.
--
-- The chain is now explicitly ONE CHAIN PER TENANT (tenant_id), the only shape
-- a tenant-scoped connection can both write and verify without bypassing row
-- level security — the same shape audit_events already has. The writer
-- (server/services/audit/chain.ts) resolves the row's tenant, takes
-- pg_advisory_xact_lock(3116, tenant) for the rest of its transaction, reads
-- that tenant's head, and announces the position it took in the
-- transaction-local GUC app.audit_chain_tenant. This file adds:
--
--   • chain_seq bigint — the chain's order key. Assigned by the BEFORE INSERT
--     trigger below ONLY for rows whose writer announced a position, so a row
--     written by pre-fix code (a rolling deploy, another server on the same
--     database) keeps chain_seq NULL and is verified as a "legacy" row under
--     the recipe it was written with. NO column default, on purpose: a default
--     would number old-recipe rows and present them as ordered.
--   • the trigger, which also refuses a row whose tenant_id differs from the
--     tenant the writer took the position for (fail closed: a wrong-tenant
--     link can never persist), and clears the announcement so one position
--     yields exactly one row.
--   • a UNIQUE index on chain_seq (no two rows at one position), a
--     (tenant_id, chain_seq) index for the head read and the per-tenant walk,
--     and a partial (tenant_id, occurred_at, id) index for the legacy walk.
--
-- Legacy rows (chain_seq NULL) stay exactly as written — audit_logs is
-- append-only (no-update / no-delete triggers) and nothing here backfills or
-- rewrites. The verifier walks them in (occurred_at, id) order and accepts a
-- row that derives from EITHER predecessor its writer could have seen (the
-- tenant's last row or the global last row); every sequenced row is held to
-- exactly one predecessor. See verifyAuditChain in chain.ts.
--
-- Additive and idempotent; re-runs on every deploy (CLAUDE.md Rule 1). No DROP
-- (ci:migration-drop-safety). No new table, so no RLS sweep entry. Ordered
-- after 20260609_audit_hmac_seal.sql, which follows
-- 20260527_mutation_primitives.sql (the file that adds sha256_chain and
-- occurred_at). The ORDER BY clauses in chain.ts are the single chain-order
-- recipe; server/services/audit/__tests__/chain-order.pglite.test.ts applies
-- this file to the shared fixture and proves the writer, the trigger and the
-- verifier agree.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    RAISE NOTICE 'audit_logs not present in this schema; skipping chain order key.';
    RETURN;
  END IF;

  CREATE SEQUENCE IF NOT EXISTS public.audit_logs_chain_seq_seq AS bigint;
  -- No DEFAULT — see the header.
  ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS chain_seq bigint;
  ALTER SEQUENCE public.audit_logs_chain_seq_seq OWNED BY public.audit_logs.chain_seq;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_chain_seq_uidx
  ON public.audit_logs (chain_seq);

CREATE INDEX IF NOT EXISTS audit_logs_tenant_chain_seq_idx
  ON public.audit_logs (tenant_id, chain_seq)
  WHERE sha256_chain IS NOT NULL;

-- The legacy walk: chained rows written before this file, in write order.
CREATE INDEX IF NOT EXISTS audit_logs_legacy_chain_order_idx
  ON public.audit_logs (tenant_id, occurred_at, id)
  WHERE sha256_chain IS NOT NULL AND chain_seq IS NULL;

-- Assign the chain position announced by the writer; refuse a wrong-tenant row.
CREATE OR REPLACE FUNCTION public.audit_logs_chain_position()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  chain_tenant text := NULLIF(current_setting('app.audit_chain_tenant', true), '');
BEGIN
  -- Unchained row, or a writer that took no chain position (pre-fix code):
  -- nothing to assign; the row is a legacy row and chain_seq stays NULL.
  IF NEW.sha256_chain IS NULL OR chain_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  IF chain_tenant <> COALESCE(NEW.tenant_id, 0)::text THEN
    RAISE EXCEPTION
      'audit_logs: chain position was taken for tenant % but the row belongs to tenant %',
      chain_tenant, COALESCE(NEW.tenant_id, 0)
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.chain_seq IS NULL THEN
    NEW.chain_seq := nextval('public.audit_logs_chain_seq_seq');
  END IF;

  -- One position, one row: a second chained INSERT in this transaction must
  -- take a new position (the writer reads the head again) or it is legacy.
  PERFORM set_config('app.audit_chain_tenant', '', true);
  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_audit_logs_chain_position'
       AND tgrelid = 'public.audit_logs'::regclass
  ) THEN
    CREATE TRIGGER trg_audit_logs_chain_position
      BEFORE INSERT ON public.audit_logs
      FOR EACH ROW EXECUTE FUNCTION public.audit_logs_chain_position();
  END IF;
END $$;
