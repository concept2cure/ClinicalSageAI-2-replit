-- 070_gcc_rls_extended_ga.sql
-- Expand RLS coverage to GA-critical schemas: vault, labeling, site_intel, signing.
-- All tables made conditional - schemas may not exist if _legacy migrations haven't run.

BEGIN;

-- =============================================================================
-- A) Evidence Vault (vault.*) - CONDITIONAL
-- =============================================================================

-- Helper to conditionally enable RLS and create policies for vault tables
DO $$
DECLARE
  vault_tables TEXT[] := ARRAY['documents', 'document_chunks', 'search_queries',
                               'document_relationships', 'evidence_citations', 'processing_queue'];
  tbl TEXT;
BEGIN
  -- Only proceed if vault schema exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'vault') THEN
    RAISE NOTICE 'Schema vault does not exist, skipping vault RLS policies';
    RETURN;
  END IF;

  -- Enable RLS on each table if it exists
  FOREACH tbl IN ARRAY vault_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'vault' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE vault.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;

  -- vault.documents policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'vault' AND table_name = 'documents') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_documents_select ON vault.documents';
    EXECUTE $p$CREATE POLICY rls_vault_documents_select ON vault.documents FOR SELECT
             USING (core.can_access_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_documents_insert ON vault.documents';
    EXECUTE $p$CREATE POLICY rls_vault_documents_insert ON vault.documents FOR INSERT
             WITH CHECK (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_documents_update ON vault.documents';
    EXECUTE $p$CREATE POLICY rls_vault_documents_update ON vault.documents FOR UPDATE
             USING (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_documents_delete ON vault.documents';
    EXECUTE $p$CREATE POLICY rls_vault_documents_delete ON vault.documents FOR DELETE
             USING (core.can_write_program(program_id))$p$;
  END IF;

  -- vault.document_chunks policies (via documents)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'vault' AND table_name = 'document_chunks') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_chunks_select ON vault.document_chunks';
    EXECUTE $p$CREATE POLICY rls_vault_chunks_select ON vault.document_chunks FOR SELECT
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_chunks_insert ON vault.document_chunks';
    EXECUTE $p$CREATE POLICY rls_vault_chunks_insert ON vault.document_chunks FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_chunks_update ON vault.document_chunks';
    EXECUTE $p$CREATE POLICY rls_vault_chunks_update ON vault.document_chunks FOR UPDATE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_chunks_delete ON vault.document_chunks';
    EXECUTE $p$CREATE POLICY rls_vault_chunks_delete ON vault.document_chunks FOR DELETE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;

  -- vault.search_queries policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'vault' AND table_name = 'search_queries') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_search_select ON vault.search_queries';
    EXECUTE $p$CREATE POLICY rls_vault_search_select ON vault.search_queries FOR SELECT
             USING (core.can_access_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_search_insert ON vault.search_queries';
    EXECUTE $p$CREATE POLICY rls_vault_search_insert ON vault.search_queries FOR INSERT
             WITH CHECK (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_search_update ON vault.search_queries';
    EXECUTE $p$CREATE POLICY rls_vault_search_update ON vault.search_queries FOR UPDATE
             USING (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_search_delete ON vault.search_queries';
    EXECUTE $p$CREATE POLICY rls_vault_search_delete ON vault.search_queries FOR DELETE
             USING (core.can_write_program(program_id))$p$;
  END IF;

  -- vault.document_relationships policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'vault' AND table_name = 'document_relationships') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_doc_rels_select ON vault.document_relationships';
    EXECUTE $p$CREATE POLICY rls_vault_doc_rels_select ON vault.document_relationships FOR SELECT
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_doc_rels_insert ON vault.document_relationships';
    EXECUTE $p$CREATE POLICY rls_vault_doc_rels_insert ON vault.document_relationships FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_doc_rels_update ON vault.document_relationships';
    EXECUTE $p$CREATE POLICY rls_vault_doc_rels_update ON vault.document_relationships FOR UPDATE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_doc_rels_delete ON vault.document_relationships';
    EXECUTE $p$CREATE POLICY rls_vault_doc_rels_delete ON vault.document_relationships FOR DELETE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;

  -- vault.evidence_citations policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'vault' AND table_name = 'evidence_citations') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_citations_select ON vault.evidence_citations';
    EXECUTE $p$CREATE POLICY rls_vault_citations_select ON vault.evidence_citations FOR SELECT
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_citations_insert ON vault.evidence_citations';
    EXECUTE $p$CREATE POLICY rls_vault_citations_insert ON vault.evidence_citations FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_citations_update ON vault.evidence_citations';
    EXECUTE $p$CREATE POLICY rls_vault_citations_update ON vault.evidence_citations FOR UPDATE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_citations_delete ON vault.evidence_citations';
    EXECUTE $p$CREATE POLICY rls_vault_citations_delete ON vault.evidence_citations FOR DELETE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;

  -- vault.processing_queue policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'vault' AND table_name = 'processing_queue') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_processing_select ON vault.processing_queue';
    EXECUTE $p$CREATE POLICY rls_vault_processing_select ON vault.processing_queue FOR SELECT
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_processing_insert ON vault.processing_queue';
    EXECUTE $p$CREATE POLICY rls_vault_processing_insert ON vault.processing_queue FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_processing_update ON vault.processing_queue';
    EXECUTE $p$CREATE POLICY rls_vault_processing_update ON vault.processing_queue FOR UPDATE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_processing_delete ON vault.processing_queue';
    EXECUTE $p$CREATE POLICY rls_vault_processing_delete ON vault.processing_queue FOR DELETE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;
END $$;

-- =============================================================================
-- B) Labeling (labeling.*) - CONDITIONAL
-- =============================================================================

