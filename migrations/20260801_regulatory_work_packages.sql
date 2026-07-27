-- Regulatory work packages, and a project profile the cockpit can actually read.
--
-- MDX-PM-01. Two changes, and the first one exists because of a real identity
-- split in this codebase that has to be stated rather than worked around.
--
-- ── 1. The platform has TWO project identities ──────────────────────────────
--
-- `projects` (serial id) is the workspace/hierarchy record. unified_tasks,
-- client_workspaces and project_industry_profiles all key on it.
--
-- `regulatory_programs` (uuid id) is the submission-effort record. It is what
-- the Projects DETAIL COCKPIT reads — server/routes/c2c/projects.ts selects from
-- regulatory_programs, and every MDX surface table since 20260507 carries
-- `program_id uuid REFERENCES regulatory_programs(id)`.
--
-- There is no join between them. That is a pre-existing condition of the schema,
-- not something introduced here, and this migration does NOT try to reconcile
-- them: inventing a mapping would mean asserting that a given program IS a given
-- project, which nothing in the data supports.
--
-- What it does instead is let a project industry profile be attached to EITHER
-- identity, so the cockpit can resolve the context for the program it is
-- displaying. project_id loses its NOT NULL and gains program_id beside it, with
-- a constraint that at least one is present. A profile addressed by program_id
-- and a profile addressed by project_id are separate rows describing separate
-- records, which is the truth.
--
-- ── 2. Work packages ───────────────────────────────────────────────────────
--
-- A work package is the unit a regulatory programme is managed in — "Analytical
-- performance", "Clinical performance", "Usability", "Labeling and IFU". Bigger
-- than a task, smaller than a filing.
--
-- It is linked to tasks through the EXISTING task_regulatory_links table
-- (entity_type = 'work_package', entity_id = the package's id::text), which is
-- why that vocabulary already contains 'work_package'. No new join table, and no
-- coupling between the uuid program space and the integer task space: the link
-- is keyed on unified_tasks.task_id, which is text.
--
-- Additive throughout. Nothing is dropped or retyped, and a database without
-- regulatory_programs no-ops rather than failing.
--
-- Idempotent: safe to re-run.

-- ── Let a project profile be addressed by program uuid ──────────────────────
DO $$
BEGIN
  IF to_regclass('public.project_industry_profiles') IS NULL THEN
    RETURN;
  END IF;

  -- Only reference regulatory_programs where it exists; an environment carrying
  -- projects but not the program workbench schema still gets the column.
  IF to_regclass('public.regulatory_programs') IS NOT NULL THEN
    ALTER TABLE project_industry_profiles
      ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES regulatory_programs(id) ON DELETE CASCADE;
  ELSE
    ALTER TABLE project_industry_profiles
      ADD COLUMN IF NOT EXISTS program_id UUID;
  END IF;

  -- A profile may now describe a program instead of a project. Dropping NOT NULL
  -- is a widening: every existing row already has project_id set.
  ALTER TABLE project_industry_profiles ALTER COLUMN project_id DROP NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'project_industry_profiles_identity_chk'
       AND conrelid = 'public.project_industry_profiles'::regclass
  ) THEN
    ALTER TABLE project_industry_profiles
      ADD CONSTRAINT project_industry_profiles_identity_chk
      CHECK (project_id IS NOT NULL OR program_id IS NOT NULL);
  END IF;

  -- One profile per program. Partial, because a project-addressed profile has a
  -- null program_id and several of those must coexist. Inside the guard, since
  -- the column it indexes is created a few lines above.
  CREATE UNIQUE INDEX IF NOT EXISTS project_industry_profiles_program_key
    ON project_industry_profiles (program_id)
    WHERE program_id IS NOT NULL;
END $$;

