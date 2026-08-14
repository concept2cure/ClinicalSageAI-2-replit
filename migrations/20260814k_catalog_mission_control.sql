-- ============================================================================
-- Apps catalog — Mission Control (the program operating surface)
-- ============================================================================
--
-- THE GAP. `server/routes/mission-control.ts` is the platform's regulatory
-- program-management engine: Programs → Destinations → Route Plans → Artifacts
-- → Evidence → Dependencies → Decisions → Reviews → Risks, organization-scoped,
-- with Part 11 provenance logged on every mutation. Thirty-eight endpoints,
-- mounted at `/api/mission-control` since it was written.
--
-- The string "mission-control" appeared nowhere in `client/src`. Not in a
-- surface, not in a route, not in the catalog. The engine had no user interface
-- of any kind, and no user could have reached it by any path.
--
-- ── Why this is NOT a duplicate of `projects` ───────────────────────────────
-- The rail already carries `projects`, labelled "Project management", and it is
-- a different system: it serves `/api/c2c/projects` over the `projects` table
-- and models the workspace a team works inside — documents, conversations,
-- team membership.
--
-- Mission Control models the regulatory program: which authorities a program is
-- destined for, which artifacts must exist for each, what evidence supports
-- them, which dependencies went stale when an upstream artifact changed, and
-- the readiness score derived from all of it. A team can have one project and
-- three submission destinations, or one program spanning several project
-- workspaces. Folding either into the other would lose the distinction that
-- makes the readiness score mean anything.
--
-- Category is 'Programs & governance' rather than a new one, so it sits beside
-- the review and audit surfaces a program lead already works from.
--
-- ── What the surface actually does, so the catalog entry is not a promise ───
-- It lists and opens programs, shows the server-computed readiness across its
-- nine dimensions with the blockers and next actions the engine derives, and
-- reads the artifacts, risks, decisions and stale dependencies behind that
-- score. It does not yet cover destinations, route plans, evidence-graph
-- editing, the review workflow, approval delegation or authority interactions —
-- those are scoped in docs/design/WORK_ORDER_mission_control.md. The
-- description below describes what ships, not what is planned; a catalog entry
-- is a statement that a capability is available, and listing a shell would be
-- worse than the invisibility this fixes.
--
-- Tier and industry metadata are left OPEN (`[]`), matching the neighbouring
-- entries: gating this behind a tier is a commercial decision, and guessing at
-- one here would silently withhold a capability from customers entitled to it.
--
-- ROLLBACK
--   DELETE FROM available_modules WHERE module_id = 'mission-control';
-- Rollback restores the invisibility; no surface, route or data is touched.
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.available_modules') IS NULL THEN
    RAISE NOTICE 'available_modules absent — catalog addition skipped';
    RETURN;
  END IF;

  INSERT INTO available_modules
    (module_id, name, description, category, path, icon, sort_order, metadata)
  VALUES
    ('mission-control', 'Mission Control',
     'Programs and their submission readiness — artifacts, evidence, risks, decisions and stale dependencies, with the blockers and next actions derived from them.',
     'Programs & governance', '/concept2cure/mission-control', 'route', 205,
     '{"tiers": [], "industries": []}'::json)
  ON CONFLICT (module_id) DO NOTHING;

  RAISE NOTICE 'Mission Control catalog entry ensured';
END
$do$;
