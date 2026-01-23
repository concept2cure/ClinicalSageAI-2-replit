-- Migration 015: Submission Package Assembly + eCTD Manifest
-- Purpose: Assemble complete eCTD submission packages with manifest generation
--
-- Key capabilities:
--   1. eCTD module structure definition
--   2. Package assembly workflow
--   3. eCTD XML manifest generation support
--   4. Package validation rules
--   5. Delivery tracking
--
-- This enables generation of submission-ready eCTD packages.

BEGIN;

CREATE SCHEMA IF NOT EXISTS ectd;

-- =============================================================================
-- A) eCTD Module Structure
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd.module_structure (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Module identification (per ICH eCTD spec)
  module_code TEXT NOT NULL UNIQUE,       -- e.g., "m1", "m2.3", "m2.7.3"
  module_name TEXT NOT NULL,
  parent_module_code TEXT REFERENCES ectd.module_structure(module_code),
  
  -- Module type
  module_level INT NOT NULL,              -- 1, 2, 3, 4, 5
  is_regional BOOLEAN NOT NULL DEFAULT FALSE,  -- m1 modules are regional
  
  -- Content requirements
  content_type TEXT NOT NULL,             -- DOCUMENT | DATASET | STUDY_REPORT | SUMMARY
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Allowed file types
  allowed_file_types TEXT[] NOT NULL DEFAULT ARRAY['pdf'],
  
  -- Regional variants
  fda_specific BOOLEAN NOT NULL DEFAULT FALSE,
  ema_specific BOOLEAN NOT NULL DEFAULT FALSE,
  pmda_specific BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Description
  description TEXT,
  guidance_reference TEXT,                -- ICH/agency guidance reference
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ectd.module_structure IS 
  'eCTD module structure definition per ICH specifications';

CREATE INDEX IF NOT EXISTS module_structure_parent_idx ON ectd.module_structure (parent_module_code);

-- Insert standard eCTD structure
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, is_regional, content_type, is_required, description)
VALUES
  -- Module 1 (Regional)
  ('m1', 'Module 1 - Regional Administrative Information', NULL, 1, TRUE, 'DOCUMENT', TRUE, 'Regional administrative documents'),
  ('m1.1', 'Forms', 'm1', 2, TRUE, 'DOCUMENT', TRUE, 'Application forms'),
  ('m1.2', 'Cover Letters', 'm1', 2, TRUE, 'DOCUMENT', FALSE, 'Cover letters'),
  ('m1.3', 'Administrative Information', 'm1', 2, TRUE, 'DOCUMENT', FALSE, 'Administrative info'),
  
  -- Module 2 (CTD Summaries)
  ('m2', 'Module 2 - CTD Summaries', NULL, 1, FALSE, 'SUMMARY', TRUE, 'Common Technical Document summaries'),
  ('m2.2', 'Introduction', 'm2', 2, FALSE, 'DOCUMENT', TRUE, 'CTD Introduction'),
  ('m2.3', 'Quality Overall Summary', 'm2', 2, FALSE, 'SUMMARY', TRUE, 'QOS'),
  ('m2.4', 'Nonclinical Overview', 'm2', 2, FALSE, 'SUMMARY', TRUE, 'Nonclinical overview'),
  ('m2.5', 'Clinical Overview', 'm2', 2, FALSE, 'SUMMARY', TRUE, 'Clinical overview'),
  ('m2.6', 'Nonclinical Written and Tabulated Summaries', 'm2', 2, FALSE, 'SUMMARY', TRUE, 'Nonclinical summaries'),
  ('m2.7', 'Clinical Summary', 'm2', 2, FALSE, 'SUMMARY', TRUE, 'Clinical summary'),
  ('m2.7.1', 'Summary of Biopharmaceutic Studies', 'm2.7', 3, FALSE, 'SUMMARY', FALSE, 'Biopharm summary'),
  ('m2.7.2', 'Summary of Clinical Pharmacology Studies', 'm2.7', 3, FALSE, 'SUMMARY', FALSE, 'Clinical pharm summary'),
  ('m2.7.3', 'Summary of Clinical Efficacy', 'm2.7', 3, FALSE, 'SUMMARY', TRUE, 'Efficacy summary'),
  ('m2.7.4', 'Summary of Clinical Safety', 'm2.7', 3, FALSE, 'SUMMARY', TRUE, 'Safety summary'),
  ('m2.7.5', 'References', 'm2.7', 3, FALSE, 'DOCUMENT', FALSE, 'Literature references'),
  ('m2.7.6', 'Synopses of Individual Studies', 'm2.7', 3, FALSE, 'SUMMARY', FALSE, 'Study synopses'),
  
  -- Module 3 (Quality)
  ('m3', 'Module 3 - Quality', NULL, 1, FALSE, 'DOCUMENT', TRUE, 'Quality documentation'),
  ('m3.2', 'Body of Data', 'm3', 2, FALSE, 'DOCUMENT', TRUE, 'Quality data'),
  ('m3.2.S', 'Drug Substance', 'm3.2', 3, FALSE, 'DOCUMENT', TRUE, 'Drug substance info'),
  ('m3.2.P', 'Drug Product', 'm3.2', 3, FALSE, 'DOCUMENT', TRUE, 'Drug product info'),
  
  -- Module 4 (Nonclinical)
  ('m4', 'Module 4 - Nonclinical Study Reports', NULL, 1, FALSE, 'STUDY_REPORT', TRUE, 'Nonclinical reports'),
  ('m4.2', 'Study Reports', 'm4', 2, FALSE, 'STUDY_REPORT', TRUE, 'Nonclinical study reports'),
  
  -- Module 5 (Clinical)
  ('m5', 'Module 5 - Clinical Study Reports', NULL, 1, FALSE, 'STUDY_REPORT', TRUE, 'Clinical reports'),
  ('m5.2', 'Tabular Listing of All Clinical Studies', 'm5', 2, FALSE, 'DOCUMENT', TRUE, 'Study listing'),
  ('m5.3', 'Clinical Study Reports', 'm5', 2, FALSE, 'STUDY_REPORT', TRUE, 'CSRs'),
  ('m5.3.5', 'Reports of Efficacy and Safety Studies', 'm5.3', 3, FALSE, 'STUDY_REPORT', TRUE, 'Efficacy/safety CSRs')
