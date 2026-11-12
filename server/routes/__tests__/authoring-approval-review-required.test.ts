/**
 * P-95 on the one editor's document: a regulated document is not approved until its review is complete
 * (docs/LAUNCH_DEFINITION_OF_DONE.md P-95, clarified 2026-11-09).
 *
 * The editor's document is an authoring document. Its review is the RR5 route
 * (server/services/authoring/authoring-review-route.ts): "Send for review" names
 * the reviewers, and each signs REVIEWER over the sections digest. The route is
 * complete once every named reviewer has signed. The APPROVER signature, by
 * E-sign or by the workflow /sign, is refused with REVIEW_REQUIRED before the
 * credential unless that route is complete over the text being approved.
 * Whether the approver may also be a reviewer (P-95 question 1) and the
 * two-reviewer floor (question 2) land as later slices.
 *
 * The fake database answers the route reads the way review-route-standing.ts
 * asks them. Everything else is answered as the approval-seal suite answers it
 * (authoringApprovalSealBinding.test.ts), so a pass here is the real approval.
 */
import crypto from 'node:crypto';
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
    route: null as null | Record<string, unknown>,
    members: [] as Array<Record<string, unknown>>,
    /** The organisation's members and its settings, as the sole-member and review-rule reads see them (P-116, P-117). */
    orgMembers: [7, 12] as number[],
    settings: null as null | Record<string, unknown>,
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
vi.mock('../../middleware/orgMembership', () => ({
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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-approval-review-required';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';
import { DOC_ID, releaseGovernanceRead } from '../../services/authoring/__tests__/release-governance-reads';

const APPROVER_ID = 7;
const REVIEWER_ID = 12;
const SECTIONS = [{ id: 'S1', doc_id: DOC_ID, code: '2.5.1', title: 'Rationale', content: '<p>body</p>', order_index: 100 }];
/** sectionsDigest (authoring-content-digests.ts) over SECTIONS: the text being approved. */
const CURRENT = crypto.createHash('sha256').update(SECTIONS.map((s) => `${s.code}:${s.content}`).join('|||')).digest('hex');
const EARLIER = crypto.createHash('sha256').update('2.5.1:<p>an earlier draft</p>').digest('hex');

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({
    userId: String(APPROVER_ID), id: String(APPROVER_ID), sub: String(APPROVER_ID), email: 'approver@test.co',
    organizationId: '3', role: 'approver', roles: ['approver', 'QA'], type: 'access',
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

/** A review route's header row, as review_routes stores it. */
function routeRow(status: 'open' | 'complete' | 'withdrawn' | 'returned', digest = CURRENT): Record<string, unknown> {
  return {
    id: '5e5e5e5e-0000-4000-8000-000000000001', round: 1, sender_id: 9, sender_name: 'Avery Author', review_order: 'parallel',
    status, status_reason: null, status_by: null, status_at: null, content_digest: digest,
    review_due_at: null, approval_due_at: null, created_at: '2026-11-09T00:00:00.000Z',
  };
}

/** A named reviewer's member row; `signedOver` is the digest their REVIEWER signature binds, or null when they have not signed. */
function reviewer(userId: number, signedOver: string | null): Record<string, unknown> {
  return {
    route_id: '5e5e5e5e-0000-4000-8000-000000000001', task_id: `task-${userId}`, assignee_id: userId,
    assignee_name: `Reviewer ${userId}`, review_role: 'reviewer', review_step: 1, route_signature_id: null,
    route_act_id: null, due_date: null, act_command: null,
    asig_id: signedOver ? `asig-${userId}` : null, asig_doc_id: signedOver ? DOC_ID : null,
    asig_signer_name: signedOver ? `Reviewer ${userId}` : null, asig_meaning: signedOver ? 'REVIEWER' : null,
    asig_content_hash: signedOver, asig_signed_at: signedOver ? '2026-11-09T01:00:00.000Z' : null,
    asig_by_assignee: Boolean(signedOver),
  };
}

const clientSql = () => h.clientQuery.mock.calls.map((c) => String(c[0]));
const signed = () => clientSql().some((s) => /INSERT INTO authoring_signatures/i.test(s));
/** The status flip: the e-sign passes 'APPROVED' as a parameter, the workflow /sign writes it in the statement. */
const approved = () => h.clientQuery.mock.calls.some((c) => /UPDATE authoring_documents/i.test(String(c[0]))
  && (/'APPROVED'/.test(String(c[0])) || ((c[1] as unknown[] | undefined) ?? []).includes('APPROVED')));

beforeEach(() => {
  vi.clearAllMocks();
  h.route = null;
  h.members = [];
  h.orgMembers = [7, 12];
  h.settings = null;
  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: () => undefined }));
  h.clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const governance = releaseGovernanceRead(sql);
    if (governance) return governance;
    const s = String(sql);
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return {};
    if (/SELECT user_id FROM organization_users/i.test(s)) return { rowCount: h.orgMembers.length, rows: h.orgMembers.map((user_id) => ({ user_id })) };
    if (/AS settings FROM organizations/i.test(s)) return { rowCount: 1, rows: [{ settings: h.settings }] };
    if (/FROM review_routes/i.test(s)) return h.route ? { rowCount: 1, rows: [h.route] } : { rowCount: 0, rows: [] };
    if (/FROM unified_tasks t/i.test(s)) return { rowCount: h.members.length, rows: h.members };
    if (/INSERT INTO frozen_documents/i.test(s)) return { rowCount: 1, rows: [{ version: 'approved', content_hash: (params ?? [])[3] }] };
    if (/FROM frozen_documents/i.test(s)) return { rowCount: 0, rows: [] };
    if (/SELECT \* FROM authoring_documents/i.test(s)) {
      return { rowCount: 1, rows: [{ id: DOC_ID, title: 'Doc', status: 'APPROVED', tenant_id: 3 }] };
    }
    if (/FROM authoring_sections/i.test(s)) return { rowCount: SECTIONS.length, rows: SECTIONS };
    return { rowCount: 1, rows: [{}] };
  });
  h.poolQuery.mockImplementation(async (sql: string) => {
    const governance = releaseGovernanceRead(sql);
    if (governance) return governance;
    const s = String(sql);
    if (s.includes('organization_users')) return { rowCount: 1, rows: [{ role: 'approver', organization_id: 3, user_id: APPROVER_ID }] };
    if (/SELECT 1 FROM authoring_documents/i.test(s)) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    if (/SELECT name FROM users/i.test(s)) return { rowCount: 1, rows: [{ name: 'Ava Approver' }] };
    if (/SELECT code, content FROM authoring_sections/i.test(s)) return { rowCount: 1, rows: [{ code: '2.5.1', content: '<p>body</p>' }] };
    if (/FROM frozen_documents/i.test(s)) return { rowCount: 0, rows: [] };
    return { rowCount: 0, rows: [] };
  });
});