-- ── Work packages ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'regulatory_programs absent; skipping regulatory_work_packages';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS regulatory_work_packages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    program_id          UUID NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

    -- Id from shared/regulatory/mdx-work-packages.ts, e.g. 'analytical_performance'.
    -- Nullable so a programme can add a package the registry does not model —
    -- the registry is a starting point for a plan, not a closed list a real
    -- programme has to fit into.
    archetype_id        TEXT,
    label               TEXT NOT NULL,

    -- strategy | design | verification | clinical_performance_evidence |
    -- submission_preparation | authority_review | market_authorization | postmarket
    lifecycle_phase     TEXT,

    -- required | conditional. Recorded per programme rather than read from the
    -- registry at display time, because the answer to a conditional package's
    -- question ("does this device contain software?") is a decision this
    -- programme made, and it has to survive a registry revision.
    applicability       TEXT NOT NULL DEFAULT 'required',
    -- Why a conditional package was included or excluded. The question the
    -- registry poses is only useful if the answer is kept.
    applicability_basis TEXT,

    -- not_started | in_progress | blocked | complete | not_applicable
    --
    -- 'not_applicable' is distinct from absent: a conditional package answered
    -- "no" is a defensible, recorded decision, and an inspector asking "why is
    -- there no biocompatibility work here" needs that answer, not a gap.
    status              TEXT NOT NULL DEFAULT 'not_started',
    status_reason       TEXT,

    owner_user_id       INTEGER REFERENCES users(id),
    -- Dated commitments only. Nothing derives a date from a phase or a duration:
    -- there is no default here and none is computed anywhere.
    target_date         DATE,
    completed_at        TIMESTAMPTZ,

    -- internal | client_visible | client_action_required | authority_ready.
    -- Defaults closed, matching unified_tasks.client_visibility.
    client_visibility   TEXT NOT NULL DEFAULT 'internal',

    -- Filing types and markets this package is being run for in THIS programme,
    -- which is narrower than the registry's supportsFilings.
    filings_in_scope    JSONB NOT NULL DEFAULT '[]'::jsonb,
    markets_in_scope    JSONB NOT NULL DEFAULT '[]'::jsonb,

    notes               TEXT,
    created_by          INTEGER REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
  );

  -- One instance of a registry package per programme. A custom package
  -- (archetype_id null) is unconstrained, since two of those are two real things.
  CREATE UNIQUE INDEX IF NOT EXISTS regulatory_work_packages_archetype_key
    ON regulatory_work_packages (program_id, archetype_id)
    WHERE archetype_id IS NOT NULL AND deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS regulatory_work_packages_program_idx
    ON regulatory_work_packages (organization_id, program_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS regulatory_work_packages_phase_idx
    ON regulatory_work_packages (organization_id, lifecycle_phase)
    WHERE deleted_at IS NULL AND lifecycle_phase IS NOT NULL;
END $$;

-- ── Decisions a work package has to defend ──────────────────────────────────
--
-- Kept as rows rather than as text on the package because a regulatory programme
-- IS a chain of defended choices, and the defence is what an authority asks for.
-- A decision recorded as prose inside a notes field cannot be listed, filtered,
-- or shown to have been made before the evidence it depends on.
DO $$
BEGIN
  IF to_regclass('public.regulatory_work_packages') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS regulatory_work_package_decisions (
    id                SERIAL PRIMARY KEY,
    organization_id   INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    work_package_id   UUID NOT NULL REFERENCES regulatory_work_packages(id) ON DELETE CASCADE,

    -- The question, usually taken from the registry's `decisions` list.
    question          TEXT NOT NULL,
    -- Null while the decision is open. An open decision is a real state and the
    -- plan shows it; a blank answer is not the same as no question.
    decision          TEXT,
    -- What the decision was defended on: a standard, a study result, a guidance
    -- document, an authority interaction. This is the field an inspector reads.
    basis             TEXT,
    decided_by        INTEGER REFERENCES users(id),
    decided_at        TIMESTAMPTZ,
    -- Superseded rather than edited, so the history of a changed position is
    -- retained. Points at the decision row that replaced this one.
    superseded_by     INTEGER REFERENCES regulatory_work_package_decisions(id),

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS rwp_decisions_package_idx
    ON regulatory_work_package_decisions (organization_id, work_package_id);
  CREATE INDEX IF NOT EXISTS rwp_decisions_open_idx
    ON regulatory_work_package_decisions (organization_id, work_package_id)
    WHERE decision IS NULL;
END $$;