ON CONFLICT (module_code) DO NOTHING;

-- =============================================================================
-- B) Submission Packages
-- =============================================================================

CREATE TYPE ectd.package_status AS ENUM (
  'DRAFT', 'ASSEMBLING', 'VALIDATING', 'READY', 'DELIVERED', 'ACKNOWLEDGED'
);

CREATE TABLE IF NOT EXISTS ectd.submission_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Package identification
  package_code TEXT NOT NULL,
  package_title TEXT NOT NULL,
  
  -- Regulatory context
  submission_id UUID REFERENCES regulatory.submissions(id) ON DELETE RESTRICT,
  sequence_number INT NOT NULL DEFAULT 0, -- eCTD sequence (0000, 0001, etc.)
  
  -- Target agency
  agency_code TEXT NOT NULL,              -- FDA, EMA, PMDA, HC
  submission_type TEXT NOT NULL,          -- ORIGINAL, AMENDMENT, SUPPLEMENT
  
  -- Status
  status ectd.package_status NOT NULL DEFAULT 'DRAFT',
  
  -- Linked snapshot
  snapshot_id UUID,
  export_id UUID,
  
  -- Validation
  is_validated BOOLEAN NOT NULL DEFAULT FALSE,
  validation_errors JSONB,
  validated_at TIMESTAMPTZ,
  validated_by TEXT,
  
  -- Manifest
  manifest_xml TEXT,                      -- Generated eCTD index.xml
  manifest_sha256 TEXT,
  
  -- Delivery
  delivered_at TIMESTAMPTZ,
  delivered_by TEXT,
  delivery_method TEXT,                   -- ESG, PORTAL, PHYSICAL
  delivery_confirmation TEXT,
  
  -- Program reference
  program_id UUID REFERENCES core.programs(id) ON DELETE RESTRICT,
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (submission_id, sequence_number)
);

COMMENT ON TABLE ectd.submission_packages IS 
  'eCTD submission packages ready for delivery to regulatory agencies';

CREATE INDEX IF NOT EXISTS packages_submission_idx ON ectd.submission_packages (submission_id);
CREATE INDEX IF NOT EXISTS packages_status_idx ON ectd.submission_packages (status);
CREATE INDEX IF NOT EXISTS packages_program_idx ON ectd.submission_packages (program_id);

-- =============================================================================
-- C) Package Documents (files in the package)
-- =============================================================================

CREATE TYPE ectd.document_status AS ENUM (
  'PENDING', 'INCLUDED', 'EXCLUDED', 'REPLACED'
);

