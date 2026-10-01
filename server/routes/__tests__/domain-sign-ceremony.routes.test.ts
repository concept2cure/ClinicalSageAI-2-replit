/**
 * P0-10b (DP-02): a domain approval that writes a `sign` ledger row is an
 * electronic signature, so it runs the signature ceremony or it writes nothing.
 *
 * Until 2026-10-01 seven routes outside research administration recorded
 * `command='sign'` through recordGovernedAction and nothing else: an IRB, IACUC
 * or IBC approval, a RIM label recorded as approved, a consent-form approval, a
 * deviation closure and the BLA assessment sign-off. No re-authentication
 * (21 CFR 11.200), no declared meaning (11.50(a)(3)), no electronic_signatures
 * row (11.50, 11.70). The ledger claimed a signature nobody gave.
 *
 * Each now runs the platform's one signing ceremony, signGovernedAct
 * (server/routes/governed-signed-act.ts, shared with the research-administration
 * routes of P0-10a). These tests drive the real handlers through it. The
 * ceremony's pieces are stubbed at their module boundary (signer
 * re-verification, the ledger pair, the signature row, the domain write) so
 * each case can say which one refused, and the fake transaction client records
 * the order of writes, so "the signature lands with the act or not at all" is
 * asserted, not assumed. The real database proof is
 * tests/db/domain-sign-ceremony.dbtest.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Router } from 'express';
import request from 'supertest';

const GOOD = 'correct horse battery staple';
const REASON = 'Committee determination recorded after review';
/** A BLA assessment's id is a uuid (migrations/20260604_bla_workbench.sql). */
const BLA_ID = '5e1f0c2a-7b3d-4e8f-9a1b-2c3d4e5f6a7b';

const h = vi.hoisted(() => {
  const state = { log: [] as string[], sigFail: null as unknown };
  /* The domain writes: each logs DOMAIN, so the order against the ledger and
     the signature is visible. Hoisted because the service mocks call it. */
  const domainWrite = (result: Record<string, unknown> = {}) => async () => {
    state.log.push('DOMAIN');
    return result;
  };
  return Object.assign(state, { domainWrite, review: { expirationDate: '2027-10-01', provenanceLinkId: null } });
});

const client = {
  query: vi.fn(async (sql: string) => {
    const word = sql.trim().split(/\s+/)[0].toUpperCase();
    if (word === 'BEGIN' || word === 'COMMIT' || word === 'ROLLBACK') h.log.push(word);
    if (/FROM c2c_bla_assessments/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: [{ id: 5, status: 'computed' }], rowCount: 1 };
    if (/^\s*UPDATE c2c_bla_assessments/.test(sql)) h.log.push('DOMAIN');
    return { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};

vi.mock('../../db', () => ({
  pool: { connect: vi.fn(async () => client), query: vi.fn(async () => ({ rows: [] })) },
  db: {},
}));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => client }));
// Every case signs as the same user; the attempt limit has its own suite
// (server/middleware/__tests__/signing-attempt-limiter.test.ts).
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../middleware/orgMembership', () => ({
  requireEditorAccessForWrites: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));

/* The re-verification reverifySigner performs, reduced to its verdict: only
   the right password is accepted (its lockout and second-factor rules have
   their own suites). */
const reverifySigner = vi.fn(async (_userId: number, creds: { password?: string; mfaToken?: string }) =>
  creds.password === GOOD
    ? { ok: true, authenticationMethod: 'password', secondFactorVerified: false }
    : { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'The password was not accepted.' },
);
vi.mock('../../services/part11/reverify-signer', () => ({
  reverifySigner: (...a: unknown[]) => reverifySigner(...(a as [number, { password?: string }])),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));

/* The signer's role from the membership row (§11.10(g)); 'admin' carries
   signing authority under the default policy, 'viewer' does not. */
const signerRole = { value: 'admin' as string | null };
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: vi.fn(async () => signerRole.value) }));

const recordGovernedAction = vi.fn(async (_c: unknown, p: { command: string; target: string }) => {
  h.log.push(`LEDGER:${p.command}:${p.target}`);
  return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' };
});
vi.mock('../c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...(a as [unknown, { command: string; target: string }])),
}));

type SigParams = { target: string; payload: Record<string, unknown>; authenticationMethod: string; actionId: string };
const persistGovernedSignSignature = vi.fn(async (_c: unknown, p: SigParams) => {
  if (h.sigFail) throw h.sigFail;
  h.log.push(`SIGNATURE:${p.target}`);
  return { id: 314, signedAt: new Date('2026-10-01T00:00:00Z') };
});
vi.mock('../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedSignSignature: (...a: unknown[]) => persistGovernedSignSignature(...(a as [unknown, SigParams])),
}));