async function approve(password = 'right-password') {
  return request(makeApp())
    .post(`/api/authoring/docs/${DOC_ID}/e-sign`)
    .set('Authorization', await bearer())
    .send({ password, meaning: 'APPROVER', intent: 'I approve this document' });
}

function expectReviewRequired(res: request.Response, says: RegExp) {
  expect(res.status, JSON.stringify(res.body)).toBe(409);
  expect(res.body?.error?.code).toBe('REVIEW_REQUIRED');
  expect(res.body?.error?.message).toMatch(says);
  expect(res.body?.error?.message).toMatch(/Nothing was signed\.$/);
  expect(signed(), 'a refused approval wrote a signature').toBe(false);
  expect(approved(), 'a refused approval approved the document').toBe(false);
  // Before the credential: a refusal spends no password check.
  expect(h.comparePassword).not.toHaveBeenCalled();
}

describe('P-95: the APPROVER e-signature on the editor\'s document', () => {
  it('is refused when the document was never sent for review, before the password is checked', async () => {
    expectReviewRequired(await approve('wrong-password'), /has not been reviewed[\s\S]*Send it for review/);
  });

  it('is refused while the review is still open, saying how many reviewers have signed', async () => {
    h.route = routeRow('open');
    h.members = [reviewer(REVIEWER_ID, CURRENT), reviewer(13, null)];
    expectReviewRequired(await approve(), /not finished: 1 of 2 reviewers have signed/);
  });

  it('is refused when the text changed after the review was signed', async () => {
    h.route = routeRow('complete', EARLIER);
    h.members = [reviewer(REVIEWER_ID, EARLIER)];
    expectReviewRequired(await approve(), /changed after it was reviewed[\s\S]*Send it for review again/);
  });

  it.each(['withdrawn', 'returned'] as const)('is refused when the latest review was %s', async (status) => {
    h.route = routeRow(status);
    h.members = [reviewer(REVIEWER_ID, null)];
    expectReviewRequired(await approve(), /has not been reviewed/);
  });

  it('is taken once every named reviewer has signed the text being approved', async () => {
    h.route = routeRow('complete');
    h.members = [reviewer(REVIEWER_ID, CURRENT), reviewer(13, CURRENT)];
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(signed()).toBe(true);
    expect(approved()).toBe(true);
  });
});

/**
 * P-95 question 1, answered by P-116 (2026-11-10): a reviewer is never the approving signer. The approver
 * is refused when the route names them as a reviewer, signed or not, before the credential; the
 * organisation's only member is admitted before this is asked (below).
 */
