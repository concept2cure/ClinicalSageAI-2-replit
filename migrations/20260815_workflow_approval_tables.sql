-- ============================================================================
-- The document-approval workflow tables — code that reads them, nothing that
-- creates them
-- ============================================================================
--
-- WHY. `GET /api/approval-workflows/pending` answered 500 on every request,
-- with `relation "document_workflows" does not exist` in the log. Five tables
-- are declared as Drizzle models in `shared/schema/unified_workflow.ts` and
-- consumed by six server services — ApprovalOrchestrator, WorkflowService,
-- DecisionLineageService, ModuleIntegrationService, the eCTD leaf-source
-- resolver and the promote-artifact AI action — and **no provisioning path
-- creates any of them**:
--
--   · `drizzle-kit push` reads only `shared/schema.ts` (drizzle.config.ts:25),
--     and that barrel re-exports eight modules from `shared/schema/` —
--     `unified_workflow` is not among them. So push never sees these models.
--   · No raw SQL migration creates them either. The three files that mention
--     `document_workflows` only add indexes or RLS policies TO it
--     (0004_workflow_performance_indexes, 0007_tenant_isolation_fixes,
--     20260331_performance_indexes), and both of the first two are on the
--     install-fresh skip list precisely because they fail on its absence.
--
-- This is the "merged ≠ applied" failure the repo already names: a table that
-- exists in TypeScript, is read by production code, and has never existed in a
-- database.
--
-- ── Why a migration rather than adding the module to the push barrel ────────
-- Adding `export * from './schema/unified_workflow'` to `shared/schema.ts` is
-- the smaller diff and it is the wrong one, for two reasons:
--
--   1. It collides. `documentComments` and `insertDocumentVersionSchema` are
--      already exported from `shared/schema.ts`, so the barrel re-export does
--      not compile.
--   2. It drags in `unified_documents`, which is ledger C-29 — a known
--      push-vs-overlay identity collision whose only SQL creator also redefines
--      `users` and `tenants` with TEXT keys. That table already exists here by
--      another route; widening the push surface to include a second definition
--      of it is how C-29 gets worse, not resolved.
--
-- So this file creates exactly the five workflow tables, mirroring the Drizzle
-- models column for column, and leaves the C-29 question alone.
--
-- Idempotent throughout: every CREATE is IF NOT EXISTS and the enum creation is
-- guarded, so this is safe on a database where a future barrel change has
-- already created them via push.

-- ── Enum types ──────────────────────────────────────────────────────────────
-- pgEnum has no IF NOT EXISTS before PG 12 semantics we can rely on across the
-- fleet, so each is guarded on pg_type.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_status') THEN
    CREATE TYPE workflow_status AS ENUM ('active', 'completed', 'rejected', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_type') THEN
    CREATE TYPE approval_type AS ENUM ('user', 'role', 'group');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'module_type') THEN
    CREATE TYPE module_type AS ENUM ('cmc', 'cer', 'study', 'ectd', '510k', 'vault');
  END IF;
END
$$;

-- ── workflow_templates ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_templates (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT,
  module_type        module_type NOT NULL,
  organization_id    INTEGER NOT NULL,
  created_by         TEXT NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT now(),
  updated_by         TEXT,
  updated_at         TIMESTAMP DEFAULT now(),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  document_types     TEXT[] NOT NULL DEFAULT '{}',
  default_for_types  TEXT[] NOT NULL DEFAULT '{}'
);

-- The endpoint's own predicate: templates for one org, active, by module.
CREATE INDEX IF NOT EXISTS idx_workflow_templates_org_active
  ON workflow_templates (organization_id, is_active);

-- ── workflow_steps ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_steps (
  id                SERIAL PRIMARY KEY,
  template_id       INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  "order"           INTEGER NOT NULL,
  approver_type     approval_type NOT NULL,
  approver_ids      TEXT[] NOT NULL,
  required_actions  TEXT[] NOT NULL DEFAULT '{review,comment}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_template ON workflow_steps (template_id);

-- ── document_workflows ──────────────────────────────────────────────────────
-- The relation whose absence produced the 500.

CREATE TABLE IF NOT EXISTS document_workflows (
  id               SERIAL PRIMARY KEY,
  document_id      INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  template_id      INTEGER NOT NULL REFERENCES workflow_templates(id),
  status           workflow_status NOT NULL DEFAULT 'active',
  current_step     INTEGER NOT NULL DEFAULT 1,
  started_by       TEXT NOT NULL,
  started_at       TIMESTAMP NOT NULL DEFAULT now(),
  completed_by     TEXT,
  completed_at     TIMESTAMP,
  rejected_by      TEXT,
  rejected_at      TIMESTAMP,
  organization_id  INTEGER NOT NULL,
  metadata         JSON DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_doc_workflows_org_status
  ON document_workflows (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_doc_workflows_document_id
  ON document_workflows (document_id);

-- ── workflow_approvals ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_approvals (
  id                SERIAL PRIMARY KEY,
  workflow_id       INTEGER NOT NULL REFERENCES document_workflows(id) ON DELETE CASCADE,
  step_id           INTEGER NOT NULL REFERENCES workflow_steps(id),
  step_order        INTEGER NOT NULL,
  status            approval_status NOT NULL DEFAULT 'pending',
  assigned_to       TEXT[] NOT NULL,
  assignment_type   approval_type NOT NULL,
  required_actions  TEXT[] NOT NULL DEFAULT '{review}',
  completed_by      TEXT,
  completed_at      TIMESTAMP,
  comments          TEXT
);

CREATE INDEX IF NOT EXISTS idx_wf_approvals_workflow_status
  ON workflow_approvals (workflow_id, status);

-- ── workflow_history ────────────────────────────────────────────────────────
-- Append-only record of who moved an approval and when. Part of the evidence a
-- regulated tenant produces for a governed transition, so it is created with
-- the rest rather than left for whoever notices next.

CREATE TABLE IF NOT EXISTS workflow_history (
  id            SERIAL PRIMARY KEY,
  workflow_id   INTEGER NOT NULL REFERENCES document_workflows(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  performed_by  TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  details       JSON DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_history_workflow ON workflow_history (workflow_id);
