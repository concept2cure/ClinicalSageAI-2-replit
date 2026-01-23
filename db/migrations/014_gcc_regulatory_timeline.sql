-- Migration 014: Regulatory Timeline + Milestone Tracking
-- Purpose: Track submission milestones, regulatory deadlines, and correspondence
--
-- This migration provides:
--   1. Submission milestone registry with deadlines
--   2. Regulatory correspondence tracking
--   3. Agency interaction log
--   4. Timeline visualization support
--   5. Deadline alerting integration
--
-- Part 11 alignment: Maintains complete regulatory interaction history
-- for inspection readiness and compliance demonstration.

BEGIN;

CREATE SCHEMA IF NOT EXISTS regulatory;

-- =============================================================================
-- A) Submission Types Registry
-- =============================================================================

CREATE TABLE IF NOT EXISTS regulatory.submission_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type_code TEXT NOT NULL UNIQUE,              -- 'IND', 'NDA', 'BLA', 'MAA', 'ANDA', etc.
  type_name TEXT NOT NULL,
  agency_code TEXT NOT NULL,                   -- 'FDA', 'EMA', 'PMDA', 'HC', etc.
  description TEXT,
  
  -- Standard milestones for this type
  standard_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Timing expectations
  typical_review_days INT,                     -- Standard review period
  priority_review_days INT,                    -- Priority/accelerated review
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE regulatory.submission_types IS 
  'Registry of submission types (IND, NDA, BLA, MAA, etc.)';

-- Insert common submission types
INSERT INTO regulatory.submission_types (type_code, type_name, agency_code, typical_review_days, priority_review_days, standard_milestones) VALUES
  ('IND', 'Investigational New Drug', 'FDA', 30, 30, 
   '[{"code":"SUBMIT","name":"Initial Submission","offset_days":0},{"code":"FDA_ACK","name":"FDA Acknowledgment","offset_days":5},{"code":"SAFE_PROCEED","name":"Safe to Proceed","offset_days":30}]'::jsonb),
  ('NDA', 'New Drug Application', 'FDA', 300, 180,
   '[{"code":"SUBMIT","name":"NDA Submission","offset_days":0},{"code":"FILE_DATE","name":"Filing Date","offset_days":60},{"code":"MID_CYCLE","name":"Mid-Cycle Review","offset_days":180},{"code":"PDUFA_DATE","name":"PDUFA Date","offset_days":300}]'::jsonb),
  ('BLA', 'Biologics License Application', 'FDA', 300, 180,
   '[{"code":"SUBMIT","name":"BLA Submission","offset_days":0},{"code":"FILE_DATE","name":"Filing Date","offset_days":60},{"code":"PDUFA_DATE","name":"PDUFA Date","offset_days":300}]'::jsonb),
  ('MAA', 'Marketing Authorisation Application', 'EMA', 210, 150,
   '[{"code":"SUBMIT","name":"MAA Submission","offset_days":0},{"code":"VALID","name":"Validation","offset_days":10},{"code":"D80","name":"Day 80 Questions","offset_days":80},{"code":"D120","name":"Day 120 List of Questions","offset_days":120},{"code":"D180","name":"Day 180 Opinion","offset_days":180}]'::jsonb),
  ('ANDA', 'Abbreviated New Drug Application', 'FDA', 180, 180,
   '[{"code":"SUBMIT","name":"ANDA Submission","offset_days":0},{"code":"GDUFA_DATE","name":"GDUFA Goal Date","offset_days":180}]'::jsonb),
  ('510K', '510(k) Premarket Notification', 'FDA', 90, 90,
   '[{"code":"SUBMIT","name":"510(k) Submission","offset_days":0},{"code":"ACCEPT","name":"Acceptance Review","offset_days":15},{"code":"DECISION","name":"Decision Date","offset_days":90}]'::jsonb)
ON CONFLICT (type_code) DO NOTHING;

-- =============================================================================
-- B) Regulatory Submissions (per-program submissions)
-- =============================================================================

CREATE TYPE regulatory.submission_status AS ENUM (
  'PLANNING',
  'DRAFTING',
  'INTERNAL_REVIEW',
  'SUBMITTED',
  'UNDER_REVIEW',
  'QUESTIONS_RECEIVED',
  'RESPONSE_PREPARATION',
  'RESPONSE_SUBMITTED',
  'APPROVED',
  'COMPLETE_RESPONSE',
  'REFUSED_TO_FILE',
  'WITHDRAWN',
  'ARCHIVED'
);

