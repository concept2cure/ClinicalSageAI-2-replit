-- 070_gcc_rls_extended_ga.sql
-- Expand RLS coverage to GA-critical schemas: vault, labeling, site_intel, signing.

BEGIN;

-- =============================================================================
-- A) Evidence Vault (vault.*)
-- =============================================================================

ALTER TABLE vault.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.document_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.evidence_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.processing_queue ENABLE ROW LEVEL SECURITY;

-- Documents
DROP POLICY IF EXISTS rls_vault_documents_select ON vault.documents;
CREATE POLICY rls_vault_documents_select
  ON vault.documents
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_vault_documents_insert ON vault.documents;
CREATE POLICY rls_vault_documents_insert
  ON vault.documents
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_vault_documents_update ON vault.documents;
CREATE POLICY rls_vault_documents_update
  ON vault.documents
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_vault_documents_delete ON vault.documents;
CREATE POLICY rls_vault_documents_delete
  ON vault.documents
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Document chunks (via documents)
DROP POLICY IF EXISTS rls_vault_chunks_select ON vault.document_chunks;
CREATE POLICY rls_vault_chunks_select
  ON vault.document_chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = document_id
        AND core.can_access_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_chunks_insert ON vault.document_chunks;
CREATE POLICY rls_vault_chunks_insert
  ON vault.document_chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_chunks_update ON vault.document_chunks;
CREATE POLICY rls_vault_chunks_update
  ON vault.document_chunks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_chunks_delete ON vault.document_chunks;
CREATE POLICY rls_vault_chunks_delete
  ON vault.document_chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = document_id
        AND core.can_write_program(d.program_id)
    )
  );

-- Search queries (program_id)
DROP POLICY IF EXISTS rls_vault_search_select ON vault.search_queries;
CREATE POLICY rls_vault_search_select
  ON vault.search_queries
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_vault_search_insert ON vault.search_queries;
CREATE POLICY rls_vault_search_insert
  ON vault.search_queries
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_vault_search_update ON vault.search_queries;
CREATE POLICY rls_vault_search_update
  ON vault.search_queries
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_vault_search_delete ON vault.search_queries;
CREATE POLICY rls_vault_search_delete
  ON vault.search_queries
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Document relationships (via source document)
DROP POLICY IF EXISTS rls_vault_doc_rels_select ON vault.document_relationships;
CREATE POLICY rls_vault_doc_rels_select
  ON vault.document_relationships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = source_document_id
        AND core.can_access_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_doc_rels_insert ON vault.document_relationships;
CREATE POLICY rls_vault_doc_rels_insert
  ON vault.document_relationships
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = source_document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_doc_rels_update ON vault.document_relationships;
CREATE POLICY rls_vault_doc_rels_update
  ON vault.document_relationships
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = source_document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_doc_rels_delete ON vault.document_relationships;
CREATE POLICY rls_vault_doc_rels_delete
  ON vault.document_relationships
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = source_document_id
        AND core.can_write_program(d.program_id)
    )
  );

-- Evidence citations (via source document)
DROP POLICY IF EXISTS rls_vault_citations_select ON vault.evidence_citations;
CREATE POLICY rls_vault_citations_select
  ON vault.evidence_citations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = source_document_id
        AND core.can_access_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_citations_insert ON vault.evidence_citations;
CREATE POLICY rls_vault_citations_insert
  ON vault.evidence_citations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = source_document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_citations_update ON vault.evidence_citations;
CREATE POLICY rls_vault_citations_update
  ON vault.evidence_citations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = source_document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_citations_delete ON vault.evidence_citations;
CREATE POLICY rls_vault_citations_delete
  ON vault.evidence_citations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = source_document_id
        AND core.can_write_program(d.program_id)
    )
  );

