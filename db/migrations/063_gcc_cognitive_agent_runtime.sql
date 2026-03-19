-- ============================================================================
-- Migration 063: Cognitive Agent Runtime
-- ============================================================================
-- Creates the core agent runtime tables for the Cognitive Ecosystem.
-- These tables support LangGraph-compatible agent orchestration with
-- checkpoint management and HITL (Human-in-the-Loop) breakpoints.
-- ============================================================================

-- Agent type enum
DO $$ BEGIN
  CREATE TYPE agent_type_enum AS ENUM (
    'regulatory_coordinator', 'safety_analyst', 'cmc_specialist',
    'quality_auditor', 'submission_planner', 'intelligence_gatherer',
    'document_reviewer', 'compliance_checker'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Agent status enum
DO $$ BEGIN
  CREATE TYPE agent_status_enum AS ENUM ('draft', 'active', 'paused', 'deprecated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Thread status enum
DO $$ BEGIN
  CREATE TYPE thread_status_enum AS ENUM ('active', 'paused', 'completed', 'failed', 'awaiting_human');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Breakpoint type enum
DO $$ BEGIN
  CREATE TYPE breakpoint_type_enum AS ENUM (
    'mandatory_review', 'risk_threshold', 'regulatory_decision',
    'quality_gate', 'human_judgment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Breakpoint resolution enum
DO $$ BEGIN
  CREATE TYPE breakpoint_resolution_enum AS ENUM ('approved', 'rejected', 'escalated', 'needs_revision');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Agent Definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS cognitive_agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type agent_type_enum NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  system_prompt TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]',
  model_config JSONB NOT NULL DEFAULT '{}',
  governance_rules JSONB NOT NULL DEFAULT '[]',
  status agent_status_enum NOT NULL DEFAULT 'draft',
  tenant_id INTEGER,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_agent_defs_type ON cognitive_agent_definitions(agent_type);
CREATE INDEX IF NOT EXISTS idx_cog_agent_defs_status ON cognitive_agent_definitions(status);
CREATE INDEX IF NOT EXISTS idx_cog_agent_defs_tenant ON cognitive_agent_definitions(tenant_id);

-- ============================================================================
-- Agent Threads (conversations/sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cognitive_agent_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_definition_id UUID NOT NULL REFERENCES cognitive_agent_definitions(id),
  product_id VARCHAR(255),
  tenant_id INTEGER NOT NULL,
  parent_thread_id UUID REFERENCES cognitive_agent_threads(id),
  status thread_status_enum NOT NULL DEFAULT 'active',
  title VARCHAR(500),
  context JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  started_by VARCHAR(255),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_threads_agent ON cognitive_agent_threads(agent_definition_id);
CREATE INDEX IF NOT EXISTS idx_cog_threads_tenant ON cognitive_agent_threads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cog_threads_status ON cognitive_agent_threads(status);
CREATE INDEX IF NOT EXISTS idx_cog_threads_product ON cognitive_agent_threads(product_id);

-- ============================================================================
-- Thread Messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS cognitive_thread_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES cognitive_agent_threads(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- 'user', 'assistant', 'system', 'tool'
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_results JSONB,
  reasoning_traces JSONB DEFAULT '[]',
  source_references JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  token_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_messages_thread ON cognitive_thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_cog_messages_created ON cognitive_thread_messages(created_at);

-- ============================================================================
-- Workflow Checkpoints (LangGraph state persistence)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cognitive_workflow_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES cognitive_agent_threads(id) ON DELETE CASCADE,
  step_name VARCHAR(255) NOT NULL,
  state_snapshot JSONB NOT NULL,
  channel_values JSONB DEFAULT '{}',
  channel_versions JSONB DEFAULT '{}',
  parent_checkpoint_id UUID REFERENCES cognitive_workflow_checkpoints(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_checkpoints_thread ON cognitive_workflow_checkpoints(thread_id);
CREATE INDEX IF NOT EXISTS idx_cog_checkpoints_step ON cognitive_workflow_checkpoints(step_name);

-- ============================================================================
-- HITL Breakpoints (Human-in-the-Loop pause points)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cognitive_hitl_breakpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES cognitive_agent_threads(id) ON DELETE CASCADE,
  checkpoint_id UUID REFERENCES cognitive_workflow_checkpoints(id),
  breakpoint_type breakpoint_type_enum NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  options JSONB DEFAULT '[]', -- Possible actions for the reviewer
  assigned_to VARCHAR(255),
  resolved_by VARCHAR(255),
  resolution breakpoint_resolution_enum,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_breakpoints_thread ON cognitive_hitl_breakpoints(thread_id);
CREATE INDEX IF NOT EXISTS idx_cog_breakpoints_type ON cognitive_hitl_breakpoints(breakpoint_type);
CREATE INDEX IF NOT EXISTS idx_cog_breakpoints_unresolved
  ON cognitive_hitl_breakpoints(thread_id) WHERE resolution IS NULL;

-- ============================================================================
-- Reasoning Traces (agent decision audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cognitive_reasoning_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES cognitive_agent_threads(id) ON DELETE CASCADE,
  message_id UUID REFERENCES cognitive_thread_messages(id),
  reasoning_type VARCHAR(50) NOT NULL, -- planning, analysis, decision, synthesis, verification, correction
  content TEXT NOT NULL,
  confidence DECIMAL(5,4), -- 0.0000 to 1.0000
  evidence JSONB DEFAULT '[]',
  alternatives_considered JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_traces_thread ON cognitive_reasoning_traces(thread_id);

-- ============================================================================
-- Governance Constraints (runtime policy enforcement)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cognitive_governance_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_definition_id UUID REFERENCES cognitive_agent_definitions(id),
  constraint_type VARCHAR(50) NOT NULL,
  constraint_name VARCHAR(255) NOT NULL,
  condition JSONB NOT NULL,
  action JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  tenant_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_constraints_agent ON cognitive_governance_constraints(agent_definition_id);
CREATE INDEX IF NOT EXISTS idx_cog_constraints_active ON cognitive_governance_constraints(active) WHERE active = TRUE;

-- ============================================================================
-- Done
-- ============================================================================
