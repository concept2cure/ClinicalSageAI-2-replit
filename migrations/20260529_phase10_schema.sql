-- ============================================================================
-- Phase 10 schema — Biopharma domain shell + Projects detail + AnA dock
-- Day 1: additive tables only. All statements are idempotent (IF NOT EXISTS).
-- ============================================================================
--
-- Ships:
--   1. c2c_ana_conversations       — per-(user, domain, surface) thread store
--   2. c2c_ana_conversation_turns  — individual turns per thread
--   3. c2c_ana_agentic_prefs       — per-(user, domain) agentic mode preference
--   4. c2c_project_pinned_evidence — project-level pinned evidence cards
--   5. FK retrofit: c2c_ana_actions.conversation_id → c2c_ana_conversations.id
--      (was deferred from Mutation Primitives Day 1 pending this table)
--
-- Type notes (matching existing schema conventions):
--   users.id           → integer (serial)
--   organizations.id   → integer
--   regulatory_programs.id → uuid
-- ============================================================================

BEGIN;

-- ── 1. c2c_ana_conversations ─────────────────────────────────────────────────
--
-- One row per (owner, domain, surface). Stores the thread_id returned by the
-- AnA stream so successive turns attach to the same conversation.
-- The `domain` column was deferred from Phase 8; added here along with the table.

CREATE TABLE IF NOT EXISTS c2c_ana_conversations (
  id            text        PRIMARY KEY,           -- conv_<uuid>
  org_id        integer     NOT NULL,
  owner_id      integer     NOT NULL,              -- users.id (integer PK)
  domain        text        NOT NULL DEFAULT 'mdx',-- 'mdx' | 'biopharma' | 'pdev' | 'project'
  surface       text        NOT NULL,              -- nav item id or 'project:<uuid>'
  thread_id     text,                              -- AnA upstream thread id (nullable until first turn)
  title         text,                              -- auto-summarised after turn 3
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS c2c_ana_conv_owner_domain_surface_uidx
  ON c2c_ana_conversations (owner_id, domain, surface);

CREATE INDEX IF NOT EXISTS c2c_ana_conv_org_idx
  ON c2c_ana_conversations (org_id);

CREATE INDEX IF NOT EXISTS c2c_ana_conv_updated_idx
  ON c2c_ana_conversations (owner_id, updated_at DESC);

-- ── 2. c2c_ana_conversation_turns ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS c2c_ana_conversation_turns (
  id              bigserial   PRIMARY KEY,
  conversation_id text        NOT NULL REFERENCES c2c_ana_conversations(id) ON DELETE CASCADE,
  role            text        NOT NULL,            -- 'user' | 'ana'
  body            text        NOT NULL,
  tool_calls      jsonb,                           -- [{name, label, status}]
  action_chips    jsonb,                           -- [{label, actionType, artifactId}]
  latency_ms      integer,
  provider        text,                            -- 'anthropic' | 'fallback'
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT c2c_ana_conv_turns_role_check CHECK (role IN ('user','ana'))
);

CREATE INDEX IF NOT EXISTS c2c_ana_turns_conv_idx
  ON c2c_ana_conversation_turns (conversation_id, created_at ASC);

-- ── 3. c2c_ana_agentic_prefs ─────────────────────────────────────────────────
--
-- Per-(user, domain) toggle: 'suggest' (confirmation required) or
-- 'act_without_asking' (direct execution). Defaults to 'suggest'.

CREATE TABLE IF NOT EXISTS c2c_ana_agentic_prefs (
  user_id    integer     NOT NULL,                 -- users.id
  domain     text        NOT NULL,
  mode       text        NOT NULL DEFAULT 'suggest',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, domain),
  CONSTRAINT c2c_ana_agentic_prefs_mode_check CHECK (mode IN ('suggest','act_without_asking'))
);

-- ── 4. c2c_project_pinned_evidence ──────────────────────────────────────────
--
-- Evidence cards pinned to a regulatory program (project). Displayed in the
-- Project detail aside. Click → vault / artifact / RIM. The unique constraint
-- ensures the same source can't be pinned twice per project.

CREATE TABLE IF NOT EXISTS c2c_project_pinned_evidence (
  id            bigserial   PRIMARY KEY,
  project_id    uuid        NOT NULL,              -- regulatory_programs.id
  evidence_kind text        NOT NULL,              -- 'artifact' | 'vault_doc' | 'rim_precedent' | 'guidance'
  evidence_ref  text        NOT NULL,              -- artifact id, vault doc id, or external reference
  title         text        NOT NULL,
  meta          text,                              -- display subtitle (e.g. "Section IV.C · RIM 0.91")
  pinned_by     integer     NOT NULL,              -- users.id
  pinned_at     timestamptz NOT NULL DEFAULT now(),
  reason        text,

  CONSTRAINT c2c_pinned_ev_kind_check
    CHECK (evidence_kind IN ('artifact','vault_doc','rim_precedent','guidance')),
  UNIQUE (project_id, evidence_kind, evidence_ref)
);

CREATE INDEX IF NOT EXISTS c2c_pinned_ev_project_idx
  ON c2c_project_pinned_evidence (project_id, pinned_at DESC);

-- ── 5. FK retrofit: c2c_ana_actions.conversation_id ──────────────────────────
--
-- The Mutation Primitives migration left conversation_id as untyped text with
-- no FK ("FK added in Phase 10.1 when c2c_ana_conversations ships").
-- Add the constraint now that the referent table exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'c2c_ana_actions_conversation_id_fkey'
      AND table_name = 'c2c_ana_actions'
  ) THEN
    ALTER TABLE c2c_ana_actions
      ADD CONSTRAINT c2c_ana_actions_conversation_id_fkey
      FOREIGN KEY (conversation_id)
      REFERENCES c2c_ana_conversations(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;