CREATE TABLE IF NOT EXISTS regulatory.submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_number TEXT NOT NULL,              -- Internal tracking number
  
  -- Type and agency
  submission_type_id UUID NOT NULL REFERENCES regulatory.submission_types(id),
  agency_code TEXT NOT NULL,
  agency_tracking_number TEXT,                  -- Agency-assigned number (e.g., IND #)
  
  -- Program link
  program_id UUID NOT NULL REFERENCES core.programs(id),
  
  -- Product/indication
  product_name TEXT NOT NULL,
  indication TEXT,
  
  -- Status
  status regulatory.submission_status NOT NULL DEFAULT 'PLANNING',
  
  -- Key dates
  target_submission_date DATE,
  actual_submission_date DATE,
  filing_date DATE,                             -- FDA filing date
  goal_date DATE,                               -- PDUFA/GDUFA date
  approval_date DATE,
  
  -- Review type
  is_priority_review BOOLEAN DEFAULT FALSE,
  is_accelerated BOOLEAN DEFAULT FALSE,
  is_breakthrough BOOLEAN DEFAULT FALSE,
  
  -- Linked assets
  primary_snapshot_id UUID,                     -- Main submission snapshot
  
  -- Notes
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE regulatory.submissions IS 
  'Regulatory submission tracking - INDs, NDAs, BLAs, MAAs, etc.';

CREATE INDEX IF NOT EXISTS submissions_program_idx 
  ON regulatory.submissions (program_id, status);

CREATE INDEX IF NOT EXISTS submissions_type_idx 
  ON regulatory.submissions (submission_type_id, status);

CREATE INDEX IF NOT EXISTS submissions_dates_idx 
  ON regulatory.submissions (goal_date, target_submission_date);

-- =============================================================================
-- C) Milestones
-- =============================================================================

CREATE TYPE regulatory.milestone_status AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'MISSED',
  'CANCELLED',
  'BLOCKED'
);

CREATE TABLE IF NOT EXISTS regulatory.milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES regulatory.submissions(id) ON DELETE CASCADE,
  
  -- Milestone definition
  milestone_code TEXT NOT NULL,                 -- 'SUBMIT', 'FILE_DATE', 'PDUFA_DATE', etc.
  milestone_name TEXT NOT NULL,
  description TEXT,
  
  -- Dates
  target_date DATE NOT NULL,
  actual_date DATE,
  
  -- Status
  status regulatory.milestone_status NOT NULL DEFAULT 'PLANNED',
  
  -- Dependencies
  depends_on_milestone_id UUID REFERENCES regulatory.milestones(id),
  
  -- Ownership
  owner TEXT,                                   -- Person responsible
  
  -- Notes
  notes TEXT,
  completion_notes TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  
  UNIQUE (submission_id, milestone_code)
);

COMMENT ON TABLE regulatory.milestones IS 
  'Submission milestones with target and actual dates';

CREATE INDEX IF NOT EXISTS milestones_submission_idx 
  ON regulatory.milestones (submission_id, target_date);

CREATE INDEX IF NOT EXISTS milestones_status_idx 
  ON regulatory.milestones (status, target_date);

-- =============================================================================
-- D) Regulatory Correspondence
-- =============================================================================

CREATE TYPE regulatory.correspondence_type AS ENUM (
  'SUBMISSION',           -- Initial or amendment submission
  'INFORMATION_REQUEST',  -- Agency request for information
  'RESPONSE',             -- Response to agency
  'DEFICIENCY_LETTER',    -- Deficiency notification
  'COMPLETE_RESPONSE',    -- Complete response letter
  'APPROVAL_LETTER',      -- Approval notification
  'REFUSE_TO_FILE',       -- RTF letter
  'MEETING_REQUEST',      -- Meeting request
  'MEETING_MINUTES',      -- Meeting minutes
  'AMENDMENT',            -- Amendment submission
  'ANNUAL_REPORT',        -- Annual report
  'SAFETY_REPORT',        -- Safety report
  'LABEL_NEGOTIATION',    -- Label discussions
  'OTHER'
);

CREATE TYPE regulatory.correspondence_direction AS ENUM (
  'OUTBOUND',             -- To agency
  'INBOUND',              -- From agency
  'INTERNAL'              -- Internal record
);

CREATE TABLE IF NOT EXISTS regulatory.correspondence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  correspondence_number TEXT NOT NULL,          -- Internal tracking
  
  -- Link to submission
  submission_id UUID NOT NULL REFERENCES regulatory.submissions(id),
  
  -- Type and direction
  correspondence_type regulatory.correspondence_type NOT NULL,
  direction regulatory.correspondence_direction NOT NULL,
  
  -- Agency details
  agency_code TEXT NOT NULL,
  agency_reference TEXT,                        -- Agency letter/reference number
  
  -- Content
  subject TEXT NOT NULL,
  summary TEXT,
  
  -- Dates
  date_sent DATE,
  date_received DATE,
  response_due_date DATE,
  
  -- Documents
  document_refs JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array of document references
  
  -- Status
  requires_response BOOLEAN DEFAULT FALSE,
  response_submitted BOOLEAN DEFAULT FALSE,
  response_correspondence_id UUID REFERENCES regulatory.correspondence(id),
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE regulatory.correspondence IS 
  'Regulatory correspondence tracking - all agency communications';

