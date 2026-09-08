-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — Vault document store
-- Compliance: none directly; enables a search a reviewer can rely on
-- Purpose: A full-text index over vault.documents so the Vault can be searched
--          by CONTENT, not only by whatever rows a page happened to load.
--
-- eCTD/CTD Context:
--   - Module(s): all
--   - Integrity Risk Addressed: a reviewer who cannot find a document assumes it
--     is absent. The Vault surface had no search input at all — the only text
--     filtering was a client-side substring match over rows already in memory,
--     which cannot match document content and silently misses anything past the
--     first page.
--
-- Determinism Contract:
--   - Additive. One index and one immutable helper. No column, table or policy
--     is created, altered or dropped, and no row is written.
--
-- Notes:
--   - Idempotent (CREATE INDEX IF NOT EXISTS inside a guarded DO block).
--     Re-runs on every deploy — see RULE 1 in CLAUDE.md.
-- =============================================================================
--
-- WHY A FUNCTION RATHER THAN THE EXPRESSION INLINE
--
-- A GIN expression index is only used when the query's expression matches it
-- CHARACTER FOR CHARACTER. Three columns concatenated with COALESCE is easy to
-- retype slightly differently in a route, and the failure mode is silent: the
-- query still returns correct rows, by sequential scan, and only shows up as a
-- slow endpoint once the corpus is large. Naming the expression once means the
-- index and the reader cannot drift apart.
--
-- IMMUTABLE is required for an index expression. `to_tsvector('english', …)` with
-- the configuration passed explicitly is immutable; the single-argument form is
-- NOT (it depends on default_text_search_config, a session setting) and Postgres
-- refuses it in an index. That is the usual reason this kind of index fails to
-- build, so it is written the long way deliberately.
--
-- WEIGHTING
--
-- Title and file name are weighted above body text. A reviewer searching
-- "stability" wants the document called Stability Report before every document
-- that mentions stability in passing, and extracted_text can be tens of
-- thousands of words, so unweighted ranking buries the obvious match.

DO $mig$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault.documents not present - skipping full-text index';
    RETURN;
  END IF;

  -- The one definition of "the searchable text of a vault document".
  CREATE OR REPLACE FUNCTION vault.document_search_vector(
    p_title TEXT, p_file_name TEXT, p_extracted_text TEXT
  ) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
    SELECT setweight(to_tsvector('english', COALESCE(p_title, '')), 'A')
        || setweight(to_tsvector('english', COALESCE(p_file_name, '')), 'B')
        || setweight(to_tsvector('english', COALESCE(p_extracted_text, '')), 'D');
  $fn$;

  -- Postgres will not index a row whose tsvector exceeds 1MB. extracted_text is
  -- unbounded, so a very large scanned document could fail the INDEX BUILD and
  -- take the whole migration — and therefore the deploy — with it. The index is
  -- built over a bounded slice of the body for that reason; the title and file
  -- name are never truncated, so the high-weight terms are always complete.
  CREATE INDEX IF NOT EXISTS idx_vault_documents_fts
    ON vault.documents
    USING gin (vault.document_search_vector(document_title, file_name, left(extracted_text, 900000)));

  -- Trigram-free prefix help for the common "type a few letters of the filename"
  -- case, which full-text handles badly (it matches whole lexemes).
  CREATE INDEX IF NOT EXISTS idx_vault_documents_file_name_lower
    ON vault.documents (lower(file_name))
    WHERE deleted_at IS NULL;

  RAISE NOTICE 'vault.documents full-text index ready';
END
$mig$;
