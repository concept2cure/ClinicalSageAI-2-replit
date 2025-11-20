/**
 * Analytics Schema for IND Wizard
 * 
 * This schema defines tables for collecting and aggregating analytics data:
 * - Submission metrics (timelines, status, etc.)
 * - User activity and productivity
 * - Content quality and completeness
 * - Regulatory performance indicators
 * - System usage patterns
 */

-- Core analytics dimension tables
CREATE TABLE IF NOT EXISTS analytics_dimensions_time (
  id SERIAL PRIMARY KEY,
  date_actual DATE NOT NULL,
  day_name TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  day_of_month INTEGER NOT NULL,
  day_of_year INTEGER NOT NULL,
  week_of_year INTEGER NOT NULL,
  month_actual INTEGER NOT NULL,
  month_name TEXT NOT NULL,
  quarter_actual INTEGER NOT NULL,
  year_actual INTEGER NOT NULL,
  UNIQUE (date_actual)
);

CREATE TABLE IF NOT EXISTS analytics_dimensions_submission (
  id UUID PRIMARY KEY,
  submission_type TEXT NOT NULL,
  sponsor_name TEXT NOT NULL,
  ind_number TEXT,
  target_authority TEXT NOT NULL,
  first_created_at TIMESTAMP WITH TIME ZONE,
  first_submitted_at TIMESTAMP WITH TIME ZONE,
  last_updated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (id)
);

-- Daily submission metrics aggregated fact table
CREATE TABLE IF NOT EXISTS analytics_submission_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_id INTEGER REFERENCES analytics_dimensions_time(id),
  submission_id UUID REFERENCES analytics_dimensions_submission(id),
  sections_count INTEGER DEFAULT 0,
  blocks_count INTEGER DEFAULT 0,
  pages_count INTEGER DEFAULT 0,
  tables_count INTEGER DEFAULT 0,
  figures_count INTEGER DEFAULT 0,
  references_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  resolved_comments_count INTEGER DEFAULT 0,
  validation_issues_count INTEGER DEFAULT 0,
  completion_percentage NUMERIC(5,2) DEFAULT 0.0,
  completeness_score INTEGER DEFAULT 0,
  quality_score INTEGER DEFAULT 0,
  active_editors_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (date_id, submission_id)
);

-- User activity metrics
CREATE TABLE IF NOT EXISTS analytics_user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_id INTEGER REFERENCES analytics_dimensions_time(id),
  user_id UUID NOT NULL,
  submission_id UUID REFERENCES ind_submissions(id),
  sections_edited INTEGER DEFAULT 0,
  blocks_created INTEGER DEFAULT 0,
  blocks_edited INTEGER DEFAULT 0,
  blocks_deleted INTEGER DEFAULT 0,
  comments_added INTEGER DEFAULT 0,
  comments_resolved INTEGER DEFAULT 0,
  signatures_added INTEGER DEFAULT 0,
  active_minutes INTEGER DEFAULT 0,
  login_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (date_id, user_id, submission_id)
);

-- Regulatory metrics
CREATE TABLE IF NOT EXISTS analytics_regulatory_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES ind_submissions(id),
  validation_date TIMESTAMP WITH TIME ZONE,
  submission_date TIMESTAMP WITH TIME ZONE,
  ack1_date TIMESTAMP WITH TIME ZONE,
  ack2_date TIMESTAMP WITH TIME ZONE,
  ack3_date TIMESTAMP WITH TIME ZONE,
  review_complete_date TIMESTAMP WITH TIME ZONE,
  time_to_ack1 INTEGER, -- minutes
  time_to_ack2 INTEGER, -- minutes
  time_to_ack3 INTEGER, -- minutes
  validation_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  reviewer_questions INTEGER DEFAULT 0,
  deficiency_count INTEGER DEFAULT 0,
  reviewer_name TEXT,
  review_outcome TEXT, -- approved, rejected, etc.
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (submission_id)
);

-- Section completeness tracking
CREATE TABLE IF NOT EXISTS analytics_section_completeness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES ind_submissions(id),
  section_code TEXT NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  has_content BOOLEAN DEFAULT FALSE,
  word_count INTEGER DEFAULT 0,
  table_count INTEGER DEFAULT 0,
  figure_count INTEGER DEFAULT 0,
  citation_count INTEGER DEFAULT 0,
  rai_count INTEGER DEFAULT 0, -- Requests for Additional Information
  quality_score INTEGER DEFAULT 0,
  completeness_score INTEGER DEFAULT 0,
  validator_issues INTEGER DEFAULT 0,
  last_edited_at TIMESTAMP WITH TIME ZONE,
  last_edited_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (submission_id, section_code)
);

-- System usage metrics
CREATE TABLE IF NOT EXISTS analytics_system_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_id INTEGER REFERENCES analytics_dimensions_time(id),
  active_users INTEGER DEFAULT 0,
  active_submissions INTEGER DEFAULT 0,
  new_submissions INTEGER DEFAULT 0,
  completed_submissions INTEGER DEFAULT 0,
  submitted_to_fda INTEGER DEFAULT 0,
  harvester_calls INTEGER DEFAULT 0,
  ai_copilot_calls INTEGER DEFAULT 0,
  pdf_generations INTEGER DEFAULT 0,
  esg_submissions INTEGER DEFAULT 0,
  average_response_time NUMERIC(10,2) DEFAULT 0.0, -- milliseconds
  peak_memory_usage INTEGER DEFAULT 0, -- MB
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (date_id)
);

