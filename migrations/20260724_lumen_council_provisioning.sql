-- Multi-agent drafting council provisioning (lumen schema)
--
-- The MultiAgentCouncilService (server/services/multi-agent-council.ts) — the
-- Drafter → Statistician → Critic → Synthesizer pipeline with Part-11 audit —
-- has always referenced lumen.* tables that no migration created, leaving the
-- capability dormant. This migration provisions the schema, the tables it owns,
-- and the four default agents idempotently (IF NOT EXISTS / ON CONFLICT DO
-- NOTHING), so AnA's convene_drafting_council tool becomes live.
--
-- lumen.data_atoms is the one lumen table this file does NOT own — see the note
-- where it used to be defined, below.
--
-- Model note: the per-agent model_provider/model_name columns are informational
-- lineage — actual routing goes through the governed AI gateway (Claude-first,
-- task-based), which records model, prompt hash, and fallback chain per call.

CREATE SCHEMA IF NOT EXISTS lumen;

CREATE TABLE IF NOT EXISTS lumen.agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code TEXT NOT NULL UNIQUE,
  agent_role TEXT NOT NULL,
  model_provider TEXT NOT NULL DEFAULT 'anthropic',
  model_name TEXT NOT NULL DEFAULT 'gateway-routed',
  temperature NUMERIC NOT NULL DEFAULT 0.3,
  max_tokens INT NOT NULL DEFAULT 4096,
  system_prompt_template TEXT NOT NULL,
  data_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lumen.council_sessions (
  id UUID PRIMARY KEY,
  program_id TEXT,
  section_path TEXT NOT NULL,
  requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_atom_ids TEXT[] NOT NULL DEFAULT '{}',
  drafter_agent_id UUID,
  statistician_agent_id UUID,
  critic_agent_id UUID,
  synthesizer_agent_id UUID,
  status TEXT NOT NULL DEFAULT 'INITIALIZED',
  current_agent_role TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INT,
  total_corrections INT,
  total_issues_found INT,
  total_issues_resolved INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lumen.agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  agent_id UUID,
  agent_role TEXT NOT NULL,
  execution_order INT NOT NULL,
  input_text TEXT,
  output_text TEXT,
  output_data JSONB,
  verifications JSONB,
  corrections_made INT NOT NULL DEFAULT 0,
  issues_found JSONB,
  overall_assessment TEXT,
  model_used TEXT,
  tokens_input INT,
  tokens_output INT,
  latency_ms INT,
  status TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lumen_agent_executions_session
  ON lumen.agent_executions (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lumen.data_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  session_id UUID NOT NULL,
  claim_text TEXT NOT NULL,
  claimed_value TEXT,
  actual_value TEXT,
  status TEXT NOT NULL,
  discrepancy_type TEXT,
  correction_applied BOOLEAN NOT NULL DEFAULT FALSE,
  corrected_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lumen_data_verifications_session
  ON lumen.data_verifications (session_id);

-- lumen.data_atoms is deliberately NOT defined here.
--
-- Its canonical definition is db/migrations/044b_gcc_lumen_schema_prerequisite.sql
-- (manifest position 25). This file previously carried a second, minimal
-- definition (id TEXT, 5 columns). Because both were CREATE TABLE IF NOT EXISTS,
-- whichever ran first won and the other silently no-opped — so on any database
-- where the c2c apply script ran before the manifest lineage, lumen.data_atoms
-- would have come up WITHOUT atom_type, source_path, content_hash, version,
-- updated_at or created_by, and without the uuid default. That shape breaks
-- server/workers/enhanced-ingestion-pipeline.ts:172, which inserts
-- (id, title, content, atom_type, source_path, metadata, content_hash, created_at).
--
-- The council itself only reads content/metadata/title/id (multi-agent-council.ts
-- :864, :1070), all of which the canonical shape provides. scripts/db/apply-c2c-migrations.mjs
-- now applies 044b ahead of this file so the canonical shape is guaranteed on the
-- preview/deploy path too. See ledger C-12 and ADR-0006.

CREATE TABLE IF NOT EXISTS lumen.data_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_code TEXT NOT NULL UNIQUE,
  binding_name TEXT NOT NULL,
  binding_type TEXT NOT NULL DEFAULT 'SQL',
  query_templates JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Default council agents ───────────────────────────────────────────────────
-- Placeholders ({{...}}) are rendered by the council's renderTemplate():
--   DRAFTER:      {{context_documents}} {{requirements}} {{section_path}}
--   STATISTICIAN: {{draft_text}} {{data_bindings}}
--   CRITIC:       {{draft_text}} {{statistician_report}}
--   SYNTHESIZER:  {{draft_text}} {{statistician_corrections}} {{critic_feedback}}

INSERT INTO lumen.agent_registry
  (agent_code, agent_role, temperature, max_tokens, system_prompt_template)
VALUES
  (
    'council_drafter_v1', 'DRAFTER', 0.3, 4096,
    'You are the Drafter on a regulated multi-agent drafting council. Write the {{section_path}} section as complete, submission-ready regulatory prose.' || E'\n\n' ||
    'Requirements (JSON):' || E'\n' || '{{requirements}}' || E'\n\n' ||
    'Context documents:' || E'\n' || '{{context_documents}}' || E'\n\n' ||
    'Rules: write full prose — no outlines, no placeholders for structure. Use only facts present in the requirements or context documents. Where a required value is not provided, write [PENDING: value not provided] rather than inventing one. Use precise regulatory tone with the subsections this section type requires. Never fabricate a number, citation, or study result.'
  ),
  (
    'council_statistician_v1', 'STATISTICIAN', 0, 4096,
    'You are the Statistician on a regulated drafting council. Extract EVERY numerical or quantitative claim from the draft below and assess each against the available data bindings.' || E'\n\n' ||
    'Draft:' || E'\n' || '{{draft_text}}' || E'\n\n' ||
    'Available data bindings (JSON):' || E'\n' || '{{data_bindings}}' || E'\n\n' ||
    'Return ONLY JSON in this exact shape: {"verifications":[{"claim":"<sentence containing the value>","claimedValue":"<the value as written>","actualValue":null,"source":"<binding code you matched, or ''none''>","status":"UNVERIFIABLE"}]}. Mark status VERIFIED only when a binding confirms the value, DISCREPANCY when a binding contradicts it, otherwise UNVERIFIABLE. Never invent an actualValue.'
  ),
  (
    'council_critic_v1', 'CRITIC', 0.2, 4096,
    'You are the Critic on a regulated drafting council. Read the draft as a hostile agency reviewer looking for reasons to push back.' || E'\n\n' ||
    'Draft:' || E'\n' || '{{draft_text}}' || E'\n\n' ||
    'Statistician verification report (JSON):' || E'\n' || '{{statistician_report}}' || E'\n\n' ||
    'Return ONLY JSON in this exact shape: {"issues":[{"type":"<completeness|consistency|defensibility|compliance|clarity>","severity":"HIGH|MEDIUM|LOW","location":"<where in the draft>","description":"<the specific problem>","suggestion":"<the concrete fix>"}],"overall_assessment":"PASS|REVISE|REJECT"}. Flag every unsupported claim, missing required subsection, internal contradiction, and non-compliant statement. Be specific — no generic advice.'
  ),
  (
    'council_synthesizer_v1', 'SYNTHESIZER', 0.2, 4096,
    'You are the Synthesizer on a regulated drafting council. Produce the final version of the draft below, applying every statistician correction and addressing the critic''s feedback.' || E'\n\n' ||
    'Draft:' || E'\n' || '{{draft_text}}' || E'\n\n' ||
    'Statistician corrections (claimed value -> actual value):' || E'\n' || '{{statistician_corrections}}' || E'\n\n' ||
    'Critic feedback:' || E'\n' || '{{critic_feedback}}' || E'\n\n' ||
    'Rules: apply all numerical corrections exactly. Resolve HIGH and MEDIUM issues in the text itself. Keep everything that was already correct. Do not introduce new unsupported claims. Return only the final prose — no commentary.'
  )
ON CONFLICT (agent_code) DO NOTHING;
