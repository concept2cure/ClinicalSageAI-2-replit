-- Migration: 0006_regulatory_atoms.sql
-- Creates missing regulatory intelligence atom tables identified by system audit.
-- Tables: cmc_comparability_assessments, cmc_batch_records, cmc_process_steps,
--         pv_signal_assessments, document_atom_provenance, meddra_term_reference,
--         biomarker_ontology

-- ============================================================
-- 1. CMC_COMPARABILITY_ATOM
-- ============================================================
CREATE TABLE IF NOT EXISTS cmc_comparability_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES cmc_projects(id) ON DELETE CASCADE,
  assessment_name TEXT NOT NULL,
  change_type TEXT,
  pre_change_state JSONB,
  post_change_state JSONB,
  changed_element TEXT,
  affected_cqas JSONB,
  affected_process_parameters JSONB,
  analytical_comparability_evidence JSONB,
  clinical_bridging_relevance TEXT,
  regulatory_risk_level TEXT,
  regulatory_classification TEXT,
  justification TEXT,
  impacted_sections JSONB,
  status TEXT DEFAULT 'draft',
  reviewed_by TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cmc_comparability_org ON cmc_comparability_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_comparability_project ON cmc_comparability_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_cmc_comparability_status ON cmc_comparability_assessments(status);
CREATE INDEX IF NOT EXISTS idx_cmc_comparability_change_type ON cmc_comparability_assessments(change_type);

