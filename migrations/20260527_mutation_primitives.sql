-- ============================================================================
-- Mutation Primitives — Day 1
-- Creates c2c_ana_actions ledger + extends audit_logs with chain fields.
-- Must run in one transaction.
-- ============================================================================

BEGIN;

-- ── 1. c2c_ana_actions — agentic-action lifecycle ledger ──────────────────
--
-- Every governed UI mutation begins here (proposed) and ends in audit_logs
-- (executed). The state machine: proposed → approved → executed (or skipped /
-- failed / reversed).
--
-- Type corrections applied vs original brief:
--   proposed_by / decided_by : integer (users.id is serial, not uuid)
--   audit_row_id             : uuid    (audit_logs.id is uuid)
--   org_id                   : integer (organizations use integer PKs)
--   conversation_id          : text, no FK (@kit-registry-no-consumer-yet;
--                              FK added in Phase 10.1 when c2c_ana_conversations ships)

CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id              text        PRIMARY KEY,                    -- act_<uuid>
  org_id          integer     NOT NULL,
  conversation_id text,
  domain          text        NOT NULL,                       -- 'mdx' | 'biopharma' | 'pdev'
  surface         text        NOT NULL,
  command         text        NOT NULL,                       -- 'claim' | 'transition' | 'resolve' | 'sign' | 'accept' | 'lock'
  target          text        NOT NULL,
  risk            text        NOT NULL DEFAULT 'low',         -- 'low' | 'med' | 'high'
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  agentic_mode    text        NOT NULL DEFAULT 'suggest',     -- 'suggest' | 'act_without_asking'
  state           text        NOT NULL DEFAULT 'proposed',    -- proposed | approved | modified | skipped | executed | failed | reversed
  proposed_at     timestamptz NOT NULL DEFAULT now(),
  proposed_by     integer     NOT NULL REFERENCES users(id),
  decided_at      timestamptz,
  decided_by      integer     REFERENCES users(id),
  decision_reason text,
  executed_at     timestamptz,
  audit_row_id    uuid        REFERENCES audit_logs(id),      -- backlink once executed
  reverse_of      text        REFERENCES c2c_ana_actions(id),
  idempotency_key text        UNIQUE,

  CONSTRAINT c2c_ana_actions_command_check
    CHECK (command IN ('claim','transition','resolve','sign','accept-ai-suggestion','lock',
                       'unclaim','transition-back','reopen','revoke-signature','reject-ai-suggestion','unlock')),
  CONSTRAINT c2c_ana_actions_risk_check
    CHECK (risk IN ('low','med','high')),
  CONSTRAINT c2c_ana_actions_state_check
    CHECK (state IN ('proposed','approved','modified','skipped','executed','failed','reversed')),
  CONSTRAINT c2c_ana_actions_mode_check
    CHECK (agentic_mode IN ('suggest','act_without_asking'))
);

CREATE INDEX IF NOT EXISTS c2c_ana_actions_org_idx     ON c2c_ana_actions (org_id);
CREATE INDEX IF NOT EXISTS c2c_ana_actions_conv_idx    ON c2c_ana_actions (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS c2c_ana_actions_state_idx   ON c2c_ana_actions (state) WHERE state IN ('proposed','approved');
CREATE INDEX IF NOT EXISTS c2c_ana_actions_target_idx  ON c2c_ana_actions (target);
CREATE INDEX IF NOT EXISTS c2c_ana_actions_proposed_at ON c2c_ana_actions (proposed_at DESC);

-- ── 2. Extend audit_logs with chain fields ────────────────────────────────
--
-- Adds the 9 columns the Mutation Primitives envelope requires.
-- Legacy columns (user_id, table_name, record_id) remain populated for
-- one release cycle so existing reports keep working. Drop them after 30 days
-- of zero reads on the old columns (tracked via query logging).
--
-- Type correction: actor_id is integer (C-5 resolution) — users.id is serial.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_id      integer     REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS target        text,
  ADD COLUMN IF NOT EXISTS target_type   text,
  ADD COLUMN IF NOT EXISTS target_id     text,
  ADD COLUMN IF NOT EXISTS reason        text,
  ADD COLUMN IF NOT EXISTS payload_hash  text,
  ADD COLUMN IF NOT EXISTS ana_action_id text        REFERENCES c2c_ana_actions(id),
  ADD COLUMN IF NOT EXISTS sha256_chain  text,
  ADD COLUMN IF NOT EXISTS occurred_at   timestamptz NOT NULL DEFAULT now();

-- ── 3. Backfill — populate new columns from legacy columns ────────────────
--
-- Runs only on rows that have legacy data but no actor_id yet.
-- sha256_chain intentionally left NULL on legacy rows — chain starts fresh
-- from the first new mutation. Integrity monitor will note the discontinuity.

UPDATE audit_logs
SET
  actor_id    = user_id,
  target      = COALESCE(table_name, '') || ':' || COALESCE(record_id, ''),
  target_type = table_name,
  target_id   = record_id,
  occurred_at = COALESCE(created_at, now())
WHERE actor_id IS NULL
  AND (user_id IS NOT NULL OR table_name IS NOT NULL);

COMMIT;