CREATE TABLE IF NOT EXISTS ectd.package_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Package reference
  package_id UUID NOT NULL REFERENCES ectd.submission_packages(id) ON DELETE CASCADE,
  
  -- Document placement in eCTD structure
  module_code TEXT NOT NULL REFERENCES ectd.module_structure(module_code),
  
  -- Document identification
  document_title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,                -- pdf, xml, xpt, etc.
  
  -- Document source
  source_type TEXT NOT NULL,              -- FRAGMENT | SNAPSHOT | UPLOAD | GENERATED
  source_fragment_id UUID,
  source_version_id INT,
  source_snapshot_id UUID,
  source_export_id UUID,
  
  -- Document content
  content_sha256 TEXT NOT NULL,
  file_size_bytes BIGINT,
  page_count INT,
  
  -- eCTD metadata
  ectd_operation TEXT NOT NULL DEFAULT 'new',  -- new, append, replace, delete
  ectd_leaf_id TEXT,                      -- Leaf ID for XML
  modified_file TEXT,                     -- For replace operations
  
  -- Status
  status ectd.document_status NOT NULL DEFAULT 'PENDING',
  
  -- Sequence within module
  sequence_order INT NOT NULL DEFAULT 0,
  
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown'
);

COMMENT ON TABLE ectd.package_documents IS 
  'Individual documents within an eCTD submission package';

CREATE INDEX IF NOT EXISTS package_docs_package_idx ON ectd.package_documents (package_id);
CREATE INDEX IF NOT EXISTS package_docs_module_idx ON ectd.package_documents (module_code);
CREATE INDEX IF NOT EXISTS package_docs_source_idx ON ectd.package_documents (source_fragment_id);

-- =============================================================================
-- D) Validation Rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd.validation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Rule identification
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  
  -- Rule scope
  agency_code TEXT,                       -- NULL = all agencies
  module_code TEXT,                       -- NULL = all modules
  
  -- Rule type
  rule_type TEXT NOT NULL,                -- REQUIRED | FORMAT | NAMING | SIZE | STRUCTURE
  severity TEXT NOT NULL,                 -- ERROR | WARNING | INFO
  
  -- Rule definition
  rule_expression TEXT,                   -- SQL or regex pattern
  error_message TEXT NOT NULL,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Metadata
  guidance_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ectd.validation_rules IS 
  'eCTD validation rules per agency specifications';

-- Insert common validation rules
INSERT INTO ectd.validation_rules (rule_code, rule_name, rule_type, severity, error_message, guidance_reference)
VALUES
  ('ECTD-001', 'PDF/A Compliance', 'FORMAT', 'ERROR', 'Document must be PDF/A compliant', 'ICH M8'),
  ('ECTD-002', 'File Naming Convention', 'NAMING', 'ERROR', 'File name must follow eCTD naming conventions', 'ICH M8'),
  ('ECTD-003', 'Required Module Present', 'REQUIRED', 'ERROR', 'Required module content is missing', 'ICH M4'),
  ('ECTD-004', 'File Size Limit', 'SIZE', 'WARNING', 'File exceeds recommended size limit (100MB)', 'Agency guidance'),
  ('ECTD-005', 'Bookmark Structure', 'STRUCTURE', 'ERROR', 'PDF must contain navigable bookmarks', 'ICH M8'),
  ('ECTD-006', 'Hyperlink Validation', 'STRUCTURE', 'WARNING', 'Hyperlinks should be functional', 'ICH M8'),
  ('ECTD-007', 'Index XML Schema', 'FORMAT', 'ERROR', 'index.xml must validate against eCTD DTD', 'ICH M8')
ON CONFLICT (rule_code) DO NOTHING;

-- =============================================================================
-- E) Validation Results
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd.validation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What was validated
  package_id UUID NOT NULL REFERENCES ectd.submission_packages(id) ON DELETE CASCADE,
  document_id UUID REFERENCES ectd.package_documents(id) ON DELETE CASCADE,
  
  -- Validation rule
  rule_id UUID NOT NULL REFERENCES ectd.validation_rules(id),
  
  -- Result
  passed BOOLEAN NOT NULL,
  severity TEXT NOT NULL,
  message TEXT,
  details JSONB,
  
  -- Attribution
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS validation_results_package_idx ON ectd.validation_results (package_id);
CREATE INDEX IF NOT EXISTS validation_results_doc_idx ON ectd.validation_results (document_id);
CREATE INDEX IF NOT EXISTS validation_results_failed_idx ON ectd.validation_results (passed) 
  WHERE passed = FALSE;