-- ============================================================
-- 2. CMC_BATCH_ATOM expanded
-- ============================================================
CREATE TABLE IF NOT EXISTS cmc_batch_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES cmc_projects(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  batch_type TEXT,
  material_type TEXT,
  scale TEXT,
  site TEXT,
  manufacturing_date DATE,
  expiry_date DATE,
  batch_size TEXT,
  batch_size_unit TEXT,
  yield DECIMAL,
  yield_unit TEXT,
  purpose TEXT,
  process_version TEXT,
  deviations JSONB,
  disposition TEXT,
  linked_analyses JSONB,
  linked_stability_study_id INTEGER REFERENCES stability_studies(id),
  specification_compliance JSONB,
  oos_events JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cmc_batch_org ON cmc_batch_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_batch_project ON cmc_batch_records(project_id);
CREATE INDEX IF NOT EXISTS idx_cmc_batch_number ON cmc_batch_records(batch_number);
CREATE INDEX IF NOT EXISTS idx_cmc_batch_disposition ON cmc_batch_records(disposition);
CREATE INDEX IF NOT EXISTS idx_cmc_batch_type ON cmc_batch_records(batch_type);

-- ============================================================
-- 3. CMC_PROCESS_STEP_ATOM
-- ============================================================
CREATE TABLE IF NOT EXISTS cmc_process_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  process_id UUID NOT NULL REFERENCES manufacturing_processes(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  unit_operation TEXT NOT NULL,
  description TEXT,
  inputs JSONB,
  outputs JSONB,
  critical_process_parameters JSONB,
  in_process_controls JSONB,
  equipment_context JSONB,
  hold_time_limit TEXT,
  hold_time_condition TEXT,
  environmental_controls JSONB,
  scale_dependencies JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cmc_process_steps_org ON cmc_process_steps(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_process_steps_process ON cmc_process_steps(process_id);
CREATE INDEX IF NOT EXISTS idx_cmc_process_steps_order ON cmc_process_steps(process_id, step_order);

-- ============================================================
-- 4. PV_SIGNAL_ATOM expanded
-- ============================================================
CREATE TABLE IF NOT EXISTS pv_signal_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  signal_name TEXT NOT NULL,
  signal_source TEXT,
  preferred_term TEXT,
  meddra_soc TEXT,
  meddra_pt TEXT,
  meddra_code TEXT,
  disproportionality_metric TEXT,
  disproportionality_value DECIMAL,
  disproportionality_ci JSONB,
  observed_count INTEGER,
  expected_count DECIMAL,
  background_incidence_rate DECIMAL,
  trend TEXT,
  seriousness_distribution JSONB,
  affected_population TEXT,
  label_relevance TEXT,
  mitigation_action TEXT,
  monitoring_implication TEXT,
  evaluation_status TEXT,
  benefit_risk_impact TEXT,
  source_study_ids JSONB,
  evidence_narrative TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pv_signal_org ON pv_signal_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_pv_signal_status ON pv_signal_assessments(evaluation_status);
CREATE INDEX IF NOT EXISTS idx_pv_signal_pt ON pv_signal_assessments(meddra_pt);
CREATE INDEX IF NOT EXISTS idx_pv_signal_source ON pv_signal_assessments(signal_source);

-- ============================================================
-- 5. DOCUMENT_ATOM enhanced provenance
-- ============================================================
CREATE TABLE IF NOT EXISTS document_atom_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL,
  document_table TEXT NOT NULL,
  submission_type TEXT,
  ectd_section TEXT,
  document_purpose TEXT,
  linked_evidence_ids JSONB,
  linked_atom_ids JSONB,
  generated_by TEXT,
  ai_model_used TEXT,
  ai_confidence_score DECIMAL,
  reviewer_status TEXT,
  approval_status TEXT,
  jurisdiction TEXT,
  modality_context TEXT,
  safety_relevance_flag BOOLEAN DEFAULT FALSE,
  biostat_relevance_flag BOOLEAN DEFAULT FALSE,
  cmc_relevance_flag BOOLEAN DEFAULT FALSE,
  source_of_truth_dependencies JSONB,
  provenance_chain JSONB,
  content_hash TEXT,
  version_number INTEGER DEFAULT 1,
  previous_version_id UUID,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_provenance_org ON document_atom_provenance(organization_id);
CREATE INDEX IF NOT EXISTS idx_doc_provenance_doc ON document_atom_provenance(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_provenance_table ON document_atom_provenance(document_table);
CREATE INDEX IF NOT EXISTS idx_doc_provenance_submission ON document_atom_provenance(submission_type);
CREATE INDEX IF NOT EXISTS idx_doc_provenance_section ON document_atom_provenance(ectd_section);
CREATE INDEX IF NOT EXISTS idx_doc_provenance_hash ON document_atom_provenance(content_hash);

-- ============================================================
-- 6. MEDDRA_TERM_REFERENCE
-- ============================================================
CREATE TABLE IF NOT EXISTS meddra_term_reference (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  meddra_version TEXT NOT NULL,
  soc_code TEXT,
  soc_name TEXT NOT NULL,
  hlgt_code TEXT,
  hlgt_name TEXT,
  hlt_code TEXT,
  hlt_name TEXT,
  pt_code TEXT NOT NULL,
  pt_name TEXT NOT NULL,
  llt_code TEXT,
  llt_name TEXT,
  is_primary_path BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meddra_org ON meddra_term_reference(organization_id);
CREATE INDEX IF NOT EXISTS idx_meddra_pt_name ON meddra_term_reference(pt_name);
CREATE INDEX IF NOT EXISTS idx_meddra_pt_code ON meddra_term_reference(pt_code);
CREATE INDEX IF NOT EXISTS idx_meddra_soc_name ON meddra_term_reference(soc_name);
CREATE INDEX IF NOT EXISTS idx_meddra_soc_code ON meddra_term_reference(soc_code);
CREATE INDEX IF NOT EXISTS idx_meddra_llt_name ON meddra_term_reference(llt_name);
CREATE INDEX IF NOT EXISTS idx_meddra_version ON meddra_term_reference(meddra_version);

-- ============================================================
-- 7. BIOMARKER_ONTOLOGY
-- ============================================================
CREATE TABLE IF NOT EXISTS biomarker_ontology (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  biomarker_name TEXT NOT NULL,
  biomarker_type TEXT NOT NULL,
  gene_symbol TEXT,
  uniprot_id TEXT,
  ncbi_gene_id TEXT,
  target_pathway TEXT,
  disease_relevance JSONB,
  assay_methods JSONB,
  regulatory_qualification TEXT,
  fda_qualification_context TEXT,
  clinical_utility TEXT,
  reference_range JSONB,
  synonyms JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_biomarker_org ON biomarker_ontology(organization_id);
CREATE INDEX IF NOT EXISTS idx_biomarker_name ON biomarker_ontology(biomarker_name);
CREATE INDEX IF NOT EXISTS idx_biomarker_type ON biomarker_ontology(biomarker_type);
CREATE INDEX IF NOT EXISTS idx_biomarker_gene ON biomarker_ontology(gene_symbol);
CREATE INDEX IF NOT EXISTS idx_biomarker_pathway ON biomarker_ontology(target_pathway);
CREATE INDEX IF NOT EXISTS idx_biomarker_utility ON biomarker_ontology(clinical_utility);

-- ============================================================
-- 8. PROTOCOL EXTRACTIONS (persistence for extract_protocol.py)
-- ============================================================
CREATE TABLE IF NOT EXISTS protocol_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id UUID,
  document_id UUID,
  file_path TEXT,
  extracted_fields JSONB NOT NULL,
  raw_text TEXT,
  content_hash TEXT NOT NULL,
  processing_time_ms INTEGER,
  fields_extracted INTEGER,
  total_fields INTEGER,
  extraction_version TEXT DEFAULT '2.0',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(content_hash, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_protocol_ext_org ON protocol_extractions(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_ext_doc ON protocol_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_protocol_ext_hash ON protocol_extractions(content_hash);

-- ============================================================
-- 9. RELATION EXTRACTION PERSISTENCE (graph entities, edges, triplets)
-- ============================================================
CREATE TABLE IF NOT EXISTS extracted_graph_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL,
  extraction_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  entity_category TEXT NOT NULL,
  confidence DECIMAL,
  source_text TEXT,
  position_offset INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_graph_entities_org ON extracted_graph_entities(organization_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_doc ON extracted_graph_entities(document_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_name ON extracted_graph_entities(entity_name);
CREATE INDEX IF NOT EXISTS idx_graph_entities_cat ON extracted_graph_entities(entity_category);

CREATE TABLE IF NOT EXISTS extracted_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL,
  extraction_id UUID NOT NULL,
  subject_name TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_name TEXT NOT NULL,
  context_text TEXT,
  confidence DECIMAL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_org ON extracted_graph_edges(organization_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_doc ON extracted_graph_edges(document_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_predicate ON extracted_graph_edges(predicate);
CREATE INDEX IF NOT EXISTS idx_graph_edges_subject ON extracted_graph_edges(subject_name);

CREATE TABLE IF NOT EXISTS extracted_graph_triplets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL,
  extraction_id UUID NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  evidence_text TEXT,
  confidence DECIMAL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_graph_triplets_org ON extracted_graph_triplets(organization_id);
CREATE INDEX IF NOT EXISTS idx_graph_triplets_doc ON extracted_graph_triplets(document_id);

CREATE TABLE IF NOT EXISTS extracted_cross_doc_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  extraction_id UUID NOT NULL,
  source_document_id UUID NOT NULL,
  target_document_id UUID NOT NULL,
  link_type TEXT NOT NULL,
  shared_entities JSONB,
  confidence DECIMAL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cross_doc_org ON extracted_cross_doc_links(organization_id);
CREATE INDEX IF NOT EXISTS idx_cross_doc_source ON extracted_cross_doc_links(source_document_id);
CREATE INDEX IF NOT EXISTS idx_cross_doc_target ON extracted_cross_doc_links(target_document_id);

CREATE TABLE IF NOT EXISTS relation_extraction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL,
  document_type TEXT,
  entities_count INTEGER,
  relationships_count INTEGER,
  triplets_count INTEGER,
  cross_doc_links_count INTEGER,
  processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rel_ext_log_org ON relation_extraction_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_rel_ext_log_doc ON relation_extraction_log(document_id);
