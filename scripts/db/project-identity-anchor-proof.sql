-- ============================================================================
-- Project-identity anchor & backfill PROOF — ADR-0011 Phase 1 (READ ONLY)
-- ============================================================================
--
-- Produces the evidence ADR-0011 (docs/adr/0011-canonical-project-identity-space.md)
-- and the spike (docs/PROJECT_IDENTITY_SPIKE_2026-08-21.md §4) require before any
-- data-moving convergence step is approved. It answers, against a real database:
--
--   1. Anchor coverage — how many integer `projects` are anchored to a uuid
--      `regulatory_programs`, and how many programs have a project.
--   2. Why the rest are unanchored — no code/name match vs. ambiguous match
--      (the exact classes the anchor migration deliberately refuses to guess).
--   3. project_members backfill feasibility — which programs can get an `owner`
--      row that locks nobody out, and which are blocked (no anchored project, or
--      no lead_user_id).
--   4. Membership-store divergence — the `project_members` table vs. the
--      `settings.projectSharing` JSON that services/project-sharing-access.ts uses.
--
-- SAFETY: every statement is a SELECT. Nothing is inserted, updated, altered, or
-- deleted. Safe to run against production read replicas. Run e.g.:
--   psql "$DATABASE_URL" -f scripts/db/project-identity-anchor-proof.sql
--
-- It reads (does not re-implement) the same candidate/unambiguous predicate as
-- migrations/20260814_projects_regulatory_program_anchor.sql, so the "ambiguous"
-- counts here are exactly the rows that migration left NULL on purpose.
-- ============================================================================

\echo '== 1. ANCHOR COVERAGE =='

-- projects: anchored vs not (the re-key/backfill target population).
SELECT
  'projects' AS entity,
  count(*)                                            AS total,
  count(*) FILTER (WHERE regulatory_program_id IS NOT NULL) AS anchored,
  count(*) FILTER (WHERE regulatory_program_id IS NULL)     AS unanchored
FROM projects;

-- programs: how many live programs are pointed at by at least one project.
SELECT
  'regulatory_programs' AS entity,
  count(*)                                                       AS total_live,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM projects p WHERE p.regulatory_program_id = g.id
  ))                                                            AS has_a_project,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM projects p WHERE p.regulatory_program_id = g.id
  ))                                                            AS orphan_program
FROM regulatory_programs g
WHERE g.deleted_at IS NULL;

\echo '== 2. WHY UNANCHORED — candidate/ambiguity breakdown =='

-- Same candidate predicate the anchor migration uses: same-org, live program,
-- project not yet anchored, program not already anchored, exact non-empty
-- code OR name match.
WITH candidate AS (
  SELECT DISTINCT p.id AS project_id, g.id AS program_id
    FROM projects p
    JOIN regulatory_programs g
      ON g.organization_id = p.organization_id
     AND (
           ( lower(btrim(p.code)) = lower(btrim(g.code)) AND btrim(coalesce(p.code, '')) <> '' )
        OR ( lower(btrim(p.name)) = lower(btrim(g.name)) AND btrim(coalesce(p.name, '')) <> '' )
         )
   WHERE p.regulatory_program_id IS NULL
     AND g.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM projects x WHERE x.regulatory_program_id = g.id)
),
per_project AS (
  SELECT p.id AS project_id,
         (SELECT count(*) FROM candidate c WHERE c.project_id = p.id) AS n_candidates
    FROM projects p
   WHERE p.regulatory_program_id IS NULL
)
SELECT
  count(*) FILTER (WHERE n_candidates = 0) AS unanchored_no_match,
  count(*) FILTER (WHERE n_candidates = 1) AS unanchored_one_candidate_maybe_contested,
  count(*) FILTER (WHERE n_candidates > 1) AS unanchored_ambiguous_multi_program,
  count(*)                                 AS unanchored_total
FROM per_project;

