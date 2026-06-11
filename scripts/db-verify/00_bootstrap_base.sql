-- Minimal base/prerequisite tables my migrations FK to + governance ledger tables.
CREATE TABLE IF NOT EXISTS organizations (id serial PRIMARY KEY, name text);
CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, email text, password_hash text);
CREATE TABLE IF NOT EXISTS submissions (id serial PRIMARY KEY, organization_id integer);
CREATE TABLE IF NOT EXISTS clinical_studies (id serial PRIMARY KEY, organization_id integer, study_id text, title text);
CREATE TABLE IF NOT EXISTS projects (id serial PRIMARY KEY, organization_id integer, name text);
CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY, tenant_id integer, user_id integer, action text, table_name text, record_id text,
  actor_id integer, target text, target_type text, target_id text, reason text, payload_hash text,
  ana_action_id text, sha256_chain text, occurred_at timestamptz, hmac_seal text
);
CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id text PRIMARY KEY, org_id integer, domain text, surface text, command text, target text, risk text, payload jsonb,
  agentic_mode text, state text, proposed_at timestamptz, proposed_by integer, decided_at timestamptz, decided_by integer,
  decision_reason text, executed_at timestamptz, audit_row_id text, idempotency_key text
);
