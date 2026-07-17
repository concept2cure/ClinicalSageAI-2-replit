-- Protocol-development store — the single in-development protocol document
-- backing the v2 ProtocolDev surface's GET read. Each row is one org's protocol
-- (synopsis, objectives, eligibility, schedule of assessments, 5x5 risk
-- register, milestones, budget, amendments, deviations/CAPA, reviews, consent),
-- assembled by the authoring hub. Org-scoped, FK-free, schema-only, idempotent.
-- Header scalars are display strings the surface renders directly; every nested
-- structure (section tree, SoA grid, risk register, amendment change-sets, …) is
-- held as JSONB so the row rehydrates straight into the surface's PdevDoc shape.
-- This is per-org protocol instance data, not a static catalog. `short_title`,
-- `open_section`, and `completeness_findings` avoid camelCase columns; `seq`
-- preserves surface ordering when an org tracks more than one protocol.

CREATE TABLE IF NOT EXISTS c2c_protocol_dev (
  id                     TEXT    NOT NULL,
  organization_id        INTEGER NOT NULL,
  seq                    INTEGER NOT NULL DEFAULT 0,
  title                  TEXT,
  short_title            TEXT,
  kind                   TEXT,
  version                TEXT,
  status                 TEXT,
  sponsor                TEXT,
  pi                     TEXT,
  updated                TEXT,
  completeness           INTEGER NOT NULL DEFAULT 0,
  open_section           TEXT,
  sections               JSONB NOT NULL DEFAULT '[]'::jsonb,
  content                JSONB NOT NULL DEFAULT '{}'::jsonb,
  objectives             JSONB NOT NULL DEFAULT '[]'::jsonb,
  eligibility            JSONB NOT NULL DEFAULT '{}'::jsonb,
  soa                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  risks                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  milestones             JSONB NOT NULL DEFAULT '[]'::jsonb,
  budget                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  amendments             JSONB NOT NULL DEFAULT '[]'::jsonb,
  deviations             JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviews                JSONB NOT NULL DEFAULT '[]'::jsonb,
  consent                JSONB NOT NULL DEFAULT '[]'::jsonb,
  completeness_findings  JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, id)
);
