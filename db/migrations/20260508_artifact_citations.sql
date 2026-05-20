-- Sentence-level citation persistence on concept2cure_artifacts.
--
-- Adds:
--   1. concept2cure_artifacts.citations  (JSONB, default '[]')
--      Latest computed sentence-citation array. Foundation for inline
--      supports / contradicts / gap badges. Shape:
--        [
--          {
--            sentenceIndex, paragraphIndex, charStart, charEnd,
--            text, contentHash,
--            sources: [
--              { artifactId, sectionCode, pageRef, passageSnippet,
--                relevanceScore, relationship }
--            ],
--            status: 'supported' | 'contradicted' | 'gap',
--            gap: { severity, readinessDelta, blockingFiling, rule, message } | null,
--            flags: VerifierFlag[]
--          }
--        ]
--
--   2. concept2cure_artifacts.citation_run_id  (UUID, FK to citation runs table)
--      Pointer to the run that produced the current `citations` snapshot.
--
--   3. ana_artifact_citation_runs  (immutable audit history)
--      Every citation engine run lands here with its full output, content
--      hash of the artifact at run time, and counts. Citations JSONB on
--      the artifact reflects the latest run; this table preserves all
--      prior runs for review / forensics.

BEGIN;

ALTER TABLE concept2cure_artifacts
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE concept2cure_artifacts
  ADD COLUMN IF NOT EXISTS citation_run_id UUID;

ALTER TABLE concept2cure_artifacts
  ADD COLUMN IF NOT EXISTS citations_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_concept2cure_artifacts_citations_gin
  ON concept2cure_artifacts USING GIN (citations);

CREATE TABLE IF NOT EXISTS ana_artifact_citation_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id        TEXT NOT NULL,
  artifact_pk        INTEGER NOT NULL,
  organization_id    INTEGER NOT NULL,
  project_id         INTEGER NOT NULL,
  ctd_section        TEXT,

  -- Hash of the artifact's content at the time the run executed. If the
  -- content changes after this run, the citations are stale.
  artifact_content_hash TEXT NOT NULL,

  -- Top-level rollup so list views don't have to scan the full citations[].
  total_sentences        INTEGER NOT NULL,
  supported_count        INTEGER NOT NULL,
  contradicted_count     INTEGER NOT NULL,
  gap_count              INTEGER NOT NULL,

  -- Sum of readinessDelta across all gap citations (negative number).
  total_readiness_delta  INTEGER NOT NULL DEFAULT 0,

  -- Whether at least one gap is severity='critical' (blocks filing).
  filing_blocked         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Full citation array for this run (immutable; concept2cure_artifacts.citations
  -- mirrors the latest, this is the audit trail).
  citations              JSONB NOT NULL,

  -- Run metadata: { strategy, modelUsed, latencyMs, retrievalChunks, ... }
  run_metadata           JSONB,

  created_by             INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ana_artifact_citation_runs_artifact
  ON ana_artifact_citation_runs(artifact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ana_artifact_citation_runs_org
  ON ana_artifact_citation_runs(organization_id);
CREATE INDEX IF NOT EXISTS idx_ana_artifact_citation_runs_filing_blocked
  ON ana_artifact_citation_runs(organization_id, filing_blocked)
  WHERE filing_blocked = TRUE;

COMMIT;
