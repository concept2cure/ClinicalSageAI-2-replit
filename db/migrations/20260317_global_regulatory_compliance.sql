-- ============================================================================
-- Migration: Global Regulatory Compliance Infrastructure
-- ============================================================================
--
-- Implements compliance tables required for ALL major global markets:
--   US (FDA 21 CFR Part 11), EU (Annex 11, MDR, GDPR), Japan (PMDA),
--   China (NMPA), Brazil (ANVISA), Korea (MFDS), Australia (TGA),
--   Canada (Health Canada/PIPEDA), UK (MHRA/UK GDPR), Switzerland (Swissmedic),
--   ICH (E6(R3), E2B(R3)), WHO (PQ), PIC/S (GMP)
--
-- Sections:
--   1. GDPR Article 30 — Records of Processing Activities (RoPA)
--   2. GDPR Articles 33-34 — Data Breach Notification
--   3. GDPR Articles 15-22 — Data Subject Rights Requests
--   4. GDPR Articles 6-7 — Consent Management
--   5. GDPR Articles 44-49 — Cross-Border Transfer Assessments
--   6. GDPR Article 35 — Data Protection Impact Assessments (DPIA)
--   7. Pharmacovigilance — Adverse Events & Safety Reporting
--   8. Pharmacovigilance — ICSR (ICH E2B(R3))
--   9. Pharmacovigilance — Periodic Safety Reports
--  10. Pharmacovigilance — Signal Detection & Risk Management
--  11. Regional Compliance Config — Per-org framework tracking
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: GDPR Article 30 — Records of Processing Activities
-- ============================================================================

