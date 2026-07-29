-- 20260510_mdx_notifications_and_clinical.sql
--
-- Two adjacent backend domains:
--   mdx_notifications  — cross-cutting "things needing attention" surface
--   clinical_studies / sites / subjects / deviations / aes / endpoints
--     — PMA pivotal trial workspace (and 510(k) clinical when needed)
--
-- Notifications are tenant-scoped + user-scoped (recipient_user_id). Every
-- mutation in the platform that wants to alert a user fires a row here;
-- the kit's notification inbox + the AnA dock both read from this table.
--
-- Clinical study tables extend the existing clinical_ops.studies if
-- present, but live in public.* so AnA + the kit consume them without
-- needing the clinical_ops schema permissions.

-- ─── Notifications ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mdx_notifications (
  id                  serial PRIMARY KEY,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  recipient_user_id   integer REFERENCES users(id),
                                 -- null = org-wide / role-targeted notice
  recipient_role      text,        -- optional role-filter (e.g. 'reg_affairs_lead')
  category            text NOT NULL,
    -- 'submission_status' | 'validation_finding' | 'q_sub_response'
    -- | 'cdx_pairing' | 'ldt_milestone_due' | 'gateway_credential_expiring'
    -- | 'ana_draft_pending' | 'risk_residual_high' | 'capa_due'
    -- | 'study_deviation' | 'enrollment_milestone' | 'admin' | 'system'
  severity            text NOT NULL,  -- 'info' | 'warning' | 'critical'
  title               text NOT NULL,
  body                text,
  resource_type       text,          -- 'submission_transmittal' | 'risk_item' | ...
  resource_id         text,
  action_url          text,          -- in-kit deeplink, e.g. '/submissions/42'
  read_at             timestamptz,
  archived_at         timestamptz,
  metadata            jsonb DEFAULT '{}'::jsonb,
  expires_at          timestamptz,   -- optional auto-archive deadline
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_org_idx       ON mdx_notifications (organization_id);
CREATE INDEX IF NOT EXISTS notif_recipient_idx ON mdx_notifications (recipient_user_id) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notif_unread_idx    ON mdx_notifications (organization_id, recipient_user_id, read_at)
  WHERE read_at IS NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS notif_category_idx  ON mdx_notifications (organization_id, category);

-- ─── Notification subscriptions (per-user opt-in) ────────────────────
-- Each user can opt-in / opt-out of each category. Default behavior is
-- opt-in for everything that matches their role; this table only stores
-- divergences from the default.
CREATE TABLE IF NOT EXISTS mdx_notification_subscriptions (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  user_id           integer NOT NULL REFERENCES users(id),
  category          text NOT NULL,
  email_enabled     boolean DEFAULT false,
  push_enabled      boolean DEFAULT false,
  in_app_enabled    boolean DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notif_sub_uniq ON mdx_notification_subscriptions (user_id, category);
CREATE INDEX IF NOT EXISTS notif_sub_org_idx ON mdx_notification_subscriptions (organization_id);

-- ─── Clinical studies (PMA pivotal + 510(k) clinical) ────────────────
CREATE TABLE IF NOT EXISTS clinical_studies (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid    REFERENCES regulatory_programs(id),
  study_id          text NOT NULL,           -- sponsor's internal id
  nct_id            text,                    -- ClinicalTrials.gov id
  title             text NOT NULL,
  phase             text,                    -- 'pivotal' | 'feasibility' | 'pilot' | 'post_market' | 'pms'
  study_type        text,                    -- 'rct' | 'single_arm' | 'observational' | 'registry'
  intended_use      text,
  primary_endpoint  text,
  primary_endpoint_met boolean,
  sample_size_planned  integer,
  sample_size_enrolled integer DEFAULT 0,
  sample_size_analyzed integer DEFAULT 0,
  status            text DEFAULT 'planning', -- 'planning' | 'enrolling' | 'follow_up' | 'analysis' | 'completed' | 'terminated'
  start_date        date,
  pcd               date,                    -- Primary Completion Date
  scd               date,                    -- Study Completion Date
  ide_number        text,                    -- IDE if applicable
  irb_approved      boolean DEFAULT false,
  irb_approval_date date,
  protocol_version  text,
  sap_version       text,
  bimo_ready        boolean DEFAULT false,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS clin_study_org_idx     ON clinical_studies (organization_id);
CREATE INDEX IF NOT EXISTS clin_study_program_idx ON clinical_studies (program_id);
CREATE INDEX IF NOT EXISTS clin_study_status_idx  ON clinical_studies (organization_id, status);

-- ─── Study sites ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_study_sites (
  id                serial PRIMARY KEY,
  study_id          integer NOT NULL REFERENCES clinical_studies(id) ON DELETE CASCADE,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  site_number       text NOT NULL,
  site_name         text NOT NULL,
  country           text,
  city              text,
  principal_investigator text,
  irb_status        text DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'withdrawn'
  irb_approval_date date,
  activated_at      date,
  closed_at         date,
  enrolled_count    integer DEFAULT 0,
  screen_failures   integer DEFAULT 0,
  withdrawals       integer DEFAULT 0,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clin_site_study_idx ON clinical_study_sites (study_id);
CREATE INDEX IF NOT EXISTS clin_site_org_idx   ON clinical_study_sites (organization_id);

-- ─── Study deviations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_study_deviations (
  id                serial PRIMARY KEY,
  study_id          integer NOT NULL REFERENCES clinical_studies(id) ON DELETE CASCADE,
  site_id           integer REFERENCES clinical_study_sites(id),
  organization_id   integer NOT NULL REFERENCES organizations(id),
  deviation_date    date NOT NULL,
  category          text NOT NULL,          -- 'major' | 'minor' | 'inclusion_exclusion' | 'visit_window' | 'consent' | 'protocol' | 'other'
  description       text NOT NULL,
  subject_id        text,                   -- sponsor's internal subject identifier (no PHI)
  reported_by       integer REFERENCES users(id),
  resolved_at       date,
  resolution_note   text,
  capa_required     boolean DEFAULT false,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clin_dev_study_idx    ON clinical_study_deviations (study_id);
CREATE INDEX IF NOT EXISTS clin_dev_org_idx      ON clinical_study_deviations (organization_id);
CREATE INDEX IF NOT EXISTS clin_dev_category_idx ON clinical_study_deviations (organization_id, category);

-- ─── Adverse events ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_study_aes (
  id                  serial PRIMARY KEY,
  study_id            integer NOT NULL REFERENCES clinical_studies(id) ON DELETE CASCADE,
  site_id             integer REFERENCES clinical_study_sites(id),
  organization_id     integer NOT NULL REFERENCES organizations(id),
  ae_id               text NOT NULL,        -- sponsor's internal AE id
  subject_id          text,
  ae_date             date NOT NULL,
  serious             boolean DEFAULT false,
  unanticipated       boolean DEFAULT false, -- UADE per 21 CFR 812.150(b)
  device_related      text,                  -- 'yes' | 'no' | 'possibly' | 'probably' | 'definitely' | 'unrelated'
  severity            text,                  -- 'mild' | 'moderate' | 'severe'
  outcome             text,                  -- 'recovered' | 'recovering' | 'not_recovered' | 'fatal' | 'unknown'
  preferred_term      text,                  -- MedDRA preferred term
  soc                 text,                  -- MedDRA system organ class
  reported_to_fda_at  date,                  -- MDR submission date
  reported_to_irb_at  date,
  mdr_event_number    text,                  -- MAUDE event identifier
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clin_ae_study_idx ON clinical_study_aes (study_id);
CREATE INDEX IF NOT EXISTS clin_ae_org_idx   ON clinical_study_aes (organization_id);
CREATE INDEX IF NOT EXISTS clin_ae_serious_idx ON clinical_study_aes (organization_id, serious)
  WHERE serious = true;

-- ─── Endpoint results ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_study_endpoints (
  id                 serial PRIMARY KEY,
  study_id           integer NOT NULL REFERENCES clinical_studies(id) ON DELETE CASCADE,
  organization_id    integer NOT NULL REFERENCES organizations(id),
  endpoint_kind      text NOT NULL,         -- 'primary' | 'secondary' | 'exploratory' | 'safety'
  name               text NOT NULL,
  description        text,
  pre_specified      boolean DEFAULT true,
  target_value       text,                  -- the pre-specified target (string to allow units)
  observed_value     text,
  ci_lower           text,
  ci_upper           text,
  p_value            decimal(8,5),
  met                boolean,
  analysis_note      text,
  metadata           jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clin_endpoint_study_idx ON clinical_study_endpoints (study_id);
CREATE INDEX IF NOT EXISTS clin_endpoint_org_idx   ON clinical_study_endpoints (organization_id);