DO $$
DECLARE
  labeling_tables TEXT[] := ARRAY['spl_documents', 'spl_sections', 'label_changes',
                                  'impact_simulations', 'regulatory_references'];
  tbl TEXT;
BEGIN
  -- Only proceed if labeling schema exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'labeling') THEN
    RAISE NOTICE 'Schema labeling does not exist, skipping labeling RLS policies';
    RETURN;
  END IF;

  -- Enable RLS on each table if it exists
  FOREACH tbl IN ARRAY labeling_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'labeling' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE labeling.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;

  -- labeling.spl_documents policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'labeling' AND table_name = 'spl_documents') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_docs_select ON labeling.spl_documents';
    EXECUTE $p$CREATE POLICY rls_labeling_docs_select ON labeling.spl_documents FOR SELECT
             USING (core.can_access_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_docs_insert ON labeling.spl_documents';
    EXECUTE $p$CREATE POLICY rls_labeling_docs_insert ON labeling.spl_documents FOR INSERT
             WITH CHECK (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_docs_update ON labeling.spl_documents';
    EXECUTE $p$CREATE POLICY rls_labeling_docs_update ON labeling.spl_documents FOR UPDATE
             USING (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_docs_delete ON labeling.spl_documents';
    EXECUTE $p$CREATE POLICY rls_labeling_docs_delete ON labeling.spl_documents FOR DELETE
             USING (core.can_write_program(program_id))$p$;
  END IF;

  -- labeling.spl_sections policies (via document)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'labeling' AND table_name = 'spl_sections') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_sections_select ON labeling.spl_sections';
    EXECUTE $p$CREATE POLICY rls_labeling_sections_select ON labeling.spl_sections FOR SELECT
             USING (EXISTS (SELECT 1 FROM labeling.spl_documents d WHERE d.id = spl_document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_sections_insert ON labeling.spl_sections';
    EXECUTE $p$CREATE POLICY rls_labeling_sections_insert ON labeling.spl_sections FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM labeling.spl_documents d WHERE d.id = spl_document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_sections_update ON labeling.spl_sections';
    EXECUTE $p$CREATE POLICY rls_labeling_sections_update ON labeling.spl_sections FOR UPDATE
             USING (EXISTS (SELECT 1 FROM labeling.spl_documents d WHERE d.id = spl_document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_sections_delete ON labeling.spl_sections';
    EXECUTE $p$CREATE POLICY rls_labeling_sections_delete ON labeling.spl_sections FOR DELETE
             USING (EXISTS (SELECT 1 FROM labeling.spl_documents d WHERE d.id = spl_document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;

  -- labeling.label_changes policies (via from_document)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'labeling' AND table_name = 'label_changes') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_changes_select ON labeling.label_changes';
    EXECUTE $p$CREATE POLICY rls_labeling_changes_select ON labeling.label_changes FOR SELECT
             USING (EXISTS (SELECT 1 FROM labeling.spl_documents d WHERE d.id = from_document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_changes_insert ON labeling.label_changes';
    EXECUTE $p$CREATE POLICY rls_labeling_changes_insert ON labeling.label_changes FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM labeling.spl_documents d WHERE d.id = from_document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_changes_update ON labeling.label_changes';
    EXECUTE $p$CREATE POLICY rls_labeling_changes_update ON labeling.label_changes FOR UPDATE
             USING (EXISTS (SELECT 1 FROM labeling.spl_documents d WHERE d.id = from_document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_changes_delete ON labeling.label_changes';
    EXECUTE $p$CREATE POLICY rls_labeling_changes_delete ON labeling.label_changes FOR DELETE
             USING (EXISTS (SELECT 1 FROM labeling.spl_documents d WHERE d.id = from_document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;

  -- labeling.impact_simulations policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'labeling' AND table_name = 'impact_simulations') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_sim_select ON labeling.impact_simulations';
    EXECUTE $p$CREATE POLICY rls_labeling_sim_select ON labeling.impact_simulations FOR SELECT
             USING (core.can_access_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_sim_insert ON labeling.impact_simulations';
    EXECUTE $p$CREATE POLICY rls_labeling_sim_insert ON labeling.impact_simulations FOR INSERT
             WITH CHECK (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_sim_update ON labeling.impact_simulations';
    EXECUTE $p$CREATE POLICY rls_labeling_sim_update ON labeling.impact_simulations FOR UPDATE
             USING (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_sim_delete ON labeling.impact_simulations';
    EXECUTE $p$CREATE POLICY rls_labeling_sim_delete ON labeling.impact_simulations FOR DELETE
             USING (core.can_write_program(program_id))$p$;
  END IF;

  -- labeling.regulatory_references policies (via section -> document)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'labeling' AND table_name = 'regulatory_references') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_refs_select ON labeling.regulatory_references';
    EXECUTE $p$CREATE POLICY rls_labeling_refs_select ON labeling.regulatory_references FOR SELECT
             USING (EXISTS (SELECT 1 FROM labeling.spl_sections s
                    JOIN labeling.spl_documents d ON d.id = s.spl_document_id
                    WHERE s.id = section_id AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_refs_insert ON labeling.regulatory_references';
    EXECUTE $p$CREATE POLICY rls_labeling_refs_insert ON labeling.regulatory_references FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM labeling.spl_sections s
                         JOIN labeling.spl_documents d ON d.id = s.spl_document_id
                         WHERE s.id = section_id AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_refs_update ON labeling.regulatory_references';
    EXECUTE $p$CREATE POLICY rls_labeling_refs_update ON labeling.regulatory_references FOR UPDATE
             USING (EXISTS (SELECT 1 FROM labeling.spl_sections s
                    JOIN labeling.spl_documents d ON d.id = s.spl_document_id
                    WHERE s.id = section_id AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_labeling_refs_delete ON labeling.regulatory_references';
    EXECUTE $p$CREATE POLICY rls_labeling_refs_delete ON labeling.regulatory_references FOR DELETE
             USING (EXISTS (SELECT 1 FROM labeling.spl_sections s
                    JOIN labeling.spl_documents d ON d.id = s.spl_document_id
                    WHERE s.id = section_id AND core.can_write_program(d.program_id)))$p$;
  END IF;
END $$;

-- =============================================================================
-- C) Site Intelligence (site_intel.*) - CONDITIONAL
-- =============================================================================

DO $$
DECLARE
  site_intel_tables TEXT[] := ARRAY['sites', 'site_metrics', 'site_risks', 'enrollment_predictions'];
  tbl TEXT;
BEGIN
  -- Only proceed if site_intel schema exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'site_intel') THEN
    RAISE NOTICE 'Schema site_intel does not exist, skipping site_intel RLS policies';
    RETURN;
  END IF;

  -- Enable RLS on each table if it exists
  FOREACH tbl IN ARRAY site_intel_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'site_intel' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE site_intel.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;

  -- site_intel.sites policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'site_intel' AND table_name = 'sites') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_sites_select ON site_intel.sites';
    EXECUTE $p$CREATE POLICY rls_site_intel_sites_select ON site_intel.sites FOR SELECT
             USING (core.can_access_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_sites_insert ON site_intel.sites';
    EXECUTE $p$CREATE POLICY rls_site_intel_sites_insert ON site_intel.sites FOR INSERT
             WITH CHECK (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_sites_update ON site_intel.sites';
    EXECUTE $p$CREATE POLICY rls_site_intel_sites_update ON site_intel.sites FOR UPDATE
             USING (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_sites_delete ON site_intel.sites';
    EXECUTE $p$CREATE POLICY rls_site_intel_sites_delete ON site_intel.sites FOR DELETE
             USING (core.can_write_program(program_id))$p$;
  END IF;

  -- site_intel.site_metrics policies (via site)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'site_intel' AND table_name = 'site_metrics') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_metrics_select ON site_intel.site_metrics';
    EXECUTE $p$CREATE POLICY rls_site_intel_metrics_select ON site_intel.site_metrics FOR SELECT
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_access_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_metrics_insert ON site_intel.site_metrics';
    EXECUTE $p$CREATE POLICY rls_site_intel_metrics_insert ON site_intel.site_metrics FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                         AND core.can_write_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_metrics_update ON site_intel.site_metrics';
    EXECUTE $p$CREATE POLICY rls_site_intel_metrics_update ON site_intel.site_metrics FOR UPDATE
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_write_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_metrics_delete ON site_intel.site_metrics';
    EXECUTE $p$CREATE POLICY rls_site_intel_metrics_delete ON site_intel.site_metrics FOR DELETE
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_write_program(s.program_id)))$p$;
  END IF;

  -- site_intel.site_risks policies (via site)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'site_intel' AND table_name = 'site_risks') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_risks_select ON site_intel.site_risks';
    EXECUTE $p$CREATE POLICY rls_site_intel_risks_select ON site_intel.site_risks FOR SELECT
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_access_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_risks_insert ON site_intel.site_risks';
    EXECUTE $p$CREATE POLICY rls_site_intel_risks_insert ON site_intel.site_risks FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                         AND core.can_write_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_risks_update ON site_intel.site_risks';
    EXECUTE $p$CREATE POLICY rls_site_intel_risks_update ON site_intel.site_risks FOR UPDATE
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_write_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_risks_delete ON site_intel.site_risks';
    EXECUTE $p$CREATE POLICY rls_site_intel_risks_delete ON site_intel.site_risks FOR DELETE
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_write_program(s.program_id)))$p$;
  END IF;

  -- site_intel.enrollment_predictions policies (via site)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'site_intel' AND table_name = 'enrollment_predictions') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_pred_select ON site_intel.enrollment_predictions';
    EXECUTE $p$CREATE POLICY rls_site_intel_pred_select ON site_intel.enrollment_predictions FOR SELECT
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_access_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_pred_insert ON site_intel.enrollment_predictions';
    EXECUTE $p$CREATE POLICY rls_site_intel_pred_insert ON site_intel.enrollment_predictions FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                         AND core.can_write_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_pred_update ON site_intel.enrollment_predictions';
    EXECUTE $p$CREATE POLICY rls_site_intel_pred_update ON site_intel.enrollment_predictions FOR UPDATE
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_write_program(s.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_site_intel_pred_delete ON site_intel.enrollment_predictions';
    EXECUTE $p$CREATE POLICY rls_site_intel_pred_delete ON site_intel.enrollment_predictions FOR DELETE
             USING (EXISTS (SELECT 1 FROM site_intel.sites s WHERE s.id = site_id
                    AND core.can_write_program(s.program_id)))$p$;
  END IF;
END $$;

-- =============================================================================
-- D) Signing (signing.*) - CONDITIONAL
-- =============================================================================

DO $$
DECLARE
  signing_tables TEXT[] := ARRAY['signing_requests', 'signatures', 'signature_manifests'];
  tbl TEXT;
BEGIN
  -- Only proceed if signing schema exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'signing') THEN
    RAISE NOTICE 'Schema signing does not exist, skipping signing RLS policies';
    RETURN;
  END IF;

  -- Enable RLS on each table if it exists
  FOREACH tbl IN ARRAY signing_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'signing' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE signing.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;

  -- signing.signing_requests policies
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'signing' AND table_name = 'signing_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_requests_select ON signing.signing_requests';
    EXECUTE $p$CREATE POLICY rls_signing_requests_select ON signing.signing_requests FOR SELECT
             USING (core.can_access_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_requests_insert ON signing.signing_requests';
    EXECUTE $p$CREATE POLICY rls_signing_requests_insert ON signing.signing_requests FOR INSERT
             WITH CHECK (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_requests_update ON signing.signing_requests';
    EXECUTE $p$CREATE POLICY rls_signing_requests_update ON signing.signing_requests FOR UPDATE
             USING (core.can_write_program(program_id))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_requests_delete ON signing.signing_requests';
    EXECUTE $p$CREATE POLICY rls_signing_requests_delete ON signing.signing_requests FOR DELETE
             USING (core.can_write_program(program_id))$p$;
  END IF;

  -- signing.signatures policies (via request)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'signing' AND table_name = 'signatures') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_signatures_select ON signing.signatures';
    EXECUTE $p$CREATE POLICY rls_signing_signatures_select ON signing.signatures FOR SELECT
             USING (EXISTS (SELECT 1 FROM signing.signing_requests r WHERE r.id = request_id
                    AND core.can_access_program(r.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_signatures_insert ON signing.signatures';
    EXECUTE $p$CREATE POLICY rls_signing_signatures_insert ON signing.signatures FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM signing.signing_requests r WHERE r.id = request_id
                         AND core.can_write_program(r.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_signatures_update ON signing.signatures';
    EXECUTE $p$CREATE POLICY rls_signing_signatures_update ON signing.signatures FOR UPDATE
             USING (EXISTS (SELECT 1 FROM signing.signing_requests r WHERE r.id = request_id
                    AND core.can_write_program(r.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_signatures_delete ON signing.signatures';
    EXECUTE $p$CREATE POLICY rls_signing_signatures_delete ON signing.signatures FOR DELETE
             USING (EXISTS (SELECT 1 FROM signing.signing_requests r WHERE r.id = request_id
                    AND core.can_write_program(r.program_id)))$p$;
  END IF;

  -- signing.signature_manifests policies (via request)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'signing' AND table_name = 'signature_manifests') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_manifests_select ON signing.signature_manifests';
    EXECUTE $p$CREATE POLICY rls_signing_manifests_select ON signing.signature_manifests FOR SELECT
             USING (EXISTS (SELECT 1 FROM signing.signing_requests r WHERE r.id = request_id
                    AND core.can_access_program(r.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_manifests_insert ON signing.signature_manifests';
    EXECUTE $p$CREATE POLICY rls_signing_manifests_insert ON signing.signature_manifests FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM signing.signing_requests r WHERE r.id = request_id
                         AND core.can_write_program(r.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_manifests_update ON signing.signature_manifests';
    EXECUTE $p$CREATE POLICY rls_signing_manifests_update ON signing.signature_manifests FOR UPDATE
             USING (EXISTS (SELECT 1 FROM signing.signing_requests r WHERE r.id = request_id
                    AND core.can_write_program(r.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_signing_manifests_delete ON signing.signature_manifests';
    EXECUTE $p$CREATE POLICY rls_signing_manifests_delete ON signing.signature_manifests FOR DELETE
             USING (EXISTS (SELECT 1 FROM signing.signing_requests r WHERE r.id = request_id
                    AND core.can_write_program(r.program_id)))$p$;
  END IF;
END $$;

COMMIT;
