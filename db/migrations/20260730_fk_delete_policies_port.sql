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
-- ============================================================================

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
  IF to_regclass('public.connector_credentials') IS NOT NULL THEN
    ALTER TABLE connector_credentials DROP CONSTRAINT IF EXISTS connector_credentials_organization_id_organizations_id_fk;
    ALTER TABLE connector_credentials ADD CONSTRAINT connector_credentials_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  -- CLIENT WORKSPACES: cascade on organization deletion.
  IF to_regclass('public.client_workspaces') IS NOT NULL THEN
    ALTER TABLE client_workspaces DROP CONSTRAINT IF EXISTS client_workspaces_organization_id_organizations_id_fk;
    ALTER TABLE client_workspaces ADD CONSTRAINT client_workspaces_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  -- SUPPLY CHAIN: cascade on organization deletion.
  IF to_regclass('public.supply_chain_suppliers') IS NOT NULL THEN
    ALTER TABLE supply_chain_suppliers DROP CONSTRAINT IF EXISTS supply_chain_suppliers_organization_id_organizations_id_fk;
    ALTER TABLE supply_chain_suppliers ADD CONSTRAINT supply_chain_suppliers_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.supply_chain_materials') IS NOT NULL THEN
    ALTER TABLE supply_chain_materials DROP CONSTRAINT IF EXISTS supply_chain_materials_organization_id_organizations_id_fk;
    ALTER TABLE supply_chain_materials ADD CONSTRAINT supply_chain_materials_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.supply_chain_batches') IS NOT NULL THEN
    ALTER TABLE supply_chain_batches DROP CONSTRAINT IF EXISTS supply_chain_batches_organization_id_organizations_id_fk;
    ALTER TABLE supply_chain_batches ADD CONSTRAINT supply_chain_batches_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;
