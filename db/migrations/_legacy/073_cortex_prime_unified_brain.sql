-- =============================================================================
-- Migration 073: Cortex Prime - Unified Life Sciences AI Brain
-- =============================================================================
-- Purpose: Collapse 20+ AI tables into 5 core primitives, enabling causal, epistemic,
-- regulatory intuition, and privacy-preserving collective intelligence for Life Sciences.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS cortex;

-- -----------------------------------------------------------------------------
-- 1. ATOMS: Universal Knowledge Nodes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortex.atoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atom_type TEXT NOT NULL,  -- e.g. 'chunk', 'entity', 'prediction', 'pattern', 'biomarker', 'regulation', ...
    content TEXT NOT NULL,
    title TEXT,
    embedding_1536 vector(1536),
    embedding_3072 vector(3072),
    parent_atom_id UUID REFERENCES cortex.atoms(id),
    source_document_id UUID,
    structured_data JSONB NOT NULL DEFAULT '{}',
    confidence FLOAT DEFAULT 1.0,
    source_type TEXT,
    org_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    version INT DEFAULT 1,
    content_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_cortex_atoms_type_org ON cortex.atoms(atom_type, org_id);
CREATE INDEX IF NOT EXISTS idx_cortex_atoms_embedding1536 ON cortex.atoms USING hnsw (embedding_1536 vector_cosine_ops);
-- NOTE: Skip index for 3072-dim embeddings (pgvector index dimension limit).

-- -----------------------------------------------------------------------------
-- 2. EDGES: Universal Reasoning Relationships
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortex.edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_atom_id UUID NOT NULL REFERENCES cortex.atoms(id),
    target_atom_id UUID NOT NULL REFERENCES cortex.atoms(id),
    edge_type TEXT NOT NULL,  -- e.g. 'supports', 'contradicts', 'derives_from', 'cites', 'version_of', 'part_of', 'validates', 'refutes'
    strength FLOAT DEFAULT 1.0,
    evidence_text TEXT,
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS idx_cortex_edges_type ON cortex.edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_cortex_edges_source_target ON cortex.edges(source_atom_id, target_atom_id);

-- -----------------------------------------------------------------------------
-- 3. AGENTS: Unified Agent Registry
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortex.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_code TEXT NOT NULL UNIQUE,
    agent_type TEXT NOT NULL,  -- e.g. 'drafter', 'reviewer', 'statistician', 'predictor', ...
    system_prompt TEXT NOT NULL,
    model_config JSONB NOT NULL DEFAULT '{}',
    capabilities TEXT[],
    gxp_validated BOOLEAN DEFAULT FALSE,
    validation_protocol_ref TEXT,
    specialization_scores JSONB DEFAULT '{}', -- { 'oncology': 0.92, 'neurology': 0.81 }
    is_active BOOLEAN DEFAULT TRUE,
    version TEXT,
    org_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. TRACES: Unified Execution/Memory Log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortex.traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID,
    agent_id UUID REFERENCES cortex.agents(id),
    trace_type TEXT NOT NULL,  -- e.g. 'query', 'generation', 'verification', 'feedback', 'checkpoint'
    input_data JSONB NOT NULL,
    output_data JSONB,
    context_atom_ids UUID[],
    output_atom_ids UUID[],
    execution_ms INT,
    token_count INT,
    confidence FLOAT,
    user_id UUID,
    org_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    checkpoint_data JSONB
);
CREATE INDEX IF NOT EXISTS idx_cortex_traces_thread ON cortex.traces(thread_id);

-- -----------------------------------------------------------------------------
-- 5. THREADS: Conversation/Workflow Context
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortex.threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_type TEXT NOT NULL,  -- e.g. 'conversation', 'council_session', 'workflow'
    org_id UUID NOT NULL,
    user_id UUID,
    program_id UUID,
    submission_id UUID,
    section_path TEXT,
    status TEXT DEFAULT 'active',
    current_step TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6. ATOM TYPES CONFIG: Extensible Typing
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortex.atom_types (
    atom_type TEXT PRIMARY KEY,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO cortex.atom_types (atom_type, description) VALUES
  ('chunk', 'Document chunk or prose fragment'),
  ('entity', 'Extracted entity (e.g. drug, endpoint, NCT ID)'),
  ('prediction', 'Model prediction or forecast'),
  ('pattern', 'Learned pattern or regulatory signal'),
  ('biomarker', 'Biomarker-endpoint relationship'),
  ('regulation', 'Regulatory knowledge or rule'),
  ('agent_output', 'Output from an agent'),
    ('outcome', 'Clinical or regulatory outcome')
ON CONFLICT (atom_type) DO NOTHING;

COMMIT;
