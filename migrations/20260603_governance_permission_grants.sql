-- Governance permission atoms — the Admin-curated per-org grant store.
--
-- The canonical DEFAULT policy lives in code
-- (server/services/governance/permissions.ts). This table holds per-org
-- additions / overrides Admin manages as rows. The engine unions both,
-- deny-by-default, explicit-deny-wins.
--
-- Idempotent and FK-free (org_id / created_by are soft references; audit_logs-
-- style append convention — no FK to users, consistent with mutation_primitives).

CREATE TABLE IF NOT EXISTS c2c_governance_grants (
  id              bigserial PRIMARY KEY,
  org_id          integer     NOT NULL,
  role            text        NOT NULL,
  action          text        NOT NULL,
  resource_type   text,                         -- null = any resource type
  ctd_module      text,                         -- null = any CTD module
  classification  text,                         -- null = any classification tier
  effect          text        NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  created_by      integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS c2c_gov_grants_org_role_idx ON c2c_governance_grants (org_id, role);
CREATE INDEX IF NOT EXISTS c2c_gov_grants_lookup_idx   ON c2c_governance_grants (org_id, action, resource_type);
