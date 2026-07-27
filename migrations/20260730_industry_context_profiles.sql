-- Industry context: make the setting that tailors the workspace a governed record.
--
-- The platform is meant to be ONE self-tailoring workspace whose content presets
-- from the client's industry — shared/regulatory/client-type-profiles.ts says so
-- explicitly, and maps medtech to the MDX vertical with device terminology and
-- dual review. That foundation is right. What is missing is that the setting
-- driving it is not governed:
--
--   * organizations.industry_mode exists, but has no specialization axis, so a
--     Class II instrument manufacturer and an IVD manufacturer are the same
--     value ('medtech') despite needing different study archetypes, protocol
--     structures, performance statistics and filing types.
--   * The Admin Settings panel that presents "Client type" as driving templates,
--     pathways and AnA context writes to localStorage. Its own comment says so.
--     A per-browser value cannot govern regulated project behaviour: two users
--     in one organization would get different study menus for the same study.
--   * There is nowhere to record that a CRO's project is a device project while
--     the same CRO's next project is a pharmaceutical one.
--
-- Two tables, one per layer of the precedence chain
-- (project -> client -> organization -> license default):
--
--   organization_industry_profiles  the governed org default, audited
--   project_industry_profiles       the per-project refinement/override
--
-- NAVIGATION IS UNAFFECTED. Neither table adds, removes or reorders anything in
-- the left rail. They change what the existing modules offer inside themselves.
--
-- Idempotent: safe to re-run.

-- ── Organization profile ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_industry_profiles (
  id                     SERIAL PRIMARY KEY,
  organization_id        INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- medical_device_diagnostics | biotech_pharma | cro | regulatory_consulting | academic_research
  primary_industry       TEXT NOT NULL,
  -- medical_device | ivd_diagnostics | medical_device_and_ivd |
  -- software_as_medical_device | companion_diagnostic | combination_product | unspecified
  --
  -- 'unspecified' is a real state, not a missing value: a CRO serving both device
  -- and IVD sponsors should not have a specialization guessed for it at the
  -- organization level. The resolver reports it so a project asks once.
  mdx_specialization     TEXT NOT NULL DEFAULT 'unspecified',

  default_markets        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ['us','eu','ca','jp',...]
  default_pathways       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- filing types enabled by default
  -- Mirrors the ApprovalRigor union in client-type-profiles.ts rather than
  -- introducing a second vocabulary for the same decision.
  default_approval_rigor TEXT NOT NULL DEFAULT 'regulated_dual_review',

  -- When this profile took effect, kept separate from updated_at: a profile
  -- changed today may be declared effective from the start of a reporting period,
  -- and an inspector asking "what was this organization set up as in June" needs
  -- the declared date, not the row's last write.
  effective_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Why the last material change was made. Required by the route for a change of
  -- industry or specialization, because those change which regulatory
  -- instruments the workspace offers.
  change_reason          TEXT,
  updated_by             INTEGER REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_industry_profiles_org_idx
  ON organization_industry_profiles (organization_id);

-- ── Project profile ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_industry_profiles (
  id                   SERIAL PRIMARY KEY,
  organization_id      INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id           INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  client_workspace_id  INTEGER REFERENCES client_workspaces(id) ON DELETE SET NULL,

  -- TRUE while the project has not been refined and is reading the org default.
  -- Kept explicitly rather than inferred from null columns, so "this project was
  -- deliberately set to match the organization" is distinguishable from "nobody
  -- has looked at this project's context yet".
  inherited_from_org   BOOLEAN NOT NULL DEFAULT TRUE,

  -- mdx | biopharma | pdev. Null means "inherit"; a service organization's
  -- project is expected to set this, since its org-level vertical is only a weak
  -- default (see INDUSTRY_DETERMINES_VERTICAL).
  vertical             TEXT,
  specialization       TEXT,
  product_type         TEXT,
  lifecycle_stage      TEXT,
  target_markets       JSONB NOT NULL DEFAULT '[]'::jsonb,
  regulatory_pathways  JSONB NOT NULL DEFAULT '[]'::jsonb,
  filing_types         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Free-form purpose (full program, submission, clinical investigation, ...).
  project_purpose      TEXT,

  updated_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_industry_profiles_org_idx
  ON project_industry_profiles (organization_id);
CREATE INDEX IF NOT EXISTS project_industry_profiles_project_idx
  ON project_industry_profiles (project_id);
CREATE INDEX IF NOT EXISTS project_industry_profiles_client_idx
  ON project_industry_profiles (client_workspace_id)
  WHERE client_workspace_id IS NOT NULL;

-- ── Backfill from what is already persisted ─────────────────────────────────
--
-- Every organization gets a profile derived from its existing industry_mode, so
-- the resolver has a governed row to read from day one instead of falling back
-- for every tenant.
--
-- Specialization is deliberately NOT guessed. A medtech organization becomes
-- 'unspecified', not 'medical_device': the distinction has never been recorded,
-- so inferring it would manufacture a regulatory fact. 'unspecified' is what the
-- system actually knows, and the surface prompts for it.
--
-- Guarded on NOT EXISTS so a re-run cannot overwrite a profile a human has since
-- set — the backfill establishes a starting point, it does not own the row.
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RETURN;
  END IF;

  -- Only organizations whose industry_mode maps to a KNOWN primary industry are
  -- backfilled. An organization with a null or unrecognized industry_mode is left
  -- WITHOUT a profile row, deliberately: creating one would fabricate a governed,
  -- audited record asserting an organization-level declaration that was never
  -- made, and — because the resolver treats a profile row as source
  -- 'organization' — it would silently present that guessed vertical as decided,
  -- with no needsDeclaration to say otherwise and a change_reason that falsely
  -- claims the value came from industry_mode. An org with no row falls through to
  -- the resolver's runtime handling, which reports its source honestly (legacy
  -- column or license default) and prompts for a declaration where one is owed.
  -- This is the same "never manufacture a regulatory fact" rule the rest of the
  -- module follows; the ELSE 'biotech_pharma' default this replaces broke it.
  INSERT INTO organization_industry_profiles (
    organization_id, primary_industry, mdx_specialization, default_approval_rigor, change_reason
  )
  SELECT
    o.id,
    CASE LOWER(o.industry_mode)
      WHEN 'medtech'         THEN 'medical_device_diagnostics'
      WHEN 'biotech'         THEN 'biotech_pharma'
      WHEN 'pharma'          THEN 'biotech_pharma'
      WHEN 'cro'             THEN 'cro'
      WHEN 'regulatory'      THEN 'regulatory_consulting'
      WHEN 'academic'        THEN 'academic_research'
      WHEN 'medical_writing' THEN 'regulatory_consulting'
    END,
    'unspecified',
    'regulated_dual_review',
    'Backfilled from organizations.industry_mode when the governed profile was introduced'
  FROM organizations o
  WHERE LOWER(o.industry_mode) IN (
      'medtech', 'biotech', 'pharma', 'cro', 'regulatory', 'academic', 'medical_writing'
    )
    AND NOT EXISTS (
      SELECT 1 FROM organization_industry_profiles p WHERE p.organization_id = o.id
    );
END $$;
