/**
 * The schema ana-governed-command-signature.pglite.integration.test.ts builds,
 * split out of it unchanged (2026-11-09, RULE 6: split, don't add) when P-95 Q2
 * gave it a case and the suite was at the 500-line limit.
 */
import fs from 'node:fs';
import path from 'node:path';

// electronic_signatures in its pre-D6 physical shape, then the REAL D6
// migration on top (as governed-sign-esignature.pglite.integration.test.ts).
export const ELECTRONIC_SIGNATURES_PRE_D6_DDL = `
CREATE TABLE electronic_signatures (
  id serial PRIMARY KEY, document_id integer NOT NULL, version_id integer NOT NULL,
  signature_type varchar(50) NOT NULL, signature_purpose text NOT NULL, signature_level integer DEFAULT 1,
  signer_id integer NOT NULL, signer_name text NOT NULL, signer_title text, signer_email text NOT NULL,
  authentication_method varchar(50) NOT NULL, authentication_timestamp timestamp NOT NULL,
  second_factor_verified boolean DEFAULT false, signature_hash varchar(256) NOT NULL,
  signature_meaning text, signature_manifest json, is_valid boolean DEFAULT true,
  verification_status varchar(50), verification_date timestamp, compliance_statement text,
  legal_disclaimer text, ip_address varchar(45), device_info json,
  signed_at timestamp DEFAULT now() NOT NULL, created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now(), organization_id integer,
  bound_payload_digest text NOT NULL DEFAULT '', superseded_by integer
);`;
export const D6_MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../../../migrations/20260813d_esignature_governed_unification.sql'),
  'utf8',
);
// concept2cure_thread_comments as migrations/phase13_review_threads_tasks.sql
// declares it, less the FKs whose referents are out of scope.
export const THREAD_COMMENTS_DDL = `
CREATE TABLE concept2cure_thread_comments (
  id SERIAL PRIMARY KEY, comment_id TEXT NOT NULL UNIQUE, org_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL, artifact_id INTEGER NOT NULL, version_id INTEGER, parent_comment_id INTEGER,
  author_id INTEGER NOT NULL, author_name TEXT NOT NULL, author_role TEXT, body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'comment', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), edited_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
);`;
export const BASE_DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text, settings jsonb DEFAULT '{}'::jsonb);
CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text);
-- The project-membership check (PF-03) reads programs and projects as one; a
-- package's integer project matches only the projects arm.
CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamp);
`;