vi.mock('../../services/irb/irb-service', async (orig) => ({
  ...(await orig<object>()),
  recordReviewTx: h.domainWrite(h.review),
  setSubmissionStatusTx: h.domainWrite(),
}));
vi.mock('../../services/iacuc/iacuc-service', async (orig) => ({
  ...(await orig<object>()),
  recordReviewTx: h.domainWrite(h.review),
  setProtocolStatusTx: h.domainWrite(),
}));
vi.mock('../../services/ibc/ibc-service', async (orig) => ({
  ...(await orig<object>()),
  recordReviewTx: h.domainWrite(h.review),
  setRegistrationStatusTx: h.domainWrite(),
}));
vi.mock('../../services/rim/rim-service', async (orig) => ({ ...(await orig<object>()), addLabelTx: h.domainWrite({ id: 77, supersededCount: 0 }) }));
vi.mock('../../services/protocol-consent/protocol-consent-service', async (orig) => ({
  ...(await orig<object>()),
  approveConsentFormTx: h.domainWrite({ approved: true, completeness: { requiredPresentPct: 100 } }),
}));
vi.mock('../../services/protocol-deviations/protocol-deviations-service', async (orig) => ({
  ...(await orig<object>()),
  closeDeviationTx: h.domainWrite({ closed: true }),
}));
vi.mock('../../services/irb-metrics', () => ({ recordIrbSubmissionCreated: vi.fn(), recordIrbApproval: vi.fn(), recordIrbReportableEvent: vi.fn() }));
vi.mock('../../services/iacuc-metrics', () => ({ recordIacucProtocolCreated: vi.fn(), recordIacucApproval: vi.fn(), recordIacucReview: vi.fn() }));
vi.mock('../../services/ibc-metrics', () => ({ recordIbcRegistrationCreated: vi.fn(), recordIbcApproval: vi.fn(), recordIbcAgentRegistered: vi.fn() }));
vi.mock('../../services/rim-metrics', () => ({ recordRimProductCreated: vi.fn(), recordRimRegistration: vi.fn(), recordRimLabelApproved: vi.fn() }));
vi.mock('../../services/protocol-consent-metrics', () => ({
  recordConsentFormCreated: vi.fn(), recordConsentElementUpdated: vi.fn(), recordConsentFormApproved: vi.fn(),
}));
vi.mock('../../services/protocol-deviations-metrics', () => ({
  recordDeviationReported: vi.fn(), recordCapaActionAdded: vi.fn(), recordDeviationClosed: vi.fn(),
}));

import irbRouter from '../irb';
import iacucRouter from '../iacuc';
import ibcRouter from '../ibc';
import rimRouter from '../rim';
import consentRouter from '../protocol-consent';
import deviationsRouter from '../protocol-deviations';
import blaRouter from '../biopharma/bla-workbench';

interface SignRoute {
  name: string;
  mount: string;
  router: Router;
  path: string;
  /** The act's own fields; the ceremony's (meaning, password) are added per case. */
  act: Record<string, unknown>;
  target: string;
  /** The same route with an outcome that is not a signature, where there is one. */
  notASignature?: { act: Record<string, unknown>; command: string };
}

const ROUTES: SignRoute[] = [
  {
    name: 'IRB approval', mount: '/api/irb', router: irbRouter, path: '/api/irb/submissions/5/reviews',
    act: { reviewType: 'full_board', outcome: 'approved', reason: REASON }, target: 'irb-submission:5',
    notASignature: { act: { reviewType: 'full_board', outcome: 'deferred', reason: REASON }, command: 'resolve' },
  },
  {
    name: 'IACUC approval', mount: '/api/iacuc', router: iacucRouter, path: '/api/iacuc/protocols/5/reviews',
    act: { reviewType: 'full_committee_review', outcome: 'approved', reason: REASON }, target: 'iacuc-protocol:5',
    notASignature: { act: { reviewType: 'full_committee_review', outcome: 'tabled', reason: REASON }, command: 'resolve' },
  },
  {
    name: 'IBC approval', mount: '/api/ibc', router: ibcRouter, path: '/api/ibc/registrations/5/reviews',
    act: { outcome: 'approved', reason: REASON }, target: 'ibc-registration:5',
    notASignature: { act: { outcome: 'tabled', reason: REASON }, command: 'resolve' },
  },
  {
    name: 'RIM label recorded as approved', mount: '/api/rim', router: rimRouter, path: '/api/rim/products/5/labels',
    act: { labelType: 'uspi', status: 'approved', reason: REASON }, target: 'rim-product:5',
    notASignature: { act: { labelType: 'uspi', status: 'draft', reason: REASON }, command: 'update' },
  },
  {
    name: 'consent-form approval', mount: '/api/protocol-consent', router: consentRouter,
    path: '/api/protocol-consent/forms/5/approve', act: { reason: REASON }, target: 'consent-form:5',
  },
  {
    name: 'deviation closure', mount: '/api/protocol-deviations', router: deviationsRouter,
    path: '/api/protocol-deviations/deviations/5/close', act: { reason: REASON }, target: 'protocol-deviation:5',
  },
  {
    name: 'BLA assessment sign-off', mount: '/api/biopharma/bla', router: blaRouter,
    path: `/api/biopharma/bla/assessments/${BLA_ID}/sign`, act: { reason: REASON }, target: `bla_assessment:${BLA_ID}`,
  },
];

