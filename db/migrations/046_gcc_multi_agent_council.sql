-- Migration 046: Multi-Agent Council Infrastructure
-- Purpose: Sequential multi-agent workflow for regulatory document drafting
--
-- This migration implements:
--   1. Agent registry and capability definitions
--   2. Council session tracking
--   3. Agent execution logs with corrections/feedback
--   4. Live data bindings for Statistician agent
--   5. Synthesis tracking and audit trail
--
-- The Council Pattern:
--   Agent A (Drafter) → Agent B (Statistician) → Agent C (Critic) → Agent D (Synthesizer)

BEGIN;

-- =============================================================================
-- A) Agent Registry
-- =============================================================================

-- Agent roles in the council
CREATE TYPE lumen.agent_role AS ENUM (
  'DRAFTER',          -- Writes initial content using RAG
  'STATISTICIAN',     -- Verifies numbers against live data bindings
  'CRITIC',           -- Reviews for tone, logic, citations (Red Team)
  'SYNTHESIZER',      -- Merges feedback and produces final output
  'MEDICAL_WRITER',   -- Domain-specific medical writing
  'REGULATORY_EXPERT',-- Regulatory compliance review
  'SAFETY_REVIEWER',  -- Safety data review
  'CMC_SPECIALIST',   -- Chemistry/Manufacturing/Controls
  'CUSTOM'            -- Custom agent role
);

-- Agent capability levels
CREATE TYPE lumen.agent_capability AS ENUM (
  'TEXT_GENERATION',     -- Can generate text
  'TEXT_ANALYSIS',       -- Can analyze text
  'DATA_QUERY',          -- Can query databases
  'CALCULATION',         -- Can perform calculations
  'CODE_EXECUTION',      -- Can execute code
  'GRAPH_TRAVERSAL',     -- Can traverse knowledge graph
  'CITATION_LOOKUP',     -- Can look up citations
  'CROSS_REFERENCE',     -- Can cross-reference documents
  'FORMATTING',          -- Can format documents
  'TRANSLATION'          -- Can translate content
);

-- Agent definitions
CREATE TABLE IF NOT EXISTS lumen.agent_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  agent_code TEXT NOT NULL UNIQUE,
  agent_name TEXT NOT NULL,
  agent_role lumen.agent_role NOT NULL,
  description TEXT,
  
  -- Capabilities
  capabilities lumen.agent_capability[] NOT NULL DEFAULT '{}',
  
  -- Configuration
  model_provider TEXT NOT NULL DEFAULT 'openai',  -- openai, anthropic, etc.
  model_name TEXT NOT NULL DEFAULT 'gpt-4-turbo',
  model_version TEXT,
  temperature FLOAT DEFAULT 0.1,
  max_tokens INT DEFAULT 4000,
  
  -- System prompt template (Jinja2 style)
  system_prompt_template TEXT NOT NULL,
  
  -- Data bindings (JSON schema)
  data_bindings JSONB DEFAULT '{}',  -- e.g., {"study_db": "connection_string"}
  
  -- Execution constraints
  timeout_seconds INT DEFAULT 120,
  max_retries INT DEFAULT 3,
  requires_approval BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default agents
INSERT INTO lumen.agent_registry (agent_code, agent_name, agent_role, capabilities, system_prompt_template, description) VALUES
(
  'DRAFTER_V1',
  'RAG Drafter Agent',
  'DRAFTER',
  ARRAY['TEXT_GENERATION', 'CITATION_LOOKUP', 'GRAPH_TRAVERSAL']::lumen.agent_capability[],
  E'You are a regulatory medical writer drafting eCTD submission content.\n\nContext Documents:\n{{context_documents}}\n\nRequirements:\n{{requirements}}\n\nWrite professional, precise regulatory prose. Cite all factual claims with [REF:atom_id].\n\nSection to draft: {{section_path}}',
  'Initial drafting agent using RAG to generate submission content'
),
(
  'STATISTICIAN_V1',
  'Data Verification Agent',
  'STATISTICIAN',
  ARRAY['DATA_QUERY', 'CALCULATION', 'TEXT_ANALYSIS']::lumen.agent_capability[],
  E'You are a biostatistician verifying numerical claims in regulatory documents.\n\nDraft Text:\n{{draft_text}}\n\nLive Data Bindings:\n{{data_bindings}}\n\nFor EACH numerical claim:\n1. Extract the claimed value\n2. Query the source data to get actual value\n3. Compare and flag discrepancies\n\nOutput JSON: {"verifications": [{"claim": "...", "claimed_value": "...", "actual_value": "...", "source": "...", "status": "VERIFIED|DISCREPANCY|UNVERIFIABLE"}]}',
  'Verifies all numerical claims against live data sources'
),
(
  'CRITIC_V1',
  'Red Team Critic Agent',
  'CRITIC',
  ARRAY['TEXT_ANALYSIS', 'CITATION_LOOKUP', 'CROSS_REFERENCE']::lumen.agent_capability[],
  E'You are a critical reviewer (Red Team) for regulatory submissions.\n\nDraft Text:\n{{draft_text}}\n\nStatistician Report:\n{{statistician_report}}\n\nReview for:\n1. Tone: Professional, objective, no promotional language\n2. Logic: Arguments are sound and well-structured\n3. Citations: All claims properly cited, no unsupported assertions\n4. Completeness: Required information present\n5. Consistency: No contradictions within or across sections\n\nOutput JSON: {"issues": [{"type": "...", "severity": "HIGH|MEDIUM|LOW", "location": "...", "description": "...", "suggestion": "..."}], "overall_assessment": "PASS|REVISE|REJECT"}',
  'Critical review for regulatory compliance and quality'
),
(
  'SYNTHESIZER_V1',
  'Feedback Synthesis Agent',
  'SYNTHESIZER',
  ARRAY['TEXT_GENERATION', 'TEXT_ANALYSIS']::lumen.agent_capability[],
  E'You are the final editor synthesizing feedback into polished regulatory text.\n\nOriginal Draft:\n{{draft_text}}\n\nStatistician Corrections:\n{{statistician_corrections}}\n\nCritic Feedback:\n{{critic_feedback}}\n\nInstructions:\n1. Apply all verified corrections from Statistician\n2. Address all HIGH and MEDIUM severity issues from Critic\n3. Maintain consistent voice and style\n4. Preserve all valid citations\n5. Flag any unresolved issues\n\nOutput the final text with inline comments for human review where needed.',
  'Synthesizes all feedback into final polished content'
)
ON CONFLICT (agent_code) DO NOTHING;

