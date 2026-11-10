/**
 * P-89 (the founder, 2026-11-01; docs/LAUNCH_DEFINITION_OF_DONE.md): an
 * approval or a seal is refused while the text being signed states a figure
 * its cited sources do not hold, unless the signer acknowledges each one.
 *
 * Before: the figure check ran once, at save, and marked such a figure
 * `unverified` in the document's provenance. Nothing read that mark at
 * signing, and nothing re-ran it after an edit, so an approver approved and
 * sealed a number no cited source states, and no record said anyone saw it.
 *
 * Over the real router, its real signing ceremony and the real figure check.
 * The pool is the approval-independence harness's; only the saved-source
 * re-read is a seam (its own PGlite test reads real Vault rows:
 * services/authoring/__tests__/saved-source-excerpts-for-signing.pglite.integration.test.ts).
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
    chained: vi.fn(async (_client: unknown, _row: { action: string; details?: Record<string, unknown> }) => {}),
    /** The saved source groups the signing re-read returns. */
    groups: [] as Array<{ sectionCode: string; excerpts: Array<{ documentId: string; contentHash: string; text: string }> | null }>,
    sourcesUndecodable: false,
    sectionContent: '<p>body</p>',
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
  writeChainedAuditRow: (client: unknown, row: { action: string; details?: Record<string, unknown> }) => h.chained(client, row),
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
vi.mock('../../services/authoring/draft-source-references', async (orig) => {
  const actual = await orig<typeof import('../../services/authoring/draft-source-references')>();
  return {
    ...actual,
    savedSourceExcerptsForSigning: vi.fn(async () => {
      if (h.sourcesUndecodable) throw new actual.SavedDraftSourceError();
      return h.groups;
    }),
  };
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-signature-figure-gate';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

// P-95: these documents' review is complete (release-governance-reads.ts, read 5); the check has its own suite.
vi.mock('../../services/authoring/authoring-review-route', async (orig) =>
  (await import('../../services/authoring/__tests__/release-governance-reads')).withCompletedReview(orig));

import router from '../authoring.router';

const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SIGNER = 7;
const SECTION = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const CITED = {
  documentId: '10000000-0000-4000-8000-000000000001',
  contentHash: 'a'.repeat(64),
  text: 'A total of 212 patients were randomized. The objective response rate was 47%.',
};
/** States 47% and 212 patients, which the cited CSR holds, and HR 0.71, which it does not. */
const DRAFTED = '<p>Of 212 patients, 47% responded; progression-free survival HR 0.71.</p>';
const HR_KEY = `${SECTION}#1:HR 0.71`;

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return `Bearer ${await new SignJWT({
    userId: String(SIGNER), id: String(SIGNER), sub: String(SIGNER), email: 'approver@test.co', organizationId: '3',
    role: 'approver', roles: ['approver'], type: 'access',
  }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(secret)}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

const sql = () => h.clientQuery.mock.calls.map((c) => String(c[0]));
const wrote = (re: RegExp) => sql().some((s) => re.test(s));
const trailRow = (op: string) => h.clientQuery.mock.calls.find(
  (c) => /INSERT INTO authoring_audit_trail/i.test(String(c[0])) && JSON.stringify(c[1] ?? []).includes(op));
const chainedRow = (action: string) => h.chained.mock.calls.map((c) => c[1]).find((r) => r.action === action);

beforeEach(() => {
  vi.clearAllMocks();
  h.groups = [];
  h.sourcesUndecodable = false;
  h.sectionContent = '<p>body</p>';
  h.workflow = false;
  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: () => undefined }));
  h.clientQuery.mockImplementation(async (text: string, params?: unknown[]) => clientAnswer(String(text), params));
  h.poolQuery.mockImplementation(async (text: string) => {
    const s = String(text);
    if (s.includes('organization_users')) return { rowCount: 1, rows: [{ role: 'approver', organization_id: 3, user_id: SIGNER }] };
    if (/SELECT 1 FROM authoring_documents/i.test(s)) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    if (/SELECT name FROM users/i.test(s)) return { rowCount: 1, rows: [{ name: 'Ava Approver' }] };
    if (/SELECT code, content FROM authoring_sections/i.test(s)) return { rowCount: 1, rows: [{ code: '2.5.4', content: h.sectionContent }] };
    return { rowCount: 0, rows: [] };
  });
});

type Answer = { rowCount?: number; rows?: unknown[] };
/** The transaction's reads and writes, in the order they are matched; the first that matches answers. */
const ANSWERS: Array<[RegExp, (params?: unknown[]) => Answer | null]> = [
  [/^\s*(BEGIN|COMMIT|ROLLBACK)/i, () => ({})],
  [/UPDATE authoring_workflow_steps/i, () => (h.workflow ? { rowCount: 1, rows: [{ id: 1 }] } : null)],
  [/COUNT\(\*\)[\s\S]*FROM authoring_workflow_steps/i, () => (h.workflow ? { rowCount: 1, rows: [{ pending: 0, total: 1 }] } : null)],
  [/FROM authoring_comments/i, () => ({ rowCount: 1, rows: [{ n: '0' }] })],
  // Separation of duties: the document was written by someone else (user 9).
  [/SELECT d\.created_by FROM authoring_documents/i, () => ({ rowCount: 1, rows: [{ created_by: 9 }] })],
  [/FROM doc_revisions/i, () => ({ rowCount: 0, rows: [] })],
  [/SELECT EXISTS[\s\S]*authoring_audit_trail/i, () => ({ rowCount: 1, rows: [{ required: false }] })],
  [/FROM authoring_audit_trail/i, () => ({ rowCount: 0, rows: [] })],
  [/INSERT INTO frozen_documents/i, (params) => ({ rowCount: 1, rows: [{ version: 'approved', content_hash: (params ?? [])[3] }] })],
  [/FROM frozen_documents/i, () => ({ rowCount: 0, rows: [] })],
  [/SELECT d\.\*|SELECT \* FROM authoring_documents/i,
    () => ({ rowCount: 1, rows: [{ id: DOC, title: 'BX-301 Clinical Overview', status: 'DRAFT', tenant_id: 3, created_by: 9 }] })],
  [/FROM authoring_sections/i, () => ({ rowCount: 1, rows: [{
    id: SECTION, doc_id: DOC, code: '2.5.4', title: 'Overview of efficacy', content: h.sectionContent, order_index: 100,
  }] })],
  // Any other read finds nothing; any write succeeds.
  [/^\s*(SELECT|WITH)\b/i, () => ({ rowCount: 0, rows: [] })],
];

function clientAnswer(s: string, params?: unknown[]): Answer {
  for (const [re, answer] of ANSWERS) {
    const out = re.test(s) ? answer(params) : null;
    if (out) return out;
  }
  return { rowCount: 1, rows: [{}] };
}

async function approve(extra: Record<string, unknown> = {}) {
  return request(makeApp())
    .post(`/api/authoring/docs/${DOC}/e-sign`)
    .set('Authorization', await bearer())
    .send({ password: 'right-password', meaning: 'APPROVER', intent: 'I approve this document as written', ...extra });
}

async function freeze(extra: Record<string, unknown> = {}) {
  return request(makeApp())
    .post(`/api/authoring/docs/${DOC}/freeze`)
    .set('Authorization', await bearer())
    .send({ password: 'right-password', meaning: 'AUTHOR', reason: 'Baseline before the review round', ...extra });
}

function drafted() {
  h.sectionContent = DRAFTED;
  h.groups = [{ sectionCode: '2.5.4', excerpts: [CITED] }];
}

describe('an approval names each unverified figure and signs nothing until each is acknowledged', () => {
  it('refuses with 409 FIGURES_UNVERIFIED before the credential, naming the figure, and writes nothing', async () => {
    drafted();
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('FIGURES_UNVERIFIED');
    expect(res.body.error.message).toMatch(/^Not approved — 1 figure in this document is not in the sources its section cites\..*Nothing was signed\.$/);
    expect(res.body.unverifiedFigures.items).toEqual([{
      key: HR_KEY, sectionId: SECTION, sectionCode: '2.5.4', sectionTitle: 'Overview of efficacy',
      text: 'HR 0.71', kind: 'hr', reason: 'not_in_cited_source',
    }]);
    expect(res.body.unverifiedFigures.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(h.comparePassword).not.toHaveBeenCalled();
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
    expect(wrote(/UPDATE authoring_documents\s+SET status = \$1/i)).toBe(false);
  });

  it('an acknowledgement that leaves a figure out, or names another, is refused the same way', async () => {
    drafted();
    for (const acknowledgedFigures of [[], [`${SECTION}#1:HR 0.62`], true]) {
      const res = await approve({ acknowledgedFigures });
      expect(res.status, JSON.stringify(acknowledgedFigures)).toBe(409);
      expect(res.body.error.code).toBe('FIGURES_UNVERIFIED');
    }
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
  });

  it('approves when each figure is acknowledged, and records each one on the approval\'s own transaction', async () => {
    drafted();
    const refused = await approve();
    const res = await approve({ acknowledgedFigures: [HR_KEY] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(true);

    const trail = trailRow('UNVERIFIED_FIGURES_ACKNOWLEDGED');
    expect(trail, 'the acknowledgement trail row').toBeTruthy();
    // $11 is the row's metadata (authoring-evidence.ts writeAuthoringAuditTrail).
    const raw = (trail![1] as unknown[])[10];
    const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(metadata).toMatchObject({ act: 'approve', digest: refused.body.unverifiedFigures.digest, items: refused.body.unverifiedFigures.items });
    expect(metadata.documentHash).toBe(res.body.documentHash);
    // The approval's chained row names what was acknowledged, beside the signature it records.
    expect(chainedRow('authoring.document.e-sign')?.details).toMatchObject({
      signatureId: res.body.signatureId,
      figuresAcknowledged: { digest: refused.body.unverifiedFigures.digest, count: 1 },
    });
  });

  it('a cited source that no longer verifies leaves every figure of its section unchecked, and says so', async () => {
    drafted();
    h.groups = [{ sectionCode: '2.5.4', excerpts: null }];
    const res = await approve();
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/3 figures .* 3 of them because a cited source could no longer be read/);
    expect(res.body.unverifiedFigures.items.map((i: { reason: string }) => i.reason)).toEqual(Array(3).fill('source_unavailable'));
  });

  it('a saved source record that cannot be read at all refuses the approval, naming that', async () => {
    drafted();
    h.sourcesUndecodable = true;
    const res = await approve();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SOURCE_REFERENCES_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(h.comparePassword).not.toHaveBeenCalled();
  });

  it('a document whose figures are all in their sources approves as before, with nothing recorded (control)', async () => {
    h.sectionContent = '<p>Of 212 patients, 47% responded.</p>';
    h.groups = [{ sectionCode: '2.5.4', excerpts: [CITED] }];
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(trailRow('UNVERIFIED_FIGURES_ACKNOWLEDGED')).toBeUndefined();
    expect(chainedRow('authoring.document.e-sign')?.details).not.toHaveProperty('figuresAcknowledged');
  });

  it('a review signature is not an approval and is not asked (control)', async () => {
    drafted();
    const res = await request(makeApp()).post(`/api/authoring/docs/${DOC}/e-sign`).set('Authorization', await bearer())
      .send({ password: 'right-password', meaning: 'REVIEWER', intent: 'I reviewed this document' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe('a seal asks the same question', () => {
  it('a freeze over an unverified figure is refused before the credential, and seals nothing', async () => {
    drafted();
    const res = await freeze();
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('FIGURES_UNVERIFIED');
    expect(res.body.error.message).toMatch(/^Not frozen — .*Nothing was sealed\.$/);
    expect(h.comparePassword).not.toHaveBeenCalled();
    expect(wrote(/INSERT INTO frozen_documents/i)).toBe(false);
  });

  it('seals once each figure is acknowledged, and the freeze\'s chained row names it', async () => {
    drafted();
    const res = await freeze({ acknowledgedFigures: [HR_KEY] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(trailRow('UNVERIFIED_FIGURES_ACKNOWLEDGED')).toBeTruthy();
    expect(chainedRow('authoring.document.freeze')?.details).toMatchObject({ figuresAcknowledged: { count: 1 } });
  });
});

describe('/sign as APPROVER, which approves and freezes at the last step, asks it too', () => {
  const sign = async (meaning: string, extra: Record<string, unknown> = {}) => request(makeApp())
    .post(`/api/authoring/docs/${DOC}/sign`).set('Authorization', await bearer())
    .send({ password: 'right-password', meaning, reason: 'Final text as written', ...extra });

  it('refuses an APPROVER signature over an unverified figure, and signs nothing', async () => {
    drafted();
    h.workflow = true;
    const res = await sign('APPROVER');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('FIGURES_UNVERIFIED');
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
  });

  it('signs once it is acknowledged, and a REVIEWER signature is not asked (control)', async () => {
    drafted();
    h.workflow = true;
    expect((await sign('APPROVER', { acknowledgedFigures: [HR_KEY] })).status).toBe(200);
    expect(chainedRow('authoring.document.sign')?.details).toMatchObject({ figuresAcknowledged: { count: 1 } });
    expect((await sign('REVIEWER')).status).toBe(200);
  });
});
