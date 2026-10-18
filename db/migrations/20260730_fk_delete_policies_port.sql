-- 2026-09-25 AMENDED IN PLACE (W2 / D1, docs/evidence/W2/2026-09-25-replay-rebuilds-nothing/):
-- client_workspaces_organization_id_organizations_id_fk, connector_credentials_organization_id_organizations_id_fk, supply_chain_suppliers_organization_id_organizations_id_fk, supply_chain_materials_organization_id_organizations_id_fk, supply_chain_batches_organization_id_organizations_id_fk are now replaced only when the live definition
-- (pg_get_constraintdef) differs from the one below. Unconditional, every deploy dropped
-- and re-added them — a full validation scan under lock (ACCESS EXCLUSIVE for a CHECK;
-- writes blocked on child and parent for a FOREIGN KEY) while the application served.
-- The definitions are unchanged. Pinned by npm run ci:replay-rebuilds-nothing.
-- ============================================================================
-- 20260730_fk_delete_policies_port.sql
--
-- Guarded port of migrations/0008_critical_fk_delete_policies.sql, from the
-- blank-DB provisioning audit 2026-07-30.
--
-- WHY THE PORT EXISTS. 0008 applies 18 ALTERs in one transaction, and its
-- FIRST pair targets user_sessions — a table nothing creates anymore (zero
-- server references; retired). On every fresh install the whole file
-- therefore aborts at statement one, and the SIXTEEN live FK delete-policies
-- behind it (sharepoint chunk/embedding/qa cascades, connector-credential,
-- client-workspace, and supply-chain org cascades) never land. This port
-- carries the same statements with each pair guarded on its child table, so
-- the retired table skips cleanly and every live policy applies. 0008 itself
-- is a historical record and is not modified; the fresh-install path
-- classifies it as superseded by this file.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD inside a to_regclass guard —
-- re-running re-asserts the same policy.
--
-- AMENDED IN PLACE 2026-10-05: connector_credentials was referenced by this
-- registered migration, but its only CREATE TABLE lived outside every deploy
-- path. Add the canonical per-organization credential store here, before the
-- FK convergence below. Credentials are application-encrypted ciphertext; the
-- table has tenant RLS now and is also reached by the final migration-set
-- tenant sweep because organization_id is a required public integer key.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.connector_credentials (
  id                SERIAL PRIMARY KEY,
  organization_id   INTEGER NOT NULL,
  connector_id      TEXT NOT NULL,
  credentials       TEXT NOT NULL,
  is_valid          BOOLEAN DEFAULT TRUE,
  last_validated_at TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT connector_credentials_organization_id_organizations_id_fk
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT connector_credentials_org_connector_unique
    UNIQUE (organization_id, connector_id)
);

ALTER TABLE public.connector_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_credentials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON public.connector_credentials;
CREATE POLICY tenant_isolation_policy ON public.connector_credentials
  FOR ALL
  USING (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
    OR organization_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INTEGER
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  )
  WITH CHECK (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
    OR organization_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INTEGER
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  );

DO $$
BEGIN
  -- SESSION / AUTH: cascade (sessions are transient). Table retired — the
  -- guard is what makes this a clean no-op rather than a file-aborting error.
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_users_id_fk;
    ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- DOCUMENTS / VERSIONS: deleting a sharepoint file deletes its derivatives.
  IF to_regclass('public.sharepoint_chunks') IS NOT NULL
     AND to_regclass('public.sharepoint_files') IS NOT NULL THEN
    ALTER TABLE sharepoint_chunks DROP CONSTRAINT IF EXISTS sharepoint_chunks_file_id_sharepoint_files_id_fk;
    ALTER TABLE sharepoint_chunks ADD CONSTRAINT sharepoint_chunks_file_id_sharepoint_files_id_fk
      FOREIGN KEY (file_id) REFERENCES sharepoint_files(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.sharepoint_embeddings') IS NOT NULL
     AND to_regclass('public.sharepoint_files') IS NOT NULL THEN
    ALTER TABLE sharepoint_embeddings DROP CONSTRAINT IF EXISTS sharepoint_embeddings_file_id_sharepoint_files_id_fk;
    ALTER TABLE sharepoint_embeddings ADD CONSTRAINT sharepoint_embeddings_file_id_sharepoint_files_id_fk
      FOREIGN KEY (file_id) REFERENCES sharepoint_files(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.sharepoint_qa_pairs') IS NOT NULL
     AND to_regclass('public.sharepoint_files') IS NOT NULL THEN
    ALTER TABLE sharepoint_qa_pairs DROP CONSTRAINT IF EXISTS sharepoint_qa_pairs_file_id_sharepoint_files_id_fk;
    ALTER TABLE sharepoint_qa_pairs ADD CONSTRAINT sharepoint_qa_pairs_file_id_sharepoint_files_id_fk
      FOREIGN KEY (file_id) REFERENCES sharepoint_files(id) ON DELETE CASCADE;
  END IF;

  -- CONNECTOR CREDENTIALS: cascade on organization deletion.
  IF to_regclass('public.connector_credentials') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.connector_credentials'::regclass AND conname = 'connector_credentials_organization_id_organizations_id_fk'
         AND pg_get_constraintdef(oid) = $def$FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE$def$
  ) THEN
    ALTER TABLE connector_credentials DROP CONSTRAINT IF EXISTS connector_credentials_organization_id_organizations_id_fk;
    ALTER TABLE connector_credentials ADD CONSTRAINT connector_credentials_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  -- CLIENT WORKSPACES: cascade on organization deletion.
  IF to_regclass('public.client_workspaces') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.client_workspaces'::regclass AND conname = 'client_workspaces_organization_id_organizations_id_fk'
         AND pg_get_constraintdef(oid) = $def$FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE$def$
  ) THEN
    ALTER TABLE client_workspaces DROP CONSTRAINT IF EXISTS client_workspaces_organization_id_organizations_id_fk;
    ALTER TABLE client_workspaces ADD CONSTRAINT client_workspaces_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  -- SUPPLY CHAIN: cascade on organization deletion.
  IF to_regclass('public.supply_chain_suppliers') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.supply_chain_suppliers'::regclass AND conname = 'supply_chain_suppliers_organization_id_organizations_id_fk'
         AND pg_get_constraintdef(oid) = $def$FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE$def$
  ) THEN
    ALTER TABLE supply_chain_suppliers DROP CONSTRAINT IF EXISTS supply_chain_suppliers_organization_id_organizations_id_fk;
    ALTER TABLE supply_chain_suppliers ADD CONSTRAINT supply_chain_suppliers_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.supply_chain_materials') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.supply_chain_materials'::regclass AND conname = 'supply_chain_materials_organization_id_organizations_id_fk'
         AND pg_get_constraintdef(oid) = $def$FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE$def$
  ) THEN
    ALTER TABLE supply_chain_materials DROP CONSTRAINT IF EXISTS supply_chain_materials_organization_id_organizations_id_fk;
    ALTER TABLE supply_chain_materials ADD CONSTRAINT supply_chain_materials_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.supply_chain_batches') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.supply_chain_batches'::regclass AND conname = 'supply_chain_batches_organization_id_organizations_id_fk'
         AND pg_get_constraintdef(oid) = $def$FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE$def$
  ) THEN
    ALTER TABLE supply_chain_batches DROP CONSTRAINT IF EXISTS supply_chain_batches_organization_id_organizations_id_fk;
    ALTER TABLE supply_chain_batches ADD CONSTRAINT supply_chain_batches_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;
