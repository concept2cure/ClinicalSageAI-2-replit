-- IND ICSR transmissions — durable, per-submission safety-message records.
--
-- Each E2B(R3) ICSR transmission to a safety gateway (FDA FAERS / EMA
-- EudraVigilance) is tracked prepared -> transmitted -> acknowledged/rejected.
-- The composed message, transmit-readiness and parsed ack (AA/AE/AR) are stored.
--
-- Tenant column is the canonical integer organization_id; indexed on it and on
-- submission_id because the service queries are org-scoped and per-submission.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS ind_icsr_transmissions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             INTEGER NOT NULL,
  submission_id               INTEGER NOT NULL,
  adverse_event_id            TEXT NOT NULL,
  gateway                     TEXT NOT NULL,
  message_number              TEXT NOT NULL,
  sender_id                   TEXT NOT NULL,
  receiver_id                 TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'prepared',
  transmit_ready              BOOLEAN NOT NULL DEFAULT FALSE,
  transmitted_at              TIMESTAMPTZ,
  acknowledged_at             TIMESTAMPTZ,
  ack_code                    TEXT,
  acknowledged_message_number TEXT,
  errors                      JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps                        JSONB NOT NULL DEFAULT '[]'::jsonb,
  message                     TEXT NOT NULL,
  created_by                  INTEGER,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ind_icsr_transmissions_org_idx ON ind_icsr_transmissions (organization_id);
CREATE INDEX IF NOT EXISTS ind_icsr_transmissions_submission_idx ON ind_icsr_transmissions (submission_id);