function appFor(route: SignRoute) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.user = { id: 42, organizationId: 7, role: 'member' };
    r.userId = 42;
    r.tenantId = 7;
    next();
  });
  app.use(route.mount, route.router);
  return app;
}

const codeOf = (body: { error?: { code?: string } }) => body.error?.code;

/** Nothing reached the database: no transaction, no domain write, no ledger, no signature. */
const NOTHING_WRITTEN = (log: string[]) => log.filter((e) => e === 'BEGIN' || e === 'DOMAIN' || e.startsWith('LEDGER') || e.startsWith('SIGNATURE'));

beforeEach(() => {
  h.log = [];
  h.sigFail = null;
  vi.clearAllMocks();
});

describe.each(ROUTES)('$name is a signature, so it runs the ceremony', (route) => {
  const post = (extra: Record<string, unknown>) => request(appFor(route)).post(route.path).send({ ...route.act, ...extra });

  it('refuses a request that carries no credentials, and writes nothing', async () => {
    const res = await post({ meaning: 'approval' });
    expect(res.status).toBe(400);
    expect(codeOf(res.body)).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(NOTHING_WRITTEN(h.log)).toEqual([]);
  });

  it('refuses a wrong password, and writes nothing', async () => {
    const res = await post({ meaning: 'approval', password: 'not the password' });
    expect(res.status).toBe(401);
    expect(codeOf(res.body)).toBe('PASSWORD_VERIFICATION_FAILED');
    expect(NOTHING_WRITTEN(h.log)).toEqual([]);
  });

  it('refuses a member whose role carries no signing authority before checking the password (§11.10(g))', async () => {
    signerRole.value = 'viewer';
    try {
      const res = await post({ meaning: 'approval', password: GOOD });
      expect(res.status).toBe(403);
      expect(codeOf(res.body)).toBe('ESIGNATURE_NO_AUTHORITY');
      expect(reverifySigner).not.toHaveBeenCalled();
      expect(NOTHING_WRITTEN(h.log)).toEqual([]);
    } finally {
      signerRole.value = 'admin';
    }
  });

  it('refuses a meaning outside the closed vocabulary before checking the password', async () => {
    const res = await post({ meaning: 'rubber-stamp', password: GOOD });
    expect(res.status).toBe(400);
    expect(codeOf(res.body)).toBe('SIGNATURE_MEANING_UNKNOWN');
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(NOTHING_WRITTEN(h.log)).toEqual([]);
  });

  it('refuses a signature that declares no meaning, and writes nothing', async () => {
    const res = await post({ password: GOOD });
    expect(res.status).toBe(400);
    expect(codeOf(res.body)).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(NOTHING_WRITTEN(h.log)).toEqual([]);
  });

  it('with the ceremony: the act, the ledger sign and the signature row commit together', async () => {
    const res = await post({ meaning: 'approval', password: GOOD });
    expect(res.status).toBe(201);
    expect(h.log).toEqual(['BEGIN', 'DOMAIN', `LEDGER:sign:${route.target}`, `SIGNATURE:${route.target}`, 'COMMIT']);
    expect(reverifySigner.mock.calls[0][0]).toBe(42);
    expect(reverifySigner.mock.calls[0][1]).toMatchObject({ password: GOOD });
    const sig = persistGovernedSignSignature.mock.calls[0][1];
    expect(sig.actionId).toBe('act_1');
    expect(sig.payload.meaning).toBe('approval');
    expect(sig.authenticationMethod).toBe('password');
    expect(res.body.signatureId).toBe(314);
  });

  it('a signature row that cannot be written rolls the act back', async () => {
    h.sigFail = new Error('signer identity unresolvable');
    const res = await post({ meaning: 'approval', password: GOOD });
    expect(res.status).toBe(500);
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    // The cause is internal; the body never carries it.
    expect(JSON.stringify(res.body)).not.toContain('signer identity unresolvable');
  });

  if (route.notASignature) {
    const other = route.notASignature;
    it(`an outcome that is not an approval is recorded as '${other.command}', with no password asked`, async () => {
      const res = await request(appFor(route)).post(route.path).send(other.act);
      expect(res.status).toBeLessThan(300);
      expect(h.log).toEqual(['BEGIN', 'DOMAIN', `LEDGER:${other.command}:${route.target}`, 'COMMIT']);
      expect(reverifySigner).not.toHaveBeenCalled();
      expect(persistGovernedSignSignature).not.toHaveBeenCalled();
    });
  }
});

