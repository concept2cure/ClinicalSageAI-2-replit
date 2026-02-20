-- ═══════════════════════════════════════════════════════════════════════════════
-- User Intelligence Platform Migration
-- Date: 2026-02-20
-- Purpose: Foundation for license-gated, user-aware, work-continuous AI platform
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USER WORK SESSIONS — tracks what each user is doing, per-project
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_work_sessions (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  session_type        TEXT NOT NULL DEFAULT 'active',  -- active, idle, completed
  -- What the user was working on
  context_type        TEXT,         -- section_drafting, document_review, data_analysis, meeting_prep, submission_assembly
  context_reference   TEXT,         -- e.g. "3.2.S.1" (section code), "protocol_v2" (artifact ref)
  context_title       TEXT,         -- human readable: "Drug Substance General Information"
  context_metadata    JSONB DEFAULT '{}',  -- flexible context data
  -- Work state
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  duration_minutes    INTEGER,      -- computed on session end
  -- AI interaction tracking
  messages_sent       INTEGER DEFAULT 0,
  artifacts_created   INTEGER DEFAULT 0,
  ai_model_used       TEXT,
  -- Device/client info
  client_type         TEXT DEFAULT 'web',  -- web, api, mobile
  CONSTRAINT valid_session_type CHECK (session_type IN ('active', 'idle', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_uws_user_active ON user_work_sessions(user_id, session_type) WHERE session_type = 'active';
CREATE INDEX IF NOT EXISTS idx_uws_user_recent ON user_work_sessions(user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_uws_org_project ON user_work_sessions(organization_id, project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. USER WORK QUEUE — AI-recommended next actions per user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_work_queue (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  -- Task details
  priority            INTEGER NOT NULL DEFAULT 50,     -- 1 (highest) to 100 (lowest)
  task_type           TEXT NOT NULL,                    -- draft_section, review_document, complete_form, analyze_data, prepare_submission
  task_title          TEXT NOT NULL,
  task_description    TEXT,
  -- Reference to what needs doing
  reference_type      TEXT,         -- section, artifact, milestone, dependency
  reference_id        TEXT,         -- ID or code of the referenced item
  reference_metadata  JSONB DEFAULT '{}',
  -- Scheduling
  due_date            TIMESTAMPTZ,
  estimated_minutes   INTEGER,
  -- Status
  status              TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, dismissed, deferred
  completed_at        TIMESTAMPTZ,
  dismissed_at        TIMESTAMPTZ,
  dismissed_reason    TEXT,
  -- Source
  source              TEXT NOT NULL DEFAULT 'ai',      -- ai, manual, dependency, deadline, review_request
  ai_confidence       REAL,                            -- 0.0 - 1.0 confidence in recommendation
  ai_reasoning        TEXT,                            -- why the AI recommended this
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uwq_user_pending ON user_work_queue(user_id, status, priority) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_uwq_project ON user_work_queue(project_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SEED: AVAILABLE_MODULES catalog — all product verticals
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO available_modules (module_id, name, description, category, path, icon, sort_order, metadata) VALUES

-- ── Submission Modules ──
('ectd-coauthor',      'eCTD Co-Author',           'AI-powered CTD Module 1-5 authoring with ICH M4 compliance, automated cross-referencing, and eCTD 4.0 publishing', 'submissions', '/ind-workspace', 'FileText',    10, '{"tiers": ["professional","enterprise"], "industries": ["biotech","pharma","cro","regulatory","medical_writing"]}'),
('ind-filing',         'IND Filing Suite',          'End-to-end IND submission management — 21 CFR 312.23 Forms 1571/1572, pre-IND meetings, clinical holds, annual reports', 'submissions', '/ind-workspace', 'Shield',      11, '{"tiers": ["professional","enterprise"], "industries": ["biotech","pharma","cro"]}'),
('510k-submission',    '510(k) Navigator',          'Predicate device analysis, substantial equivalence, performance testing matrix, FDA eSTAR integration', 'submissions', '/ind-workspace', 'Cpu',          12, '{"tiers": ["standard","professional","enterprise"], "industries": ["medtech"]}'),
('pma-submission',     'PMA Suite',                 'Class III premarket approval — clinical evidence, manufacturing QMS, post-approval surveillance', 'submissions', '/ind-workspace', 'Activity',     13, '{"tiers": ["professional","enterprise"], "industries": ["medtech"]}'),
('nda-bla',            'NDA / BLA Suite',           'Full marketing application authoring — ISS/ISE, REMS, labeling per ICH E1/E3/E9', 'submissions', '/ind-workspace', 'Award',       14, '{"tiers": ["enterprise"], "industries": ["biotech","pharma"]}'),
('ce-marking',         'EU MDR / IVDR',             'CE marking technical files, clinical evaluation per MEDDEV 2.7/1, GSPR mapping, Notified Body submissions', 'submissions', '/ind-workspace', 'Globe',       15, '{"tiers": ["professional","enterprise"], "industries": ["medtech"]}'),

-- ── Authoring & Intelligence Modules ──
('cmc-wizard',         'CMC Wizard',                'Chemistry, Manufacturing & Controls authoring — ICH Q-series (Q1-Q14), process validation, stability protocols, batch analysis', 'authoring', '/cmc-wizard', 'FlaskConical',  20, '{"tiers": ["professional","enterprise"], "industries": ["biotech","pharma","cro"]}'),
('doc-canvas',         'Document Canvas',           'Advanced document editor with regulatory templates — Word/PDF generation, collaborative editing, version control, electronic signatures', 'authoring',  '/doc-canvas', 'PenTool',     21, '{"tiers": ["standard","professional","enterprise"], "industries": ["biotech","pharma","cro","medtech","academic","regulatory","medical_writing"]}'),
('protocol-designer',  'Protocol Designer',         'Clinical protocol authoring per ICH E6(R2)/E8(R3) — endpoint design, statistical analysis plans, adaptive trial frameworks', 'authoring', '/protocol-designer', 'ClipboardList', 22, '{"tiers": ["professional","enterprise"], "industries": ["biotech","pharma","cro","academic"]}'),
('csr-author',         'CSR Author',                'Clinical Study Reports per ICH E3 — narrative generation, safety tables, efficacy analysis, appendix management', 'authoring', '/csr-author', 'FileSearch', 23, '{"tiers": ["professional","enterprise"], "industries": ["biotech","pharma","cro","medical_writing"]}'),
('cer-generator',      'CER Generator',             'Clinical Evaluation Reports per MEDDEV 2.7/1 Rev 4 — literature search, PMCF plans, benefit-risk analysis', 'authoring', '/cer-generator', 'FileCheck', 24, '{"tiers": ["standard","professional","enterprise"], "industries": ["medtech"]}'),

-- ── Intelligence & Analytics Modules ──
('evidence-engine',    'Evidence Engine',            'Systematic evidence generation — literature search, PICO extraction, meta-analysis, evidence grading (GRADE), gap analysis', 'intelligence', '/evidence', 'Search',      30, '{"tiers": ["professional","enterprise"], "industries": ["biotech","pharma","cro","medtech","academic"]}'),
('insight-synthesis',  'Insight Synthesis',          'Cross-study analysis, competitive intelligence, regulatory precedent mining, advisory committee trend analysis', 'intelligence', '/insights',  'BrainCircuit', 31, '{"tiers": ["enterprise"], "industries": ["biotech","pharma"]}'),
('strategic-advisor',  'Strategic Advisor',          'Regulatory strategy recommendations — pathway selection, accelerated programs (Fast Track, Breakthrough, Priority Review), global filing sequences', 'intelligence', '/strategy', 'Target', 32, '{"tiers": ["enterprise"], "industries": ["biotech","pharma","cro","medtech"]}'),
('safety-signal',      'Safety Signal Detection',   'FAERS integration, signal detection algorithms, CIOMS-form generation, aggregate safety reporting (DSUR, PSUR, PBRER)', 'intelligence', '/safety', 'ShieldAlert', 33, '{"tiers": ["professional","enterprise"], "industries": ["biotech","pharma"]}'),

-- ── Data & Analytics ──
('analytics-hub',      'Analytics Hub',             'Submission metrics, team performance, regulatory timeline forecasting, quality KPIs, budget tracking', 'analytics', '/analytics', 'BarChart3', 40, '{"tiers": ["standard","professional","enterprise"], "industries": ["biotech","pharma","cro","medtech","academic","regulatory","medical_writing"]}'),
('compliance-monitor', 'Compliance Monitor',        'Real-time 21 CFR Part 11 compliance, audit trail analysis, training matrix, deviation tracking, CAPA management', 'analytics', '/compliance', 'ShieldCheck', 41, '{"tiers": ["professional","enterprise"], "industries": ["biotech","pharma","cro","medtech"]}'),

-- ── Vault & Infrastructure ──
('vault',              'Document Vault',             'Secure document management — version control, access control, electronic signatures, retention policies, regulatory hold management', 'infrastructure', '/vault', 'Lock', 50, '{"tiers": ["standard","professional","enterprise"], "industries": ["biotech","pharma","cro","medtech","academic","regulatory","medical_writing"]}'),
('team-workspace',     'Team Workspace',            'Multi-user collaboration — task assignment, review workflows, real-time co-editing, comment threads, approval chains', 'infrastructure', '/workspace', 'Users', 51, '{"tiers": ["standard","professional","enterprise"], "industries": ["biotech","pharma","cro","medtech","academic","regulatory","medical_writing"]}')

ON CONFLICT (module_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  path = EXCLUDED.path,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TIER → MODULE defaults — auto-create subscriptions for matching tiers
-- ─────────────────────────────────────────────────────────────────────────────
-- This function provisions module subscriptions based on org tier + industry
CREATE OR REPLACE FUNCTION provision_org_modules(p_org_id INTEGER)
RETURNS void AS $$
DECLARE
  v_tier TEXT;
  v_industry TEXT;
  v_mod RECORD;
BEGIN
  SELECT tier, industry_mode INTO v_tier, v_industry
  FROM organizations WHERE id = p_org_id;

  IF v_tier IS NULL THEN v_tier := 'standard'; END IF;
  IF v_industry IS NULL THEN v_industry := 'biotech'; END IF;

  FOR v_mod IN
    SELECT module_id, metadata
    FROM available_modules
  LOOP
    -- Check if this module's tier requirement matches
    IF v_mod.metadata IS NOT NULL
       AND (v_mod.metadata->'tiers') IS NOT NULL
       AND v_tier = ANY(ARRAY(SELECT jsonb_array_elements_text(v_mod.metadata->'tiers')))
       AND (
         (v_mod.metadata->'industries') IS NULL
         OR v_industry = ANY(ARRAY(SELECT jsonb_array_elements_text(v_mod.metadata->'industries')))
       )
    THEN
      INSERT INTO module_subscriptions (organization_id, module_id, enabled, enabled_at)
      VALUES (p_org_id, v_mod.module_id, true, NOW())
      ON CONFLICT (organization_id, module_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. USER PREFERENCES extended — AI personality + work style
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: users.preferences is already JSON, we use it with a defined structure:
-- {
--   "greeting_name": "Dr. Smith",    -- how Lumen should address them
--   "communication_style": "concise", -- concise, detailed, academic
--   "expertise_level": "expert",      -- novice, intermediate, expert
--   "focus_areas": ["CMC", "nonclinical"], -- their primary work domains
--   "default_submission_type": "IND",
--   "timezone": "America/New_York",
--   "notification_preferences": { ... },
--   "ai_personality": {
--     "formality": "professional",    -- casual, professional, academic
--     "proactivity": "high",          -- low, medium, high
--     "detail_level": "high"          -- low, medium, high
--   }
-- }

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-compute session duration on end
CREATE OR REPLACE FUNCTION compute_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.session_type = 'completed' AND NEW.ended_at IS NOT NULL AND OLD.session_type != 'completed' THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_duration ON user_work_sessions;
CREATE TRIGGER trg_session_duration
  BEFORE UPDATE ON user_work_sessions
  FOR EACH ROW EXECUTE FUNCTION compute_session_duration();

-- Auto-update updated_at on work queue
CREATE OR REPLACE FUNCTION update_work_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uwq_updated ON user_work_queue;
CREATE TRIGGER trg_uwq_updated
  BEFORE UPDATE ON user_work_queue
  FOR EACH ROW EXECUTE FUNCTION update_work_queue_timestamp();

-- Indexes for the AI context builder (fast lookups)
CREATE INDEX IF NOT EXISTS idx_artifacts_project_recent ON concept2cure_artifacts(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv_recent ON concept2cure_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user_recent ON activity_feed(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_org_owner ON projects(organization_id, owner_id);
