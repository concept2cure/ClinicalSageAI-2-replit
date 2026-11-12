/**
 * The organizations, people, sponsors, projects and documents AnA's project-scope suites read, on PGlite: one CRO
 * organization (1) with two Northwind projects (10, 11), a private Northwind project (12) and a Contoso project (13),
 * and another organization (2) with its own (20). Member 7 can open 10, 11 and 13, never 12 or 20. Split out of
 * ana-vault-tools-project-scope.pglite.test.ts (2026-11-12) so the trial master file suite reads the same world.
 * Not a test file.
 */
export const ANA_PROJECT_SCOPE = {
  ORG: 1,
  MEMBER: 7,
  P_A1: '11111111-1111-4111-8111-111111111111',
  P_A2: '22222222-2222-4222-8222-222222222222',
  P_B: '33333333-3333-4333-8333-333333333333',
  P_PRIV: '44444444-4444-4444-8444-444444444444',
  P_THEIRS: '55555555-5555-4555-8555-555555555555',
} as const;
const { P_A1, P_A2, P_B, P_PRIV, P_THEIRS } = ANA_PROJECT_SCOPE;

export const ANA_PROJECT_SCOPE_SQL = `
    CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text DEFAULT 'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer NOT NULL, name text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, name text, code text,
      description text, status text DEFAULT 'active', deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, code text, name text,
      regulatory_program_id uuid, client_workspace_id integer, status text DEFAULT 'active',
      owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}');
    CREATE TABLE project_visibility_settings (organization_id integer, project_id integer, visibility text);
    CREATE TABLE project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
    CREATE TABLE account_skill_bundles (id integer PRIMARY KEY, bundle_id text, organization_id integer,
      project_id integer, status text, metadata jsonb DEFAULT '{}');
    CREATE TABLE connector_credentials (organization_id integer, connector_id text, credentials text, is_valid boolean);
    CREATE TABLE user_intelligence_profiles (id serial PRIMARY KEY,user_id integer,organization_id integer,
      workflow_preferences jsonb DEFAULT '{}',UNIQUE(user_id,organization_id));
    CREATE TABLE audit_logs (id uuid PRIMARY KEY,tenant_id integer,user_id integer,record_id text,table_name text,
      action text,new_values jsonb,occurred_at timestamptz DEFAULT now(),actor_id integer,target text,payload_hash text,
      sha256_chain text,hmac_seal text,old_values json,ip_address text,user_agent text,reason text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text, organization_id integer, project_id integer,
      title text, type text DEFAULT 'document', category text DEFAULT 'document', ctd_section text,
      status text DEFAULT 'draft', version integer DEFAULT 2, content text DEFAULT 'body', content_hash text,
      metadata json DEFAULT '{}', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
      locked_at timestamptz, created_by_id integer);
    CREATE TABLE concept2cure_artifact_versions (id serial PRIMARY KEY, artifact_id integer, organization_id integer,
      version integer, content text, content_hash text, change_description text,
      created_at timestamptz DEFAULT now(), created_by_id integer);
    CREATE TABLE c2c_documents (id text PRIMARY KEY, org_id integer, project_id uuid, doc_type text, agency text,
      title text, status text DEFAULT 'draft', readiness integer DEFAULT 0, updated_at timestamptz DEFAULT now());
    CREATE TABLE c2c_document_sections (document_id text, section_key text, parent_key text, label text,
      status text, mandatory boolean, version integer, path_order integer, content jsonb);

    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (7, 'C. Consultant', 'c@cro', 'active'), (9, 'P. Owner', 'p@cro', 'active');
    INSERT INTO organization_users VALUES (1, 7, 'member'), (1, 9, 'member');
    INSERT INTO client_workspaces VALUES (100, 1, 'Northwind Bio'), (101, 1, 'Contoso Pharma'), (200, 2, 'Their client');
    INSERT INTO regulatory_programs (id, organization_id, name, code) VALUES
      ('${P_A1}', 1, 'Northwind oncology IND', 'NW-1'),
      ('${P_A2}', 1, 'Northwind second IND', 'NW-2'),
      ('${P_B}', 1, 'Contoso device study', 'CT-1'),
      ('${P_PRIV}', 1, 'Northwind private program', 'NW-PRIV'),
      ('${P_THEIRS}', 2, 'Their program', 'THEIRS-1');
    INSERT INTO projects (id, organization_id, code, name, regulatory_program_id, client_workspace_id, owner_id, created_by_id) VALUES
      (10, 1, 'NW-1', 'Northwind oncology IND', '${P_A1}', 100, 9, 9),
      (11, 1, 'NW-2', 'Northwind second IND', '${P_A2}', 100, 9, 9),
      (12, 1, 'NW-PRIV', 'Northwind private program', '${P_PRIV}', 100, 9, 9),
      (13, 1, 'CT-1', 'Contoso device study', '${P_B}', 101, 9, 9),
      (20, 2, 'THEIRS-1', 'Their program', '${P_THEIRS}', 200, 9, 9);
    INSERT INTO project_visibility_settings VALUES
      (1, 10, 'org_public'), (1, 11, 'org_public'), (1, 12, 'private'), (1, 13, 'org_public'), (2, 20, 'org_public');
    INSERT INTO project_members VALUES (1, 12, 9, 'owner', 'active');

    INSERT INTO concept2cure_artifacts (artifact_id, organization_id, project_id, title, updated_at) VALUES
      ('a-a1',     1, 10, 'Northwind clinical overview memo', now() - interval '1 hour'),
      ('a-a2',     1, 11, 'Northwind protocol memo',          now() - interval '2 hours'),
      ('a-b',      1, 13, 'Contoso device memo',              now() - interval '3 hours'),
      ('a-priv',   1, 12, 'Private memo',                     now() - interval '4 hours'),
      ('a-theirs', 2, 20, 'Their memo',                       now() - interval '5 hours');
    UPDATE concept2cure_artifacts SET ctd_section = '3.2.S.1' WHERE artifact_id IN ('a-a1', 'a-b', 'a-priv');
    INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash)
      SELECT a.id, a.organization_id, v, 'line ' || v, 'h' || v FROM concept2cure_artifacts a, generate_series(1, 2) v;

    INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, title, updated_at) VALUES
      ('doc_a1',   1, '${P_A1}',   'ind', 'fda', 'Northwind IND',      now() - interval '1 hour'),
      ('doc_b',    1, '${P_B}',    'k510', 'fda', 'Contoso 510(k)',    now() - interval '2 hours'),
      ('doc_priv', 1, '${P_PRIV}', 'ind', 'fda', 'Private IND',        now() - interval '3 hours'),
      ('doc_them', 2, '${P_THEIRS}', 'ind', 'fda', 'Their IND',        now() - interval '4 hours');
    INSERT INTO c2c_document_sections VALUES
      ('doc_a1', '2.5', NULL, 'Clinical overview', 'drafted', true, 1, 1, '{"text":"A"}'),
      ('doc_b', '2.5', NULL, 'Clinical overview', 'drafted', true, 1, 1, '{"text":"B"}'),
      ('doc_priv', '2.5', NULL, 'Clinical overview', 'drafted', true, 1, 1, '{"text":"P"}');

    -- A study's trial master file, on the deployed store (eTMF convergence E4 step 2): a Northwind study with a filing
    -- against a Vault document, a declaration that a record does not apply and a removed filing; a Contoso study; a
    -- study of the private project. The columns the search and the study list read.
    CREATE TABLE cdisc_prm_studies (id serial PRIMARY KEY, tenant_id integer NOT NULL, study_id text NOT NULL,
      program_id uuid, protocol_title text);
    CREATE TABLE tmf_artifact_filings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer NOT NULL,
      trial_id text NOT NULL, artifact_code text NOT NULL, zone_number integer, document_ref text, created_by integer,
      filed_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), study_ref integer,
      removed_at timestamptz, removed_by integer, removal_reason text, not_applicable_reason text);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, program_id uuid, organization_id integer,
      document_title text, file_name text, deleted_at timestamptz);
    INSERT INTO cdisc_prm_studies (id, tenant_id, study_id, program_id, protocol_title) VALUES
      (1, 1, 'NW-101', '${P_A1}', 'Northwind phase 2'),
      (2, 1, 'CT-201', '${P_B}', 'Contoso pivotal'),
      (3, 1, 'NW-PRIV-1', '${P_PRIV}', 'Private study');
    INSERT INTO vault.documents (id, program_id, organization_id, document_title, file_name) VALUES
      ('d0000000-0000-4000-8000-000000000001', '${P_A1}', 1, 'Northwind monitoring plan v2', 'mp.pdf');
    INSERT INTO tmf_artifact_filings (organization_id, trial_id, artifact_code, zone_number, document_ref, study_ref,
        not_applicable_reason, removed_at, removal_reason) VALUES
      (1, 'NW-101', 'monitoring_plan', 1, 'vault://d0000000-0000-4000-8000-000000000001', 1, NULL, NULL, NULL),
      (1, 'NW-101', 'tmf_plan', 1, NULL, 1, 'Covered by the sponsor-level plan.', NULL, NULL),
      (1, 'NW-101', 'sample_crf', 2, 'doc-ref', 1, NULL, now(), 'Filed against the wrong study.'),
      (1, 'CT-201', 'monitoring_plan', 1, NULL, 2, NULL, NULL, NULL),
      (1, 'NW-PRIV-1', 'monitoring_plan', 1, NULL, 3, NULL, NULL, NULL);
`;