-- Processing queue (via document)
DROP POLICY IF EXISTS rls_vault_processing_select ON vault.processing_queue;
CREATE POLICY rls_vault_processing_select
  ON vault.processing_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = document_id
        AND core.can_access_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_processing_insert ON vault.processing_queue;
CREATE POLICY rls_vault_processing_insert
  ON vault.processing_queue
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_processing_update ON vault.processing_queue;
CREATE POLICY rls_vault_processing_update
  ON vault.processing_queue
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_processing_delete ON vault.processing_queue;
CREATE POLICY rls_vault_processing_delete
  ON vault.processing_queue
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM vault.documents d
      WHERE d.id = document_id
        AND core.can_write_program(d.program_id)
    )
  );

-- =============================================================================
-- B) Labeling (labeling.*)
-- =============================================================================

ALTER TABLE labeling.spl_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE labeling.spl_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE labeling.label_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE labeling.impact_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE labeling.regulatory_references ENABLE ROW LEVEL SECURITY;

-- SPL documents
DROP POLICY IF EXISTS rls_labeling_docs_select ON labeling.spl_documents;
CREATE POLICY rls_labeling_docs_select
  ON labeling.spl_documents
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_labeling_docs_insert ON labeling.spl_documents;
CREATE POLICY rls_labeling_docs_insert
  ON labeling.spl_documents
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_labeling_docs_update ON labeling.spl_documents;
CREATE POLICY rls_labeling_docs_update
  ON labeling.spl_documents
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_labeling_docs_delete ON labeling.spl_documents;
CREATE POLICY rls_labeling_docs_delete
  ON labeling.spl_documents
  FOR DELETE
  USING (core.can_write_program(program_id));

-- SPL sections (via document)
DROP POLICY IF EXISTS rls_labeling_sections_select ON labeling.spl_sections;
CREATE POLICY rls_labeling_sections_select
  ON labeling.spl_sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM labeling.spl_documents d
      WHERE d.id = spl_document_id
        AND core.can_access_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_sections_insert ON labeling.spl_sections;
CREATE POLICY rls_labeling_sections_insert
  ON labeling.spl_sections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM labeling.spl_documents d
      WHERE d.id = spl_document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_sections_update ON labeling.spl_sections;
CREATE POLICY rls_labeling_sections_update
  ON labeling.spl_sections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM labeling.spl_documents d
      WHERE d.id = spl_document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_sections_delete ON labeling.spl_sections;
CREATE POLICY rls_labeling_sections_delete
  ON labeling.spl_sections
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM labeling.spl_documents d
      WHERE d.id = spl_document_id
        AND core.can_write_program(d.program_id)
    )
  );

-- Label changes (via from_document)
DROP POLICY IF EXISTS rls_labeling_changes_select ON labeling.label_changes;
CREATE POLICY rls_labeling_changes_select
  ON labeling.label_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM labeling.spl_documents d
      WHERE d.id = from_document_id
        AND core.can_access_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_changes_insert ON labeling.label_changes;
CREATE POLICY rls_labeling_changes_insert
  ON labeling.label_changes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM labeling.spl_documents d
      WHERE d.id = from_document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_changes_update ON labeling.label_changes;
CREATE POLICY rls_labeling_changes_update
  ON labeling.label_changes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM labeling.spl_documents d
      WHERE d.id = from_document_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_changes_delete ON labeling.label_changes;
CREATE POLICY rls_labeling_changes_delete
  ON labeling.label_changes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM labeling.spl_documents d
      WHERE d.id = from_document_id
        AND core.can_write_program(d.program_id)
    )
  );

