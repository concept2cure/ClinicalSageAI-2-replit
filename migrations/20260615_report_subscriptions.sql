-- Report subscriptions (Report-OS / Insights, Step 6) — durable, org-scoped.
--
-- Binds a report type + scope to a constrained recurrence schedule and a
-- recipient list, plus the scheduler's run bookkeeping (last_run_at /
-- next_run_at). The schedule is stored as json (cadence/hour/day-of-week or
-- day-of-month); next_run_at is recomputed on each run by the service.
--
-- Tenant column is the canonical integer organization_id; indexed on it and on
-- enabled because the service lists per-org and the scheduler scans enabled
-- subscriptions platform-wide.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS report_subscriptions (
  id                  SERIAL PRIMARY KEY,
  organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_workspace_id INTEGER REFERENCES client_workspaces(id) ON DELETE SET NULL,
  report_type_id      TEXT NOT NULL REFERENCES report_type_registry(type_id) ON DELETE RESTRICT,
  scope_type          TEXT NOT NULL,
  scope_id            TEXT NOT NULL,
  schedule            JSON NOT NULL,
  recipients          JSON DEFAULT '[]'::json,
  format              TEXT NOT NULL DEFAULT 'pdf',
  channel             TEXT NOT NULL DEFAULT 'platform',
  persona             TEXT,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  last_run_at         TIMESTAMP,
  next_run_at         TIMESTAMP,
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_subscriptions_org_idx ON report_subscriptions (organization_id);
CREATE INDEX IF NOT EXISTS report_subscriptions_enabled_idx ON report_subscriptions (enabled);
