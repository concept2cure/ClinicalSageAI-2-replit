-- Drop unused CDISC reference tables (GitHub issue #846).
--
-- Removes the ~32 CDISC reference tables that had ZERO references in any route
-- or service. The active PRM subset is KEPT and intentionally NOT dropped here:
--   cdisc_prm_studies, cdisc_prm_study_arms, cdisc_prm_epochs,
--   cdisc_prm_visits, cdisc_prm_endpoints
-- (backs server/services/study-design/study-design-repository.ts).
--
-- Requires DBA review before applying to any environment with data.
--
-- Idempotent: every statement uses DROP TABLE IF EXISTS.
--
-- FK-aware drop order: two foreign keys exist BETWEEN dropped tables
-- (see migrations/0000_sweet_joseph.sql):
--   cdisc_cdash_fields.form_id           -> cdisc_cdash_forms.form_id
--   cdisc_docs_define_artifacts.*        -> cdisc_ectd_define_xml.*
-- so the referencing (child) table is dropped before its parent. No KEPT table
-- references any of the tables dropped below.

-- CDASH (child before parent)
DROP TABLE IF EXISTS cdisc_cdash_fields;
DROP TABLE IF EXISTS cdisc_cdash_forms;
DROP TABLE IF EXISTS cdisc_cdash_sdtm_mappings;

-- CSR templates / TFL / SAP
DROP TABLE IF EXISTS cdisc_csr_tfl;
DROP TABLE IF EXISTS cdisc_csr_sap;
DROP TABLE IF EXISTS cdisc_csr_templates;

-- ADaM
DROP TABLE IF EXISTS cdisc_adam_specs;

-- Docs (child) before eCTD define-xml (parent)
DROP TABLE IF EXISTS cdisc_docs_define_artifacts;
DROP TABLE IF EXISTS cdisc_docs_acrf;
DROP TABLE IF EXISTS cdisc_docs_repository;

-- eCTD
DROP TABLE IF EXISTS cdisc_ectd_datasets;
DROP TABLE IF EXISTS cdisc_ectd_reviewers_guide;
DROP TABLE IF EXISTS cdisc_ectd_sdsp;
DROP TABLE IF EXISTS cdisc_ectd_define_xml;

-- IND integration
DROP TABLE IF EXISTS cdisc_ind_integration;
DROP TABLE IF EXISTS cdisc_ind_send;
DROP TABLE IF EXISTS cdisc_ind_iss;
DROP TABLE IF EXISTS cdisc_ind_ise;

-- Compliance
DROP TABLE IF EXISTS cdisc_compliance_rules;
DROP TABLE IF EXISTS cdisc_compliance_results;
DROP TABLE IF EXISTS cdisc_compliance_agency_prefs;
DROP TABLE IF EXISTS cdisc_compliance_versions;

-- Product Quality
DROP TABLE IF EXISTS cdisc_pq_domains;
DROP TABLE IF EXISTS cdisc_pq_stability;
DROP TABLE IF EXISTS cdisc_pq_manufacturing;

-- Medical Device
DROP TABLE IF EXISTS cdisc_device_dx;
DROP TABLE IF EXISTS cdisc_device_de;
DROP TABLE IF EXISTS cdisc_device_relationships;

-- Task management
DROP TABLE IF EXISTS cdisc_task_deliverables;
DROP TABLE IF EXISTS cdisc_task_milestones;
DROP TABLE IF EXISTS cdisc_task_workflows;
DROP TABLE IF EXISTS cdisc_task_validation_queue;
