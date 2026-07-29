-- 20260511_qms_and_labeling.sql
--
-- Two adjacent domains, both required for any medical-device manufacturer
-- in routine production:
--
--   QMS (21 CFR 820 → QMSR effective Feb 2026, ISO 13485):
--     qms_documents        — controlled-document register
--     qms_training_records — per-user, per-document training acknowledgments
--     qms_suppliers        — approved supplier list + quality agreements
--     qms_internal_audits  — internal audit schedule + reports
--     qms_management_reviews — quarterly / annual management review records
--     qms_nonconforming_products — NC log + dispositions
--
--   Labeling:
--     labeling_documents     — IFU, package insert, patient label, operator manual
--     labeling_translations  — language variants of a labeling document
--     labeling_symbols       — ISO 15223-1 symbol usage per labeling document
--
-- All tenant-scoped via organization_id NOT NULL; soft-delete via
-- deleted_at where mutation is expected.

-- ─── QMS document register ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qms_documents (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  doc_number        text NOT NULL,              -- e.g. SOP-001, WI-014, FORM-22
  title             text NOT NULL,
  doc_type          text NOT NULL,              -- 'sop' | 'wi' | 'form' | 'spec' | 'policy' | 'manual' | 'protocol'
  category          text,                       -- 'design' | 'production' | 'capa' | 'training' | 'purchasing' | 'mgmt' | 'misc'
  version           text NOT NULL DEFAULT '1.0',
  status            text NOT NULL DEFAULT 'draft', -- 'draft' | 'in_review' | 'effective' | 'superseded' | 'retired'
  effective_date    date,
  next_review_date  date,
  author_id         integer REFERENCES users(id),
  approver_id       integer REFERENCES users(id),
  approved_at       timestamptz,
  superseded_by_id  integer REFERENCES qms_documents(id),
  artifact_id       integer,                    -- optional fk into concept2cure_artifacts
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_doc_org_number_uniq
  ON qms_documents (organization_id, doc_number)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS qms_doc_org_idx     ON qms_documents (organization_id);
CREATE INDEX IF NOT EXISTS qms_doc_status_idx  ON qms_documents (organization_id, status);

-- ─── QMS training records ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qms_training_records (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  user_id           integer NOT NULL REFERENCES users(id),
  document_id       integer NOT NULL REFERENCES qms_documents(id) ON DELETE CASCADE,
  document_version  text NOT NULL,
  acknowledged_at   timestamptz NOT NULL DEFAULT now(),
  acknowledgment_method text,                   -- 'electronic_signature' | 'attestation' | 'trainer_verified'
  trainer_id        integer REFERENCES users(id),
  quiz_score        integer,                    -- 0..100 when a quiz gate is configured
  expires_at        timestamptz,                -- annual / periodic refresh
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qms_train_user_idx     ON qms_training_records (user_id);
CREATE INDEX IF NOT EXISTS qms_train_doc_idx      ON qms_training_records (document_id);
CREATE INDEX IF NOT EXISTS qms_train_org_idx      ON qms_training_records (organization_id);
CREATE INDEX IF NOT EXISTS qms_train_expires_idx  ON qms_training_records (organization_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- ─── QMS suppliers + quality agreements ────────────────────────────────
CREATE TABLE IF NOT EXISTS qms_suppliers (
  id                  serial PRIMARY KEY,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  supplier_name       text NOT NULL,
  supplier_code       text,                     -- internal code
  scope               text,                     -- what they supply
  criticality         text NOT NULL,            -- 'critical' | 'major' | 'minor'
  approval_status     text NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'conditional' | 'revoked'
  approval_date       date,
  reapproval_date     date,                     -- when periodic re-evaluation is due
  quality_agreement_id integer,                  -- fk into qms_documents
  last_audit_date     date,
  next_audit_date     date,
  iso_certifications  text[],                   -- ['ISO 13485:2016', 'ISO 9001:2015']
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS qms_supp_org_idx     ON qms_suppliers (organization_id);
CREATE INDEX IF NOT EXISTS qms_supp_status_idx  ON qms_suppliers (organization_id, approval_status);

-- ─── QMS internal audits ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qms_internal_audits (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  audit_number      text NOT NULL,
  scope             text NOT NULL,              -- which process / area / regulation
  audit_standard    text,                       -- 'ISO 13485:2016' | '21 CFR 820' | 'QMSR' | 'MDSAP'
  auditor_lead_id   integer REFERENCES users(id),
  auditor_team      integer[],                  -- user_ids of audit team
  planned_date      date,
  started_at        date,
  completed_at      date,
  status            text NOT NULL DEFAULT 'planned',
                                                -- 'planned' | 'in_progress' | 'closed' | 'cancelled'
  finding_count     integer DEFAULT 0,
  major_findings    integer DEFAULT 0,
  minor_findings    integer DEFAULT 0,
  observations      integer DEFAULT 0,
  report_artifact_id integer,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qms_audit_org_idx    ON qms_internal_audits (organization_id);
CREATE INDEX IF NOT EXISTS qms_audit_status_idx ON qms_internal_audits (organization_id, status);

-- ─── QMS management reviews ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qms_management_reviews (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  review_date       date NOT NULL,
  period            text NOT NULL,              -- 'Q1-2026', 'Annual-2026'
  chair_id          integer REFERENCES users(id),
  attendees         integer[],                  -- user_ids
  inputs            jsonb,                      -- structured agenda inputs per ISO 13485 §5.6.2
  outputs           jsonb,                      -- decisions + actions per §5.6.3
  open_action_count integer DEFAULT 0,
  closed_action_count integer DEFAULT 0,
  minutes_artifact_id integer,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qms_mr_org_idx    ON qms_management_reviews (organization_id);
CREATE INDEX IF NOT EXISTS qms_mr_date_idx   ON qms_management_reviews (organization_id, review_date DESC);

-- ─── QMS nonconforming products ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qms_nonconforming_products (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  nc_number         text NOT NULL,
  device_name       text,
  lot_or_serial     text,
  detected_at       timestamptz NOT NULL DEFAULT now(),
  detected_by       integer REFERENCES users(id),
  source            text,                       -- 'in_process' | 'final_inspection' | 'complaint' | 'audit' | 'supplier'
  description       text NOT NULL,
  disposition       text,                       -- 'use_as_is' | 'rework' | 'regrade' | 'scrap' | 'return_to_supplier' | 'pending'
  disposition_rationale text,
  disposition_at    timestamptz,
  capa_linked       boolean DEFAULT false,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qms_nc_org_idx ON qms_nonconforming_products (organization_id);
CREATE INDEX IF NOT EXISTS qms_nc_dispo_idx ON qms_nonconforming_products (organization_id, disposition);

-- ─── Labeling documents ────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS lbl_doc_org_idx     ON labeling_documents (organization_id);
CREATE INDEX IF NOT EXISTS lbl_doc_program_idx ON labeling_documents (program_id);
CREATE INDEX IF NOT EXISTS lbl_doc_kind_idx    ON labeling_documents (organization_id, doc_kind);

-- ─── Labeling translations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labeling_translations (
  id                  serial PRIMARY KEY,
  labeling_document_id integer NOT NULL REFERENCES labeling_documents(id) ON DELETE CASCADE,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  language            text NOT NULL,            -- BCP 47 tag, e.g. 'de-DE', 'ja-JP', 'fr-CA'
  translator          text,
  translation_method  text,                     -- 'human' | 'mt_postedited' | 'machine'
  back_translation_verified boolean DEFAULT false,
  status              text NOT NULL DEFAULT 'pending',
                                                -- 'pending' | 'in_progress' | 'review' | 'approved' | 'rejected'
  artifact_id         integer,
  approved_at         timestamptz,
  approved_by         integer REFERENCES users(id),
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lbl_trans_uniq
  ON labeling_translations (labeling_document_id, language);
CREATE INDEX IF NOT EXISTS lbl_trans_org_idx ON labeling_translations (organization_id);

-- ─── Labeling symbols (ISO 15223-1) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS labeling_symbols (
  id                  serial PRIMARY KEY,
  labeling_document_id integer NOT NULL REFERENCES labeling_documents(id) ON DELETE CASCADE,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  symbol_code         text NOT NULL,            -- ISO 15223-1 reference number (e.g. '5.4.3')
  symbol_name         text NOT NULL,            -- 'Caution', 'Manufacturer', 'Date of manufacture', etc.
  description         text,                     -- explanatory text
  required_by         text[],                   -- ['FDA', 'EU', 'PMDA']
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lbl_sym_doc_idx  ON labeling_symbols (labeling_document_id);
CREATE INDEX IF NOT EXISTS lbl_sym_org_idx  ON labeling_symbols (organization_id);
CREATE INDEX IF NOT EXISTS lbl_sym_code_idx ON labeling_symbols (organization_id, symbol_code);
