-- ═══════════════════════════════════════════════════════════════════════════
-- Five columns the application WRITES that no migration ever creates.
--
-- Same class as GA ledger L38 (concept2cure_artifact_versions.updated_at) and
-- L30: shared/schema.ts declares the column, drizzle-push (install-fresh)
-- therefore creates it, and a database built from migrations alone does not
-- have it — so the INSERT fails with 42703 on exactly the long-lived
-- deployments. Found by diffing a freshly pushed database against every column
-- the migration files create, then keeping only the columns a raw INSERT in
-- server/ actually names. Each was then confirmed by hand against the
-- migration that creates its table.
--
--   concept2cure_signatures.created_at, .updated_at
--       written by server/services/ana/verifiedSealService.ts and
--       submission-chat-apply-rewrite.ts. Part 11 electronic signatures.
--   regulatory_audit_logs.created_at, .updated_at
--       written by the same two. The audit trail beside those signatures.
--   concept2cure_submission_snapshots.updated_at
--       written by server/services/compute/exportGovernance.ts.
--
-- NOT INCLUDED, and worth recording because the first version of this migration
-- got it wrong: knowledge_graph_nodes.organization_id and
-- knowledge_graph_edges.organization_id. The detection above reported them as
-- uncreated because 20260730_graphrag_knowledge_tables.sql really does create
-- those tables without the column — but
-- db/migrations/20260813_knowledge_graph_tenant_keys.sql adds it afterwards,
-- inside a DO block, as
--     EXECUTE format('ALTER TABLE public.%I ADD COLUMN organization_id INTEGER', t)
-- so the column name lives in a format string and no textual scan for
-- "ADD COLUMN organization_id" can see it. That migration is on the deploy path.
-- The lesson generalises: a migration set that builds DDL dynamically cannot be
-- audited by grep alone, and any column this method flags has to be confirmed
-- by hand before it is acted on.
--
-- Types, nullability and defaults are read from a pushed database and
-- reproduced exactly, so both provisioning paths converge on one shape rather
-- than merely on one column name. created_at is NOT NULL DEFAULT now() on the
-- two audit/signature tables, matching the model; the rest are nullable.
--
-- Backfill note: organization_id is added NULLABLE with no default, exactly as
-- the model has it. Existing rows on a migration-provisioned database keep a
-- NULL tenant — which the canonical policies treat as shared/unattributed
-- rather than as belonging to anyone. Assigning them an owner is a data
-- decision that needs someone who knows whose rows they are; inventing one here
-- would be a fabricated attribution in a governed store.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  spec   record;
  added  int := 0;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('concept2cure_signatures',           'created_at',      'timestamp NOT NULL DEFAULT now()'),
      ('concept2cure_signatures',           'updated_at',      'timestamp DEFAULT now()'),
      ('regulatory_audit_logs',             'created_at',      'timestamp NOT NULL DEFAULT now()'),
      ('regulatory_audit_logs',             'updated_at',      'timestamp DEFAULT now()'),
      ('concept2cure_submission_snapshots', 'updated_at',      'timestamp DEFAULT now()')
    ) AS t(tbl, col, definition)
  LOOP
    IF to_regclass('public.' || spec.tbl) IS NULL THEN
      CONTINUE; -- table not provisioned on this database; nothing to align
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = spec.tbl
         AND column_name  = spec.col
    ) THEN
      CONTINUE; -- already aligned (a pushed database, or a re-run)
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s',
                   spec.tbl, spec.col, spec.definition);
    RAISE NOTICE '[column-align] added %.% ', spec.tbl, spec.col;
    added := added + 1;
  END LOOP;

  RAISE NOTICE '[column-align] % column(s) added to match shared/schema.ts.', added;
END $$;
