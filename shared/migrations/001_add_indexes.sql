-- Execute in Neon SQL Editor
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atoms_submission_jurisdiction
ON regulatory_atoms (submission_id, applicable_jurisdictions);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atoms_compliance_score
ON regulatory_atoms (compliance_score DESC)
WHERE compliance_score < 0.8;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_timestamp
ON audit_logs (timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
ON users (email);

-- PgAudit extension must be created by a superuser in Neon.
