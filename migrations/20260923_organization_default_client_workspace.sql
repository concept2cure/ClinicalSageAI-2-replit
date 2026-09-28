-- ============================================================================
-- Every organisation gets its own client workspace — the PM spine's NOT NULL
-- parent (repair sweep for organisations that already exist)
-- ============================================================================
--
-- THE DEFECT. `projects.client_workspace_id` is NOT NULL and FKs to
-- `client_workspaces`. `ensureProgramProjectAnchor`
-- (server/services/c2c/program-project-anchor.ts) is the one writer of the
-- program -> PM-spine anchor and it refuses to invent that value: with no
-- workspace it reports NO_CLIENT_WORKSPACE and the program is created
-- unanchored. That refusal is right — the column decides who can see a
-- project — but nothing in the running product ever created the FIRST
-- workspace:
--
--   * POST /api/clients (server/routes/clients-routes.ts) is the server's only
--     writer of client_workspaces. It IS mounted (bootstrap/
--     register-tenant-routes.ts), but no client in this repository calls it, so
--     nothing reaches it on a normal signup.
--   * The three organisation creators — self-serve signup (routes/auth.ts),
--     first-run setup (routes/setup.ts) and the boot seed
--     (db/bootstrap/seed-default-org.ts) — wrote organisations, users,
--     memberships and launch-module grants. None wrote a workspace.
--
-- So on a fresh tenant the anchor skip was not an edge case, it was every
-- program, and every governed artifact stayed out of
-- `concept2cure_artifacts` (whose project_id is an INTEGER FK to projects.id).
-- Reproduced end to end on a fresh install before this change: Module 3
-- compiled 21 sections and bridged 0 artifacts with bridgeSkips 21, and the
-- data room served no Module 3 branch. Both cleared with one workspace row
-- present and nothing else changed.
--
-- THE RESOLUTION, in two halves. The three creators now call
-- `ensureOrganizationDefaultWorkspace`
-- (server/services/c2c/organization-default-workspace.ts) inside their own
-- transaction, so no organisation is created without one from here on. This
-- file is the other half: the repair for organisations that already exist,
-- including any seeded by scripts/seed-founder.mjs or scripts/seed-admin.mjs,
-- which write organisations directly and reach no application code.
--
-- ── ONLY where the organisation has NONE ────────────────────────────────────
-- The NOT EXISTS predicate is not merely an idempotence guard, it is the rule.
-- An organisation that already has exactly one workspace is the unambiguous
-- case the anchor writer is waiting for, and a CRO's several client workspaces
-- are its own arrangement: this file never expresses an opinion about an
-- organisation that has already made one. Only the empty case is repaired,
-- which is also why this sweep can never give an organisation a second
-- workspace and so can never be the cause of an AMBIGUOUS skip.
--
-- ── Re-runnable, per CLAUDE.md RULE 1 ───────────────────────────────────────
-- Every entry of C2C_MIGRATION_FILES executes on every deploy. This file is
-- additive and its own no-op on the second run: after the first application
-- every organisation has a workspace, so NOT EXISTS matches nothing. It drops
-- nothing and alters no existing row. A later organisation created outside the
-- application (a seed script, a hand-written INSERT) is repaired by the next
-- deploy, which is why this stays in the set rather than running once.
--
-- ── The slug ────────────────────────────────────────────────────────────────
-- Derived from `organizations.slug` (NOT NULL) with the same normalisation
-- `defaultWorkspaceIdentity` applies in TypeScript: lowercase, runs of
-- non-alphanumerics to a single hyphen, no leading or trailing hyphen, and a
-- constant fallback so the NOT NULL column is always satisfiable. The two
-- agree on every real organisation; they cannot diverge into a duplicate row
-- in any case, because both are gated on the organisation having no workspace
-- at all. `unique_org_slug` is scoped to (organization_id, slug), so the
-- shared fallback collides with nothing across tenants.
--
-- created_by_id is NULL on purpose: the platform wrote these rows, not a
-- person. That is the same posture `provisionLaunchModules` takes with a null
-- actor for the launch-catalog grants.
--
-- ROLLBACK
--   There is none that is safe to write here. Deleting these rows would orphan
--   any projects.client_workspace_id that now points at them. To undo, delete
--   the workspace rows that no project references, by hand, per organisation.
-- ============================================================================

INSERT INTO client_workspaces (organization_id, name, slug, description, status, created_by_id, metadata)
SELECT
  o.id,
  btrim(o.name),
  COALESCE(
    NULLIF(
      regexp_replace(
        regexp_replace(lower(btrim(o.slug)), '[^a-z0-9]+', '-', 'g'),
        '^-+|-+$', '', 'g'
      ),
      ''
    ),
    'workspace'
  ),
  'Default workspace for ' || btrim(o.name),
  'active',
  NULL,
  -- The organisation's OWN workspace, as opposed to a client workspace a CRO
  -- created for a customer. ensureProgramProjectAnchor prefers this row over
  -- counting, so a tenant that later adds client workspaces through the live
  -- POST /api/clients keeps anchoring its programs instead of flipping to
  -- AMBIGUOUS_CLIENT_WORKSPACE the moment it has two. The key is
  -- DEFAULT_WORKSPACE_MARKER in services/c2c/organization-default-workspace.ts;
  -- the two must spell it identically.
  '{"defaultForOrganization": true}'::json
FROM organizations o
WHERE btrim(o.name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM client_workspaces w WHERE w.organization_id = o.id
  )
ON CONFLICT (organization_id, slug) DO NOTHING;

-- Assert the repair actually left every organisation addressable. A truncated
-- or partially-refused sweep must fail at apply time rather than produce a
-- tenant that silently cannot anchor a program — the same standard the
-- reference-data seeds in this set hold themselves to.
DO $$
DECLARE
  unworkspaced INTEGER;
BEGIN
  SELECT count(*) INTO unworkspaced
    FROM organizations o
   WHERE btrim(o.name) <> ''
     AND NOT EXISTS (SELECT 1 FROM client_workspaces w WHERE w.organization_id = o.id);

  IF unworkspaced > 0 THEN
    RAISE EXCEPTION
      'organization_default_client_workspace: % organisation(s) still have no client workspace. '
      'projects.client_workspace_id is NOT NULL, so every program in them would be created '
      'unanchored and its governed artifacts would never reach concept2cure_artifacts.',
      unworkspaced;
  END IF;
END $$;
