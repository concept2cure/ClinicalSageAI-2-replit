\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA dr_proof;

CREATE TABLE dr_proof.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE dr_proof.tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE dr_proof.users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES dr_proof.tenants(id),
  email text NOT NULL UNIQUE,
  auth_subject text NOT NULL UNIQUE
);
CREATE TABLE dr_proof.regulated_records (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES dr_proof.tenants(id),
  title text NOT NULL,
  content text NOT NULL,
  content_sha256 text NOT NULL
);
CREATE TABLE dr_proof.object_references (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES dr_proof.tenants(id),
  storage_provider text NOT NULL,
  object_key text NOT NULL,
  media_type text NOT NULL,
  payload bytea NOT NULL,
  payload_sha256 text NOT NULL
);
CREATE TABLE dr_proof.audit_events (
  sequence_no bigint PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES dr_proof.tenants(id),
  action text NOT NULL,
  previous_hash text NOT NULL,
  event_hash text NOT NULL
);

INSERT INTO dr_proof.schema_migrations(version) VALUES ('wo-04-dr-proof-v1');
INSERT INTO dr_proof.tenants(id, name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'DR Alpha Research'),
  ('20000000-0000-4000-8000-000000000002', 'DR Beta Research');
INSERT INTO dr_proof.users(id, tenant_id, email, auth_subject) VALUES
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'alpha.dr@example.invalid', 'dr-auth-alpha'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'beta.dr@example.invalid', 'dr-auth-beta');
-- VALUES, not SELECT ... UNION ALL: UNION resolves the unknown-typed uuid
-- literals to text, and text has no assignment cast to uuid, so the UNION form
-- fails on every PostgreSQL version and aborted the whole drill at seeding.
INSERT INTO dr_proof.regulated_records(id, tenant_id, title, content, content_sha256) VALUES
  ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'Protocol approval', 'Approved synthetic protocol v1', encode(digest('Approved synthetic protocol v1', 'sha256'), 'hex')),
  ('23000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002',
   'Submission review', 'Reviewed synthetic submission v1', encode(digest('Reviewed synthetic submission v1', 'sha256'), 'hex'));
INSERT INTO dr_proof.object_references(id, tenant_id, storage_provider, object_key, media_type, payload, payload_sha256)
SELECT '14000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
       'dr-inline-test-adapter', 'tenant-alpha/proof.bin', 'application/octet-stream',
       decode('000102ff434c494e4943414c53414745', 'hex'),
       encode(digest(decode('000102ff434c494e4943414c53414745', 'hex'), 'sha256'), 'hex');

WITH first_event AS (
  SELECT encode(digest('1|10000000-0000-4000-8000-000000000001|record.created|GENESIS', 'sha256'), 'hex') AS hash
), inserted AS (
  INSERT INTO dr_proof.audit_events VALUES
    (1, '10000000-0000-4000-8000-000000000001', 'record.created', 'GENESIS', (SELECT hash FROM first_event))
  RETURNING event_hash
)
INSERT INTO dr_proof.audit_events
SELECT 2, '10000000-0000-4000-8000-000000000001', 'record.approved', event_hash,
       encode(digest('2|10000000-0000-4000-8000-000000000001|record.approved|' || event_hash, 'sha256'), 'hex')
FROM inserted;

ALTER TABLE dr_proof.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_proof.regulated_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_proof.object_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_proof.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant ON dr_proof.users TO c2c_dr_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY records_tenant ON dr_proof.regulated_records TO c2c_dr_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY objects_tenant ON dr_proof.object_references TO c2c_dr_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY audits_tenant ON dr_proof.audit_events TO c2c_dr_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT USAGE ON SCHEMA dr_proof TO c2c_dr_app;
GRANT SELECT ON ALL TABLES IN SCHEMA dr_proof TO c2c_dr_app;
