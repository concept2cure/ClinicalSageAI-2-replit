/**
 * A QMS approval signature asks whether the filing still holds this text.
 *
 * P-29.2, docs/EXIT_ATTESTATION_DECISION_2026-10-18.md. An exit attests to the
 * EDITING layer (`authoring_sections`); the filing (`c2c_document_sections`) is
 * a derived projection, and the guarantee a client is owed is that you cannot
 * seal, sign or ship a document whose filed copy is not the text you are
 * looking at.
 *
 * THE DOOR. `approveQmsDocumentSigned` writes its signature row and its
 * chained ledger pair, then stamps the bound editing copy:
 *
 *     UPDATE authoring_documents SET status = 'APPROVED', approved_at = NOW(),
 *            updated_at = NOW() WHERE id = $1 AND tenant_id = $2
 *
 * APPROVED is a sealing status (`LOCKED_DOCUMENT_STATUSES`), so after this the
 * text is sealed for filing and a §11.50 signature attests to it — with no
 * cross-store agreement check anywhere in the call. It was the fourth seal:
 * found by `ci:filing-exit-agreement` on its own first run, not by P-29 and not
 * by any dimension of the review behind it, and baselined as a DEFECT with its
 * reason rather than left silent.
 *
 * WHY IT IS NARROW, AND WHY IT IS STILL REAL. A QMS controlled document is
 * usually an internal procedure with no bound filing, and then
 * `filingAgreesWithEditing` answers "not bound to a filing" and the check costs
 * one query. But nothing REFUSES a QMS document from being bound to one, so the
 * door exists; the gate's job is to refuse a door that merely happens to be
 * unused today.
 *
 * WHAT IS MOCKED, AND WHY THAT IS NOT A DODGE. `filingAgreesWithEditing` is
 * stubbed so these cases drive the SEAM — does this door ask the question, and
 * does it refuse on the answer. Whether the question is answered correctly is
 * the business of the 54 cases in
 * `tests/schema-contract/authoring-section-commits-to-filing.contract.test.ts`,
 * which run it against a real filing store. Duplicating those here would test
 * the same thing twice and this thing not at all.
 */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
// RR4: a send names its review route; the route's own writer is proven against PostgreSQL
// (tests/db/review-route-qms-rr4.dbtest.ts), so here it is a stand-in and this suite keeps to its subject.
vi.mock('../qms-review-route', async (original) => ({
  ...(await original<typeof import('../qms-review-route')>()),
  sendQmsRoute: async () => ({ routeId: 'route-stand-in', notices: [] }),
}));
const QMS_ROUTE = { reviewers: [], approvers: [8], approvalDueDate: '2099-01-01' };

const h = vi.hoisted(() => ({ agreement: vi.fn(), persistSignature: vi.fn() }));

vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: async () => ({ actionId: 'action', auditId: 'audit', sha256Chain: 'chain' }) }));
vi.mock('../../c2c/document-alias-map', () => ({ recordDocumentAlias: async () => ({ recorded: true }), canonicalIdFor: async () => null, DocumentAliasConflictError: class extends Error {} }));
vi.mock('../../authoring/authoring-permissions', async (original) => ({
  ...await original<typeof import('../../authoring/authoring-permissions')>(), grantAuthoringPermission: async () => undefined,
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'admin' }));
vi.mock('../../authoring/authoring-evidence', async (original) => ({
  ...await original<typeof import('../../authoring/authoring-evidence')>(),
  writeAuthoringAuditTrail: async () => undefined,
  createRevision: async (q: { query: Function }, args: { sectionId: string; content: string; updatedBy: string; tenantId: number }) => {
    await q.query('INSERT INTO doc_revisions (section_id,content,created_by,tenant_id) VALUES ($1,$2,$3,$4)', [args.sectionId,args.content,args.updatedBy,args.tenantId]);
    return 'revision';
  },
}));
vi.mock('../../part11/signature-persistence', async (original) => ({
  ...await original<typeof import('../../part11/signature-persistence')>(),
  // Spied, not just stubbed: QmsApprovalRefusedError's contract says "Nothing
  // has been written when thrown", and the only way to hold the check to that
  // is to assert this was never reached.
  persistGovernedActionSignature: async (...args: unknown[]) => {
    h.persistSignature(...args);
    return { id: 51, signedAt: new Date('2026-10-14T12:00:00Z') };
  },
}));
// The seam under test. See the header on why this is stubbed rather than driven
// against a real filing store.
vi.mock('../../c2c/filing-section-target', () => ({
  filingAgreesWithEditing: (...args: unknown[]) => h.agreement(...args),
}));

