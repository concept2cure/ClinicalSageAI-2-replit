-- Report definitions (AnA Reporting Canvas) — saved dashboards / report canvases.
--
-- A titled, ordered set of governed report-type panels, authored conversationally
-- by AnA (origin='ana'), suggested as a best-practices preset (origin='preset'),
-- or built by hand (origin='manual'). The `spec` json holds
-- { scopeType, panels: [{ reportTypeId, scopeType, scopeId?, label? }] } — every
-- panel references a governed report type, so rendering a canvas generates each
-- panel's governed run. No free-form content: the whole canvas stays inside the
-- truthfulness contract.
--
-- Org-scoped, soft-deletable (archived_at). Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS report_definitions (
  id                  SERIAL PRIMARY KEY,
  definition_uuid     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_workspace_id INTEGER REFERENCES client_workspaces(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  kind                TEXT NOT NULL DEFAULT 'dashboard',
  spec                JSON NOT NULL,
  origin              TEXT NOT NULL DEFAULT 'manual',
  persona             TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP NOT NULL DEFAULT now(),
  archived_at         TIMESTAMP
);

CREATE INDEX IF NOT EXISTS report_definitions_org_idx ON report_definitions (organization_id);
CREATE INDEX IF NOT EXISTS report_definitions_status_idx ON report_definitions (status);
