-- ============================================================================
-- Literature screening decisions — the MEDDEV 2.7/1 Rev 4 appraisal trail
-- (GA completion ledger L4)
-- ============================================================================
--
-- THE GAP. Literature search and recording work end to end
-- (server/services/literature-recording.service.ts →
-- POST /api/cerv2/literature/record → literature_entries), but the SCREENING
-- decision — the include/exclude call a reviewer makes on each hit, and the
-- reason for an exclusion — could not be stored at all. `literature_entries`
-- is entirely bibliographic: title, authors, abstract, journal, doi, url,
-- source, relevance_score, embedding. No status column, no jsonb column.
-- So the write path said so out loud rather than pretending
-- (SCREENING_STATE_UNSUPPORTED), and every screening decision a reviewer made
-- died with the browser session.
--
-- Under MEDDEV 2.7/1 Rev 4 §8-§9 the screening/appraisal trail is precisely
-- what a notified body audits: which articles were screened, at which stage,
-- by whom, when, and — for every exclusion — why. A CER whose literature
-- selection cannot be reconstructed is a CER whose evidence base cannot be
-- verified.
--
-- ── WHY A SEPARATE TABLE, NOT COLUMNS ON literature_entries ────────────────
-- Three independent reasons, each sufficient:
--
--   1. TWO STAGES, NOT ONE. MEDDEV/PRISMA screening is sequential: a
--      title/abstract pass, then a full-text pass on the survivors. Both
--      decisions are evidence, and the CER reports both counts separately —
--      see the CER intelligence flow's own field ids,
--      server/services/ana/intelligence-questions/flows/cer-report.ts:923,929
--      (`articles_after_title_abstract_screening`,
--       `articles_after_full_text_screening`). This file's `stage` vocabulary
--      is taken from those ids rather than invented: 'title_abstract',
--      'full_text'. A pair of columns on literature_entries could hold only
--      one of the two.
--
--   2. PER-DEVICE, NOT PER-ORG. `literature_entries` is an ORGANIZATION
--      corpus with no program column. A screening decision belongs to a
--      clinical evaluation — i.e. to one device's CER. An article excluded as
--      irrelevant to device A is routinely pivotal for device B in the same
--      org. Storing the decision on the shared corpus row would make one
--      reviewer's exclusion silently rewrite another device's evidence base.
--      `program_id` here carries that scope.
--
--   3. ONE ROW = ONE DECISION EVENT. The decision has its own actor and its
--      own timestamp, which are not the corpus row's actor and timestamp.
--
-- ── SCOPE SEMANTICS: program_id NULL is a real, distinct scope ──────────────
-- NULL program_id means "screened against the organization corpus, with no
-- program context" — what the workbench records when no program is open. It is
-- NOT a wildcard and NOT a default: a read for program G returns only rows
-- with program_id = G, and a read with no program returns only NULL rows.
-- Treating NULL as a fallback would let an org-level exclusion silently
-- suppress an article from a specific device's CER, which is defect (2) again
-- by another route.
--
-- Because Postgres treats NULLs as distinct in a unique index, the
-- one-current-decision-per-scope constraint needs TWO partial unique indexes
-- (the portable form; NULLS NOT DISTINCT is PG15+ and this cluster floor is
-- not pinned). See §2.
--
-- ── CURRENT STATE HERE, HISTORY IN THE AUDIT CHAIN ─────────────────────────
-- This table holds the CURRENT decision per (org, entry, program, stage);
-- re-deciding UPDATEs it in place. The immutable before/after trail lives
-- where every other governed action's does — `audit_logs`, written through
-- `auditService.logAction` (docs/AUDIT_STORE_INVENTORY_2026-08.md §2), which
-- hash-chains and HMAC-seals each row. That is the repo's established split
-- (domain table + chained audit row), and it is what makes the decision
-- reconstructable: the audit payload carries the superseded decision and the
-- new one, so a revision is visible, not overwritten.
--
-- ── WHY NO FOREIGN KEYS (the repo's FK-free linkage convention) ────────────
-- `literature_entries` is created by db/migrations/20260801_consolidated_tree_
-- reconciliation.sql, which IS on C2C_MIGRATION_FILES — but its column types
-- differ across lineages (the quarantined _consolidated definition declares
-- organization_id TEXT, the canonical one INTEGER), and `regulatory_programs`
-- reaches no durable applier at all (see the reasoning in
-- migrations/20260814_projects_regulatory_program_anchor.sql). deploy-migrate
-- runs stopOnFirstFailure, so an unguarded REFERENCES here would abort the
-- entire migration set on any database missing either parent. Same call as
-- 20260814 and db/migrations/20260725_bundle_execution_receipts.sql (ADR-0009):
-- the linkage is conventional, enforced by the writer (which resolves the
-- entry inside the caller's org before inserting) and by the read joins, not
-- by the database. Reads tolerate a dangling reference exactly as they
-- tolerate an absent one.
--
-- ── TENANCY ────────────────────────────────────────────────────────────────
-- organization_id is INTEGER NOT NULL, deliberately: that is what
-- db/migrations/20260801_tenant_isolation_sweep.sql requires to attach
-- tenant_isolation_policy (it SKIPS a TEXT/uuid tenant key with a NOTICE).
-- This file is registered in scripts/db/migration-set.mjs ABOVE that sweep, so
-- the table is policied on the same deploy that creates it — never provisioned
-- cross-tenant readable.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS literature_screening_decisions;
-- Rollback loses the screening trail in this table only; the chained
-- audit_logs rows for every decision survive it.
-- ============================================================================

-- ─── 1. The table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS literature_screening_decisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant key. INTEGER so the isolation sweep can policy it (see header).
  organization_id     INTEGER NOT NULL,

  -- literature_entries.id — conventional link, no FK (see header).
  literature_entry_id UUID NOT NULL,

  -- regulatory_programs.id, or NULL for an org-corpus-level decision. NULL is
  -- a distinct scope, not a wildcard.
  program_id          UUID,

  -- Appraisal stage. Vocabulary from the CER intelligence flow's own field ids
  -- (cer-report.ts:923,929), not invented here.
  stage               TEXT NOT NULL,

  -- The reviewer's call. 'pending' is an EXPLICIT deferral ("retrieve the full
  -- text before deciding") and is meaningfully different from the absence of a
  -- row, which means never screened.
  decision            TEXT NOT NULL,

  -- Mandatory for an exclusion (MEDDEV 2.7/1 Rev 4 §8: the reason for every
  -- exclusion is part of the record), forbidden otherwise so an included entry
  -- cannot carry a stale rationale. Enforced by CHECK below, not only by the
  -- service.
  exclusion_reason    TEXT,

  -- users.id of the deciding reviewer. NOT NULL: an unattributed screening
  -- decision is not Part 11 evidence.
  decided_by          INTEGER NOT NULL,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints added separately + guarded so this file is idempotent and so a
-- re-run against a database that already has the table (created by an earlier
-- deploy) still converges on the full shape.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'literature_screening_decisions_stage_chk'
  ) THEN
    ALTER TABLE literature_screening_decisions
      ADD CONSTRAINT literature_screening_decisions_stage_chk
      CHECK (stage IN ('title_abstract', 'full_text'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'literature_screening_decisions_decision_chk'
  ) THEN
    ALTER TABLE literature_screening_decisions
      ADD CONSTRAINT literature_screening_decisions_decision_chk
      CHECK (decision IN ('included', 'excluded', 'pending'));
  END IF;

  -- The integrity rule that makes the trail auditable: an exclusion carries a
  -- non-blank reason; anything else carries none.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'literature_screening_decisions_reason_chk'
  ) THEN
    ALTER TABLE literature_screening_decisions
      ADD CONSTRAINT literature_screening_decisions_reason_chk
      CHECK (
        (decision = 'excluded' AND exclusion_reason IS NOT NULL AND btrim(exclusion_reason) <> '')
        OR (decision <> 'excluded' AND exclusion_reason IS NULL)
      );
  END IF;
END
$do$;

-- ─── 2. One current decision per scope ──────────────────────────────────────
-- Two partial indexes, because Postgres treats NULL program_id values as
-- distinct and a single unique index would therefore permit unlimited
-- duplicate org-level decisions for the same entry+stage.

CREATE UNIQUE INDEX IF NOT EXISTS literature_screening_decisions_scope_uq
  ON literature_screening_decisions (organization_id, literature_entry_id, program_id, stage)
  WHERE program_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS literature_screening_decisions_scope_org_uq
  ON literature_screening_decisions (organization_id, literature_entry_id, stage)
  WHERE program_id IS NULL;

-- ─── 3. Read-path indexes ───────────────────────────────────────────────────
-- The workbench read is "every decision in this org for this program", joined
-- back to literature_entries to key by PMID.

CREATE INDEX IF NOT EXISTS literature_screening_decisions_org_program_idx
  ON literature_screening_decisions (organization_id, program_id);

CREATE INDEX IF NOT EXISTS literature_screening_decisions_entry_idx
  ON literature_screening_decisions (literature_entry_id);

-- ─── 4. Documentation carried in the database ───────────────────────────────

COMMENT ON TABLE literature_screening_decisions IS
  'MEDDEV 2.7/1 Rev 4 literature screening/appraisal decisions — one CURRENT decision per (organization, literature entry, program, stage). The immutable before/after trail is in audit_logs via auditService (GA ledger L4).';
COMMENT ON COLUMN literature_screening_decisions.program_id IS
  'regulatory_programs.id, or NULL for an organization-corpus-level decision. NULL is a distinct scope, never a wildcard: a read for a program returns only that program''s rows. FK-free by repo convention (regulatory_programs reaches no durable applier).';
COMMENT ON COLUMN literature_screening_decisions.stage IS
  'title_abstract | full_text — the two MEDDEV/PRISMA screening passes, named after the CER flow''s own field ids (cer-report.ts:923,929).';
COMMENT ON COLUMN literature_screening_decisions.exclusion_reason IS
  'Mandatory for decision=excluded, forbidden otherwise (CHECK literature_screening_decisions_reason_chk). MEDDEV 2.7/1 Rev 4 §8 requires the reason for every exclusion to be part of the record.';
