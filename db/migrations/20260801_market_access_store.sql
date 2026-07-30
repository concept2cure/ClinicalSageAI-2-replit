-- Market-access payer/HTA position store (REAL, org-scoped, with a write path).
--
-- The payer and HTA positions the v2 MarketAccess surface tracks: one row per
-- market × payer position per program — the coverage/reimbursement mechanism
-- (NCD/LCD, medical policy, HTA appraisal, reimbursement pricing, ...), the
-- billing code in play, the position's status in the surface's rendered vocab
-- (covered | partial | review | planned | denied), an optional expected/actual
-- coverage-decision date, and the working note the coverage table shows.
--
-- This replaces the seed-only c2c_market_access blob (20260717_market_access_store.sql,
-- one JSONB row per program): unlike that blob, this table has a real writer —
-- market-access-service.ts (createMarketAccessPosition, via POST /api/market-access) —
-- so a live tenant populates it by tracking payer positions, not only the demo seed.
-- Read by GET /api/market-access (flat position rows; the surface derives its KPIs and
-- code-strategy view from them). Org-scoped, soft-delete aware, audited at the route
-- layer. FK-free (repo migration convention).

CREATE TABLE IF NOT EXISTS market_access_positions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id INTEGER     NOT NULL,
  program         TEXT        NOT NULL,                    -- display: "BX-204"
  market          TEXT        NOT NULL,                    -- display: United States | United Kingdom | ...
  payer           TEXT        NOT NULL,                    -- display: "CMS -- Medicare" | "NHS -- NICE" | ...
  mechanism       TEXT,                                    -- coverage basis: NCD / LCD | Medical policy | HTA appraisal | ...
  code            TEXT,                                    -- billing code in play: "HCPCS E2103" | "CPT 95249" | NULL
  status          TEXT        NOT NULL DEFAULT 'planned',  -- covered | partial | review | planned | denied
  decision_date   DATE,                                    -- expected/actual coverage decision date
  note            TEXT,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_market_access_positions_org
  ON market_access_positions (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;