/*
 * P1-51 follow-up (security review 2026-10-01): a BLA assessment's id is a uuid,
 * which PostgreSQL reads from many spellings. The ceremony locks, and the
 * signature names, the canonical one, so every spelling of one assessment is one
 * lock and one signed target; anything that is not a uuid is not an assessment.
 */
describe('BLA assessment sign-off: one spelling of the assessment', () => {
  const bla = ROUTES.find((r) => r.name === 'BLA assessment sign-off')!;
  const sign = (id: string) =>
    request(appFor(bla)).post(`/api/biopharma/bla/assessments/${id}/sign`).send({ reason: REASON, meaning: 'approval', password: GOOD });

  it('an upper-case spelling signs under the lower-case target', async () => {
    const res = await sign(BLA_ID.toUpperCase());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(h.log).toEqual(['BEGIN', 'DOMAIN', `LEDGER:sign:bla_assessment:${BLA_ID}`, `SIGNATURE:bla_assessment:${BLA_ID}`, 'COMMIT']);
  });

  it('an id that is not a uuid is not an assessment: 404 before the ceremony, nothing written', async () => {
    const res = await sign('5');
    expect(res.status).toBe(404);
    expect(codeOf(res.body)).toBe('NOT_FOUND');
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(NOTHING_WRITTEN(h.log)).toEqual([]);
  });
});

/*
 * The second door (P0-10b fix round, DP-02). Each committee router also has a
 * PATCH .../status that wrote any status in its enum, 'approved' included, as a
 * 'transition' ledger row: an approval with no signature, no review record and
 * no reviewer, from a session alone. A status a determination sets is now set
 * only by the determination route above; the PATCH refuses it and writes
 * nothing. Statuses no determination sets still move through the PATCH.
 */
interface StatusDoor {
  name: string;
  mount: string;
  router: Router;
  path: string;
  target: string;
  /** What recordReviewTx writes into the status column. */
  determined: string[];
  /** A status no determination sets: the PATCH still records it. */
  lifecycle: string;
}

const STATUS_DOORS: StatusDoor[] = [
  {
    name: 'IRB submission', mount: '/api/irb', router: irbRouter, path: '/api/irb/submissions/5/status',
    target: 'irb-submission:5', determined: ['approved', 'modifications_required'], lifecycle: 'suspended',
  },
  {
    name: 'IACUC protocol', mount: '/api/iacuc', router: iacucRouter, path: '/api/iacuc/protocols/5/status',
    target: 'iacuc-protocol:5', determined: ['approved', 'conditional'], lifecycle: 'expired',
  },
  {
    name: 'IBC registration', mount: '/api/ibc', router: ibcRouter, path: '/api/ibc/registrations/5/status',
    target: 'ibc-registration:5', determined: ['approved', 'conditional'], lifecycle: 'closed',
  },
];

describe.each(STATUS_DOORS)('$name status PATCH cannot set what a determination sets', (door) => {
  const patch = (status: string) =>
    request(appFor({ name: door.name, mount: door.mount, router: door.router, path: door.path, act: {}, target: door.target }))
      .patch(door.path)
      .send({ status, reason: REASON });

  it.each(door.determined)("refuses status '%s', and writes nothing", async (status) => {
    const res = await patch(status);
    expect(res.status, `${door.name}: PATCH set '${status}' without a determination: ${JSON.stringify(res.body)}`).toBe(409);
    expect(codeOf(res.body)).toBe('STATUS_SET_BY_DETERMINATION');
    expect(res.body.error.message).toContain(door.path.replace(/\/status$/, '/reviews').replace('/5/', '/:id/'));
    expect(NOTHING_WRITTEN(h.log)).toEqual([]);
    expect(persistGovernedSignSignature).not.toHaveBeenCalled();
  });

  it('still records a status no determination sets, as a transition', async () => {
    const res = await patch(door.lifecycle);
    expect(res.status).toBe(201);
    expect(h.log).toEqual(['BEGIN', 'DOMAIN', `LEDGER:transition:${door.target}`, 'COMMIT']);
  });
});
