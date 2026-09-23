/**
 * Shared fixture for the AnA document-canvas server tests (WM, 2026-09-21):
 * the FK prerequisites the authoring migrations need, a program with a
 * governed filing, the vault store, and the HTTP/JWT plumbing the router's own
 * middleware expects. Each test file keeps its OWN migration list (the
 * migration-list-closure contract scans test files for those literals; a list
 * hidden in a helper would dodge it).
 *
 * Not a test file: nothing here runs on its own.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

export const JWT_SECRET = 'authoring-canvas-secret-0921';
process.env.JWT_SECRET = JWT_SECRET;
// The router verifies via verifyJwtWithRotation, which in test env reads
// JWT_SECRET_DEV ?? JWT_SECRET; pin both so the token this file signs verifies.
process.env.JWT_SECRET_DEV = JWT_SECRET;

export const ORG = 1;
export const OTHER_ORG = 2;
export const AUTHOR = { id: '3', organizationId: ORG, email: 'author@canvas.example', name: 'Avery Author' };
/** A token with a subject but NO organization claim — the 403 case. */
export const TENANTLESS = { id: '5', email: 'nobody@canvas.example', name: 'No Tenant' };

export const PROGRAM = '11111111-1111-4111-8111-111111111111';
/** A second program in the SAME org whose filing nothing has claimed yet. */
export const PROGRAM_B = '33333333-3333-4333-8333-333333333333';
export const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
export const FILING = 'doc_ind_11111111';
export const FILING_B = 'doc_ind_33333333';
/** `drug` → the pharma vault view, whose folders are the CTD modules (module-1 … module-5). */
export const PRODUCT_TYPE = 'drug';

/**
 * FK prerequisites. `users.id` is a serial and `organization_users.user_id` an
 * integer, as production has them; the program carries the class the governed
 * binding resolves (ind + FDA → an IND filing) and the product type the vault
 * view derives its CTD folders from.
 */
export const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT, uuid UUID NOT NULL DEFAULT gen_random_uuid());
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  CREATE TABLE regulatory_programs (
    id UUID PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    name TEXT,
    program_type TEXT,
    primary_agency TEXT,
    product_type TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE projects (id SERIAL PRIMARY KEY, organization_id INTEGER, name TEXT, regulatory_program_id UUID);
  -- doc_type / agency are the resolver's own codes (document-class.ts: ind → 'ind', FDA → 'fda').
  CREATE TABLE c2c_documents (
    id TEXT PRIMARY KEY, project_id UUID, org_id INTEGER, doc_type TEXT, agency TEXT, title TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ${AUDIT_LOGS_PGLITE_DDL}
  INSERT INTO organizations (id, name) VALUES (${ORG}, 'canvas-org'), (${OTHER_ORG}, 'other-org');
  INSERT INTO users (id, name, email) VALUES (${AUTHOR.id}, '${AUTHOR.name}', '${AUTHOR.email}'), (${TENANTLESS.id}, '${TENANTLESS.name}', '${TENANTLESS.email}');
  INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${AUTHOR.id}, 'member');
  INSERT INTO regulatory_programs (id, organization_id, name, program_type, primary_agency, product_type)
    VALUES ('${PROGRAM}', ${ORG}, 'C2C-001 IND', 'ind', 'FDA', '${PRODUCT_TYPE}'),
           ('${PROGRAM_B}', ${ORG}, 'C2C-002 IND', 'ind', 'FDA', '${PRODUCT_TYPE}'),
           ('${OTHER_PROGRAM}', ${OTHER_ORG}, 'Other org program', 'ind', 'FDA', '${PRODUCT_TYPE}');
  INSERT INTO projects (id, organization_id, name, regulatory_program_id) VALUES (42, ${ORG}, 'legacy anchor', '${PROGRAM}');
  INSERT INTO c2c_documents (id, project_id, org_id, doc_type, agency, title)
    VALUES ('${FILING}', '${PROGRAM}', ${ORG}, 'ind', 'fda', 'IND filing'),
           ('${FILING_B}', '${PROGRAM_B}', ${ORG}, 'ind', 'fda', 'IND filing B');
`;

/** The vault store as the ingest INSERT and the placement UPDATE write it. */
export const VAULT_DDL = `
  CREATE SCHEMA IF NOT EXISTS vault;
  CREATE TABLE vault.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    organization_id INTEGER,
    document_code TEXT NOT NULL,
    document_title TEXT NOT NULL,
    document_type TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0',
    s3_bucket TEXT, s3_key TEXT, storage_version_id TEXT, storage_provider TEXT,
    file_name TEXT, file_size BIGINT, mime_type TEXT,
    content_hash TEXT NOT NULL,
    classification TEXT DEFAULT 'INTERNAL',
    retention_policy TEXT, parent_document_id UUID, supersedes_id UUID,
    extracted_text TEXT, page_count INTEGER, word_count INTEGER,
    folder_id TEXT, evidence_kind TEXT, ctd_section TEXT,
    placement_status TEXT NOT NULL DEFAULT 'unfiled',
    placement_confidence TEXT, placement_rationale TEXT,
    placed_by INTEGER, placed_at TIMESTAMPTZ,
    processing_status TEXT DEFAULT 'PENDING',
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (program_id, document_code, version)
  );
  CREATE UNIQUE INDEX idx_vault_documents_program_hash_unique ON vault.documents (program_id, content_hash);
`;

export async function mint(u: { id: string; organizationId?: number; email: string; name: string }): Promise<string> {
  return new SignJWT({
    userId: u.id,
    email: u.email,
    name: u.name,
    ...(u.organizationId != null ? { organizationId: u.organizationId, tenant_id: u.organizationId } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

export function makeApp(router: express.Router): express.Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  // No auth shim: the router's OWN jose middleware verifies the token.
  app.use('/api/authoring', router);
  return app;
}

export const asToken = (token: string) => (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

/** A three-section Module 2.5 excerpt, the shape AnA drafts. */
export const M25_SECTIONS = [
  { code: '2.5.1', title: 'Product Development Rationale', content: '<p>C2C-001 is a selective inhibitor developed for moderate-to-severe disease.</p>' },
  { code: '2.5.2', title: 'Overview of Biopharmaceutics', content: '<p>Oral bioavailability was <strong>62%</strong> across two formulations.</p><ul><li>Fasted</li><li>Fed</li></ul>' },
  { code: '2.5.3', title: 'Overview of Clinical Pharmacology', content: '<p>Exposure increased dose-proportionally from 10 to 80 mg.</p>' },
];
