-- ============================================================================
-- RIM learned patterns — the judgment layer's own tables
-- ============================================================================
--
-- The RIM learning loop (activated 2026-08-20, ledger L70) initially persisted
-- each org's learned patterns as one JSON blob in project_memory_entries under
-- category 'rim_learned_pattern' — the documented stopgap convention. A blob
-- has no per-pattern identity, no queryable history, and no provenance a
-- reviewer can inspect; "accumulated judgment" that cannot show its work is
-- not defensible. These tables graduate the store:
--
--   rim_learned_patterns     — one row per learned pattern, upserted on its
--                              deterministic identity (org + pattern_key).
--                              occurrences/confidence strengthen with
--                              repetition; first_seen/last_seen bound it.
--   rim_pattern_observations — append-only: one row per observation event.
--                              Nothing updates or deletes here; it is the
--                              audit trail behind every aggregate row.
--
-- created_by is a text actor label, not a users(id) FK: patterns are written
-- by system interceptors (compliance scans, feedback capture), and inventing
-- a user for a machine observation would falsify the record.
--
-- Tenancy: organization_id integer, so the 20260801 tenant-isolation sweep
-- (ordered after this file in C2C_MIGRATION_FILES) policies both tables in
-- the same deploy that creates them.
--
-- Reader/writer: server/services/intelligence/rim-pattern-persistence.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rim_learned_patterns (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  -- Deterministic identity: rimPatternId(org, domain, signalType, normalized observation).
  pattern_key     text NOT NULL,
  domain          text NOT NULL,
  signal_type     text NOT NULL CHECK (signal_type IN
                    ('deficiency','reviewer_trigger','rejection','strong_language',
                     'weak_language','data_gap','consistency_issue','formatting','risk_signal')),
  observation     text NOT NULL,
  confidence      real NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  occurrences     integer NOT NULL DEFAULT 1,
  first_seen      timestamptz NOT NULL,
  last_seen       timestamptz NOT NULL,
  created_by      text NOT NULL DEFAULT 'rim_interceptor',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- The upsert target: recording the same observation strengthens the row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rim_learned_patterns_key
  ON rim_learned_patterns(organization_id, pattern_key);
CREATE INDEX IF NOT EXISTS idx_rim_learned_patterns_org_domain
  ON rim_learned_patterns(organization_id, domain);

CREATE TABLE IF NOT EXISTS rim_pattern_observations (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  pattern_key     text NOT NULL,
  observed_at     timestamptz NOT NULL,
  recorded_by     text NOT NULL DEFAULT 'rim_interceptor',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rim_pattern_observations_org_key
  ON rim_pattern_observations(organization_id, pattern_key);
