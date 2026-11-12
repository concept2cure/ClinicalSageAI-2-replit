/**
 * P-102, slice 2 (2026-11-12): an informed-consent document is approved only
 * over its 21 CFR 50.25 elements.
 *
 * Before: the editor's Check showed the gate (slice 1) and nothing read it at
 * signing. A consent form with no risks section, and a confidentiality section
 * that never says FDA may inspect the records, was approved and frozen by
 * E-sign or by the workflow's /sign.
 *
 * Over the real router and its real signing ceremony; the pool and the seams
 * are the figure gate's harness (authoring-signature-figure-gate.test.ts).
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
    /** The consent document's sections, by outline code. */
    sections: {} as Record<string, string>,
    templateId: '' as string | null,
    productCode: null as string | null,
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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-signature-consent-gate';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

// P-95: these documents' review is complete (release-governance-reads.ts, read 5); the check has its own suite.
vi.mock('../../services/authoring/authoring-review-route', async (orig) =>
  (await import('../../services/authoring/__tests__/release-governance-reads')).withCompletedReview(orig));

import router from '../authoring.router';
import { CONSENT_TEMPLATE_IDS } from '../../services/protocol-consent/protocol-consent-logic';

const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SIGNER = 7;
const COMPLETE: Record<string, string> = {
  '1': 'This study involves research. Its purpose is to test the drug; you will take part for twelve weeks.',
  '2': 'You will have blood drawn at each visit. The study drug is experimental.',
  '3': 'You may have headache or nausea.',
  '4': 'You may not benefit directly.',
  '5': 'You may choose standard treatment instead.',
  '6': 'Your records will be kept confidential. The Food and Drug Administration may inspect the records of this study.',
  '7': 'If you are injured, medical treatment is available.',
  '8': 'Taking part is voluntary. You may withdraw at any time without penalty or loss of benefits.',
  '9': 'Call the study doctor with questions.',
  '11': 'A description of this clinical trial will be available on http://www.ClinicalTrials.gov, as required by U.S. Law.',
};

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
const sectionRows = () => Object.entries(h.sections).map(([code, text], i) => ({
  id: `5e000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, doc_id: DOC, code, title: `Section ${code}`,
  content: `<p>${text}</p>`, order_index: i,
}));

type Answer = { rowCount?: number; rows?: unknown[] };
const ANSWERS: Array<[RegExp, (params?: unknown[]) => Answer | null]> = [
  [/^\s*(BEGIN|COMMIT|ROLLBACK)/i, () => ({})],
  [/UPDATE authoring_workflow_steps/i, () => (h.workflow ? { rowCount: 1, rows: [{ id: 1 }] } : null)],
  [/COUNT\(\*\)[\s\S]*FROM authoring_workflow_steps/i, () => (h.workflow ? { rowCount: 1, rows: [{ pending: 0, total: 1 }] } : null)],
  [/FROM authoring_comments/i, () => ({ rowCount: 1, rows: [{ n: '0' }] })],
  [/SELECT d\.created_by FROM authoring_documents/i, () => ({ rowCount: 1, rows: [{ created_by: 9 }] })],
  [/FROM doc_revisions/i, () => ({ rowCount: 0, rows: [] })],
  [/SELECT EXISTS[\s\S]*authoring_audit_trail/i, () => ({ rowCount: 1, rows: [{ required: false }] })],
  [/FROM authoring_audit_trail/i, () => ({ rowCount: 0, rows: [] })],
  [/INSERT INTO frozen_documents/i, (params) => ({ rowCount: 1, rows: [{ version: 'approved', content_hash: (params ?? [])[3] }] })],
  [/FROM frozen_documents/i, () => ({ rowCount: 0, rows: [] })],
  [/SELECT d\.\*|SELECT \* FROM authoring_documents/i,
    () => ({ rowCount: 1, rows: [{ id: DOC, title: 'LUM-201 informed consent form', status: 'DRAFT', tenant_id: 3, created_by: 9, template_id: h.templateId, product_code: h.productCode }] })],
  [/FROM authoring_sections/i, () => ({ rowCount: sectionRows().length, rows: sectionRows() })],
  [/^\s*(SELECT|WITH)\b/i, () => ({ rowCount: 0, rows: [] })],
];

function clientAnswer(s: string, params?: unknown[]): Answer {
  for (const [re, answer] of ANSWERS) {
    const out = re.test(s) ? answer(params) : null;
    if (out) return out;
  }
  return { rowCount: 1, rows: [{}] };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.groups = [];
  h.sourcesUndecodable = false;
  h.sections = { ...COMPLETE };
  h.templateId = CONSENT_TEMPLATE_IDS[0];
  h.productCode = null;
  h.workflow = false;
  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: () => undefined }));
  h.clientQuery.mockImplementation(async (text: string, params?: unknown[]) => clientAnswer(String(text), params));
  h.poolQuery.mockImplementation(async (text: string) => {
    const s = String(text);
    if (s.includes('organization_users')) return { rowCount: 1, rows: [{ role: 'approver', organization_id: 3, user_id: SIGNER }] };
    if (/SELECT 1 FROM authoring_documents/i.test(s)) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    if (/SELECT name FROM users/i.test(s)) return { rowCount: 1, rows: [{ name: 'Ava Approver' }] };
    return { rowCount: 0, rows: [] };
  });
});

async function approve(extra: Record<string, unknown> = {}) {
  return request(makeApp())
    .post(`/api/authoring/docs/${DOC}/e-sign`)
    .set('Authorization', await bearer())
    .send({ password: 'right-password', meaning: 'APPROVER', intent: 'I approve this consent form as written', ...extra });
}

describe('an informed-consent form is approved only over its 21 CFR 50.25(a) elements', () => {
  it('refuses 409 CONSENT_INCOMPLETE before the credential, naming each element, and signs nothing', async () => {
    h.sections = { ...COMPLETE, '3': '', '6': 'Your records will be kept confidential.' };
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('CONSENT_INCOMPLETE');
    expect(res.body.error.message).toMatch(/Reasonably foreseeable risks or discomforts; Extent of confidentiality of records/);
    expect(res.body.consentElements.incomplete).toEqual(['risks', 'confidentiality']);
    expect(h.comparePassword).not.toHaveBeenCalled();
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
  });

  it('no statement lifts a missing 50.25(a) element', async () => {
    h.sections = { ...COMPLETE, '3': '' };
    const res = await approve({ notApplicableClinicalTrial: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONSENT_INCOMPLETE');
    expect(trailRow('CONSENT_NOT_APPLICABLE_CLINICAL_TRIAL_STATED')).toBeUndefined();
  });

  it('a complete form approves, with nothing recorded about trial status (control)', async () => {
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(true);
    expect(trailRow('CONSENT_NOT_APPLICABLE_CLINICAL_TRIAL_STATED')).toBeUndefined();
    expect(chainedRow('authoring.document.e-sign')?.details).not.toHaveProperty('consentTrialStatus');
  });

  it('a consent form AnA drafted, recorded by type and with no template, is held to the same gate (P-130)', async () => {
    h.templateId = null;
    h.productCode = 'informed_consent';
    h.sections = { ...COMPLETE, '3': '' };
    const res = await approve();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONSENT_INCOMPLETE');
  });

  it('a document of another type is not asked (control)', async () => {
    h.templateId = null;
    h.sections = { '1': 'Background.' };
    expect((await approve()).status).toBe(200);
  });
});

describe('the ClinicalTrials.gov statement', () => {
  it('missing, the approver is asked whether the study is an applicable clinical trial', async () => {
    delete h.sections['11'];
    const res = await approve();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONSENT_TRIAL_STATUS_REQUIRED');
    expect(res.body.error.message).toMatch(/21 CFR 50\.25\(c\)[\s\S]*Nothing was signed\.$/);
    expect(h.comparePassword).not.toHaveBeenCalled();
  });

  it('stated not one, the form approves and the statement is recorded on the trail and on the signature\'s chained row', async () => {
    delete h.sections['11'];
    const res = await approve({ notApplicableClinicalTrial: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const trail = trailRow('CONSENT_NOT_APPLICABLE_CLINICAL_TRIAL_STATED');
    expect(trail, 'the statement\'s trail row').toBeTruthy();
    const raw = (trail![1] as unknown[])[10];
    const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(metadata).toMatchObject({ act: 'approve', element: 'clinicaltrials_gov', applicableClinicalTrial: false });
    expect(metadata.documentHash).toBe(res.body.documentHash);
    expect(chainedRow('authoring.document.e-sign')?.details).toMatchObject({
      consentTrialStatus: { applicableClinicalTrial: false, statedBy: 'approver@test.co' },
    });
  });
});

describe('/sign as APPROVER asks the same', () => {
  const sign = async (meaning: string, extra: Record<string, unknown> = {}) => request(makeApp())
    .post(`/api/authoring/docs/${DOC}/sign`).set('Authorization', await bearer())
    .send({ password: 'right-password', meaning, reason: 'Final consent text as written', ...extra });

  it('refuses an incomplete form, and a REVIEWER signature is not asked (control)', async () => {
    h.workflow = true;
    h.sections = { ...COMPLETE, '8': '' };
    const res = await sign('APPROVER');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('CONSENT_INCOMPLETE');
    expect(wrote(/INSERT INTO authoring_signatures/i)).toBe(false);
    expect((await sign('REVIEWER')).status).toBe(200);
  });

  it('signs once the trial status is stated, and its chained row names it', async () => {
    h.workflow = true;
    delete h.sections['11'];
    expect((await sign('APPROVER')).body.error.code).toBe('CONSENT_TRIAL_STATUS_REQUIRED');
    expect((await sign('APPROVER', { notApplicableClinicalTrial: true })).status).toBe(200);
    expect(chainedRow('authoring.document.sign')?.details).toMatchObject({ consentTrialStatus: { applicableClinicalTrial: false } });
  });
});
