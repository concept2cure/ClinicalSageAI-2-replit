-- Submission Twin — Living Submission Intelligence Layer
-- 6 tables: claims, evidence links, drift alerts, challenges, change impacts, assessments

-- Enums
DO $$ BEGIN
  CREATE TYPE claim_support_strength AS ENUM ('direct', 'indirect', 'weak', 'stale', 'contradictory', 'unsupported');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE drift_type AS ENUM ('summary_detail_mismatch', 'claim_escalation_without_evidence', 'endpoint_framing_drift', 'cmc_maturity_overstatement', 'narrative_statistical_mismatch', 'document_contradiction', 'stale_downstream_summary');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reviewer_lens AS ENUM ('skeptical_reviewer', 'evidence_sufficiency_skeptic', 'cmc_heavy_reviewer', 'clinical_risk_reviewer', 'compliance_inspection', 'claims_challenger', 'biostatistics_skeptic');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE twin_finding_severity AS ENUM ('critical', 'high', 'medium', 'low', 'informational');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE twin_assessment_status AS ENUM ('running', 'completed', 'failed', 'stale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. Claims
CREATE TABLE IF NOT EXISTS submission_twin_claims (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id),
  artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  section_id INTEGER REFERENCES c2c_package_sections(id),
  claim_text TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  section_path TEXT,
  source_location JSONB,
  confidence REAL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS twin_claims_package_idx ON submission_twin_claims(package_id);
CREATE INDEX IF NOT EXISTS twin_claims_artifact_idx ON submission_twin_claims(artifact_id);
CREATE INDEX IF NOT EXISTS twin_claims_type_idx ON submission_twin_claims(claim_type);
CREATE INDEX IF NOT EXISTS twin_claims_org_idx ON submission_twin_claims(organization_id);

-- 2. Evidence Links
CREATE TABLE IF NOT EXISTS submission_twin_evidence_links (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER NOT NULL REFERENCES submission_twin_claims(id),
  evidence_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  evidence_vault_doc_id UUID,
  evidence_text TEXT,
  support_strength claim_support_strength NOT NULL,
  relevance_score REAL DEFAULT 0,
  is_statistical BOOLEAN DEFAULT FALSE,
  statistical_detail JSONB,
  stale_since TIMESTAMP,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS twin_evidence_claim_idx ON submission_twin_evidence_links(claim_id);
CREATE INDEX IF NOT EXISTS twin_evidence_strength_idx ON submission_twin_evidence_links(support_strength);
CREATE INDEX IF NOT EXISTS twin_evidence_org_idx ON submission_twin_evidence_links(organization_id);

-- 3. Drift Alerts
CREATE TABLE IF NOT EXISTS submission_twin_drift_alerts (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id),
  drift_type drift_type NOT NULL,
  severity twin_finding_severity NOT NULL,
  source_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  target_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  description TEXT NOT NULL,
  source_excerpt TEXT,
  target_excerpt TEXT,
  suggested_fix TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by INTEGER,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS twin_drift_package_idx ON submission_twin_drift_alerts(package_id);
CREATE INDEX IF NOT EXISTS twin_drift_type_idx ON submission_twin_drift_alerts(drift_type);
CREATE INDEX IF NOT EXISTS twin_drift_severity_idx ON submission_twin_drift_alerts(severity);
CREATE INDEX IF NOT EXISTS twin_drift_resolved_idx ON submission_twin_drift_alerts(resolved);
CREATE INDEX IF NOT EXISTS twin_drift_org_idx ON submission_twin_drift_alerts(organization_id);

-- 4. Assessments (must be created before challenges which reference it)
CREATE TABLE IF NOT EXISTS submission_twin_assessments (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id),
  status twin_assessment_status NOT NULL DEFAULT 'running',
  readiness_score REAL,
  fragility_score REAL,
  claim_count INTEGER DEFAULT 0,
  supported_claim_count INTEGER DEFAULT 0,
  unsupported_claim_count INTEGER DEFAULT 0,
  drift_alert_count INTEGER DEFAULT 0,
  challenge_count INTEGER DEFAULT 0,
  critical_finding_count INTEGER DEFAULT 0,
  next_best_artifact TEXT,
  next_best_artifact_rationale TEXT,
  weak_zones JSONB,
  biostat_alignment JSONB,
  executive_summary TEXT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  triggered_by INTEGER,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS twin_assessment_package_idx ON submission_twin_assessments(package_id);
CREATE INDEX IF NOT EXISTS twin_assessment_status_idx ON submission_twin_assessments(status);
CREATE INDEX IF NOT EXISTS twin_assessment_org_idx ON submission_twin_assessments(organization_id);
CREATE INDEX IF NOT EXISTS twin_assessment_created_idx ON submission_twin_assessments(created_at);

-- 5. Challenges
CREATE TABLE IF NOT EXISTS submission_twin_challenges (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id),
  assessment_id INTEGER REFERENCES submission_twin_assessments(id),
  reviewer_lens reviewer_lens NOT NULL,
  challenge_text TEXT NOT NULL,
  target_claim_id INTEGER REFERENCES submission_twin_claims(id),
  target_section TEXT,
  severity twin_finding_severity NOT NULL,
  deficiency_likelihood REAL DEFAULT 0,
  suggested_response TEXT,
  suggested_artifact TEXT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS twin_challenges_package_idx ON submission_twin_challenges(package_id);
CREATE INDEX IF NOT EXISTS twin_challenges_assessment_idx ON submission_twin_challenges(assessment_id);
CREATE INDEX IF NOT EXISTS twin_challenges_lens_idx ON submission_twin_challenges(reviewer_lens);
CREATE INDEX IF NOT EXISTS twin_challenges_severity_idx ON submission_twin_challenges(severity);
CREATE INDEX IF NOT EXISTS twin_challenges_org_idx ON submission_twin_challenges(organization_id);

-- 6. Change Impacts
CREATE TABLE IF NOT EXISTS submission_twin_change_impacts (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id),
  changed_artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id),
  change_description TEXT NOT NULL,
  change_type TEXT NOT NULL,
  impacted_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  impacted_claim_id INTEGER REFERENCES submission_twin_claims(id),
  impact_severity twin_finding_severity NOT NULL,
  impact_description TEXT NOT NULL,
  remediation TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMP,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS twin_impact_package_idx ON submission_twin_change_impacts(package_id);
CREATE INDEX IF NOT EXISTS twin_impact_changed_idx ON submission_twin_change_impacts(changed_artifact_id);
CREATE INDEX IF NOT EXISTS twin_impact_impacted_idx ON submission_twin_change_impacts(impacted_artifact_id);
CREATE INDEX IF NOT EXISTS twin_impact_resolved_idx ON submission_twin_change_impacts(resolved);
CREATE INDEX IF NOT EXISTS twin_impact_org_idx ON submission_twin_change_impacts(organization_id);
