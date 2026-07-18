-- Biopharma specialty data layer, batch 2 — the three sub-cards that were still
-- static surface fixtures: pediatric PREA/PIP milestones, orphan Rare-Pediatric-
-- Disease vouchers / grants, and orphan patient-advocacy engagements. Org-scoped,
-- FK-free, non-destructive. Schema only — demo rows are seeded by
-- scripts/seed/ga-demo.d/122-pediatric-orphan-cards.mjs (a migration must not
-- write tenant rows). Mirrors the 20260716_biopharma_specialty.sql convention;
-- served by the same listRouter read pattern, fail-closed to the client fixture.

CREATE TABLE IF NOT EXISTS biopharma_prea_milestones (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  product           TEXT,
  milestone         TEXT,          -- e.g. "Adolescent PK substudy — interim"
  due               TEXT,          -- display date (e.g. "Aug 2026")
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE IF NOT EXISTS biopharma_orphan_rpd (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  product           TEXT,
  kind              TEXT,          -- e.g. "Rare Pediatric Disease" | "NIH rare disease grant"
  value             TEXT,          -- display value (e.g. "$100M+")
  notes             TEXT,
  status            TEXT,          -- received | awarded | ...
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE IF NOT EXISTS biopharma_orphan_advocacy (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  product           TEXT,
  org_name          TEXT,          -- advocacy organization
  engagement        TEXT,          -- e.g. "Steering committee · Q monthly"
  PRIMARY KEY (organization_id, id)
);