-- =============================================================================
-- B) Council Sessions
-- =============================================================================

-- Session status
CREATE TYPE lumen.council_status AS ENUM (
  'INITIALIZED',       -- Session created, not started
  'DRAFTING',          -- Drafter agent working
  'VERIFYING',         -- Statistician agent working
  'REVIEWING',         -- Critic agent working
  'SYNTHESIZING',      -- Synthesizer agent working
  'AWAITING_APPROVAL', -- Needs human approval
  'COMPLETED',         -- All agents finished
  'FAILED',            -- Session failed
  'CANCELLED'          -- Session cancelled
);

-- Council drafting sessions
CREATE TABLE IF NOT EXISTS lumen.council_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Context
  program_id UUID REFERENCES core.programs(id),
  section_path TEXT NOT NULL,              -- eCTD section being drafted
  
  -- Input
  requirements JSONB NOT NULL DEFAULT '{}',
  context_atom_ids UUID[],                 -- Reference documents
  
  -- Agent assignments
  drafter_agent_id UUID REFERENCES lumen.agent_registry(id),
  statistician_agent_id UUID REFERENCES lumen.agent_registry(id),
  critic_agent_id UUID REFERENCES lumen.agent_registry(id),
  synthesizer_agent_id UUID REFERENCES lumen.agent_registry(id),
  
  -- Status tracking
  status lumen.council_status NOT NULL DEFAULT 'INITIALIZED',
  current_agent_role lumen.agent_role,
  
  -- Outputs (stored as atoms, these are references)
  draft_atom_id UUID,
  final_atom_id UUID,
  
  -- Metrics
  total_corrections INT DEFAULT 0,
  total_issues_found INT DEFAULT 0,
  total_issues_resolved INT DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INT,
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  
  -- Config bundle for reproducibility
  config_bundle_id UUID
);

CREATE INDEX idx_council_sessions_program ON lumen.council_sessions(program_id);
CREATE INDEX idx_council_sessions_status ON lumen.council_sessions(status);
CREATE INDEX idx_council_sessions_section ON lumen.council_sessions(section_path);

-- =============================================================================
-- C) Agent Execution Logs
-- =============================================================================

-- Detailed execution log for each agent in a session
CREATE TABLE IF NOT EXISTS lumen.agent_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Context
  session_id UUID NOT NULL REFERENCES lumen.council_sessions(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES lumen.agent_registry(id),
  agent_role lumen.agent_role NOT NULL,
  execution_order INT NOT NULL,
  
  -- Input
  input_text TEXT,
  input_data JSONB,
  prompt_used TEXT,
  
  -- Output
  output_text TEXT,
  output_data JSONB,
  
  -- For Statistician: verification results
  verifications JSONB,   -- Array of {claim, claimed_value, actual_value, status}
  corrections_made INT DEFAULT 0,
  
  -- For Critic: review results
  issues_found JSONB,    -- Array of {type, severity, location, description}
  overall_assessment TEXT,
  
  -- Execution details
  model_used TEXT,
  tokens_input INT,
  tokens_output INT,
  latency_ms INT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, RUNNING, COMPLETED, FAILED
  error_message TEXT,
  
  -- Attribution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_executions_session ON lumen.agent_executions(session_id);
CREATE INDEX idx_agent_executions_agent ON lumen.agent_executions(agent_id);

-- =============================================================================
-- D) Live Data Bindings
-- =============================================================================

