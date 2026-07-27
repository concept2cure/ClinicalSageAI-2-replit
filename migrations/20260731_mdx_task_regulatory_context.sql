-- MDX task context: lifecycle phase, and what a task actually supports.
--
-- unified_tasks already carries the hard parts — dependencies, blocked_by/blocks,
-- critical_path, regulatory_impact, approval workflow, impact scoring. It does not
-- need replacing and this migration does not replace it. Two things are missing.
--
-- 1. There is no lifecycle phase.
--    server/routes/taskBoard.routes.ts returns `phase: null` and says why in its
--    honesty notes: "unified_tasks has no submission-phase column." So the board
--    cannot group work by where it sits in the regulatory lifecycle, which is the
--    first question anyone running a submission programme asks.
--
--    Added as COLUMNS on unified_tasks rather than in the link table below,
--    because a lifecycle phase is a property of the task itself: a task is in one
--    phase, while it may support several studies and filings. Putting it on the
--    relationship would let one task claim two phases through two links, which is
--    not a state anyone can act on.
--
-- 2. There is nowhere to record what a task supports.
--    A task can currently name a source entity (source_entity_id /
--    source_entity_type) — where it CAME FROM — but not the study, deliverable,
--    filing, requirement or authority commitment it exists to advance. Those are
--    many-per-task and carry their own market and pathway, so they are a
--    relationship, not more columns:
--
--      "Approve reproducibility report"
--        supports  study:reproducibility
--        blocks    filing:dual_510k_clia_waiver  (US, analytical performance)
--        blocks    filing:performance_evaluation_report  (EU, IVDR Class C)
--
--    That is what lets a card say "Blocks FDA Analytical Performance and IVDR PER"
--    instead of just showing a due date.
--
-- Additive throughout: no column dropped or retyped, no existing row modified, and
-- every task without MDX context behaves exactly as it does today.
--
-- Idempotent: safe to re-run.

-- ── Task-level regulatory context ───────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.unified_tasks') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE unified_tasks
    -- strategy | design | verification | clinical_performance_evidence |
    -- submission_preparation | authority_review | market_authorization | postmarket
    --
    -- Nullable on purpose. A task with no declared phase reads as "not yet
    -- classified", which is true; defaulting every existing task to 'strategy'
    -- would put thousands of tasks in a phase nobody assigned them to, and the
    -- board would show a lifecycle breakdown that is entirely manufactured.
    ADD COLUMN IF NOT EXISTS lifecycle_phase TEXT,
    -- mdx | biopharma | pdev — denormalized from the resolved project context so
    -- the board can filter without resolving context per task. The project profile
    -- remains the source of truth; this is a query convenience that a task write
    -- populates, not a second place to declare the vertical.
    ADD COLUMN IF NOT EXISTS industry_vertical TEXT,
    ADD COLUMN IF NOT EXISTS mdx_specialization TEXT,
    -- Whether this task's existence and status may be shown to a client user.
    -- Defaults to internal: releasing work to a client is an act, and defaulting
    -- to visible would publish internal regulatory strategy by omission.
    ADD COLUMN IF NOT EXISTS client_visibility TEXT NOT NULL DEFAULT 'internal';

  CREATE INDEX IF NOT EXISTS unified_tasks_lifecycle_phase_idx
    ON unified_tasks (organization_id, lifecycle_phase)
    WHERE lifecycle_phase IS NOT NULL;

  CREATE INDEX IF NOT EXISTS unified_tasks_vertical_idx
    ON unified_tasks (organization_id, industry_vertical)
    WHERE industry_vertical IS NOT NULL;
END $$;

-- ── What a task supports ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_regulatory_links (
  id               SERIAL PRIMARY KEY,
  organization_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Matches unified_tasks.task_id (the text business key), not the serial id, so
  -- a link survives the same identifier the rest of the task graph uses in
  -- depends_on / blocks.
  task_id          TEXT NOT NULL,

  -- study | deliverable | filing | requirement | commitment | work_package | decision
  entity_type      TEXT NOT NULL,
  -- Free-form by design: the entities live in different stores (rbm_*, vault,
  -- submission, MDX) with different key types, and a foreign key per type would
  -- either force one shape on all of them or need seven nullable columns.
  entity_id        TEXT NOT NULL,
  -- Human label captured at link time, so a board can render the link without
  -- fanning out to every store on every read. Refreshed by the writer, never
  -- treated as authoritative over the entity itself.
  entity_label     TEXT,

  -- supports | blocks | evidence_for | satisfies | derived_from
  relationship     TEXT NOT NULL DEFAULT 'supports',

  -- Regulatory coordinates OF THIS LINK, not of the task: the same task can
  -- support a US filing and an EU one, and those carry different pathways and
  -- different filing sections.
  market           TEXT,
  pathway          TEXT,
  filing_type      TEXT,
  -- Which section of the filing this link feeds, where known.
  filing_section   TEXT,

  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One link per (task, entity, relationship, market). The market is part of the
  -- key because supporting the same filing in two markets is two real links, not
  -- a duplicate.
  UNIQUE (organization_id, task_id, entity_type, entity_id, relationship, market)
);

CREATE INDEX IF NOT EXISTS task_regulatory_links_task_idx
  ON task_regulatory_links (organization_id, task_id);
CREATE INDEX IF NOT EXISTS task_regulatory_links_entity_idx
  ON task_regulatory_links (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS task_regulatory_links_filing_idx
  ON task_regulatory_links (organization_id, filing_type)
  WHERE filing_type IS NOT NULL;
