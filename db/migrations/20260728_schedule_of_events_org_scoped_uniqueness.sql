-- Schedule of Events: make the ON CONFLICT arbiter tenant-aware.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- project_schedule_of_events was UNIQUE on (project_id) alone
-- (db/migrations/20260617_project_schedule_of_events.sql:48). Uniqueness is what
-- ON CONFLICT resolves against, so an org-blind key decides WHOSE ROW an upsert
-- lands on. generateProjectSchedule (server/services/projects/schedule-of-events/
-- service.ts:390) upserted with `ON CONFLICT (project_id) DO UPDATE SET ...`, and
-- POST /projects/:id/schedule-of-events/generate never verified that :id belonged
-- to the caller's organization.
--
-- The DO UPDATE SET list does not include organization_id, so an overwritten row
-- KEEPS the victim's tenant id — the write is invisible to the attacker and the
-- row still counts as the victim's record. A caller in org B could regenerate
-- org A's schedule of events: new project_type, new framework, new goals, new
-- baseline and target dates, version incremented, `last_reviewed_by_ana_at`
-- refreshed so it reads as freshly reviewed. Blind write, no data returned — an
-- integrity event rather than a leak, on the artifact a program manages dates
-- and regulatory milestones from.
--
-- ── The fix ──────────────────────────────────────────────────────────────────
-- Two layers, because the application-side ownership check (added alongside this
-- migration) is a single `if` that a future refactor can drop:
--
--   1. The arbiter becomes (organization_id, project_id), so ON CONFLICT can
--      never resolve across a tenant boundary.
--   2. A composite FOREIGN KEY to projects(id, organization_id) makes it
--      structurally impossible to attach a schedule to a project owned by a
--      different organization — enforced by Postgres, not by convention.
--
-- Layer 2 is the one that matters. With the narrow unique index removed, layer 1
-- alone would permit a second row (orgB, project42) rather than overwriting
-- org A's — better, but still tenant pollution. The FK refuses the row outright.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Refuse to proceed over existing cross-tenant rows.
--
-- If any schedule row's organization_id disagrees with its project's owner, the
-- FK below would fail with a generic constraint error. Those rows are the
-- corruption this migration exists to prevent, so fail EARLY and name them: a
-- human has to decide whether each is an artifact of the bug or of a legitimate
-- org move, and no migration should guess.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  offenders text;
  offender_count integer;
BEGIN
  SELECT count(*), string_agg(format('schedule id=%s (org %s) -> project %s (org %s)',
                                     s.id, s.organization_id, p.id, p.organization_id), '; ')
    INTO offender_count, offenders
  FROM project_schedule_of_events s
  JOIN projects p ON p.id = s.project_id
  WHERE p.organization_id IS DISTINCT FROM s.organization_id;

  IF offender_count > 0 THEN
    RAISE EXCEPTION
      'project_schedule_of_events has % row(s) whose organization_id does not match the owning project. These are cross-tenant rows and must be resolved by hand before this migration can apply. Offenders: %',
      offender_count, offenders;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FK target. projects.id is the primary key, so (id, organization_id) needs
--    its own unique index to be referenceable by a composite FK. It is
--    redundant for uniqueness (id alone is already unique) and exists purely to
--    make the tenant-consistency FK expressible.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uniq_projects_id_org
  ON projects (id, organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The tenant-aware arbiter, created BEFORE the old one is dropped so the
--    table is never momentarily without a uniqueness guarantee on the plan
--    header. Still one header row per project per org.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS unique_project_schedule_org
  ON project_schedule_of_events (organization_id, project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Drop the org-blind arbiter. This is the line that closes the defect: while
--    a unique index on (project_id) exists, `ON CONFLICT (project_id)` remains
--    expressible and a future caller could reintroduce it.
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS unique_project_schedule;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Structural tenant consistency. A schedule row can now only reference a
--    project in the SAME organization — checked by Postgres on every insert and
--    update, including any that bypasses the service layer.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_schedule_project_same_org'
      AND conrelid = 'project_schedule_of_events'::regclass
  ) THEN
    ALTER TABLE project_schedule_of_events
      ADD CONSTRAINT fk_schedule_project_same_org
      FOREIGN KEY (project_id, organization_id)
      REFERENCES projects (id, organization_id);
  END IF;
END $$;

COMMIT;