-- Impact simulations (program_id)
DROP POLICY IF EXISTS rls_labeling_sim_select ON labeling.impact_simulations;
CREATE POLICY rls_labeling_sim_select
  ON labeling.impact_simulations
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_labeling_sim_insert ON labeling.impact_simulations;
CREATE POLICY rls_labeling_sim_insert
  ON labeling.impact_simulations
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_labeling_sim_update ON labeling.impact_simulations;
CREATE POLICY rls_labeling_sim_update
  ON labeling.impact_simulations
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_labeling_sim_delete ON labeling.impact_simulations;
CREATE POLICY rls_labeling_sim_delete
  ON labeling.impact_simulations
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Regulatory references (via section -> document)
DROP POLICY IF EXISTS rls_labeling_refs_select ON labeling.regulatory_references;
CREATE POLICY rls_labeling_refs_select
  ON labeling.regulatory_references
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM labeling.spl_sections s
      JOIN labeling.spl_documents d ON d.id = s.spl_document_id
      WHERE s.id = section_id
        AND core.can_access_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_refs_insert ON labeling.regulatory_references;
CREATE POLICY rls_labeling_refs_insert
  ON labeling.regulatory_references
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM labeling.spl_sections s
      JOIN labeling.spl_documents d ON d.id = s.spl_document_id
      WHERE s.id = section_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_refs_update ON labeling.regulatory_references;
CREATE POLICY rls_labeling_refs_update
  ON labeling.regulatory_references
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM labeling.spl_sections s
      JOIN labeling.spl_documents d ON d.id = s.spl_document_id
      WHERE s.id = section_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_labeling_refs_delete ON labeling.regulatory_references;
CREATE POLICY rls_labeling_refs_delete
  ON labeling.regulatory_references
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM labeling.spl_sections s
      JOIN labeling.spl_documents d ON d.id = s.spl_document_id
      WHERE s.id = section_id
        AND core.can_write_program(d.program_id)
    )
  );

-- =============================================================================
-- C) Site Intelligence (site_intel.*)
-- =============================================================================

ALTER TABLE site_intel.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_intel.site_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_intel.site_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_intel.enrollment_predictions ENABLE ROW LEVEL SECURITY;

-- Sites
DROP POLICY IF EXISTS rls_site_intel_sites_select ON site_intel.sites;
CREATE POLICY rls_site_intel_sites_select
  ON site_intel.sites
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_site_intel_sites_insert ON site_intel.sites;
CREATE POLICY rls_site_intel_sites_insert
  ON site_intel.sites
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_site_intel_sites_update ON site_intel.sites;
CREATE POLICY rls_site_intel_sites_update
  ON site_intel.sites
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_site_intel_sites_delete ON site_intel.sites;
CREATE POLICY rls_site_intel_sites_delete
  ON site_intel.sites
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Site metrics (via site)
DROP POLICY IF EXISTS rls_site_intel_metrics_select ON site_intel.site_metrics;
CREATE POLICY rls_site_intel_metrics_select
  ON site_intel.site_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_access_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_metrics_insert ON site_intel.site_metrics;
CREATE POLICY rls_site_intel_metrics_insert
  ON site_intel.site_metrics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_metrics_update ON site_intel.site_metrics;
CREATE POLICY rls_site_intel_metrics_update
  ON site_intel.site_metrics
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_metrics_delete ON site_intel.site_metrics;
CREATE POLICY rls_site_intel_metrics_delete
  ON site_intel.site_metrics
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

-- Site risks (via site)
DROP POLICY IF EXISTS rls_site_intel_risks_select ON site_intel.site_risks;
CREATE POLICY rls_site_intel_risks_select
  ON site_intel.site_risks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_access_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_risks_insert ON site_intel.site_risks;
CREATE POLICY rls_site_intel_risks_insert
  ON site_intel.site_risks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_risks_update ON site_intel.site_risks;
CREATE POLICY rls_site_intel_risks_update
  ON site_intel.site_risks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_risks_delete ON site_intel.site_risks;
CREATE POLICY rls_site_intel_risks_delete
  ON site_intel.site_risks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

-- Enrollment predictions (via site)
DROP POLICY IF EXISTS rls_site_intel_pred_select ON site_intel.enrollment_predictions;
CREATE POLICY rls_site_intel_pred_select
  ON site_intel.enrollment_predictions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_access_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_pred_insert ON site_intel.enrollment_predictions;