-- Content quality metrics
CREATE TABLE IF NOT EXISTS analytics_content_quality (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES ind_submissions(id),
  section_code TEXT NOT NULL,
  spelling_errors INTEGER DEFAULT 0,
  grammar_errors INTEGER DEFAULT 0,
  regulatory_compliance_score INTEGER DEFAULT 0,
  clarity_score INTEGER DEFAULT 0,
  completeness_score INTEGER DEFAULT 0,
  cross_reference_count INTEGER DEFAULT 0,
  issue_count INTEGER DEFAULT 0,
  scan_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (submission_id, section_code, scan_date)
);

-- Analytics dashboard preferences
CREATE TABLE IF NOT EXISTS analytics_dashboard_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  dashboard_type TEXT NOT NULL, -- 'submission', 'regulatory', 'productivity', 'system', 'custom'
  dashboard_name TEXT NOT NULL,
  widgets JSONB NOT NULL, -- JSON array of widget configs
  layout JSONB, -- Grid layout configuration
  theme TEXT DEFAULT 'light',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, dashboard_name)
);

-- Initialize time dimension with a couple of years
INSERT INTO analytics_dimensions_time (
  date_actual, day_name, day_of_week, day_of_month, day_of_year,
  week_of_year, month_actual, month_name, quarter_actual, year_actual
)
SELECT
  datum AS date_actual,
  to_char(datum, 'Day') AS day_name,
  EXTRACT(DOW FROM datum) AS day_of_week,
  EXTRACT(DAY FROM datum) AS day_of_month,
  EXTRACT(DOY FROM datum) AS day_of_year,
  EXTRACT(WEEK FROM datum) AS week_of_year,
  EXTRACT(MONTH FROM datum) AS month_actual,
  to_char(datum, 'Month') AS month_name,
  EXTRACT(QUARTER FROM datum) AS quarter_actual,
  EXTRACT(YEAR FROM datum) AS year_actual
FROM (
  SELECT generate_series(
    '2023-01-01'::DATE,
    '2028-12-31'::DATE,
    '1 day'::INTERVAL
  ) AS datum
) subq
ON CONFLICT (date_actual) DO NOTHING;

-- Functions for analytics maintenance
CREATE OR REPLACE FUNCTION refresh_analytics_dimensions_submission()
RETURNS VOID AS $$
BEGIN
  INSERT INTO analytics_dimensions_submission (
    id, submission_type, sponsor_name, ind_number, target_authority,
    first_created_at, first_submitted_at, last_updated_at
  )
  SELECT
    id,
    submission_type,
    sponsor_name,
    ind_number,
    target_authority,
    created_at AS first_created_at,
    NULL AS first_submitted_at, -- Placeholder, would be updated when submitted
    updated_at AS last_updated_at
  FROM ind_submissions
  ON CONFLICT (id) DO UPDATE SET
    submission_type = EXCLUDED.submission_type,
    sponsor_name = EXCLUDED.sponsor_name,
    ind_number = EXCLUDED.ind_number,
    target_authority = EXCLUDED.target_authority,
    last_updated_at = EXCLUDED.last_updated_at;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate daily metrics
CREATE OR REPLACE FUNCTION refresh_analytics_submission_metrics_daily(p_date DATE)
RETURNS VOID AS $$
DECLARE
  v_date_id INTEGER;
BEGIN
  -- Get date dimension ID
  SELECT id INTO v_date_id FROM analytics_dimensions_time WHERE date_actual = p_date;
  
  -- Ensure record exists for all active submissions
  INSERT INTO analytics_submission_metrics_daily (date_id, submission_id)
  SELECT v_date_id, id
  FROM analytics_dimensions_submission
  WHERE (first_created_at <= p_date OR first_created_at IS NULL)
  ON CONFLICT (date_id, submission_id) DO NOTHING;
  
  -- Update metrics (placeholder, would be expanded with real calculations)
  UPDATE analytics_submission_metrics_daily m
  SET
    updated_at = CURRENT_TIMESTAMP
  WHERE m.date_id = v_date_id;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_submission_metrics_date ON analytics_submission_metrics_daily(date_id);
CREATE INDEX IF NOT EXISTS idx_analytics_submission_metrics_submission ON analytics_submission_metrics_daily(submission_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_activity_date ON analytics_user_activity(date_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_activity_user ON analytics_user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_activity_submission ON analytics_user_activity(submission_id);
CREATE INDEX IF NOT EXISTS idx_analytics_regulatory_metrics_submission ON analytics_regulatory_metrics(submission_id);
CREATE INDEX IF NOT EXISTS idx_analytics_section_completeness_submission ON analytics_section_completeness(submission_id, section_code);
CREATE INDEX IF NOT EXISTS idx_analytics_system_usage_date ON analytics_system_usage(date_id);
CREATE INDEX IF NOT EXISTS idx_analytics_content_quality_submission ON analytics_content_quality(submission_id, section_code);