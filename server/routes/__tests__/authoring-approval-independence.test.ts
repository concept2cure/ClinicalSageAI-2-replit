/**
 * An author may not approve their own Authoring document (21 CFR 11.10(g),
 * separation of duties; ICH E6 for the sponsor's CSR sign-off).
 *
 * POST /docs/:docId/e-sign with meaning APPROVER approves and freezes the
 * document, and POST /docs/:docId/sign can seal it at the last workflow step.
 * Both checked the signer's org role, the document grant and the password, and
 * never whether the signer wrote the document — and the creator is granted
 * `approve` on it. So an author with an approver role could approve their own
 * CSR, and the approval moved its bound filing sections to `approved`
 * (Part 11 audit of the CSR path, 2026-10-29). Independence was checked only
 * later, at Vault carry-over.
 *
 * Both now ask the one separation-of-duties check the governed ceremony asks
 * (services/governance/separation-of-duties.ts assertSignerIsNotAuthor), for
 * every meaning but AUTHOR, before re-authentication — so a refused signer
 * spends no second factor and nothing is signed.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const clientQuery = vi.fn();
  return {
    poolQuery: vi.fn(),
    clientQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release: () => undefined })),
    comparePassword: vi.fn(async (plain: string) => plain === 'right-password'),
    authorship: {
      creator: 9 as number | null,
      revisionAuthors: [] as number[],
      lookupFails: false,
    },
    /** One /submit workflow step, the signer's, which this signature clears. */
    workflow: false,
  };
});

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() },
  getPool: () => ({ query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() }),
  query: (...a: unknown[]) => h.poolQuery(...a),
  db: {},
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
  writeChainedAuditRow: vi.fn(async () => {}),
}));
vi.mock('../../services/part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: vi.fn(async () => 'approver'),
}));
vi.mock('../../middleware/orgMembership', async (orig) => ({
  ...(await orig<typeof import('../../middleware/orgMembership')>()),
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateOrgMembershipCache: () => undefined,
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: (plain: string) => h.comparePassword(plain),
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-approval-independence';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SIGNER = 7;
const SECTION = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

async function bearer(roles: string[] = ['approver']): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({
    userId: String(SIGNER), id: String(SIGNER), sub: String(SIGNER), email: 'approver@test.co', organizationId: '3',
    role: 'approver', roles, type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

const sql = () => h.clientQuery.mock.calls.map((c) => String(c[0]));
const wrote = (re: RegExp) => sql().some((s) => re.test(s));

beforeEach(() => {
  vi.clearAllMocks();
  h.authorship = { creator: 9, revisionAuthors: [], lookupFails: false };
  h.workflow = false;
  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: () => undefined }));
  h.clientQuery.mockImplementation(async (text: string, params?: unknown[]) => workflowAnswer(String(text)) ?? clientAnswer(text, params));
  h.poolQuery.mockImplementation(async (text: string) => {
    const s = String(text);
    if (s.includes('organization_users')) return { rowCount: 1, rows: [{ role: 'approver', organization_id: 3, user_id: SIGNER }] };
    if (/SELECT 1 FROM authoring_documents/i.test(s)) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    if (/SELECT name FROM users/i.test(s)) return { rowCount: 1, rows: [{ name: 'Ava Approver' }] };
    if (/SELECT code, content FROM authoring_sections/i.test(s)) return { rowCount: 1, rows: [{ code: '9', content: '<p>body</p>' }] };
    if (/FROM frozen_documents/i.test(s)) return { rowCount: 0, rows: [] };
    return { rowCount: 0, rows: [] };
  });
});

/** One /submit step, the signer's, answered while `h.workflow` is set. */
function workflowAnswer(s: string) {
  if (!h.workflow) return null;
  if (/UPDATE authoring_workflow_steps/i.test(s)) return { rowCount: 1, rows: [{ id: 1 }] };
  return /COUNT\(\*\)[\s\S]*FROM authoring_workflow_steps/i.test(s) ? { rowCount: 1, rows: [{ pending: 0, total: 1 }] } : null;
}

async function clientAnswer(text: string, params?: unknown[]) {
  const s = String(text);
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return {};
  // The separation-of-duties authorship reads (separation-of-duties.ts authoringDocumentAuthors).
  if (/SELECT d\.created_by FROM authoring_documents/i.test(s)) {
    if (h.authorship.lookupFails) throw Object.assign(new Error('relation "authoring_documents" is locked'), { code: '55P03' });
    return h.authorship.creator === null ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ created_by: h.authorship.creator }] };
  }
  if (/FROM doc_revisions/i.test(s)) {
    return { rowCount: h.authorship.revisionAuthors.length, rows: h.authorship.revisionAuthors.map((id) => ({ created_by: id })) };
  }
  // Not a CSR: the release gate's retained-requirement question answers false.
  if (/SELECT EXISTS[\s\S]*authoring_audit_trail/i.test(s)) return { rowCount: 1, rows: [{ required: false }] };
  if (/FROM authoring_audit_trail/i.test(s)) return { rowCount: 0, rows: [] };
  if (/INSERT INTO frozen_documents/i.test(s)) {
    return { rowCount: 1, rows: [{ version: 'approved', content_hash: (params ?? [])[3] }] };
  }
  if (/FROM frozen_documents/i.test(s)) return { rowCount: 0, rows: [] };
  if (/SELECT d\.\*/i.test(s) || /SELECT \* FROM authoring_documents/i.test(s)) {
    return { rowCount: 1, rows: [{ id: DOC, title: 'LMN-201 RePreve interim report', status: 'DRAFT', tenant_id: 3, created_by: h.authorship.creator }] };
  }
  if (/FROM authoring_sections/i.test(s)) {
    return { rowCount: 1, rows: [{ id: SECTION, doc_id: DOC, code: '9', title: 'Investigational plan', content: '<p>body</p>', order_index: 100 }] };
  }
  // Any other read finds nothing (no prior CSR receipt, no workflow, no filing
  // binding); any write succeeds.
  if (/^\s*(SELECT|WITH)\b/i.test(s)) return { rowCount: 0, rows: [] };
  return { rowCount: 1, rows: [{}] };
}

