-- ============================================================================
-- ARCHIVED 2026-09-10 (WO-1, ADR-0006). DO NOT RE-ADD THIS MIRROR.
-- ============================================================================
-- This was a BYTE-IDENTICAL copy of migrations/20260501_q_sub.sql — same md5
-- (ebad5201783623187705fae35c4f6bde), `cmp` reported no difference, and
-- scripts/db/migration-set.mjs:1172 already said so in a comment. So nothing is
-- lost by archiving it: no shape, constraint, default or index differed, and
-- CLAUDE.md RULE 1's amend-in-place requirement is not engaged, because nothing
-- was removed from the surviving definition — only a second copy of it.
--
-- WHICH COPY SURVIVES WAS FORCED BY THE APPLIERS, NOT CHOSEN.
-- migrations/20260501_q_sub.sql is pinned by name in C2C_MIGRATION_FILES
-- (migration-set.mjs:1173), so deploy-migrate runs it; install-fresh's root-tree
-- overlay runs it too. Both real appliers execute the root copy and neither
-- executes this one. Keeping this one instead would have meant repointing
-- migration-set.mjs AND adding it to install-fresh's PRE_OVERLAY_CREATORS,
-- because the root tree's migrations/20260507_mdx_beta_surfaces.sql:143 declares
-- `q_submission_id uuid NOT NULL REFERENCES q_submissions(id)` and would fail
-- with 42P01 if q_submissions were not already there.
--
-- WHY THE MIRROR EXISTED, so the reasoning is not repeated.
-- docs/reports/MDX_BETA_BACKEND_PROGRESS_2026-05-01.md:26-27 records it as
-- deliberate — "a mirror at db/migrations/20260501_q_sub.sql so the bash runner
-- picks it up too". That was defensible when written. It is not now, for two
-- reasons: scripts/db_migrate.sh (the bash runner) has NO automated caller, and
-- .github/workflows/neon-preview-db.yml:92 explicitly declines to run it
-- ("would re-apply all ~166 migrations from scratch — most aren't idempotent");
-- and the mirror was never completed, so on that path q_submissions existed
-- while regulatory_programs (migrations/20260524_program_workbench_schema.sql)
-- and q_sub_section_bodies did not — every Q-Sub read joins
-- regulatory_programs, so the tables it created could not serve a request.
--
-- THE DEFECT THIS REMOVES is divergence, not duplication. Both files being
-- identical was an accident of nobody having edited one. The moment anyone
-- ALTERed the Q-Sub schema by editing a single copy, install-fresh- and
-- db_migrate.sh-provisioned databases would silently diverge under
-- CREATE TABLE IF NOT EXISTS, with no gate able to see it.
-- ============================================================================

-- Q-Sub (Pre-Submission) migration
--
-- Mirrors shared/schema/q-sub.ts. Hand-authored to mirror the drizzle table
-- definitions exactly — tenant isolation is enforced at the service layer by
-- joining regulatoryPrograms.organization_id, matching the pattern used by
-- evidence-sufficiency and post-market.

BEGIN;

-- ─── q_submissions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS q_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      text NOT NULL,
  q_number        varchar(32),
  q_sub_type      varchar(16) NOT NULL,
  title           text NOT NULL,
  stage           varchar(16) NOT NULL DEFAULT 'plan',
  days_in         integer NOT NULL DEFAULT 0,
  filed_at        timestamptz,
  target_date     timestamptz,
  fda_team        text,
  tone            varchar(8) DEFAULT '',
  summary         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  CONSTRAINT q_submissions_qsubtype_chk CHECK (q_sub_type IN ('presub','sir','srd','agree','info')),
  CONSTRAINT q_submissions_stage_chk    CHECK (stage IN ('plan','package','submit','await','feedback','integrate'))
);
CREATE INDEX IF NOT EXISTS q_submissions_program_idx ON q_submissions (program_id);
CREATE INDEX IF NOT EXISTS q_submissions_stage_idx   ON q_submissions (stage);
CREATE UNIQUE INDEX IF NOT EXISTS q_submissions_qnumber_uq ON q_submissions (q_number) WHERE q_number IS NOT NULL;

-- ─── q_sub_meetings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS q_sub_meetings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_submission_id       uuid NOT NULL REFERENCES q_submissions(id) ON DELETE CASCADE,
  meeting_date          timestamptz NOT NULL,
  kind                  varchar(64) NOT NULL,
  fda_team_display      text,
  confirmed             boolean NOT NULL DEFAULT false,
  minutes_received_at   timestamptz,
  minutes_text          text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS q_sub_meetings_submission_idx ON q_sub_meetings (q_submission_id);

-- ─── q_sub_questions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS q_sub_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_submission_id   uuid NOT NULL REFERENCES q_submissions(id) ON DELETE CASCADE,
  n                 integer NOT NULL,
  question          text NOT NULL,
  our_position      text NOT NULL,
  fda_response      text,
  status            varchar(16) NOT NULL DEFAULT 'awaiting',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT q_sub_questions_status_chk CHECK (status IN ('answered','awaiting'))
);
CREATE INDEX IF NOT EXISTS q_sub_questions_submission_idx ON q_sub_questions (q_submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS q_sub_questions_submission_n_uq ON q_sub_questions (q_submission_id, n);

-- ─── q_sub_commitments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS q_sub_commitments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_sub_question_id        uuid NOT NULL REFERENCES q_sub_questions(id) ON DELETE CASCADE,
  display_code             varchar(32) NOT NULL,
  text                     text NOT NULL,
  dossier_link_kind        varchar(32) NOT NULL,
  dossier_link_label       varchar(128) NOT NULL,
  dossier_link_section_id  text NOT NULL,
  rolled_in                boolean NOT NULL DEFAULT false,
  rolled_in_at             timestamptz,
  rolled_in_by             text,
  blocker                  boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT q_sub_commitments_link_chk CHECK (dossier_link_kind IN ('k510-section','pma-section','cer-section'))
);
CREATE INDEX IF NOT EXISTS q_sub_commitments_question_idx ON q_sub_commitments (q_sub_question_id);
CREATE INDEX IF NOT EXISTS q_sub_commitments_blocker_idx ON q_sub_commitments (blocker) WHERE blocker = true;
CREATE INDEX IF NOT EXISTS q_sub_commitments_section_idx ON q_sub_commitments (dossier_link_section_id);
CREATE UNIQUE INDEX IF NOT EXISTS q_sub_commitments_displaycode_uq ON q_sub_commitments (display_code);

-- ─── q_sub_timeline_entries ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS q_sub_timeline_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_submission_id   uuid NOT NULL REFERENCES q_submissions(id) ON DELETE CASCADE,
  "when"            varchar(32) NOT NULL,
  who               varchar(64) NOT NULL,
  what              text NOT NULL,
  occurred_at       timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS q_sub_timeline_submission_idx ON q_sub_timeline_entries (q_submission_id);
CREATE INDEX IF NOT EXISTS q_sub_timeline_occurred_idx   ON q_sub_timeline_entries (occurred_at DESC);

COMMIT;