import { createControlledQmsDocument, updateControlledQmsDocument } from '../controlled-document-service';
import { approveQmsDocumentSigned } from '../document-approval-signature';
import type { CreateContext } from '../../authoring/authoring-documents';
import { installQmsProgramAccessHarness } from './qms-authoring-harness';

const PID = '00000000-0000-4000-8000-000000000012';
let db: PGlite;
let ctx: CreateContext;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id int PRIMARY KEY); INSERT INTO organizations VALUES (9),(10);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz); INSERT INTO regulatory_programs VALUES ('${PID}',9,NULL);
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY,title text,module text,product_code text,locale text,status text,created_by text,created_at timestamptz,updated_at timestamptz,
      tenant_id int,template_id uuid,client_program_id uuid,approved_at timestamptz,frozen_at timestamptz,locked_at timestamptz,locked_by text,c2c_document_id uuid);
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY,doc_id uuid REFERENCES authoring_documents(id),code text,title text,content text,order_index int,created_at timestamptz,updated_at timestamptz,tenant_id int);
    CREATE TABLE doc_revisions (id serial,section_id uuid,content text,created_by text,tenant_id int);
    CREATE TABLE doc_permissions (tenant_id int,doc_id uuid,section_id uuid,principal_id text,email text,role text,
      revoked_at timestamptz,valid_from timestamptz DEFAULT NOW(),valid_until timestamptz);
    CREATE TABLE qms_documents (id serial PRIMARY KEY,organization_id int,doc_number text,title text,doc_type text,category text,version text,status text,
      author_id int,approver_id int,approved_at timestamptz,effective_date date,next_review_date date,artifact_id int,metadata jsonb DEFAULT '{}',updated_at timestamptz,deleted_at timestamptz);
    CREATE UNIQUE INDEX qms_numbers ON qms_documents(organization_id,doc_number);`);
  await installQmsProgramAccessHarness(db,9,3,PID);
  await db.exec(`INSERT INTO users VALUES (7,'active'),(8,'active'); INSERT INTO organization_users VALUES (9,7,'admin'),(9,8,'reviewer');
    INSERT INTO project_members VALUES (9,9,8,'use','active');`);
  await db.exec(await readFile('db/migrations/20261014_qms_controlled_authoring_content.sql','utf8'));
  const pool = { query: (sql: string, args?: unknown[]) => db.query(sql,args), connect: async () => ({ query: (sql: string, args?: unknown[]) => db.query(sql,args), release: () => undefined }) };
  ctx = { pool: pool as unknown as CreateContext['pool'], tenantId: 9, actor: { id: '3', email: null },
    audit: { pool, tenantId: 9, actorId: '3', actorEmail: 'unknown', actorRole: 'author', ipAddress: 'unknown', userAgent: 'test' } };
});
afterAll(async () => { await db?.close(); });

/** No divergence — the shape filingAgreesWithEditing returns for a clean doc. */
const AGREES = { documentId: 'c2c-1', diverged: [] };
/** The shape it returns for an unbound document: nothing to disagree with. */
const UNBOUND = { documentId: null, diverged: [] };
/** One section whose FILED copy is not the text the document holds. */
const DIVERGED = {
  documentId: 'c2c-1',
  diverged: [{ key: '2.5', filed: 'different', section: { id: 'sec-1', code: '2.5.1' } }],
};
/** A section the filing has no row for. Reported, but it does not block a seal. */
const UNFILED = {
  documentId: 'c2c-1',
  diverged: [{ key: '3.2.S', filed: 'empty', section: { id: 'sec-2', code: '3.2.S' } }],
};

let seq = 0;
const APPROVE = {
  orgId: 9, userId: 7, reason: 'Independently reviewed saved text', meaning: 'APPROVED' as const,
  effectiveDate: null, authenticationMethod: 'password' as const, secondFactorVerified: false, ipAddress: null,
};
const client = () => ({ query: (sql: string, args?: unknown[]) => db.query(sql, args) });

/**
 * An approvable controlled document with saved text.
 *
 * Routed through the real send-for-review transition rather than by forcing
 * the status: only a document under review can be approved
 * (`lockApprovableDocument`), and a fixture that wrote `in_review` directly
 * would approve a document that never passed the gate in front of it.
 */
async function approvable() {
  seq += 1;
  const row = await createControlledQmsDocument(ctx, {
    title: `Procedure ${seq}`, docType: 'sop', programId: PID, templateKey: 'sop',
    reason: `Create controlled procedure ${seq}`,
  });
  await db.query(`UPDATE authoring_sections SET content = '<p>Use verified document numbers.</p>' WHERE doc_id = $1`, [row.authoring_document_id]);
  await updateControlledQmsDocument(ctx, row.id, { status: 'in_review', reason: `Send procedure ${seq} for review`, route: QMS_ROUTE });
  return row;
}

const authoringStatus = async (docId: string) =>
  (await db.query<{ status: string }>('SELECT status FROM authoring_documents WHERE id = $1', [docId])).rows[0]?.status;
const signedVersions = async (id: number) =>
  (await db.query('SELECT * FROM qms_document_versions WHERE document_id = $1', [id])).rows.length;

beforeEach(() => {
  h.agreement.mockReset().mockResolvedValue(AGREES);
  h.persistSignature.mockReset();
});

describe('a QMS approval consults the filing before it seals', () => {
  it('asks the question, on the signing transaction and for the bound editing copy', async () => {
    const row = await approvable();
    await db.exec('BEGIN');
    await approveQmsDocumentSigned(client(), { ...APPROVE, documentId: row.id });
    await db.exec('COMMIT');
    expect(h.agreement, 'the seal must ask whether the filing holds this text').toHaveBeenCalled();
    expect(h.agreement.mock.calls[0]?.[1]).toMatchObject({ authoringDocId: row.authoring_document_id, tenantId: 9 });
  });

  it('refuses when the filed copy is not the text being approved, and seals nothing', async () => {
    const row = await approvable();
    h.agreement.mockResolvedValue(DIVERGED);
    await db.exec('BEGIN');
    await expect(
      approveQmsDocumentSigned(client(), { ...APPROVE, documentId: row.id }),
    ).rejects.toMatchObject({ code: 'FILING_DIVERGED' });

    /* Read INSIDE the still-open transaction, before the rollback.
       `QmsApprovalRefusedError` promises "Nothing has been written when
       thrown", and a rollback would make that look true however late the
       check ran — mutant P5 (the check moved after applyApproval) passed every
       other assertion in this file for exactly that reason. applyApproval
       stamps the register row, so the register row's status is what tells the
       two apart. */
    const inFlight = await db.query<{ status: string }>('SELECT status FROM qms_documents WHERE id = $1', [row.id]);
    expect(inFlight.rows[0].status, 'the refusal must come before the approval is applied').toBe('in_review');
    expect(h.persistSignature, 'and before the signature').not.toHaveBeenCalled();

    await db.exec('ROLLBACK');
    expect(await authoringStatus(row.authoring_document_id)).not.toBe('APPROVED');
    expect(await signedVersions(row.id)).toBe(0);
  });

  it('names the section the approver can open, not only the filing node', async () => {
    const row = await approvable();
    h.agreement.mockResolvedValue(DIVERGED);
    await db.exec('BEGIN');
    const err = await approveQmsDocumentSigned(client(), { ...APPROVE, documentId: row.id }).catch((e) => e);
    await db.exec('ROLLBACK');
    // '2.5' is an assembled node no authoring section carries, so a refusal
    // naming only the key sends the approver looking for a section that does
    // not exist. Same rule as the authoring router's refusal.
    expect(String(err.message)).toContain('2.5.1');
  });

  it('approves an unbound controlled document — the usual case — without complaint', async () => {
    const row = await approvable();
    h.agreement.mockResolvedValue(UNBOUND);
    await db.exec('BEGIN');
    await approveQmsDocumentSigned(client(), { ...APPROVE, documentId: row.id });
    await db.exec('COMMIT');
    expect(await authoringStatus(row.authoring_document_id)).toBe('APPROVED');
    expect(await signedVersions(row.id)).toBe(1);
  });

  it('does not block on a section the filing has no row for', async () => {
    /* `empty` is an unfiled section, not a rewritten one. The authoring router
       reports it and seals anyway; a second answer to the same question here
       would be the divergence this consolidation exists to prevent. */
    const row = await approvable();
    h.agreement.mockResolvedValue(UNFILED);
    await db.exec('BEGIN');
    await approveQmsDocumentSigned(client(), { ...APPROVE, documentId: row.id });
    await db.exec('COMMIT');
    expect(await authoringStatus(row.authoring_document_id)).toBe('APPROVED');
  });
});
