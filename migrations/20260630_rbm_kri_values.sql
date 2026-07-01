-- RBM KRI trend history — time-series readings behind each Key Risk Indicator.
--
-- Each row is one observed value of a KRI at a point in time, so the UI can
-- draw a sparkline and central monitoring can see direction of travel rather
-- than only the latest snapshot. Tenant-scoped via organization_id; cascade
-- deletes with the parent KRI. See server/routes/mdx-rbm.ts.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS rbm_kri_values (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  kri_id          INTEGER NOT NULL REFERENCES rbm_kris(id) ON DELETE CASCADE,
  value           NUMERIC(12,4) NOT NULL,
  status          TEXT,                                  -- green | amber | red at time of reading
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rbm_kri_values_org_idx ON rbm_kri_values (organization_id);
CREATE INDEX IF NOT EXISTS rbm_kri_values_kri_idx ON rbm_kri_values (kri_id, observed_at);