CREATE TABLE IF NOT EXISTS gdpr_processing_activities (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  lawful_basis TEXT NOT NULL CHECK (lawful_basis IN (
    'consent', 'contract', 'legal_obligation', 'vital_interest',
    'public_task', 'legitimate_interest'
  )),
  data_categories TEXT[] DEFAULT '{}',
  data_subject_categories TEXT[] DEFAULT '{}',
  recipients TEXT[] DEFAULT '{}',
  third_country_transfers JSONB DEFAULT '[]',
  retention_period_months INTEGER,
  technical_measures TEXT[] DEFAULT '{}',
  organizational_measures TEXT[] DEFAULT '{}',
  dpia_conducted BOOLEAN DEFAULT FALSE,
  dpa_contact_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_ropa_org ON gdpr_processing_activities(organization_id);

-- ============================================================================
-- SECTION 2: GDPR Articles 33-34 — Data Breach Notification
-- ============================================================================

CREATE TABLE IF NOT EXISTS gdpr_data_breaches (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  data_affected TEXT NOT NULL,
  subjects_affected INTEGER DEFAULT 0,
  detected_at TIMESTAMPTZ NOT NULL,
  reported_to_authority_at TIMESTAMPTZ,
  reported_to_subjects_at TIMESTAMPTZ,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  within_notification_window BOOLEAN DEFAULT TRUE, -- 72 hours per Art. 33
  remediation_steps TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'detected' CHECK (status IN (
    'detected', 'reported_to_authority', 'reported_to_subjects', 'remediated', 'closed'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_breach_org ON gdpr_data_breaches(organization_id);

-- ============================================================================
-- SECTION 3: GDPR Articles 15-22 — Data Subject Rights Requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS gdpr_data_subject_requests (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  data_subject_id TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN (
    'access', 'rectification', 'erasure', 'restriction',
    'portability', 'objection', 'automated_decision'
  )),
  status TEXT DEFAULT 'received' CHECK (status IN (
    'received', 'in_progress', 'completed', 'denied', 'escalated'
  )),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  response_deadline TIMESTAMPTZ NOT NULL, -- 30 days per Art. 12(3)
  completed_at TIMESTAMPTZ,
  response_details TEXT,
  denial_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_dsr_org ON gdpr_data_subject_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_dsr_deadline ON gdpr_data_subject_requests(response_deadline)
  WHERE status NOT IN ('completed', 'denied');

-- ============================================================================
-- SECTION 4: GDPR Articles 6-7 — Consent Management
-- ============================================================================

CREATE TABLE IF NOT EXISTS gdpr_consent_records (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  data_subject_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  consent_given BOOLEAN NOT NULL,
  consent_method TEXT,
  consent_timestamp TIMESTAMPTZ DEFAULT NOW(),
  withdrawal_timestamp TIMESTAMPTZ,
  lawful_basis TEXT DEFAULT 'consent',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_consent_org ON gdpr_consent_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_subject ON gdpr_consent_records(data_subject_id);

-- ============================================================================
-- SECTION 5: GDPR Articles 44-49 — Cross-Border Transfer Assessments
-- ============================================================================

CREATE TABLE IF NOT EXISTS gdpr_transfer_assessments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  source_region TEXT NOT NULL,
  destination_region TEXT NOT NULL,
  transfer_mechanism TEXT NOT NULL CHECK (transfer_mechanism IN (
    'adequacy_decision', 'sccs', 'bcrs', 'derogation',
    'explicit_consent', 'binding_agreement', 'code_of_conduct'
  )),
  legal_basis TEXT,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  tia_completed BOOLEAN DEFAULT FALSE, -- Transfer Impact Assessment
  supplementary_measures TEXT[] DEFAULT '{}',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_transfer_org ON gdpr_transfer_assessments(organization_id);

-- ============================================================================
-- SECTION 6: GDPR Article 35 — Data Protection Impact Assessments
-- ============================================================================

CREATE TABLE IF NOT EXISTS gdpr_dpias (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  processing_activity_id INTEGER REFERENCES gdpr_processing_activities(id),
  description TEXT NOT NULL,
  necessity_assessment TEXT,
  risk_assessment JSONB DEFAULT '{}', -- {likelihood, impact, mitigations[]}
  dpo_opinion TEXT,
  supervisory_authority_consulted BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'in_review', 'approved', 'requires_changes'
  )),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_dpia_org ON gdpr_dpias(organization_id);

-- ============================================================================
-- SECTION 7: Pharmacovigilance — Adverse Events
-- ============================================================================

CREATE TABLE IF NOT EXISTS pv_adverse_events (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER,
  event_type TEXT NOT NULL CHECK (event_type IN ('AE', 'SAE', 'SUSAR', 'AESI')),
  patient_id TEXT, -- anonymized
  event_description TEXT NOT NULL,
  onset_date DATE,
  report_date DATE DEFAULT CURRENT_DATE,
  seriousness_criteria TEXT[] DEFAULT '{}',
  -- (death, life_threatening, hospitalization, disability, congenital_anomaly, medically_important)
  causality TEXT CHECK (causality IN (
    'definite', 'probable', 'possible', 'unlikely', 'unrelated', 'not_assessed'
  )),
  outcome TEXT CHECK (outcome IN (
    'recovered', 'recovering', 'not_recovered', 'fatal', 'unknown'
  )),
  reporter_type TEXT CHECK (reporter_type IN (
    'investigator', 'sponsor', 'patient', 'healthcare_provider', 'other'
  )),
  country_of_occurrence TEXT,
  regulatory_reporting_deadline TIMESTAMPTZ,
  reported_to_authorities BOOLEAN DEFAULT FALSE,
  expedited_report_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_ae_org ON pv_adverse_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_pv_ae_project ON pv_adverse_events(project_id);
CREATE INDEX IF NOT EXISTS idx_pv_ae_deadline ON pv_adverse_events(regulatory_reporting_deadline)
  WHERE reported_to_authorities = FALSE;

-- ============================================================================
-- SECTION 8: Pharmacovigilance — ICSR (ICH E2B(R3))
-- ============================================================================

CREATE TABLE IF NOT EXISTS pv_icsr (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  adverse_event_id INTEGER REFERENCES pv_adverse_events(id),
  icsr_type TEXT NOT NULL CHECK (icsr_type IN ('initial', 'follow_up', 'nullification')),
  sender_type TEXT DEFAULT 'sponsor',
  receiver_type TEXT DEFAULT 'regulatory_authority',
  transmission_date TIMESTAMPTZ,
  e2b_version TEXT DEFAULT 'R3',
  worldwide_unique_id TEXT,
  report_type TEXT,
  seriousness TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_icsr_org ON pv_icsr(organization_id);
CREATE INDEX IF NOT EXISTS idx_pv_icsr_ae ON pv_icsr(adverse_event_id);

-- ============================================================================
-- SECTION 9: Pharmacovigilance — Periodic Safety Reports
-- ============================================================================

CREATE TABLE IF NOT EXISTS pv_periodic_reports (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER,
  report_type TEXT NOT NULL CHECK (report_type IN ('DSUR', 'PSUR', 'PBRER', 'PADER')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'in_review', 'submitted', 'accepted', 'revision_requested'
  )),
  submitted_to TEXT[] DEFAULT '{}', -- regulatory authority names
  due_date DATE NOT NULL,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_periodic_org ON pv_periodic_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_pv_periodic_due ON pv_periodic_reports(due_date)
  WHERE status NOT IN ('submitted', 'accepted');

-- ============================================================================
-- SECTION 10: Pharmacovigilance — Signals & Risk Management
-- ============================================================================

CREATE TABLE IF NOT EXISTS pv_safety_signals (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER,
  signal_source TEXT CHECK (signal_source IN (
    'spontaneous', 'clinical_trial', 'literature', 'registry', 'other'
  )),
  description TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  evaluation_status TEXT DEFAULT 'new' CHECK (evaluation_status IN (
    'new', 'under_evaluation', 'confirmed', 'refuted', 'closed'
  )),
  action TEXT CHECK (action IN (
    'label_update', 'rems', 'dear_doctor', 'withdrawal', 'none', 'monitoring'
  )),
  risk_benefit_assessment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pv_risk_management_plans (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER,
  version TEXT DEFAULT '1.0',
  identified_risks JSONB DEFAULT '[]',
  potential_risks JSONB DEFAULT '[]',
  missing_information JSONB DEFAULT '[]',
  pharmacovigilance_activities JSONB DEFAULT '{}',
  risk_minimization_measures JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'approved', 'revision_requested'
  )),
  region TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 11: Regional Compliance Configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS regional_compliance_config (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  region_code TEXT NOT NULL, -- US, EU, JP, CN, BR, KR, AU, CA, UK, CH, WHO
  framework_id TEXT NOT NULL, -- e.g., '21CFR11', 'EU_ANNEX11', 'GDPR', 'PMDA_ORD21'
  enabled BOOLEAN DEFAULT TRUE,
  configuration JSONB DEFAULT '{}',
  -- Regional-specific settings:
  audit_retention_years INTEGER DEFAULT 15,
  required_languages TEXT[] DEFAULT '{en}',
  timezone_rule TEXT DEFAULT 'UTC',
  data_residency_required BOOLEAN DEFAULT FALSE,
  data_residency_region TEXT,
  e_signature_required BOOLEAN DEFAULT TRUE,
  hash_algorithm TEXT DEFAULT 'SHA-256',
  export_formats TEXT[] DEFAULT '{csv,json}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, region_code, framework_id)
);

CREATE INDEX IF NOT EXISTS idx_regional_compliance_org ON regional_compliance_config(organization_id);

-- ============================================================================
-- Audit: record this migration
-- ============================================================================

DO $$
BEGIN
  -- Try to log the migration to audit_events
  INSERT INTO audit_events
    (organization_id, event_type, entity_type, entity_id, user_id, user_name,
     user_role, ip_address, timestamp, reason, regulatory_significant, gxp_relevant)
  VALUES
    (1, 'system.migration', 'database', '20260317_global_regulatory_compliance',
     0, 'system', 'system', '127.0.0.1', NOW(),
     'Global regulatory compliance tables created: GDPR (RoPA, DPIA, consent, DSR, breach, transfers), Pharmacovigilance (AE, ICSR, periodic reports, signals, RMP), Regional compliance config',
     true, true);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not log migration to audit_events: %', SQLERRM;
END;
$$;

COMMIT;
