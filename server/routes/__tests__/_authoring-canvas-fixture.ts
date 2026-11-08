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
import { randomUUID } from 'node:crypto';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';
import { runWithTenantScope } from '../../db/tenantStore';
import { describe, it, expect } from 'vitest';
import { writeAuthoringAuditTrail } from '../../services/authoring/authoring-evidence';
import { assertIndependentCheckRelease } from '../../services/authoring/workflow-import-governance';
import { evaluateSavedIndependentCheck } from '../../services/ana/saved-document-critique';
import * as independentReviewServices from '../../services/authoring/peer-review';

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
    indication TEXT,
    metadata JSON,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE projects (id SERIAL PRIMARY KEY, organization_id INTEGER, name TEXT, regulatory_program_id UUID);
  CREATE TABLE project_charters (id SERIAL PRIMARY KEY, organization_id INTEGER, project_id INTEGER,
    version INTEGER, updated_at TIMESTAMPTZ, approval_status TEXT, therapeutic_area TEXT,
    development_stage TEXT, target_population TEXT);
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

/** Canonical project access prerequisites for services that read/write drafts.
 * Other authoring fixtures opt in; no private permission is inferred. */
export const AUTHORING_ACCESS_DDL = `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
  ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_workspace_id integer;
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planning';
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id integer;
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_id integer;
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';
  CREATE TABLE IF NOT EXISTS project_visibility_settings (project_id integer, organization_id integer, visibility text);
  CREATE TABLE IF NOT EXISTS project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
  CREATE TABLE IF NOT EXISTS concept2cure_artifacts (id integer PRIMARY KEY, organization_id integer, project_id integer);
  CREATE TABLE IF NOT EXISTS concept2cure_review_assignments (id serial PRIMARY KEY, artifact_id integer, organization_id integer, reviewer_id integer, status text);
  INSERT INTO projects (id,organization_id,name,regulatory_program_id) VALUES (43,${ORG},'second anchor','${PROGRAM_B}') ON CONFLICT DO NOTHING;
  UPDATE projects SET owner_id=${AUTHOR.id},created_by_id=${AUTHOR.id};
  INSERT INTO project_visibility_settings VALUES (42,${ORG},'org_public'),(43,${ORG},'org_public');
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
    -- The version a restore holds the bytes of (migrations/20261029_vault_documents_restored_from.sql).
    restored_from_id UUID,
    -- The retention clock the ingest starts at admission (P1-22; ADR-0014 §6):
    -- the organisation's period, else 25 years, never earlier than a named policy.
    retention_until DATE,
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
  -- The policies the ingest reads the retention days from (the columns it
  -- reads, from migrations/20260608_vault_retention.sql). Empty here: a document
  -- that names no policy, or an unknown one, is dated by the organisation period.
  CREATE TABLE vault.retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name TEXT NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
  );
  -- The organisation's own retention period the ingest reads (ADR-0014 §6; the
  -- columns it reads, from migrations/20261001_organization_retention_settings.sql).
  -- Empty here: every document is dated by the 25-year default.
  CREATE TABLE organization_retention_settings (
    organization_id INTEGER NOT NULL UNIQUE,
    retention_years INTEGER NOT NULL
  );
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

export function makeApp(router: express.Router, opts: { role?: string; dbClient?: { query: (...args: never[]) => unknown } } = {}): express.Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  /* The request's database client, as production binds it (requestDbLease.ts
     bindRequestDbClient). Routes that read through requestPgClient refuse
     without one, so a test that reaches them passes its database here. */
  if (opts.dbClient) {
    const dbClient = opts.dbClient;
    app.use((req, _res, next) => { (req as unknown as { dbClient: unknown }).dbClient = dbClient; next(); });
  }
  /* The request's tenant scope, as production opens it: the global /api gate
     (server/bootstrap/register-platform-routes.ts) runs authMiddleware ahead of
     this router, which scopes the request with the caller's organization_users
     role. The Vault write services read that role. 'member' is the role PREREQ
     gives AUTHOR. */
  app.use((_req, _res, next) =>
    runWithTenantScope(
      { tenantId: String(ORG), role: opts.role ?? 'member', source: 'request', caller: 'authoring-canvas-fixture' },
      next,
    ),
  );
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


/** Reusable real-ledger acceptance checks, driven by each canonical Authoring
 * fixture's own migrations and actor/HTTP setup. No provider or policy bypass. */
export function registerIndependentFindingAcceptance(deps: {
  connection: () => import('../../db/requestDb').RequestConnectable;
  document: () => Promise<{ id: string; sections: string[] }>;
  grant: (id: string) => Promise<unknown>;
  requestReview: (id: string) => Promise<unknown>;
  read: (id: string, actorId?: string) => Promise<Awaited<ReturnType<typeof independentReviewServices.readAuthoringPeerReviews>>>;
  expected: (id: string) => Promise<import('../../../shared/authoring/peer-review').AuthoringReviewExpected>;
  submit: (id: string, body: import('../../../shared/authoring/peer-review').AuthoringReviewInput) => Promise<unknown>;
  reviewerId: string;
}) {
  const { document, grant, requestReview, read, expected, submit } = deps;
  const REVIEWER = deps.reviewerId;
  const connection: import('../../db/requestDb').RequestConnectable = {
    query: (sql, args) => deps.connection().query(sql, args), connect: () => deps.connection().connect(),
  };
  const service = independentReviewServices;
  const audit = { ipAddress: '127.0.0.1', userAgent: 'independent-check-acceptance' };
  const rows = async (sql: string, args?: unknown[]) => (await connection.query(sql, args)).rows;
  type SavedDocument = { id: string; sections: string[] };
async function requireIndependent(doc: SavedDocument) {
  await connection.query('UPDATE authoring_sections SET content=$1 WHERE doc_id=$2', ['The protocol specified the study procedures.', doc.id]);
  await recordIndependentAnaGenesis(connection, doc.id, doc.sections[0]);
}
async function independentSubject(documentId: string) {
  const current = await read(documentId);
  const [doc] = await rows('SELECT * FROM authoring_documents WHERE id=$1', [documentId]);
  return { organizationId: ORG, doc: { ...doc, id: documentId }, sections: current.reviewContext.snapshot.sections,
    actor: { id: REVIEWER, email: 'reviewer@review.example' } };
}
async function runChecks(documentId: string, actorId = REVIEWER) {
  const current = await read(documentId, actorId);
  return service.runAuthoringIndependentCheck(connection, { tenantId: ORG, actorId, documentId,
    expectedSnapshotHash: current.reviewContext.snapshotHash }, audit);
}
registerIndependentProofFailureCases({ connection, document, requireIndependent, requestReview, independentSubject });
registerIndependentAuditFailureCase({ connection, document, requireIndependent, read });

describe('durable deterministic checks and explicit human finding decisions', () => {
  it('refuses an empty document without recording a favorable independent receipt', async () => {
    const doc = await document(); await requireIndependent(doc); await grant(doc.id);
    await connection.query('DELETE FROM authoring_sections WHERE doc_id=$1', [doc.id]);
    await expect(runChecks(doc.id)).rejects.toThrow(/empty/);
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='INDEPENDENT_CHECK_RECORDED'", [doc.id])).toHaveLength(0);
    await expect(assertIndependentCheckRelease(connection, await independentSubject(doc.id))).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
  });
  it('requires an independent receipt from immutable AnA genesis, while manual legacy records retain their path', async () => {
    const manual = await document(); await requestReview(manual.id);
    await expect(assertIndependentCheckRelease(connection, await independentSubject(manual.id))).resolves.toBeUndefined();
    const doc = await document(); await requireIndependent(doc); await grant(doc.id);
    expect((await read(doc.id)).reviewContext.independentCheck).toMatchObject({ standing: 'missing', receiptId: null });
    await expect(assertIndependentCheckRelease(connection, await independentSubject(doc.id))).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
    await requestReview(doc.id);
    expect((await read(doc.id)).reviewContext.independentCheck).toMatchObject({ standing: 'current', semanticVerified: false });
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='INDEPENDENT_CHECK_RECORDED'", [doc.id])).toHaveLength(1);
  });

  it('retains a hard finding until a real rerun removes it and the assigned independent reviewer explicitly closes it', async () => {
    const doc = await document(); await requireIndependent(doc);
    await connection.query("UPDATE authoring_sections SET content='' WHERE id=$1", [doc.sections[0]]);
    await requestReview(doc.id);
    const first = (await read(doc.id)).reviewContext.independentCheck!;
    const hard = first.findings.find(f => f.hard)!;
    expect(first.hardBlockCount).toBeGreaterThan(0);
    await expect(assertIndependentCheckRelease(connection, await independentSubject(doc.id))).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
    await expect(submit(doc.id, { review_status: 'approved', expected: await expected(doc.id), independent_findings: {
      receiptId: first.receiptId!, snapshotHash: first.snapshotHash, dispositions: [{ findingId: hard.findingId, decision: 'resolved', reason: 'The model says that this is now supported.' }],
    } })).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
    await connection.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', ['The protocol specified the study procedures.', doc.sections[0]]);
    expect((await read(doc.id)).reviewContext.independentCheck!.standing).toBe('stale');
    const checked = (await runChecks(doc.id)).independentCheck;
    expect(checked.hardBlockCount).toBeGreaterThan(0); // corrected content does not erase an open historical finding
    await submit(doc.id, { review_status: 'approved', expected: await expected(doc.id), independent_findings: {
      receiptId: checked.receiptId!, snapshotHash: checked.snapshotHash,
      dispositions: [{ findingId: hard.findingId, decision: 'resolved', reason: 'Read the corrected accepted section and the complete current check.' }],
    } });
    await expect(assertIndependentCheckRelease(connection, await independentSubject(doc.id))).resolves.toBeUndefined();
    const decisions = await rows("SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='INDEPENDENT_FINDING_REVIEW'", [doc.id]);
    expect(decisions[0]).toMatchObject({ metadata: { independentCheck: { dispositions: [{ findingId: hard.findingId, decision: 'resolved' }] } } });
    // A later recurrence is a new open obligation; an old resolution cannot clear it.
    await connection.query("UPDATE authoring_sections SET content='' WHERE id=$1", [doc.sections[0]]); await runChecks(doc.id);
    await connection.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', ['The protocol specified the study procedures.', doc.sections[0]]); await runChecks(doc.id);
    await expect(assertIndependentCheckRelease(connection, await independentSubject(doc.id))).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
  });

  it('records human disagreement without waiving a hard deterministic blocker', async () => {
    const doc = await document(); await requireIndependent(doc);
    await connection.query("UPDATE authoring_sections SET content='' WHERE id=$1", [doc.sections[0]]); await requestReview(doc.id);
    const current = (await read(doc.id)).reviewContext.independentCheck!;
    await submit(doc.id, { review_status: 'rejected', review_comments: 'The requested evidence remains incomplete.', expected: await expected(doc.id), independent_findings: {
      receiptId: current.receiptId!, snapshotHash: current.snapshotHash,
      dispositions: [{ findingId: current.findings.find(f => f.hard)!.findingId, decision: 'rejected', reason: 'The reviewer disagrees with this finding but has not corrected the record.' }],
    } });
    await expect(assertIndependentCheckRelease(connection, await independentSubject(doc.id))).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
  });

  it('refuses child authority and stale snapshots without writing a receipt', async () => {
    const doc = await document(); await requireIndependent(doc); await requestReview(doc.id);
    await expect(evaluateSavedIndependentCheck(connection, { organizationId: ORG, userId: Number(REVIEWER), projectRef: PROGRAM, agentDepth: 1 }, doc.id)).rejects.toThrow(/child/);
    const count = (await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='INDEPENDENT_CHECK_RECORDED'", [doc.id])).length;
    await expect(service.runAuthoringIndependentCheck(connection, { tenantId: ORG, actorId: REVIEWER, documentId: doc.id,
      expectedSnapshotHash: '0'.repeat(64) }, audit)).rejects.toMatchObject({ code: 'REVIEW_CHANGED' });
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='INDEPENDENT_CHECK_RECORDED'", [doc.id])).toHaveLength(count);
  });
});

}

function registerIndependentProofFailureCases(fixture: {
  connection: import('../../db/requestDb').RequestConnectable;
  document: () => Promise<{ id: string; sections: string[] }>;
  requireIndependent: (doc: { id: string; sections: string[] }) => Promise<void>;
  requestReview: (id: string) => Promise<unknown>;
  independentSubject: (id: string) => Promise<Parameters<typeof assertIndependentCheckRelease>[1]>;
}) {
  describe('immutable independent-check proof validation', () => {
    it.each(['metadata', 'chain-link', 'missing-receipt'] as const)('holds release for %s damage in the retained proof', async defect => {
      const doc = await fixture.document(); await fixture.requireIndependent(doc); await fixture.requestReview(doc.id);
      const subject = await fixture.independentSubject(doc.id);
      await expect(assertIndependentCheckRelease(fixture.connection, subject)).resolves.toBeUndefined();
      // Project a damaged read of the actual persisted rows; never disable the database's immutable-ledger guards.
      const damaged = { query: async (sql: string, args?: unknown[]) => {
        const result = await fixture.connection.query(sql, args);
        if (!sql.startsWith('WITH trails AS')) return result;
        const rows = JSON.parse(JSON.stringify(result.rows)) as Array<Record<string, any>>;
        const receipt = rows.find(row => row.operation_type === 'INDEPENDENT_CHECK_RECORDED')!;
        if (defect === 'metadata') receipt.metadata.independentCheck.checkerVersion = 'forged-checker';
        if (defect === 'chain-link') receipt.sha256_chain = '0'.repeat(64);
        return { ...result, rows: defect === 'missing-receipt' ? rows.filter(row => row !== receipt) : rows };
      } };
      await expect(assertIndependentCheckRelease(damaged, subject)).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
    });
  });
}

async function recordIndependentAnaGenesis(connection: import('../../db/requestDb').RequestConnectable, docId: string, sectionId: string) {
  const client = await connection.connect();
  try {
    await client.query('BEGIN');
    await writeAuthoringAuditTrail({ tenantId: ORG, actorId: AUTHOR.id, actorEmail: AUTHOR.email,
      actorRole: 'member', ipAddress: '127.0.0.1', userAgent: 'independent-check-fixture', pool: connection }, {
      docId, sectionId, operationType: 'CREATE', beforeContent: null, afterContent: null,
      changeReason: 'Server-recorded AnA draft genesis.', executor: client,
      metadata: { provenance: { source: 'ana' }, independentCheck: { required: true, version: 1 } },
    });
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

function registerIndependentAuditFailureCase(fixture: {
  connection: import('../../db/requestDb').RequestConnectable;
  document: () => Promise<{ id: string; sections: string[] }>;
  requireIndependent: (doc: { id: string; sections: string[] }) => Promise<void>;
  read: (id: string, actorId?: string) => Promise<Awaited<ReturnType<typeof independentReviewServices.readAuthoringPeerReviews>>>;
}) {
  it('rolls back the independent receipt and its initialization when the awaited chained audit fails', async () => {
    const doc = await fixture.document(); await fixture.requireIndependent(doc);
    const current = await fixture.read(doc.id, AUTHOR.id);
    const failed = { ...fixture.connection, connect: async () => {
      const client = await fixture.connection.connect();
      return { release: () => client.release(), query: async (sql: string, args?: unknown[]) => {
        if (/INSERT INTO audit_logs/.test(sql) && args?.includes('authoring.section.INDEPENDENT_CHECK_RECORDED')) throw new Error('fixture audit unavailable');
        return client.query(sql, args);
      } };
    } };
    await expect(independentReviewServices.runAuthoringIndependentCheck(failed, { tenantId: ORG, actorId: AUTHOR.id,
      documentId: doc.id, expectedSnapshotHash: current.reviewContext.snapshotHash }, { ipAddress: '127.0.0.1', userAgent: 'audit-failure-fixture' })).rejects.toThrow();
    expect((await fixture.connection.query("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type LIKE 'INDEPENDENT_CHECK_%'", [doc.id])).rows).toHaveLength(0);
    // tenant-isolation-safe: an assertion that NO audit row exists for this document; scoped to one tenant it would pass over a row written under the wrong one
    expect((await fixture.connection.query("SELECT 1 FROM audit_logs WHERE new_values->>'docId'=$1 AND action LIKE 'authoring.section.INDEPENDENT_CHECK_%'", [doc.id])).rows).toHaveLength(0);
  });
}

export function registerIndependentReviewHttpAcceptance(fixture: {
  app: () => express.Express;
  connection: () => import('../../db/requestDb').RequestConnectable;
  create: () => Promise<string>;
  reviewer: (req: request.Test) => request.Test;
  requestReview: (id: string) => Promise<request.Response>;
}) {
  const q = (sql: string, args?: unknown[]) => fixture.connection().query(sql, args);
  async function prepared() {
    const id = await fixture.create(), sectionId = randomUUID();
    await q(`INSERT INTO authoring_sections (id,doc_id,code,title,content,order_index,tenant_id)
      VALUES($1,$2,'2.5.1','Protocol','The protocol specified the study procedures.',0,$3)`, [sectionId, id, ORG]);
    await recordIndependentAnaGenesis(fixture.connection(), id, sectionId);
    const requested = await fixture.requestReview(id);
    expect(requested.status, JSON.stringify(requested.body)).toBe(200);
    return { id, sectionId };
  }
  const read = (id: string) => fixture.reviewer(request(fixture.app()).get(`/api/authoring/documents/${id}/reviews`));
  const check = (id: string, body: Record<string, unknown>) => fixture.reviewer(request(fixture.app()).post(`/api/authoring/documents/${id}/review`)).send({ action: 'run_independent_checks', ...body });
  describe('saved independent checks through the mounted native HTTP workflow', () => {
    it('runs the actual checker and exposes the authoritative receipt, without accepting caller findings or stale bytes', async () => {
      const doc = await prepared(), before = await read(doc.id);
      expect(before.body.reviewContext).toMatchObject({ canRunIndependentChecks: true, independentCheck: { standing: 'current', semanticVerified: false } });
      await q('UPDATE authoring_sections SET content=$1 WHERE id=$2', ['The protocol specified revised study procedures.', doc.sectionId]);
      const changed = await read(doc.id);
      expect(changed.body.reviewContext.independentCheck.standing).toBe('stale');
      expect((await check(doc.id, { expectedSnapshotHash: changed.body.reviewContext.snapshotHash, findings: [] })).status).toBe(400);
      expect((await check(doc.id, { expectedSnapshotHash: before.body.reviewContext.snapshotHash })).status).toBe(409);
      const checked = await check(doc.id, { expectedSnapshotHash: changed.body.reviewContext.snapshotHash });
      expect(checked.status, JSON.stringify(checked.body)).toBe(200);
      expect(checked.body.independentCheck).toMatchObject({ standing: 'current', snapshotHash: changed.body.reviewContext.snapshotHash, semanticVerified: false });
      expect((await read(doc.id)).body.reviewContext.independentCheck.receiptId).toBe(checked.body.independentCheck.receiptId);
      expect(checked.body.independentCheck.receiptId).not.toBe(before.body.reviewContext.independentCheck.receiptId);
    });
    it.each(['freeze', 'e-sign'])('holds /%s before credential verification or signature writes when the saved proof is stale', async action => {
      const doc = await prepared();
      await q('UPDATE authoring_sections SET content=$1 WHERE id=$2', ['The saved content changed after checking.', doc.sectionId]);
      const response = await fixture.reviewer(request(fixture.app()).post(`/api/authoring/docs/${doc.id}/${action}`)).send({
        password: 'deliberately-wrong', meaning: 'REVIEWER', intent: 'I reviewed the current complete document.', reason: 'Review the complete saved document before release.' });
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      expect(response.body.code).toBe('INDEPENDENT_CHECK_REQUIRED');
      expect((await q('SELECT 1 FROM authoring_signatures WHERE doc_id=$1', [doc.id])).rows).toHaveLength(0);
      expect((await q('SELECT status,frozen_at FROM authoring_documents WHERE id=$1', [doc.id])).rows[0]).toMatchObject({ status: 'draft', frozen_at: null });
    });
  });
}
