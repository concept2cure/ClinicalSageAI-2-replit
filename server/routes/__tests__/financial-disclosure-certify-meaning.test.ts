/**
 * POST /api/financial-disclosures/disclosures/:id/certify — a certification
 * states a meaning from the closed vocabulary, or it is refused before anything
 * is asked or written.
 *
 * WHAT WENT WRONG (docs/work-orders/README.md, "→ D5 lane (P1-21 / DP-17),
 * found, not fixed")
 * The route defaulted `meaning` to 'Certified'. Since 3d09bf2a9 the shared
 * signature writer refuses any meaning outside GOVERNED_SIGN_MEANINGS, so every
 * certification that omitted a meaning — or sent one outside the vocabulary —
 * re-authenticated the signer, opened a transaction, certified the disclosure,
 * wrote the ledger pair, and then failed at the signature row: a 500, rolled
 * back. The signer was asked for a password for a request that could never
 * succeed. Now the meaning is required and checked first, with the answer the
 * governed action route gives (c2c/actions.ts): 400, naming the vocabulary.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  connect: vi.fn(),
  verifyReauth: vi.fn(),
  recordGovernedAction: vi.fn(),
  persistGovernedActionSignature: vi.fn(),
  certifyDisclosureTx: vi.fn(),
  signerRole: vi.fn(),
}));

vi.mock('../../db', () => ({ pool: { connect: (...a: unknown[]) => h.connect(...a) } }));
// §11.10(g): the certifier's role, as the membership row holds it.
vi.mock('../../services/part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: (...a: unknown[]) => h.signerRole(...a),
}));
vi.mock('../c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => h.verifyReauth(...a),
  recordGovernedAction: (...a: unknown[]) => h.recordGovernedAction(...a),
}));
vi.mock('../../services/part11/signature-persistence', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  persistGovernedActionSignature: (...a: unknown[]) => h.persistGovernedActionSignature(...a),
}));
vi.mock('../../services/financial-disclosures/fcoi-service', () => ({
  createInvestigatorTx: vi.fn(),
  listInvestigators: vi.fn(),
  createDisclosureTx: vi.fn(),
  updateDisclosureTx: vi.fn(),
  softDeleteDisclosureTx: vi.fn(),
  addInterestTx: vi.fn(),
  certifyDisclosureTx: (...a: unknown[]) => h.certifyDisclosureTx(...a),
  loadDisclosureSnapshot: vi.fn(async () => ({})),
  listDisclosures: vi.fn(),
}));
vi.mock('../../services/financial-disclosures/fcoi-logic', () => ({
  validateDisclosureCompleteness: () => ({ riskLevel: 'low', findings: [] }),
}));
vi.mock('../../services/fcoi-metrics', () => ({
  recordFcoiDisclosureCreated: vi.fn(),
  recordFcoiCertification: vi.fn(),
  recordFcoiSignatureInvalidation: vi.fn(),
  recordFcoiReview: vi.fn(),
}));
vi.mock('../../services/ai-gateway', () => ({ getGateway: vi.fn() }));

import router from '../financial-disclosures';
import { GOVERNED_SIGN_MEANINGS } from '../../services/part11/signature-meanings';

const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req as any, { userId: 5, tenantId: 7 });
    next();
  });
  a.use('/api/financial-disclosures', router);
  return a;
}
const certify = (body: Record<string, unknown>) =>
  request(app())
    .post('/api/financial-disclosures/disclosures/12/certify')
    .send({ reason: 'Annual certification for study BX-204.', reauth: { password: 'pw' }, ...body });

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockResolvedValue(client);
  h.verifyReauth.mockResolvedValue({ ok: true });
  h.recordGovernedAction.mockResolvedValue({ actionId: 'act-1', auditId: 'aud-1', sha256Chain: 'chain' });
  h.persistGovernedActionSignature.mockResolvedValue({ signatureId: 'sig-1' });
  h.certifyDisclosureTx.mockResolvedValue({ contentHash: 'hash', provenanceLinkId: 'prov' });
  h.signerRole.mockResolvedValue('approver');
});

describe('certify: the meaning is required, and one of the governed meanings', () => {
  it.each([
    ['no meaning', {}, 'SIGNATURE_MEANING_REQUIRED'],
    ['an empty meaning', { meaning: '' }, 'SIGNATURE_MEANING_REQUIRED'],
    ['the old default, outside the vocabulary', { meaning: 'Certified' }, 'SIGNATURE_MEANING_UNKNOWN'],
  ])('%s is refused 400 before the signer is asked for a password, and nothing is opened', async (_label, body, code) => {
    const res = await certify(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
    expect(res.body.error.message).toContain(GOVERNED_SIGN_MEANINGS.join(', '));
    expect(h.verifyReauth).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.persistGovernedActionSignature).not.toHaveBeenCalled();
  });

  it('a governed meaning is carried, unchanged, into the certification, the ledger and the signature row', async () => {
    const res = await certify({ meaning: 'responsibility' });

    expect(res.status).toBe(200);
    expect(h.verifyReauth).toHaveBeenCalledTimes(1);
    expect(h.certifyDisclosureTx).toHaveBeenCalledWith(client, 7, 5, 12, 'responsibility');
    expect(h.recordGovernedAction.mock.calls[0][1].payload.meaning).toBe('responsibility');
    expect(h.persistGovernedActionSignature.mock.calls[0][1].payload.meaning).toBe('responsibility');
  });
});

/* QA 2026-10-08 (j6 sweep): certifying a disclosure is an electronic signature
   on a Form FDA 3454/3455 that ships in Module 1. The route re-authenticated the
   certifier and wrote the signature row without asking whether their role may
   sign, so a member's (or a manager's, P-18) password certified one. */
describe('certify: signing authority (§11.10(g)) before the password', () => {
  it.each(['manager', 'member'])('a %s is refused 403 ESIGNATURE_NO_AUTHORITY; no password is asked and nothing is opened', async (role) => {
    h.signerRole.mockResolvedValue(role);
    const res = await certify({ meaning: 'responsibility' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(h.signerRole).toHaveBeenCalledWith(5, 7);
    expect(h.verifyReauth).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.persistGovernedActionSignature).not.toHaveBeenCalled();
  });

  it('a role lookup that cannot run refuses 503, names no cause, and asks for no password', async () => {
    h.signerRole.mockRejectedValue(new Error('organization_users unreadable: secret-detail'));
    const res = await certify({ meaning: 'responsibility' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SIGNING_AUTHORITY_UNVERIFIED');
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
    expect(h.verifyReauth).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
  });
});
