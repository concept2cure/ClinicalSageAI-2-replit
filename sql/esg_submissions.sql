/**
 * FDA ESG Submission and Acknowledgment Schema
 * 
 * This schema defines tables for:
 * 1. FDA ESG submission tracking
 * 2. Acknowledgment processing (ACK1, ACK2, ACK3)
 * 3. Submission validation reports
 * 4. Digital signatures for 21 CFR Part 11 compliance
 */

-- FDA ESG Submissions
CREATE TABLE IF NOT EXISTS esg_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES ind_submissions(id),
  esg_submission_id TEXT,  -- FDA-assigned submission ID
  status TEXT NOT NULL DEFAULT 'preparing', -- preparing, validating, submitted, acknowledged, rejected
  submission_type TEXT NOT NULL, -- original, amendment, response
  sequence_number INTEGER,
  center TEXT NOT NULL, -- CDER, CBER, etc.
  submission_format TEXT NOT NULL DEFAULT 'ectd', -- ectd, non-ectd
  package_path TEXT, -- Path to the ESG submission package
  validation_status TEXT, -- passed, failed, warnings
  sender_id TEXT, -- ESG sender ID
  receiver_id TEXT, -- ESG receiver ID
  gateway_route TEXT, -- production, test
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- FDA Acknowledgments
CREATE TABLE IF NOT EXISTS esg_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES esg_submissions(id),
  ack_type TEXT NOT NULL, -- ack1, ack2, ack3
  ack_id TEXT, -- FDA-assigned acknowledgment ID
  ack_date TIMESTAMP WITH TIME ZONE,
  ack_status TEXT NOT NULL, -- success, warning, error
  ack_message TEXT,
  ack_code TEXT,
  raw_content TEXT, -- Raw XML of the acknowledgment
  parsed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Validation Reports for ESG submissions
CREATE TABLE IF NOT EXISTS esg_validation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES esg_submissions(id),
  validator TEXT NOT NULL, -- which validator was used (e.g., 'globalsubmit', 'lorenz')
  validation_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL, -- passed, failed, warnings
  report_content JSONB, -- Full validation report
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  error_summary TEXT,
  report_path TEXT -- Path to full report file if stored externally
);

-- Digital Signatures for 21 CFR Part 11 compliance
CREATE TABLE IF NOT EXISTS digital_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'esg_submission', 'ind_section', etc.
  entity_id UUID NOT NULL,
  signer_id UUID NOT NULL,
  signature_type TEXT NOT NULL, -- 'approval', 'review', 'final'
  signature_hash TEXT NOT NULL, -- Hash of the content
  signing_method TEXT NOT NULL, -- 'pki', 'username_password', etc.
  signature_reason TEXT,
  ip_address TEXT,
  signing_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verification_status TEXT DEFAULT 'valid', -- 'valid', 'invalid', 'revoked'
  certificate_details JSONB
);

-- Submission Packages for tracking all files in a submission
CREATE TABLE IF NOT EXISTS esg_submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES esg_submissions(id),
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL, -- xml, pdf, etc.
  file_role TEXT NOT NULL, -- backbone, content, index, etc.
  file_size BIGINT,
  md5_hash TEXT NOT NULL,
  sha256_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ESG Connection Configuration
CREATE TABLE IF NOT EXISTS esg_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  environment TEXT NOT NULL DEFAULT 'test', -- test, production
  connection_type TEXT NOT NULL DEFAULT 'as2', -- as2, sftp
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  certificate_path TEXT,
  certificate_password TEXT,
  fda_receiver_id TEXT,
  sftp_username TEXT,
  sftp_password TEXT,
  as2_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Submission Events Audit Log
CREATE TABLE IF NOT EXISTS esg_submission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES esg_submissions(id),
  event_type TEXT NOT NULL, -- 'package_created', 'validation_started', 'submission_sent', 'ack_received'
  event_details JSONB,
  performed_by UUID,
  event_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_esg_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_esg_submissions_timestamp
BEFORE UPDATE ON esg_submissions
FOR EACH ROW EXECUTE PROCEDURE update_esg_timestamp();

CREATE TRIGGER update_esg_config_timestamp
BEFORE UPDATE ON esg_configuration
FOR EACH ROW EXECUTE PROCEDURE update_esg_timestamp();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_esg_submissions_submission_id ON esg_submissions(submission_id);
CREATE INDEX IF NOT EXISTS idx_esg_acknowledgments_submission_id ON esg_acknowledgments(submission_id);
CREATE INDEX IF NOT EXISTS idx_esg_validation_reports_submission_id ON esg_validation_reports(submission_id);
CREATE INDEX IF NOT EXISTS idx_digital_signatures_entity ON digital_signatures(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_esg_submission_files_submission_id ON esg_submission_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_esg_submission_events_submission_id ON esg_submission_events(submission_id);

-- Example configuration (disabled by default)
/*
INSERT INTO esg_configuration 
  (environment, connection_type, sender_id, sender_name, fda_receiver_id, as2_url) 
VALUES
  ('test', 'as2', 'ABCXYZ123', 'TrialSage Pharma', 'CDER', 'https://gateway.fda.gov/as2-test')
ON CONFLICT DO NOTHING;
*/