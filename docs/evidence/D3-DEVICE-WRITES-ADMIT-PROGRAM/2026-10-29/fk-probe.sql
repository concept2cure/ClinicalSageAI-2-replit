\set ON_ERROR_STOP off
\set VERBOSITY terse
-- Minimal parents. regulatory_programs: uuid id, integer organization, soft delete.
CREATE TABLE organizations (id integer PRIMARY KEY);
CREATE TABLE users (id integer PRIMARY KEY);
CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id), deleted_at timestamptz);
-- Verbatim from migrations/20260507_mdx_beta_surfaces.sql (on C2C_MIGRATION_FILES):
CREATE TABLE IF NOT EXISTS udi_records (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid REFERENCES regulatory_programs(id),
  device_name       text   NOT NULL,
  udi_di            text   NOT NULL,
  udi_pi_format     text,                 -- AIDC / HRI / both
  issuing_agency    text   NOT NULL,      -- GS1 / HIBCC / ICCBBA
  gmdn_code         text,
  device_class      text,                 -- I / IIa / IIb / III (EU) or I/II/III (US)
  product_code      text,                 -- FDA 3-letter product code
  brand_name        text,
  catalog_number    text,
  version_or_model  text,
  package_qty       integer,
  package_type      text,
  mri_safety        text,                 -- mri_safe / mri_conditional / mri_unsafe / not_evaluated
  lot_serial        text,                 -- 'lot' | 'serial' | 'none'
  prescription_use  boolean DEFAULT true,
  hctp              boolean DEFAULT false, -- human cell, tissue, or cellular and tissue-based product
  kit               boolean DEFAULT false,
  single_use        boolean DEFAULT false,
  rx_only           boolean DEFAULT true,
  gudid_submitted_at timestamptz,
  gudid_status      text DEFAULT 'draft', -- draft / submitted / published / rejected
  gudid_payload     jsonb,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
-- Verbatim from migrations/20260511_qms_and_labeling.sql (on C2C_MIGRATION_FILES):
CREATE TABLE IF NOT EXISTS labeling_documents (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid    REFERENCES regulatory_programs(id),
  device_name       text NOT NULL,
  doc_kind          text NOT NULL,              -- 'ifu' | 'package_insert' | 'patient_label' | 'operator_manual' | 'service_manual' | 'quick_ref' | 'box_label'
  version           text NOT NULL DEFAULT '1.0',
  status            text NOT NULL DEFAULT 'draft', -- 'draft' | 'review' | 'approved' | 'effective' | 'superseded'
  language          text NOT NULL DEFAULT 'en', -- primary language tag
  region            text,                       -- 'us' | 'eu' | 'jp' | 'global'
  udi_di            text,                       -- linked UDI-DI when device-specific
  effective_date    date,
  expires_at        date,
  artifact_id       integer,                    -- fk into concept2cure_artifacts
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
-- As migrations/20261013b_qms_inspection_same_org_keys.sql adds it for labeling_documents.program_id:
CREATE UNIQUE INDEX regulatory_programs_id_org_uq ON public.regulatory_programs (id, organization_id);
ALTER TABLE public.labeling_documents ADD CONSTRAINT labeling_documents_program_same_org_fk FOREIGN KEY (program_id, organization_id)
  REFERENCES public.regulatory_programs (id, organization_id) ON DELETE NO ACTION ON UPDATE NO ACTION;

INSERT INTO organizations VALUES (7), (8);
INSERT INTO regulatory_programs VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 7, NULL),   -- OWN
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 8, NULL),   -- FOREIGN (organization 8)
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 7, now());  -- DELETED (organization 7, soft-deleted)
-- MISSING: cccccccc-cccc-4ccc-8ccc-cccccccccccc is in no table.
\echo '-- organization 7 files a UDI record under OWN'
INSERT INTO udi_records (organization_id, program_id, device_name, udi_di, issuing_agency) VALUES (7, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CGM v2', '00819000000000', 'GS1') RETURNING id, program_id;
\echo '-- organization 7 files a UDI record under FOREIGN'
INSERT INTO udi_records (organization_id, program_id, device_name, udi_di, issuing_agency) VALUES (7, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'CGM v2', '00819000000001', 'GS1') RETURNING id, program_id;
\echo '-- organization 7 files a UDI record under MISSING'
INSERT INTO udi_records (organization_id, program_id, device_name, udi_di, issuing_agency) VALUES (7, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'CGM v2', '00819000000002', 'GS1') RETURNING id, program_id;
\echo '-- organization 7 files a UDI record under DELETED'
INSERT INTO udi_records (organization_id, program_id, device_name, udi_di, issuing_agency) VALUES (7, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'CGM v2', '00819000000003', 'GS1') RETURNING id, program_id;
\echo '-- organization 7 files a labeling document under OWN'
INSERT INTO labeling_documents (organization_id, program_id, device_name, doc_kind) VALUES (7, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CGM v2', 'ifu') RETURNING id, program_id;
\echo '-- organization 7 files a labeling document under FOREIGN'
INSERT INTO labeling_documents (organization_id, program_id, device_name, doc_kind) VALUES (7, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'CGM v2', 'ifu') RETURNING id, program_id;
\echo '-- organization 7 files a labeling document under MISSING'
INSERT INTO labeling_documents (organization_id, program_id, device_name, doc_kind) VALUES (7, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'CGM v2', 'ifu') RETURNING id, program_id;
\echo '-- organization 7 files a labeling document under DELETED'
INSERT INTO labeling_documents (organization_id, program_id, device_name, doc_kind) VALUES (7, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'CGM v2', 'ifu') RETURNING id, program_id;
\echo '-- rows stored'
SELECT 'udi_records' AS t, program_id FROM udi_records UNION ALL SELECT 'labeling_documents', program_id FROM labeling_documents ORDER BY 1,2;