-- =============================================================================
-- F) Delivery Records
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd.delivery_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Package reference
  package_id UUID NOT NULL REFERENCES ectd.submission_packages(id) ON DELETE RESTRICT,
  
  -- Delivery details
  delivery_method TEXT NOT NULL,          -- ESG, PORTAL, PHYSICAL, OTHER
  delivery_destination TEXT NOT NULL,     -- Gateway URL, portal name, etc.
  
  -- Delivery status
  status TEXT NOT NULL,                   -- INITIATED, IN_PROGRESS, COMPLETED, FAILED
  
  -- Timestamps
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Confirmation
  confirmation_number TEXT,
  agency_receipt_number TEXT,
  acknowledgment_received BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledgment_at TIMESTAMPTZ,
  
  -- Error handling
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  
  -- Transfer details
  transfer_size_bytes BIGINT,
  transfer_duration_seconds INT,
  
  -- Attribution
  delivered_by TEXT NOT NULL DEFAULT 'unknown'
);

COMMENT ON TABLE ectd.delivery_records IS 
  'Records of package deliveries to regulatory agencies';

CREATE INDEX IF NOT EXISTS delivery_records_package_idx ON ectd.delivery_records (package_id);
CREATE INDEX IF NOT EXISTS delivery_records_status_idx ON ectd.delivery_records (status);

-- =============================================================================
-- G) Views
-- =============================================================================

-- View: Package assembly status
CREATE OR REPLACE VIEW ectd.v_package_status AS
SELECT 
  pkg.id,
  pkg.package_code,
  pkg.package_title,
  pkg.agency_code,
  pkg.sequence_number,
  pkg.status,
  pkg.is_validated,
  pkg.program_id,
  p.program_code,
  
  -- Document counts
  COUNT(doc.id) AS total_documents,
  COUNT(doc.id) FILTER (WHERE doc.status = 'INCLUDED') AS included_documents,
  COUNT(doc.id) FILTER (WHERE doc.status = 'PENDING') AS pending_documents,
  
  -- Validation summary
  COUNT(vr.id) FILTER (WHERE vr.passed = FALSE AND vr.severity = 'ERROR') AS error_count,
  COUNT(vr.id) FILTER (WHERE vr.passed = FALSE AND vr.severity = 'WARNING') AS warning_count,
  
  -- Module coverage
  (SELECT COUNT(DISTINCT module_code) FROM ectd.package_documents WHERE package_id = pkg.id) AS modules_populated,
  
  pkg.created_at,
  pkg.updated_at

FROM ectd.submission_packages pkg
LEFT JOIN core.programs p ON p.id = pkg.program_id
LEFT JOIN ectd.package_documents doc ON doc.package_id = pkg.id
LEFT JOIN ectd.validation_results vr ON vr.package_id = pkg.id
GROUP BY pkg.id, p.program_code;

-- View: Module completion status
CREATE OR REPLACE VIEW ectd.v_module_completion AS
SELECT 
  pkg.id AS package_id,
  pkg.package_code,
  ms.module_code,
  ms.module_name,
  ms.is_required,
  COALESCE(COUNT(doc.id), 0) AS document_count,
  CASE 
    WHEN COUNT(doc.id) > 0 THEN 'POPULATED'
    WHEN ms.is_required THEN 'MISSING'
    ELSE 'OPTIONAL'
  END AS completion_status
FROM ectd.submission_packages pkg
CROSS JOIN ectd.module_structure ms
LEFT JOIN ectd.package_documents doc ON doc.package_id = pkg.id AND doc.module_code = ms.module_code
WHERE ms.module_level <= 2  -- Only show top-level modules
GROUP BY pkg.id, pkg.package_code, ms.module_code, ms.module_name, ms.is_required;

-- View: Delivery dashboard
CREATE OR REPLACE VIEW ectd.v_delivery_dashboard AS
SELECT 
  pkg.id AS package_id,
  pkg.package_code,
  pkg.agency_code,
  pkg.status AS package_status,
  dr.delivery_method,
  dr.status AS delivery_status,
  dr.initiated_at,
  dr.completed_at,
  dr.confirmation_number,
  dr.acknowledgment_received,
  pkg.program_id,
  p.program_code
FROM ectd.submission_packages pkg
LEFT JOIN ectd.delivery_records dr ON dr.package_id = pkg.id
LEFT JOIN core.programs p ON p.id = pkg.program_id
WHERE pkg.status IN ('READY', 'DELIVERED', 'ACKNOWLEDGED');

COMMIT;
