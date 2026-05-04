-- CAPA + complaint + MDR / vigilance migration.
--
-- Mirrors shared/schema/capa-mdr.ts. Hand-authored to match the Drizzle
-- table definitions. Tenant isolation is enforced at the service layer
-- by joining regulatoryPrograms.organization_id, matching the q-sub /
-- evidence-sufficiency / post-market pattern.
--
-- Regulatory backbone: 21 CFR 820.198, 820.100, 803, 806; EU MDR Reg
-- 2017/745 Article 87; ISO 13485 §8.2; ISO 14971 §10.

BEGIN;

-- ─── complaints ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id                  text NOT NULL,
  complaint_code              varchar(64) NOT NULL,

  source                      varchar(32) NOT NULL,
  channel                     varchar(32) NOT NULL,
  received_at                 timestamptz NOT NULL,

  reporter                    json,

  device_udi_di               varchar(64),
  device_lot                  varchar(64),
  device_serial               varchar(128),
  device_model                varchar(128),

  event_date                  timestamptz,
  event_location_country      varchar(8),
  event_narrative             text NOT NULL,

  patient_harm                varchar(24) NOT NULL DEFAULT 'none',
  severity_assessment         varchar(24) NOT NULL DEFAULT 'minor',

  preliminary_classification  json,

  triage_state                varchar(32) NOT NULL DEFAULT 'new',
  triage_decision             json,
  triaged_by                  text,
  triaged_at                  timestamptz,

  linked_mdr_event_id         uuid,
  linked_capa_id              uuid,

  closed_at                   timestamptz,
  closed_by                   text,
  closure_reason              text,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  text,
  updated_by                  text,

  CONSTRAINT complaints_source_chk CHECK (source IN
    ('customer','distributor','clinical_trial','internal','regulator','literature','service','other')),
  CONSTRAINT complaints_channel_chk CHECK (channel IN
    ('phone','email','web_form','service_call','salesforce','servicenow','mail','in_person','other')),
  CONSTRAINT complaints_patient_harm_chk CHECK (patient_harm IN
    ('none','malfunction','injury','serious_injury','death')),
  CONSTRAINT complaints_severity_chk CHECK (severity_assessment IN
    ('negligible','minor','serious','critical')),
  CONSTRAINT complaints_triage_state_chk CHECK (triage_state IN
    ('new','triaged','investigation','resolved','closed','escalated_capa','escalated_mdr'))
);
CREATE INDEX IF NOT EXISTS complaints_program_idx     ON complaints (program_id);
CREATE INDEX IF NOT EXISTS complaints_state_idx       ON complaints (triage_state);
CREATE INDEX IF NOT EXISTS complaints_received_idx    ON complaints (received_at);
CREATE INDEX IF NOT EXISTS complaints_udi_idx         ON complaints (device_udi_di);
CREATE INDEX IF NOT EXISTS complaints_severity_idx    ON complaints (severity_assessment);
CREATE UNIQUE INDEX IF NOT EXISTS complaints_code_uq  ON complaints (complaint_code);

-- ─── mdr_events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mdr_events (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id                  text NOT NULL,
  mdr_code                    varchar(64) NOT NULL,

  source_complaint_id         uuid REFERENCES complaints(id) ON DELETE SET NULL,

  jurisdiction                varchar(16) NOT NULL,

  us_fda_report_type          varchar(24),
  fda_report_number           varchar(64),
  fda_patient_code            varchar(32),
  fda_device_problem_code     varchar(32),
  fda_health_effect_code      varchar(32),

  eu_mdr_severity             varchar(32),
  eu_report_number            varchar(64),

  decision_date               timestamptz NOT NULL,
  report_due_at               timestamptz,
  report_filed_at             timestamptz,
  report_confirmation_code    varchar(128),
  days_to_due                 integer,

  event_narrative             text NOT NULL,
  patient_outcome             text,
  corrections_taken           text,

  attachment_refs             json,

  state                       varchar(32) NOT NULL DEFAULT 'open',

  linked_capa_id              uuid,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  text,
  updated_by                  text,

  CONSTRAINT mdr_jurisdiction_chk CHECK (jurisdiction IN
    ('us_fda','eu_mdr','both','other')),
  CONSTRAINT mdr_fda_type_chk CHECK (us_fda_report_type IS NULL OR us_fda_report_type IN
    ('initial_5day','initial_30day','supplemental','followup','annual','not_reportable')),
  CONSTRAINT mdr_eu_severity_chk CHECK (eu_mdr_severity IS NULL OR eu_mdr_severity IN
    ('life_threatening_2day','death_or_serious_10day','other_serious_15day','not_reportable')),
  CONSTRAINT mdr_state_chk CHECK (state IN
    ('open','preparing','filed','acknowledged','followup_required','closed'))
);
CREATE INDEX IF NOT EXISTS mdr_events_program_idx       ON mdr_events (program_id);
CREATE INDEX IF NOT EXISTS mdr_events_state_idx         ON mdr_events (state);
CREATE INDEX IF NOT EXISTS mdr_events_jurisdiction_idx  ON mdr_events (jurisdiction);
CREATE INDEX IF NOT EXISTS mdr_events_due_idx           ON mdr_events (report_due_at);
CREATE INDEX IF NOT EXISTS mdr_events_source_idx        ON mdr_events (source_complaint_id);
CREATE UNIQUE INDEX IF NOT EXISTS mdr_events_code_uq    ON mdr_events (mdr_code);
CREATE UNIQUE INDEX IF NOT EXISTS mdr_events_fda_report_uq ON mdr_events (fda_report_number)
  WHERE fda_report_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mdr_events_eu_report_uq  ON mdr_events (eu_report_number)
  WHERE eu_report_number IS NOT NULL;