CREATE INDEX IF NOT EXISTS correspondence_submission_idx 
  ON regulatory.correspondence (submission_id, date_sent DESC);

CREATE INDEX IF NOT EXISTS correspondence_response_idx 
  ON regulatory.correspondence (requires_response, response_due_date) 
  WHERE requires_response = TRUE AND response_submitted = FALSE;

-- =============================================================================
-- E) Agency Meetings
-- =============================================================================

CREATE TYPE regulatory.meeting_type AS ENUM (
  'PRE_IND',
  'END_OF_PHASE_1',
  'END_OF_PHASE_2',
  'PRE_NDA',
  'PRE_BLA',
  'TYPE_A',
  'TYPE_B',
  'TYPE_C',
  'TYPE_D',
  'SCIENTIFIC_ADVICE',
  'PROTOCOL_ASSISTANCE',
  'AD_HOC',
  'OTHER'
);

CREATE TYPE regulatory.meeting_status AS ENUM (
  'REQUESTED',
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'DENIED'
);

CREATE TABLE IF NOT EXISTS regulatory.meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Link
  submission_id UUID REFERENCES regulatory.submissions(id),
  program_id UUID NOT NULL REFERENCES core.programs(id),
  
  -- Meeting details
  meeting_type regulatory.meeting_type NOT NULL,
  meeting_title TEXT NOT NULL,
  agency_code TEXT NOT NULL,
  
  -- Status and dates
  status regulatory.meeting_status NOT NULL DEFAULT 'REQUESTED',
  requested_date DATE,
  scheduled_date DATE,
  actual_date DATE,
  
  -- Request tracking
  request_correspondence_id UUID REFERENCES regulatory.correspondence(id),
  briefing_doc_due DATE,
  briefing_doc_submitted DATE,
  
  -- Meeting content
  objectives TEXT[],
  questions_submitted TEXT[],
  
  -- Outcomes
  minutes_received DATE,
  minutes_correspondence_id UUID REFERENCES regulatory.correspondence(id),
  key_outcomes TEXT[],
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE regulatory.meetings IS 
  'Regulatory agency meetings - Pre-IND, EOP2, Pre-NDA, etc.';

CREATE INDEX IF NOT EXISTS meetings_program_idx 
  ON regulatory.meetings (program_id, scheduled_date);

CREATE INDEX IF NOT EXISTS meetings_submission_idx 
  ON regulatory.meetings (submission_id);

-- =============================================================================
-- F) Timeline Events (unified view)
-- =============================================================================

CREATE TABLE IF NOT EXISTS regulatory.timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id),
  submission_id UUID REFERENCES regulatory.submissions(id),
  
  -- Event details
  event_type TEXT NOT NULL,                     -- 'MILESTONE', 'CORRESPONDENCE', 'MEETING', 'CUSTOM'
  event_code TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_description TEXT,
  
  -- Source reference
  source_table TEXT,                            -- 'milestones', 'correspondence', 'meetings'
  source_id UUID,
  
  -- Timing
  target_date DATE,
  actual_date DATE,
  display_date DATE NOT NULL,                   -- Which date to show on timeline
  
  -- Visual
  color_code TEXT DEFAULT 'blue',               -- For timeline rendering
  icon TEXT,
  is_critical BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_completed BOOLEAN DEFAULT FALSE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE regulatory.timeline_events IS 
  'Unified timeline events for visualization';

CREATE INDEX IF NOT EXISTS timeline_events_program_idx 
  ON regulatory.timeline_events (program_id, display_date);

CREATE INDEX IF NOT EXISTS timeline_events_submission_idx 
  ON regulatory.timeline_events (submission_id, display_date);

-- =============================================================================
-- G) Views for Timeline and Reporting
-- =============================================================================

-- View: Upcoming deadlines
CREATE OR REPLACE VIEW regulatory.v_upcoming_deadlines AS
SELECT
  p.program_code,
  p.program_name,
  s.submission_number,
  s.product_name,
  st.type_code AS submission_type,
  st.agency_code,
  m.milestone_code,
  m.milestone_name,
  m.target_date,
  m.status,
  m.owner,
  CASE
    WHEN m.target_date < CURRENT_DATE THEN 'OVERDUE'
    WHEN m.target_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'THIS_WEEK'
    WHEN m.target_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'THIS_MONTH'
    ELSE 'FUTURE'
  END AS urgency
