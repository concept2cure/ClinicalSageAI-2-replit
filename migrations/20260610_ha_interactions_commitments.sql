-- ============================================================================
-- Health-Authority Interaction & Commitment Management (Capability C2C-03)
-- ============================================================================
--
-- Threads the regulatory relationship onto the provenance spine:
--   ha_interactions (agency meetings: Pre-IND / EOP2 / pre-NDA / Type A-B-C)
--     → ha_interaction_questions (sponsor question + agency response)
--     → regulatory_commitments (PMR / PMC / REMS / meeting commitments)
--       → commitment_milestones (fulfillment milestones)
--
-- Commitments thread back to the interaction that created them
-- (source_interaction_id) and forward to the submission they support via
-- provenance_links (C2C-02), written by the service on creation/fulfillment.
--
-- Tenancy/audit mirror the platform; status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/ha-interactions.ts
-- Service: server/services/ha-interactions/*
-- Routes:  server/routes/ha-interactions.ts (/api/ha-interactions)
-- ============================================================================

-- ─── HA interactions (meetings) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ha_interactions (
  id                        serial PRIMARY KEY,
  organization_id           integer NOT NULL REFERENCES organizations(id),
  submission_id             integer REFERENCES submissions(id),
  interaction_type          text NOT NULL CHECK (interaction_type IN
                              ('pre_ind','eop1','eop2','pre_nda','pre_bla','type_a','type_b','type_c','scientific_advice','other')),
  agency                    text NOT NULL CHECK (agency IN ('fda','ema','pmda','mhra','other')),
  title                     text NOT NULL,
  objective                 text,
  status                    text NOT NULL DEFAULT 'planned' CHECK (status IN
                              ('planned','requested','scheduled','held','minutes_received','closed','cancelled')),
  requested_date            date,
  scheduled_date            date,
  held_date                 date,
  minutes_received_date     date,
  briefing_book_artifact_id text,
  created_by                integer NOT NULL REFERENCES users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ha_interactions_org        ON ha_interactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_ha_interactions_submission ON ha_interactions(submission_id);

-- ─── Interaction questions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ha_interaction_questions (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  interaction_id    integer NOT NULL REFERENCES ha_interactions(id),
  question_number   integer NOT NULL,
  question_text     text NOT NULL,
  sponsor_position  text,
  agency_response   text,
  agreement_reached boolean NOT NULL DEFAULT false,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ha_questions_org         ON ha_interaction_questions(organization_id);
CREATE INDEX IF NOT EXISTS idx_ha_questions_interaction ON ha_interaction_questions(interaction_id);

-- ─── Regulatory commitments (PMR / PMC / REMS / meeting) ────────────────────
CREATE TABLE IF NOT EXISTS regulatory_commitments (
  id                    serial PRIMARY KEY,
  organization_id       integer NOT NULL REFERENCES organizations(id),
  submission_id         integer REFERENCES submissions(id),
  source_interaction_id integer REFERENCES ha_interactions(id),
  commitment_type       text NOT NULL CHECK (commitment_type IN ('pmr','pmc','rems','meeting_commitment','other')),
  description           text NOT NULL,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN
                          ('open','in_progress','submitted','fulfilled','overdue','waived','released')),
  regulatory_basis      text,
  due_date              date,
  fulfilled_date        date,
  created_by            integer NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_reg_commitments_org        ON regulatory_commitments(organization_id);
CREATE INDEX IF NOT EXISTS idx_reg_commitments_submission ON regulatory_commitments(submission_id);
CREATE INDEX IF NOT EXISTS idx_reg_commitments_source     ON regulatory_commitments(source_interaction_id);

-- ─── Commitment fulfillment milestones ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS commitment_milestones (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  commitment_id   integer NOT NULL REFERENCES regulatory_commitments(id),
  title           text NOT NULL,
  due_date        date,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','met','missed')),
  completed_date  date,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_commitment_milestones_org        ON commitment_milestones(organization_id);
CREATE INDEX IF NOT EXISTS idx_commitment_milestones_commitment ON commitment_milestones(commitment_id);
