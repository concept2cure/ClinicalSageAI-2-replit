-- Agency-meetings store — the regulator-interaction worklist (Pre-IND, INTERACT,
-- Type A/B/C/D, EOP2, pre-NDA/BLA, device Q-Sub, EMA Scientific Advice) backing
-- the v2 AgencyMeetings surface's GET read. Each row is an actual meeting
-- instance with its clock/status/dates; the per-meeting briefing book (sections +
-- questions) and minutes (agreements + commitments) are nested facts held as
-- JSONB so the row rehydrates straight into the surface's Meeting / BriefingBook
-- / Minutes shapes. Org-scoped, FK-free, schema-only, idempotent.

CREATE TABLE IF NOT EXISTS c2c_agency_meetings (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  type              TEXT,
  agency            TEXT,
  cat               TEXT,
  program           TEXT,
  status            TEXT,
  requested         TEXT,
  granted           TEXT,
  meets             TEXT,
  clock             TEXT,
  format            TEXT,
  goal              TEXT,
  briefing_book     JSONB,
  minutes           JSONB,
  PRIMARY KEY (organization_id, id)
);
