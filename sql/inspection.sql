-- TrialSage Vault - Inspection Mode Portal Tables

-- Inspector Access Tokens
create table if not exists inspector_tokens (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references ind_wizards(id),
  inspector_email text,
  expires_at timestamp,
  created_by uuid,
  created_at timestamp default now()
);

-- Inspector Activity Audit Trail
create table if not exists inspector_audit (
  id bigserial primary key,
  token_id uuid references inspector_tokens(id),
  action text,
  metadata jsonb,
  ts timestamp default now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inspector_tokens_expiry ON inspector_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_inspector_tokens_submission ON inspector_tokens(submission_id);
CREATE INDEX IF NOT EXISTS idx_inspector_audit_token ON inspector_audit(token_id);
CREATE INDEX IF NOT EXISTS idx_inspector_audit_action ON inspector_audit(action);

-- Create view for easy reporting
CREATE OR REPLACE VIEW vw_inspector_activity AS
SELECT 
  a.id as audit_id,
  t.id as token_id,
  t.inspector_email,
  t.submission_id,
  a.action,
  a.metadata,
  a.ts as activity_timestamp,
  t.expires_at
FROM 
  inspector_audit a
JOIN 
  inspector_tokens t ON a.token_id = t.id
ORDER BY 
  a.ts DESC;