-- Registered data sources for Statistician agent queries
CREATE TABLE IF NOT EXISTS lumen.data_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  binding_code TEXT NOT NULL UNIQUE,
  binding_name TEXT NOT NULL,
  description TEXT,
  
  -- Connection
  binding_type TEXT NOT NULL,             -- 'SQL', 'API', 'FILE', 'ATOM_QUERY'
  connection_config JSONB NOT NULL,       -- Encrypted connection details
  
  -- Query templates (parameterized)
  query_templates JSONB DEFAULT '{}',     -- {"subject_count": "SELECT COUNT(*) FROM subjects WHERE study_id = :study_id"}
  
  -- Schema info for validation
  schema_definition JSONB,
  
  -- Access control
  allowed_agent_roles lumen.agent_role[] DEFAULT ARRAY['STATISTICIAN']::lumen.agent_role[],
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_validated_at TIMESTAMPTZ,
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system'
);

-- =============================================================================
-- E) Statistician Verification Audit
-- =============================================================================

-- Immutable record of all data verifications
CREATE TABLE IF NOT EXISTS lumen.data_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Context
  execution_id UUID NOT NULL REFERENCES lumen.agent_executions(id),
  session_id UUID NOT NULL REFERENCES lumen.council_sessions(id),
  
  -- The claim being verified
  claim_text TEXT NOT NULL,
  claimed_value TEXT NOT NULL,
  claim_location TEXT,                    -- Position in document
  
  -- Verification result
  actual_value TEXT,
  source_binding_id UUID REFERENCES lumen.data_bindings(id),
  source_query TEXT,
  query_result JSONB,
  
  -- Outcome
  status TEXT NOT NULL,                   -- VERIFIED, DISCREPANCY, UNVERIFIABLE
  discrepancy_type TEXT,                  -- NUMERIC_MISMATCH, ROUNDING, TYPO, OUTDATED, etc.
  correction_applied BOOLEAN DEFAULT FALSE,
  corrected_value TEXT,
  
  -- Attribution
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Immutability
  CONSTRAINT no_update_verifications CHECK (TRUE)
);

-- Immutability trigger
CREATE OR REPLACE FUNCTION lumen.prevent_verification_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'data_verifications is append-only for audit compliance';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_update_verifications ON lumen.data_verifications;
CREATE TRIGGER trg_no_update_verifications
  BEFORE UPDATE OR DELETE ON lumen.data_verifications
  FOR EACH ROW
  EXECUTE FUNCTION lumen.prevent_verification_mutation();

CREATE INDEX idx_data_verifications_session ON lumen.data_verifications(session_id);
CREATE INDEX idx_data_verifications_status ON lumen.data_verifications(status);

-- =============================================================================
-- F) Council Workflow Views
-- =============================================================================

-- Active sessions with progress
CREATE OR REPLACE VIEW lumen.v_council_session_progress AS
SELECT 
  cs.id AS session_id,
  cs.section_path,
  cs.status,
  cs.current_agent_role,
  cs.created_at AS started_at,
  cs.completed_at,
  
  -- Agent status
  (SELECT status FROM lumen.agent_executions WHERE session_id = cs.id AND agent_role = 'DRAFTER' LIMIT 1) AS drafter_status,
  (SELECT status FROM lumen.agent_executions WHERE session_id = cs.id AND agent_role = 'STATISTICIAN' LIMIT 1) AS statistician_status,
  (SELECT status FROM lumen.agent_executions WHERE session_id = cs.id AND agent_role = 'CRITIC' LIMIT 1) AS critic_status,
  (SELECT status FROM lumen.agent_executions WHERE session_id = cs.id AND agent_role = 'SYNTHESIZER' LIMIT 1) AS synthesizer_status,
  
  -- Metrics
  cs.total_corrections,
  cs.total_issues_found,
  cs.total_issues_resolved,
  
  -- Timing
  EXTRACT(EPOCH FROM (COALESCE(cs.completed_at, NOW()) - cs.started_at))::INT AS elapsed_seconds

FROM lumen.council_sessions cs
ORDER BY cs.created_at DESC;

-- Verification summary by session
CREATE OR REPLACE VIEW lumen.v_verification_summary AS
SELECT 
  session_id,
  COUNT(*) AS total_claims,
  COUNT(*) FILTER (WHERE status = 'VERIFIED') AS verified_count,
  COUNT(*) FILTER (WHERE status = 'DISCREPANCY') AS discrepancy_count,
  COUNT(*) FILTER (WHERE status = 'UNVERIFIABLE') AS unverifiable_count,
  COUNT(*) FILTER (WHERE correction_applied = TRUE) AS corrections_applied
FROM lumen.data_verifications
GROUP BY session_id;

COMMIT;