FROM regulatory.milestones m
JOIN regulatory.submissions s ON s.id = m.submission_id
JOIN regulatory.submission_types st ON st.id = s.submission_type_id
JOIN core.programs p ON p.id = s.program_id
WHERE m.status IN ('PLANNED', 'IN_PROGRESS')
  AND m.target_date IS NOT NULL
ORDER BY m.target_date ASC;

-- View: Pending responses
CREATE OR REPLACE VIEW regulatory.v_pending_responses AS
SELECT
  p.program_code,
  s.submission_number,
  c.correspondence_number,
  c.correspondence_type,
  c.subject,
  c.date_received,
  c.response_due_date,
  c.response_due_date - CURRENT_DATE AS days_remaining,
  CASE
    WHEN c.response_due_date < CURRENT_DATE THEN 'OVERDUE'
    WHEN c.response_due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'URGENT'
    ELSE 'PENDING'
  END AS urgency
FROM regulatory.correspondence c
JOIN regulatory.submissions s ON s.id = c.submission_id
JOIN core.programs p ON p.id = s.program_id
WHERE c.requires_response = TRUE
  AND c.response_submitted = FALSE
ORDER BY c.response_due_date ASC;

-- View: Submission status summary
CREATE OR REPLACE VIEW regulatory.v_submission_summary AS
SELECT
  p.program_code,
  p.program_name,
  st.type_code AS submission_type,
  st.agency_code,
  s.submission_number,
  s.product_name,
  s.indication,
  s.status,
  s.target_submission_date,
  s.actual_submission_date,
  s.goal_date,
  s.is_priority_review,
  s.is_breakthrough,
  (SELECT COUNT(*) FROM regulatory.milestones m WHERE m.submission_id = s.id AND m.status = 'COMPLETED') AS milestones_completed,
  (SELECT COUNT(*) FROM regulatory.milestones m WHERE m.submission_id = s.id) AS milestones_total,
  (SELECT COUNT(*) FROM regulatory.correspondence c WHERE c.submission_id = s.id) AS correspondence_count
FROM regulatory.submissions s
JOIN regulatory.submission_types st ON st.id = s.submission_type_id
JOIN core.programs p ON p.id = s.program_id
ORDER BY s.goal_date NULLS LAST, s.target_submission_date;

-- View: Meeting calendar
CREATE OR REPLACE VIEW regulatory.v_meeting_calendar AS
SELECT
  p.program_code,
  m.meeting_type,
  m.meeting_title,
  m.agency_code,
  m.status,
  COALESCE(m.scheduled_date, m.requested_date) AS date,
  m.briefing_doc_due,
  CASE
    WHEN m.briefing_doc_due IS NOT NULL AND m.briefing_doc_submitted IS NULL 
         AND m.briefing_doc_due <= CURRENT_DATE + INTERVAL '14 days'
    THEN TRUE
    ELSE FALSE
  END AS briefing_doc_urgent,
  s.submission_number
FROM regulatory.meetings m
JOIN core.programs p ON p.id = m.program_id
LEFT JOIN regulatory.submissions s ON s.id = m.submission_id
WHERE m.status IN ('REQUESTED', 'SCHEDULED')
ORDER BY COALESCE(m.scheduled_date, m.requested_date);

-- =============================================================================
-- H) Trigger: Auto-create timeline events
-- =============================================================================

CREATE OR REPLACE FUNCTION regulatory.tg_milestone_to_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_program_id UUID;
BEGIN
  SELECT program_id INTO v_program_id
  FROM regulatory.submissions
  WHERE id = NEW.submission_id;

  INSERT INTO regulatory.timeline_events (
    program_id, submission_id, event_type, event_code, event_title,
    source_table, source_id, target_date, actual_date, display_date,
    is_critical, is_completed
  )
  VALUES (
    v_program_id, NEW.submission_id, 'MILESTONE', NEW.milestone_code, NEW.milestone_name,
    'milestones', NEW.id, NEW.target_date, NEW.actual_date, 
    COALESCE(NEW.actual_date, NEW.target_date),
    NEW.milestone_code IN ('PDUFA_DATE', 'GDUFA_DATE', 'SUBMIT', 'FILE_DATE'),
    NEW.status = 'COMPLETED'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_milestone_to_timeline ON regulatory.milestones;
CREATE TRIGGER trg_milestone_to_timeline
  AFTER INSERT OR UPDATE ON regulatory.milestones
  FOR EACH ROW
  EXECUTE FUNCTION regulatory.tg_milestone_to_timeline();

COMMIT;
