-- 20260507_mdx_beta_surfaces.sql
--
-- Add the three domain tables the MDX paying-client beta needs that don't
-- yet exist: UDI records, risk management (ISO 14971), software lifecycle
-- (IEC 62304). All are tenant-scoped (organization_id NOT NULL) and
-- program-scoped where the artifact belongs to a specific program.
--
-- Audit + soft-delete columns follow the platform convention (created_at /
-- updated_at NOT NULL, deleted_at nullable). No row-level security here —
-- tenant scoping is enforced at the service layer via JOINs against
-- regulatory_programs.organization_id, matching how cerv2_510k_sections,
-- safety_signals, and saved_precedent_queries handle isolation.
--
-- All three tables get a (organization_id, program_id) composite index for
-- the kit's per-program filters. UDI also gets a unique (org, udi_di) index
-- because UDI-DI is globally unique within a Issuing Agency assignment.

-- ─── UDI records (one row per device variant) ─────────────────────────
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
CREATE INDEX  IF NOT EXISTS udi_records_org_idx          ON udi_records (organization_id);
CREATE INDEX  IF NOT EXISTS udi_records_program_idx      ON udi_records (program_id);
CREATE INDEX  IF NOT EXISTS udi_records_org_program_idx  ON udi_records (organization_id, program_id);
CREATE UNIQUE INDEX IF NOT EXISTS udi_records_org_di_uniq
  ON udi_records (organization_id, udi_di)
  WHERE deleted_at IS NULL;

-- ─── Risk management (ISO 14971) — hazard / harm / control matrix ─────
CREATE TABLE IF NOT EXISTS risk_items (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid REFERENCES regulatory_programs(id),
  ref_code          text,                 -- e.g. 'RISK-0042' display id
  hazard            text NOT NULL,        -- the hazard itself
  hazardous_situation text,               -- circumstance that exposes patient
  harm              text NOT NULL,        -- the resulting harm
  sequence_of_events text,                -- how hazard becomes harm
  severity          integer NOT NULL,     -- 1..5 (catastrophic..negligible scale per ISO 14971)
  probability       integer NOT NULL,     -- 1..5 (frequent..improbable)
  detectability     integer,              -- 1..5 (very low..very high)
  initial_risk      integer,              -- derived = severity * probability
  residual_severity integer,
  residual_probability integer,
  residual_risk     integer,              -- after risk controls applied
  control_strategy  text,                 -- 'design_eliminate' | 'design_reduce' | 'protective' | 'information'
  acceptable        boolean,              -- residual risk acceptable per risk policy
  benefit_risk_rationale text,            -- when residual risk NOT acceptable but benefit outweighs
  status            text NOT NULL DEFAULT 'open', -- 'open' | 'mitigating' | 'verified' | 'accepted' | 'closed'
  source            text,                 -- 'fmea' | 'pha' | 'fault_tree' | 'literature' | 'complaint' | 'capa'
  assigned_to       integer REFERENCES users(id),
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS risk_items_org_idx          ON risk_items (organization_id);
CREATE INDEX IF NOT EXISTS risk_items_program_idx      ON risk_items (program_id);
CREATE INDEX IF NOT EXISTS risk_items_status_idx       ON risk_items (organization_id, status);
CREATE INDEX IF NOT EXISTS risk_items_org_program_idx  ON risk_items (organization_id, program_id);

CREATE TABLE IF NOT EXISTS risk_controls (
  id                serial PRIMARY KEY,
  risk_item_id      integer NOT NULL REFERENCES risk_items(id) ON DELETE CASCADE,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  description       text NOT NULL,
  control_type      text NOT NULL,        -- 'inherent_safety' | 'protective_measure' | 'information_safety'
  implementation_evidence text,           -- link / artifact / test report ref
  verification_evidence text,             -- proof the control is implemented
  effectiveness_evidence text,            -- proof the control actually reduces risk
  introduces_new_risk boolean DEFAULT false,
  new_risk_item_id  integer REFERENCES risk_items(id),
  status            text NOT NULL DEFAULT 'proposed',
                                          -- 'proposed' | 'implemented' | 'verified' | 'effective'
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS risk_controls_item_idx ON risk_controls (risk_item_id);
CREATE INDEX IF NOT EXISTS risk_controls_org_idx  ON risk_controls (organization_id);

-- ─── Software lifecycle (IEC 62304) — per-device software deliverables ─
CREATE TABLE IF NOT EXISTS software_lifecycle_items (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid REFERENCES regulatory_programs(id),
  doc_level         text NOT NULL,        -- 'basic' | 'enhanced' per FDA 2023 software guidance
  safety_class      text,                 -- 'A' | 'B' | 'C' per IEC 62304
  item_kind         text NOT NULL,
    -- 'srs' | 'sds' | 'arch' | 'unit_test' | 'integration_test' | 'system_test'
    -- 'release_note' | 'anomaly_log' | 'ots_list' | 'sbom' | 'pentest' | 'threat_model'
    -- 'risk_control' | 'use_error' | 'cybersecurity_label'
  title             text NOT NULL,
  identifier        text,                 -- e.g. 'SRS-1.0', 'SBOM-2026Q2'
  status            text NOT NULL DEFAULT 'draft',
                                          -- 'draft' | 'in_review' | 'approved' | 'superseded'
  evidence_artifact_id integer,           -- optional fk into concept2cure_artifacts
  notes             text,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS software_items_org_idx          ON software_lifecycle_items (organization_id);
CREATE INDEX IF NOT EXISTS software_items_program_idx      ON software_lifecycle_items (program_id);
CREATE INDEX IF NOT EXISTS software_items_kind_idx         ON software_lifecycle_items (organization_id, item_kind);
CREATE INDEX IF NOT EXISTS software_items_org_program_idx  ON software_lifecycle_items (organization_id, program_id);

-- ─── Q-Sub briefing-document body (per-section markdown) ──────────────
-- Lightweight side-table so the briefing editor can save per-section
-- content without touching the q_submissions row. Each section_key is one
-- of the 8 canonical briefing sections (see brief delivered to Claude
-- Design). draft_source flips to 'ana' when write_q_sub_section was used.
CREATE TABLE IF NOT EXISTS q_sub_section_bodies (
  id                serial PRIMARY KEY,
  q_submission_id   uuid NOT NULL REFERENCES q_submissions(id) ON DELETE CASCADE,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  section_key       text NOT NULL,
  content           text,
  draft_source      text,                 -- 'ana' | 'human' | NULL
  drafted_at        timestamptz,
  drafted_summary   text,
  accepted_at       timestamptz,
  accepted_by       integer REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS q_sub_section_uniq
  ON q_sub_section_bodies (q_submission_id, section_key);
CREATE INDEX IF NOT EXISTS q_sub_section_org_idx
  ON q_sub_section_bodies (organization_id);

-- ─── Default-template flag (per org, per granule) ─────────────────────
-- Surface 12 (Templates browser) wants a "set as default" affordance.
-- ectd_templates already has is_default, but we need an org+granule
-- uniqueness so only one default per (org, granule_id) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ectd_templates_default_uniq
  ON ectd_templates (organization_id, granule_id)
  WHERE is_default = true;