-- ─── capa_records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capa_records (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id                    text NOT NULL,
  capa_code                     varchar(64) NOT NULL,

  title                         text NOT NULL,
  summary                       text,

  type                          varchar(16) NOT NULL,
  source                        varchar(32) NOT NULL,
  source_refs                   json,

  risk_level                    varchar(16) NOT NULL DEFAULT 'medium',

  assigned_to                   text,
  target_close_date             timestamptz,

  problem_statement             text,
  containment_actions           text,
  root_cause_analysis           json,
  corrective_action_plan        text,

  effectiveness_check_criteria  text,
  effectiveness_check_result    json,

  state                         varchar(32) NOT NULL DEFAULT 'open',

  closed_at                     timestamptz,
  closed_by                     text,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    text,
  updated_by                    text,

  CONSTRAINT capa_type_chk CHECK (type IN ('corrective','preventive','both')),
  CONSTRAINT capa_source_chk CHECK (source IN
    ('complaint','internal_audit','external_audit','mdr','nonconformance',
     'management_review','supplier','inspection_finding','risk_review',
     'trend_signal','other')),
  CONSTRAINT capa_risk_chk CHECK (risk_level IN ('low','medium','high','critical')),
  CONSTRAINT capa_state_chk CHECK (state IN
    ('open','investigation','action_planned','action_implemented',
     'effectiveness_check','closed_effective','closed_not_effective','escalated'))
);
CREATE INDEX IF NOT EXISTS capa_records_program_idx     ON capa_records (program_id);
CREATE INDEX IF NOT EXISTS capa_records_state_idx       ON capa_records (state);
CREATE INDEX IF NOT EXISTS capa_records_risk_idx        ON capa_records (risk_level);
CREATE INDEX IF NOT EXISTS capa_records_source_idx      ON capa_records (source);
CREATE INDEX IF NOT EXISTS capa_records_target_idx      ON capa_records (target_close_date);
CREATE UNIQUE INDEX IF NOT EXISTS capa_records_code_uq  ON capa_records (capa_code);

-- ─── capa_actions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capa_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capa_id           uuid NOT NULL REFERENCES capa_records(id) ON DELETE CASCADE,
  n                 integer NOT NULL,

  type              varchar(32) NOT NULL,
  description       text NOT NULL,

  owner             text,
  due_date          timestamptz,
  completed_at      timestamptz,
  completed_by      text,

  evidence_refs     json,
  state             varchar(16) NOT NULL DEFAULT 'planned',

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT capa_action_type_chk CHECK (type IN
    ('containment','corrective','preventive','training','document_change',
     'process_change','supplier_action','communication','verification','other')),
  CONSTRAINT capa_action_state_chk CHECK (state IN
    ('planned','in_progress','done','blocked','cancelled'))
);
CREATE INDEX IF NOT EXISTS capa_actions_capa_idx        ON capa_actions (capa_id);
CREATE INDEX IF NOT EXISTS capa_actions_state_idx       ON capa_actions (state);
CREATE INDEX IF NOT EXISTS capa_actions_owner_idx       ON capa_actions (owner);
CREATE UNIQUE INDEX IF NOT EXISTS capa_actions_capa_n_uq ON capa_actions (capa_id, n);

-- ─── vigilance_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vigilance_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id    text NOT NULL,

  kind          varchar(48) NOT NULL,
  entity_type   varchar(24) NOT NULL,
  entity_id     uuid NOT NULL,

  actor         text,
  actor_role    varchar(32),

  occurred_at   timestamptz NOT NULL,
  payload       json,
  reason        text,
  signature_id  uuid,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vigilance_kind_chk CHECK (kind IN
    ('complaint_received','complaint_triaged','complaint_state_changed',
     'mdr_opened','mdr_clock_computed','mdr_filed','mdr_acknowledged','mdr_state_changed',
     'capa_opened','capa_state_changed','capa_action_added','capa_action_completed',
     'capa_effectiveness_verified','capa_closed','note')),
  CONSTRAINT vigilance_entity_type_chk CHECK (entity_type IN
    ('complaint','mdr_event','capa_record','capa_action'))
);
CREATE INDEX IF NOT EXISTS vigilance_events_program_idx  ON vigilance_events (program_id);
CREATE INDEX IF NOT EXISTS vigilance_events_entity_idx   ON vigilance_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS vigilance_events_kind_idx     ON vigilance_events (kind);
CREATE INDEX IF NOT EXISTS vigilance_events_occurred_idx ON vigilance_events (occurred_at);

COMMIT;
