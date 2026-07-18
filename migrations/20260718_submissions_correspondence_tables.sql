-- Submissions + regulator-correspondence stores.
--
-- Routes (server/routes/regulatory-correspondence.ts for c2c_*, plus the reg_*
-- lifecycle route) + the demo seed (scripts/seed/ga-demo.d/80-programs-tlf-pdev.mjs)
-- were shipped, but these tables were never created by a migration in the
-- runner's tree. Columns derived from the route INSERT/SELECT column lists and
-- the seed INSERTs. c2c_* ids are route-generated UUIDs (crypto.randomUUID());
-- the seed relies on the gen_random_uuid() default. project_id is integer (the
-- correspondence route coerces it with Number()); reg_* uses tenant_id + a
-- serial sub_id PK and a text product_id.

CREATE TABLE IF NOT EXISTS c2c_submissions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          integer NOT NULL,
  project_id               integer,
  submission_type          text NOT NULL,
  regulator                text,
  center                   text,
  division                 text,
  application_number       text,
  sequence_number          text,
  lifecycle_state          text,
  clock_metadata           jsonb,
  linked_artifact_ids      jsonb,
  linked_communication_ids jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_c2c_submissions_org ON c2c_submissions (organization_id);
CREATE INDEX IF NOT EXISTS idx_c2c_submissions_project ON c2c_submissions (organization_id, project_id);

CREATE TABLE IF NOT EXISTS c2c_correspondence (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   integer NOT NULL,
  project_id        integer,
  submission_id     uuid,
  direction         text,
  source_channel    text,
  communication_type text,
  subject           text,
  sender            text,
  recipients        jsonb,
  received_at       timestamptz,
  sent_at           timestamptz,
  due_date          timestamptz,
  urgency           text,
  response_required boolean,
  status            text,
  source_message_id text,
  source_thread_id  text,
  source_mailbox_id text,
  parser_metadata   jsonb,
  attachment_refs   jsonb,
  parsed_text       text,
  summary           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_c2c_correspondence_org ON c2c_correspondence (organization_id);
CREATE INDEX IF NOT EXISTS idx_c2c_correspondence_project ON c2c_correspondence (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_c2c_correspondence_submission ON c2c_correspondence (submission_id);

CREATE TABLE IF NOT EXISTS c2c_correspondence_issues (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id   uuid NOT NULL REFERENCES c2c_correspondence(id) ON DELETE CASCADE,
  category            text,
  severity            text,
  blocker             boolean,
  response_required   boolean,
  source_excerpt      text,
  confidence          numeric,
  human_review_status text,
  mapped_ctd_sections jsonb,
  mapped_artifact_ids jsonb,
  resolution_status   text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_c2c_correspondence_issues_corr ON c2c_correspondence_issues (correspondence_id);

CREATE TABLE IF NOT EXISTS c2c_submission_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     integer NOT NULL,
  project_id          integer,
  submission_id       uuid,
  correspondence_id   uuid,
  response_package_id uuid,
  event_type          text NOT NULL,
  event_time          timestamptz NOT NULL DEFAULT now(),
  summary             text,
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_c2c_submission_events_org ON c2c_submission_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_c2c_submission_events_submission ON c2c_submission_events (submission_id);

-- NOTE: the reg_* CMC-portfolio tables (reg_submissions / reg_m3_sections) are
-- intentionally NOT created here. Their canonical baseline (0000_sweet_joseph.sql)
-- keys them on a UUID sub_id (reg_obligations.sub_id is uuid) and a differently
-- shaped reg_questions already exists, so creating a serial-keyed reg_submissions
-- collides with the shipped schema. The seed's seedCmc() guard-skips cleanly when
-- reg_submissions is absent, so leaving it uncreated keeps that CMC sub-surface on
-- its fixture without breaking the rest of the programs/correspondence seed.
-- Reconciling the reg_* tree against 0000 is tracked separately.
