-- ════════════════════════════════════════════════════════════════════════════
-- A revised source document is linked to the one it replaces.
--
-- THE GAP (ledger L21). `cre_evidence_sources.checksum` is written once at
-- ingest and never updated — the only `UPDATE ... SET checksum` statements in
-- the repo are in tests. A revised document is therefore ingested as a WHOLLY
-- NEW row: its bytes hash differently, `findSourceByChecksum` misses, and a
-- fresh source identity is created with nothing pointing back at the one it
-- replaced.
--
-- The consequence reached a user-facing surface. `authoring_citations
-- .payload_sha256` holds the source's checksum AT CITE TIME, so the freshness
-- check `src.checksum <> c.payload_sha256` compares an immutable value with
-- itself and can never be true. The Source Tracer's "source changed since
-- cited" branch was unreachable, and every citation showed "content unchanged"
-- forever — including citations whose document had genuinely been revised,
-- which is the one case the check exists for.
--
-- THE CHANGE. Two columns, both additive and nullable-or-defaulted, so existing
-- rows keep their meaning:
--
--   previous_version_id — the source this one replaces, when that is KNOWN.
--                         NULL means "not known to supersede anything", which
--                         is the truthful state for every row ingested before
--                         this migration and for every genuinely new document.
--   is_current          — FALSE once a successor has been recorded. DEFAULT
--                         TRUE, because a source with no known successor is
--                         current, and that is what every existing row is.
--
-- WHAT THIS DOES NOT DO. It does not backfill. Nothing in the existing data
-- says which rows superseded which — inferring it now from titles and dates
-- would manufacture a lineage the system never observed, and a fabricated
-- supersession is worse than an absent one: it would tell a reviewer a
-- citation is stale on the strength of a guess. Links are recorded going
-- forward, by the ingest path, and each records HOW it was established.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, guarded on the table existing.
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources absent — source versioning skipped';
    RETURN;
  END IF;

  ALTER TABLE cre_evidence_sources
    ADD COLUMN IF NOT EXISTS previous_version_id INTEGER,
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE;

  -- Self-referencing FK, added separately so a re-run does not fail on it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cre_evidence_sources_previous_version_fk'
  ) THEN
    ALTER TABLE cre_evidence_sources
      ADD CONSTRAINT cre_evidence_sources_previous_version_fk
      FOREIGN KEY (previous_version_id) REFERENCES cre_evidence_sources(id);
  END IF;

  -- A source may be superseded by at most ONE successor. Without this, two
  -- concurrent re-uploads could both claim the same predecessor and the
  -- lineage would fork — which reads as two different "current" versions of one
  -- document, the ambiguity this table exists to remove.
  CREATE UNIQUE INDEX IF NOT EXISTS cre_evidence_sources_one_successor
    ON cre_evidence_sources (previous_version_id)
    WHERE previous_version_id IS NOT NULL;

  -- The Data Room and the freshness check both read "current rows for this
  -- tenant", so that predicate gets an index rather than a scan.
  CREATE INDEX IF NOT EXISTS cre_evidence_sources_current_idx
    ON cre_evidence_sources (organization_id, is_current);
END
$do$;
