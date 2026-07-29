-- ============================================================================
-- Design controls (Design History File) + Risk Management File (ISO 14971)
-- ============================================================================
--
-- Closes the Tier-1 IVD-lifecycle audit gaps:
--   - "Design Controls / DHF — absent" (21 CFR 820.30 / ISO 13485 §7.3)
--   - "Risk Management File — stub only" (ISO 14971:2019)
--
-- Tenant model mirrors ivd_performance / qms tables: organization_id is
-- mandatory and program_id is an optional link into regulatory_programs.
-- Assessment logic lives in:
--   server/services/regulatory/design-controls.ts
--   server/services/regulatory/iso-14971-risk.ts
-- and is exposed through server/routes/design-risk.ts.
-- ============================================================================

-- ─── Design inputs (820.30(c)) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_inputs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id),
  program_id      uuid,
  requirement     text NOT NULL,
  category        text NOT NULL,   -- intended_use|user_need|functional|performance|safety|regulatory|usability|interface
  risk_item_ref   uuid,            -- optional link to a risk_items row
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS design_inputs_org_idx     ON design_inputs (organization_id);
CREATE INDEX IF NOT EXISTS design_inputs_program_idx ON design_inputs (program_id);

-- ─── Design outputs (820.30(d)) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_outputs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        integer NOT NULL REFERENCES organizations(id),
  program_id             uuid,
  description            text NOT NULL,
  satisfies_input_ids    uuid[] NOT NULL DEFAULT '{}',
  has_acceptance_criteria boolean NOT NULL DEFAULT false,
  metadata               jsonb DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX IF NOT EXISTS design_outputs_org_idx     ON design_outputs (organization_id);
CREATE INDEX IF NOT EXISTS design_outputs_program_idx ON design_outputs (program_id);

-- ─── Design verifications (820.30(f)) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_verifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     integer NOT NULL REFERENCES organizations(id),
  program_id          uuid,
  description         text NOT NULL,
  verifies_output_ids uuid[] NOT NULL DEFAULT '{}',
  result              text,        -- pass|fail|pending
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS design_verif_org_idx     ON design_verifications (organization_id);
CREATE INDEX IF NOT EXISTS design_verif_program_idx ON design_verifications (program_id);

-- ─── Design validations (820.30(g)) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_validations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      integer NOT NULL REFERENCES organizations(id),
  program_id           uuid,
  description          text NOT NULL,
  validates_input_ids  uuid[] NOT NULL DEFAULT '{}',
  production_equivalent boolean NOT NULL DEFAULT false,
  result               text,       -- pass|fail|pending
  metadata             jsonb DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS design_valid_org_idx     ON design_validations (organization_id);
CREATE INDEX IF NOT EXISTS design_valid_program_idx ON design_validations (program_id);

-- ─── Design reviews (820.30(e)) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_reviews (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              integer NOT NULL REFERENCES organizations(id),
  program_id                   uuid,
  phase                        text NOT NULL,
  independent_reviewer_present boolean NOT NULL DEFAULT false,
  action_items_open            integer NOT NULL DEFAULT 0,
  metadata                     jsonb DEFAULT '{}'::jsonb,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  deleted_at                   timestamptz
);
CREATE INDEX IF NOT EXISTS design_reviews_org_idx     ON design_reviews (organization_id);
CREATE INDEX IF NOT EXISTS design_reviews_program_idx ON design_reviews (program_id);

-- ─── Design changes (820.30(i)) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_changes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       integer NOT NULL REFERENCES organizations(id),
  program_id            uuid,
  description           text NOT NULL,
  reviewed              boolean NOT NULL DEFAULT false,
  verified_or_validated boolean NOT NULL DEFAULT false,
  metadata              jsonb DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX IF NOT EXISTS design_changes_org_idx     ON design_changes (organization_id);
CREATE INDEX IF NOT EXISTS design_changes_program_idx ON design_changes (program_id);

-- ─── Design plans (820.30(b)) — one flag row per program ────────────────────
CREATE TABLE IF NOT EXISTS design_plans (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            integer NOT NULL REFERENCES organizations(id),
  program_id                 uuid,
  title                      text NOT NULL,
  design_transfer_documented boolean NOT NULL DEFAULT false,
  metadata                   jsonb DEFAULT '{}'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  deleted_at                 timestamptz
);
CREATE INDEX IF NOT EXISTS design_plans_org_idx     ON design_plans (organization_id);
CREATE INDEX IF NOT EXISTS design_plans_program_idx ON design_plans (program_id);

-- ─── Risk management files (ISO 14971) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_management_files (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    integer NOT NULL REFERENCES organizations(id),
  program_id         uuid,
  device_name        text NOT NULL,
  status             text NOT NULL DEFAULT 'draft', -- draft|under_review|approved|superseded
  benefit_documented boolean NOT NULL DEFAULT false,
  benefit_magnitude  text,        -- low|moderate|high
  metadata           jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX IF NOT EXISTS rmf_org_idx     ON risk_management_files (organization_id);
CREATE INDEX IF NOT EXISTS rmf_program_idx ON risk_management_files (program_id);

-- ─── Risk items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     integer NOT NULL REFERENCES organizations(id),
  rmf_id              uuid NOT NULL REFERENCES risk_management_files(id) ON DELETE CASCADE,
  hazard              text NOT NULL,
  hazardous_situation text NOT NULL,
  harm                text NOT NULL,
  initial_severity    text NOT NULL, -- negligible|minor|serious|critical|catastrophic
  initial_p1          text NOT NULL, -- improbable|remote|occasional|probable|frequent
  initial_p2          text NOT NULL,
  residual_severity   text,
  residual_p1         text,
  residual_p2         text,
  design_input_ref    uuid,
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS risk_items_org_idx ON risk_items (organization_id);
CREATE INDEX IF NOT EXISTS risk_items_rmf_idx ON risk_items (rmf_id);

-- ─── Risk controls (ISO 14971 §7) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_controls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  integer NOT NULL REFERENCES organizations(id),
  risk_item_id     uuid NOT NULL REFERENCES risk_items(id) ON DELETE CASCADE,
  option           text NOT NULL, -- inherent_safety_by_design|protective_measure|information_for_safety
  description      text NOT NULL,
  verified         boolean NOT NULL DEFAULT false,
  verification_ref text,
  metadata         jsonb DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS risk_controls_org_idx  ON risk_controls (organization_id);
CREATE INDEX IF NOT EXISTS risk_controls_item_idx ON risk_controls (risk_item_id);