-- Of the "one candidate" projects, how many are blocked only because the
-- program they match is ALSO matched by another project (the contested case).
WITH candidate AS (
  SELECT DISTINCT p.id AS project_id, g.id AS program_id
    FROM projects p
    JOIN regulatory_programs g
      ON g.organization_id = p.organization_id
     AND (
           ( lower(btrim(p.code)) = lower(btrim(g.code)) AND btrim(coalesce(p.code, '')) <> '' )
        OR ( lower(btrim(p.name)) = lower(btrim(g.name)) AND btrim(coalesce(p.name, '')) <> '' )
         )
   WHERE p.regulatory_program_id IS NULL
     AND g.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM projects x WHERE x.regulatory_program_id = g.id)
)
SELECT
  count(*) FILTER (
    WHERE (SELECT count(*) FROM candidate c2 WHERE c2.project_id = c.project_id) = 1
      AND (SELECT count(*) FROM candidate c3 WHERE c3.program_id = c.program_id) = 1
  ) AS would_link_now_unambiguous,
  count(*) FILTER (
    WHERE (SELECT count(*) FROM candidate c3 WHERE c3.program_id = c.program_id) > 1
  ) AS blocked_program_contested_by_multiple_projects
FROM candidate c;

\echo '== 3. project_members BACKFILL FEASIBILITY (lock-nobody-out) =='

-- For every live program: can it get an owner row, and is there a target?
-- A backfill needs (a) an integer projects.id anchored to the program AND
-- (b) an owner user id. lead_user_id is the clean owner source; created_by is
-- TEXT and cannot seed an integer user_id without resolution.
SELECT
  count(*)                                                              AS live_programs,
  count(*) FILTER (WHERE anchored_project_id IS NOT NULL
                     AND lead_user_id IS NOT NULL)                      AS backfillable_clean,
  count(*) FILTER (WHERE anchored_project_id IS NULL)                   AS blocked_no_anchored_project,
  count(*) FILTER (WHERE anchored_project_id IS NOT NULL
                     AND lead_user_id IS NULL)                          AS anchored_but_no_lead_user,
  count(*) FILTER (WHERE anchored_project_id IS NOT NULL
                     AND lead_user_id IS NOT NULL
                     AND NOT owner_row_exists)                          AS would_insert_owner_rows
FROM (
  SELECT
    g.id,
    g.lead_user_id,
    (SELECT p.id FROM projects p WHERE p.regulatory_program_id = g.id ORDER BY p.id LIMIT 1) AS anchored_project_id,
    EXISTS (
      SELECT 1 FROM project_members m
        JOIN projects p ON p.id = m.project_id
       WHERE p.regulatory_program_id = g.id
         AND m.user_id = g.lead_user_id
         AND m.role = 'owner'
    ) AS owner_row_exists
  FROM regulatory_programs g
  WHERE g.deleted_at IS NULL
) f;

\echo '== 4. MEMBERSHIP-STORE DIVERGENCE (table vs settings JSON) =='

-- The table.
SELECT 'project_members table' AS store,
       count(*)                                        AS rows,
       count(*) FILTER (WHERE role = 'owner')          AS owner_rows,
       count(DISTINCT project_id)                      AS projects_with_membership
FROM project_members;

-- The JSON model services/project-sharing-access.ts writes to. Best-effort: only
-- runs if projects.settings exists and is json/jsonb. Counts projects that carry
-- a projectSharing.members array — the population that the table may disagree with.
DO $do$
DECLARE
  n_json_projects BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='projects'
       AND column_name='settings' AND data_type IN ('json','jsonb')
  ) THEN
    EXECUTE $q$
      SELECT count(*) FROM projects
       WHERE settings IS NOT NULL
         AND (settings::jsonb -> 'projectSharing' -> 'members') IS NOT NULL
         AND jsonb_typeof(settings::jsonb -> 'projectSharing' -> 'members') = 'array'
         AND jsonb_array_length(settings::jsonb -> 'projectSharing' -> 'members') > 0
    $q$ INTO n_json_projects;
    RAISE NOTICE 'settings.projectSharing.members present on % project row(s) — reconcile against the project_members table before either becomes authoritative', n_json_projects;
  ELSE
    RAISE NOTICE 'projects.settings is absent or not json/jsonb — JSON membership diff skipped';
  END IF;
END
$do$;

\echo '== PROOF COMPLETE — nothing was modified =='
