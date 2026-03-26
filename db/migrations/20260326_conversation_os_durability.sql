BEGIN;

CREATE TABLE IF NOT EXISTS conversation_os_tool_manifests (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS conversation_os_tool_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversation_os_tool_events_conv_idx ON conversation_os_tool_events (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_os_retrieval_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_status TEXT NOT NULL DEFAULT 'ingested',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, conversation_id, source_id)
);

CREATE TABLE IF NOT EXISTS conversation_os_retrieval_chunks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source_ref_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  section TEXT,
  approved_only BOOLEAN NOT NULL DEFAULT FALSE,
  text TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_os_retrieval_chunks_source_fk FOREIGN KEY (source_ref_id)
    REFERENCES conversation_os_retrieval_sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS conversation_os_retrieval_chunks_conv_idx ON conversation_os_retrieval_chunks (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_os_scout_findings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  chunk_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  promoted BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_os_execution_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  class TEXT NOT NULL,
  sources_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS conversation_os_execution_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  step_status TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_os_execution_steps_plan_fk FOREIGN KEY (plan_id)
    REFERENCES conversation_os_execution_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_os_artifact_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_os_proposal_versions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  quality JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_os_proposal_versions_proposal_fk FOREIGN KEY (proposal_id)
    REFERENCES conversation_os_artifact_proposals(id) ON DELETE CASCADE,
  UNIQUE (proposal_id, version)
);

CREATE TABLE IF NOT EXISTS conversation_os_quality_evaluations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  proposal_id TEXT,
  user_id TEXT NOT NULL,
  evaluation JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