async function eSign(meaning: 'AUTHOR' | 'REVIEWER' | 'APPROVER') {
  return request(makeApp())
    .post(`/api/authoring/docs/${DOC}/e-sign`)
    .set('Authorization', await bearer())
    .send({ password: 'right-password', meaning, intent: 'I approve this document as written' });
}

describe('POST /docs/:docId/e-sign APPROVER is refused to an author of the document', () => {
  it('the creator is refused, nothing is signed or approved, and no re-authentication is spent', async () => {
    h.authorship.creator = SIGNER;
    const res = await eSign('APPROVER');
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code).toBe('SEPARATION_OF_DUTIES');
    expect(res.body.error).toMatch(/author of this record/);
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
    expect(wrote(/UPDATE authoring_documents/i)).toBe(false);
    expect(h.comparePassword).not.toHaveBeenCalled();
  });

  it('a contributor to a section is an author too', async () => {
    h.authorship.revisionAuthors = [SIGNER];
    const res = await eSign('APPROVER');
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
  });

  it('an independent approver approves as before', async () => {
    const res = await eSign('APPROVER');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(true);
  });

  it('a document with no recorded author cannot be shown independent: 409, nothing signed', async () => {
    h.authorship.creator = null;
    const res = await eSign('APPROVER');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('SEPARATION_OF_DUTIES_AUTHOR_UNRESOLVED');
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
  });

  it('an authorship lookup that fails is 503, in the canonical sentence, not the driver text', async () => {
    h.authorship.lookupFails = true;
    const res = await eSign('APPROVER');
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.code).toBe('SEPARATION_OF_DUTIES_UNVERIFIED');
    expect(JSON.stringify(res.body)).not.toMatch(/relation|locked|55P03/);
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
  });

  it('the author signing as AUTHOR is not a separation-of-duties case', async () => {
    h.authorship.creator = SIGNER;
    const res = await eSign('AUTHOR');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe('POST /docs/:docId/sign, which can seal at the last workflow step, is refused to an author too', () => {
  it('the creator signing as REVIEWER is refused, and nothing is signed', async () => {
    h.authorship.creator = SIGNER;
    const res = await request(makeApp())
      .post(`/api/authoring/docs/${DOC}/sign`)
      .set('Authorization', await bearer())
      .send({ password: 'right-password', meaning: 'REVIEWER', reason: 'Reviewed against the source tables' });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code).toBe('SEPARATION_OF_DUTIES');
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
    expect(h.comparePassword).not.toHaveBeenCalled();
  });
});

/**
 * 2026-10-30 (the CSR path sweep): only an approval signature approves.
 * /sign approved and froze the document at the last workflow step whatever the
 * signature meant. A signer with the QA role who wrote the CSR could sign it
 * with meaning AUTHOR, which skips the separation-of-duties check, clear their
 * own step and leave the document APPROVED and frozen, its only signature
 * reading "Authorship". A REVIEWER signature did the same with "Review". Now
 * neither decides an approval; an APPROVER signature, held to independence,
 * still does.
 */
describe('POST /docs/:docId/sign approves only on an APPROVER signature', () => {
  const sign = async (meaning: 'AUTHOR' | 'REVIEWER' | 'APPROVER') => request(makeApp())
    .post(`/api/authoring/docs/${DOC}/sign`)
    .set('Authorization', await bearer(['qa']))
    .send({ password: 'right-password', meaning, reason: 'Final CSR text as written' });
  // The document's approval, not a workflow step's own status.
  const documentApproved = () => wrote(/UPDATE authoring_documents\s+SET status = 'APPROVED'/);
  const approved = () => documentApproved() || wrote(/INSERT INTO frozen_documents/i);

  it('the author signing AUTHOR at the last step records authorship and approves nothing', async () => {
    h.workflow = true;
    h.authorship.creator = SIGNER;
    const res = await sign('AUTHOR');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(true);
    expect(approved()).toBe(false);
  });

  it('a reviewer signing REVIEWER at the last step records review and approves nothing', async () => {
    h.workflow = true;
    const res = await sign('REVIEWER');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(approved()).toBe(false);
  });

  it('an independent APPROVER at the last step approves and freezes, as before (control)', async () => {
    h.workflow = true;
    const res = await sign('APPROVER');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(documentApproved()).toBe(true);
    expect(wrote(/INSERT INTO frozen_documents/i)).toBe(true);
  });
});
