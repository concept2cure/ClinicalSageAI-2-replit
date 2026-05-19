-- 20260509_submission_gateways.sql
--
-- Multi-region regulatory submission gateway infrastructure. Tracks every
-- transmit attempt to FDA ESG, EMA CESP / EUDAMED, and PMDA Gateway in a
-- single table so ops, audit, and AnA share one source of truth.
--
-- One row per transmit attempt — retries, re-submits, and follow-up acks
-- each get their own row, linked by submission_id (the package being
-- transmitted) and chained via parent_transmittal_id for retries.

-- ─── Submission transmittals (per-attempt log) ────────────────────────
CREATE TABLE IF NOT EXISTS submission_transmittals (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  program_id           uuid    REFERENCES regulatory_programs(id),
  package_id           integer REFERENCES c2c_submission_packages(id),
  parent_transmittal_id integer REFERENCES submission_transmittals(id),
  region               text NOT NULL,            -- 'fda' | 'ema' | 'pmda'
  gateway              text NOT NULL,            -- 'esg' | 'cesp' | 'eudamed' | 'pmda_gateway'
  format               text NOT NULL,            -- 'ectd' | 'estar' | 'eudamed_register' | 'pmda_ectd'
  submission_type      text,                     -- 'original' | 'amendment' | 'response' | 'annual_report' | 'safety'
  transport            text,                     -- 'as2' | 'sftp' | 'rest' | 'soap'
  bundle_path          text,                     -- on-disk path to the package
  bundle_sha256        text,                     -- integrity hash
  bundle_size_bytes    bigint,
  transmission_id      text,                     -- gateway-issued tracking id (MDN id, CESP basket, PMDA receipt)
  status               text NOT NULL DEFAULT 'pending',
                                                 -- 'pending' | 'in_transit' | 'received' | 'rejected'
                                                 -- | 'ack1_received' | 'ack2_received' | 'ack3_received'
                                                 -- | 'validation_passed' | 'validation_failed'
                                                 -- | 'review_started' | 'response_required' | 'completed'
  http_status          integer,                  -- when transport=rest, the response code
  error_class          text,                     -- 'auth' | 'transport' | 'validation' | 'gateway' | 'timeout'
  error_message        text,
  submitted_by         integer REFERENCES users(id),
  submitted_at         timestamptz NOT NULL DEFAULT now(),
  ack_received_at      timestamptz,
  completed_at         timestamptz,
  metadata             jsonb DEFAULT '{}'::jsonb,
  audit_trail_ref      text,                     -- audit_logs.id reference for the originating action
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sub_trans_org_idx       ON submission_transmittals (organization_id);
CREATE INDEX IF NOT EXISTS sub_trans_program_idx   ON submission_transmittals (program_id);
CREATE INDEX IF NOT EXISTS sub_trans_package_idx   ON submission_transmittals (package_id);
CREATE INDEX IF NOT EXISTS sub_trans_region_idx    ON submission_transmittals (organization_id, region);
CREATE INDEX IF NOT EXISTS sub_trans_status_idx    ON submission_transmittals (organization_id, status);
CREATE INDEX IF NOT EXISTS sub_trans_txn_idx       ON submission_transmittals (transmission_id);

-- ─── Per-transmittal validation findings ──────────────────────────────
-- The kit's UI surfaces these as a "validator results" pane. One row per
-- finding (error / warning / info). Validator can be regional (FDA
-- eValidator / EMA-validator / PMDA pre-check) or commercial (Lorenz /
-- GlobalSubmit). We don't run them in-process; we record their output.
CREATE TABLE IF NOT EXISTS submission_validation_findings (
  id                serial PRIMARY KEY,
  transmittal_id    integer NOT NULL REFERENCES submission_transmittals(id) ON DELETE CASCADE,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  validator         text NOT NULL,              -- 'fda_evalidator' | 'ema_validator' | 'pmda_precheck' | 'lorenz' | 'globalsubmit' | 'internal'
  severity          text NOT NULL,              -- 'error' | 'warning' | 'info'
  rule_id           text,                       -- validator rule id (e.g. 'FDA-1059')
  rule_title        text,
  message           text NOT NULL,
  file_path         text,                       -- the specific file/leaf that triggered the finding
  line_number       integer,
  resolved          boolean DEFAULT false,
  resolved_at       timestamptz,
  resolved_by       integer REFERENCES users(id),
  resolution_note   text,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sub_val_trans_idx    ON submission_validation_findings (transmittal_id);
CREATE INDEX IF NOT EXISTS sub_val_org_idx      ON submission_validation_findings (organization_id);
CREATE INDEX IF NOT EXISTS sub_val_sev_idx      ON submission_validation_findings (organization_id, severity, resolved);

-- ─── Gateway credentials registry (per-org, per-region) ───────────────
-- Records which credentials are configured for each (org, region, gateway)
-- combination. Actual secret values live in the platform secrets store
-- (env vars, vault, etc.); this table only flags presence + last-rotation
-- so the kit + AnA can answer "is region X submit-ready?" without
-- accessing the secret material.
CREATE TABLE IF NOT EXISTS submission_gateway_credentials (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  region            text NOT NULL,              -- 'fda' | 'ema' | 'pmda'
  gateway           text NOT NULL,              -- 'esg' | 'cesp' | 'eudamed' | 'pmda_gateway'
  environment       text NOT NULL DEFAULT 'production',  -- 'staging' | 'production'
  credential_kind   text NOT NULL,              -- 'mtls' | 'sftp_key' | 'oauth' | 'api_key' | 'basic_auth'
  identifier        text NOT NULL,              -- username / org id / certificate cn — non-secret display field
  secrets_ref       text NOT NULL,              -- name of the secrets-store key (e.g. 'FDA_ESG_CERT_PATH')
  expires_at        timestamptz,                -- cert / key expiration; null when not applicable
  last_rotated_at   timestamptz,
  status            text NOT NULL DEFAULT 'active', -- 'active' | 'expiring' | 'expired' | 'revoked'
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sub_cred_uniq
  ON submission_gateway_credentials (organization_id, region, gateway, environment);
CREATE INDEX IF NOT EXISTS sub_cred_org_idx    ON submission_gateway_credentials (organization_id);
CREATE INDEX IF NOT EXISTS sub_cred_status_idx ON submission_gateway_credentials (organization_id, status);