CREATE POLICY rls_site_intel_pred_insert
  ON site_intel.enrollment_predictions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_pred_update ON site_intel.enrollment_predictions;
CREATE POLICY rls_site_intel_pred_update
  ON site_intel.enrollment_predictions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_site_intel_pred_delete ON site_intel.enrollment_predictions;
CREATE POLICY rls_site_intel_pred_delete
  ON site_intel.enrollment_predictions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM site_intel.sites s
      WHERE s.id = site_id
        AND core.can_write_program(s.program_id)
    )
  );

-- =============================================================================
-- D) Signing (signing.*)
-- =============================================================================

ALTER TABLE signing.signing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signing.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE signing.signature_manifests ENABLE ROW LEVEL SECURITY;

-- Signing requests (program_id)
DROP POLICY IF EXISTS rls_signing_requests_select ON signing.signing_requests;
CREATE POLICY rls_signing_requests_select
  ON signing.signing_requests
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_signing_requests_insert ON signing.signing_requests;
CREATE POLICY rls_signing_requests_insert
  ON signing.signing_requests
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_signing_requests_update ON signing.signing_requests;
CREATE POLICY rls_signing_requests_update
  ON signing.signing_requests
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_signing_requests_delete ON signing.signing_requests;
CREATE POLICY rls_signing_requests_delete
  ON signing.signing_requests
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Signatures (via request)
DROP POLICY IF EXISTS rls_signing_signatures_select ON signing.signatures;
CREATE POLICY rls_signing_signatures_select
  ON signing.signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signing.signing_requests r
      WHERE r.id = request_id
        AND core.can_access_program(r.program_id)
    )
  );

DROP POLICY IF EXISTS rls_signing_signatures_insert ON signing.signatures;
CREATE POLICY rls_signing_signatures_insert
  ON signing.signatures
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signing.signing_requests r
      WHERE r.id = request_id
        AND core.can_write_program(r.program_id)
    )
  );

DROP POLICY IF EXISTS rls_signing_signatures_update ON signing.signatures;
CREATE POLICY rls_signing_signatures_update
  ON signing.signatures
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM signing.signing_requests r
      WHERE r.id = request_id
        AND core.can_write_program(r.program_id)
    )
  );

DROP POLICY IF EXISTS rls_signing_signatures_delete ON signing.signatures;
CREATE POLICY rls_signing_signatures_delete
  ON signing.signatures
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM signing.signing_requests r
      WHERE r.id = request_id
        AND core.can_write_program(r.program_id)
    )
  );

-- Signature manifests (via request)
DROP POLICY IF EXISTS rls_signing_manifests_select ON signing.signature_manifests;
CREATE POLICY rls_signing_manifests_select
  ON signing.signature_manifests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signing.signing_requests r
      WHERE r.id = request_id
        AND core.can_access_program(r.program_id)
    )
  );

DROP POLICY IF EXISTS rls_signing_manifests_insert ON signing.signature_manifests;
CREATE POLICY rls_signing_manifests_insert
  ON signing.signature_manifests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signing.signing_requests r
      WHERE r.id = request_id
        AND core.can_write_program(r.program_id)
    )
  );

DROP POLICY IF EXISTS rls_signing_manifests_update ON signing.signature_manifests;
CREATE POLICY rls_signing_manifests_update
  ON signing.signature_manifests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM signing.signing_requests r
      WHERE r.id = request_id
        AND core.can_write_program(r.program_id)
    )
  );

DROP POLICY IF EXISTS rls_signing_manifests_delete ON signing.signature_manifests;
CREATE POLICY rls_signing_manifests_delete
  ON signing.signature_manifests
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM signing.signing_requests r
      WHERE r.id = request_id
        AND core.can_write_program(r.program_id)
    )
  );

COMMIT;