describe('P-116: a reviewer on the route is never the approving signer', () => {
  const expectReviewerRefused = (res: request.Response) => {
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body?.error?.code).toBe('APPROVER_IS_REVIEWER');
    expect(res.body?.error?.message).toMatch(/reviewer on this document’s review[\s\S]*Another member approves it\. Nothing was signed\.$/);
    expect(signed(), 'a refused approval wrote a signature').toBe(false);
    expect(approved(), 'a refused approval approved the document').toBe(false);
    expect(h.comparePassword).not.toHaveBeenCalled();
  };

  it('the E-sign is refused when the approver signed the review, though the review is complete', async () => {
    h.route = routeRow('complete');
    h.members = [reviewer(APPROVER_ID, CURRENT), reviewer(13, CURRENT)];
    expectReviewerRefused(await approve('wrong-password'));
  });

  it('the E-sign is refused when the approver is named on the route and has not signed', async () => {
    h.route = routeRow('open');
    h.members = [reviewer(REVIEWER_ID, CURRENT), reviewer(APPROVER_ID, null)];
    expectReviewerRefused(await approve());
  });

  it('the workflow /sign as APPROVER is refused the same way', async () => {
    h.route = routeRow('complete');
    h.members = [reviewer(APPROVER_ID, CURRENT), reviewer(13, CURRENT)];
    expectReviewerRefused(await request(makeApp())
      .post(`/api/authoring/docs/${DOC_ID}/sign`)
      .set('Authorization', await bearer())
      .send({ meaning: 'APPROVER', reason: 'final approval', password: 'right-password' }));
  });

  it('the only member, where the rules allow it, still approves alone', async () => {
    h.orgMembers = [APPROVER_ID];
    h.route = routeRow('complete');
    h.members = [reviewer(APPROVER_ID, CURRENT)];
    expect((await approve()).status).toBe(200);
  });
});

describe('P-95: the workflow /sign as APPROVER', () => {
  it('is refused the same way when the document was never reviewed', async () => {
    const res = await request(makeApp())
      .post(`/api/authoring/docs/${DOC_ID}/sign`)
      .set('Authorization', await bearer())
      .send({ meaning: 'APPROVER', reason: 'final approval', password: 'wrong-password' });
    expectReviewRequired(res, /has not been reviewed/);
  });
});

/**
 * P-116 and P-117 on the editor's document: the organisation's only member may
 * approve with no reviewer where its review rules allow it, and the audit trail
 * says so; the reviewer count is the organisation's own setting.
 */
describe("P-116, P-117: the organisation's review rules on the APPROVER e-signature", () => {
  const audited = (operation: string) => h.clientQuery.mock.calls.some((c) => ((c[1] as unknown[] | undefined) ?? []).includes(operation));

  it('the only member approves a document that was never reviewed, and the audit trail records no independent review', async () => {
    h.orgMembers = [APPROVER_ID];
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(signed()).toBe(true);
    expect(approved()).toBe(true);
    expect(audited('APPROVAL_WITHOUT_INDEPENDENT_REVIEW')).toBe(true);
  });

  it('the only member still gives the password: a wrong one signs nothing', async () => {
    h.orgMembers = [APPROVER_ID];
    const res = await approve('wrong-password');
    expect(res.status).not.toBe(200);
    expect(signed()).toBe(false);
  });

  it('with self-approval switched off, the only member is refused REVIEW_REQUIRED as anyone is', async () => {
    h.orgMembers = [APPROVER_ID];
    h.settings = { security: { soleMemberSelfApproval: false } };
    expectReviewRequired(await approve('wrong-password'), /has not been reviewed/);
    expect(audited('APPROVAL_WITHOUT_INDEPENDENT_REVIEW')).toBe(false);
  });

  it('an independently reviewed approval writes no such record', async () => {
    h.route = routeRow('complete');
    h.members = [reviewer(REVIEWER_ID, CURRENT)];
    expect((await approve()).status).toBe(200);
    expect(audited('APPROVAL_WITHOUT_INDEPENDENT_REVIEW')).toBe(false);
  });

  it('two reviewers required, one named and signed: refused, saying how many more', async () => {
    h.settings = { security: { independentReviewersRequired: 2 } };
    h.route = routeRow('complete');
    h.members = [reviewer(REVIEWER_ID, CURRENT)];
    expectReviewRequired(await approve(), /ask for 2 independent reviewers, and this review names 1/);
  });

  it('two reviewers required, two signed: approved', async () => {
    h.settings = { security: { independentReviewersRequired: 2 } };
    h.route = routeRow('complete');
    h.members = [reviewer(REVIEWER_ID, CURRENT), reviewer(13, CURRENT)];
    expect((await approve()).status).toBe(200);
  });

  it('the workflow /sign as APPROVER follows the same rule for the only member', async () => {
    h.orgMembers = [APPROVER_ID];
    const res = await request(makeApp())
      .post(`/api/authoring/docs/${DOC_ID}/sign`)
      .set('Authorization', await bearer())
      .send({ meaning: 'APPROVER', reason: 'final approval', password: 'right-password' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(audited('APPROVAL_WITHOUT_INDEPENDENT_REVIEW')).toBe(true);
  });
});
