/**
 * Accepting a hazard's residual risk is an electronic signature (D2, fold F1
 * slice A, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
 *
 * `PATCH /api/mdx/risk-items/:id` with status `accepted` set the status from a
 * session alone: no editor gate, no re-authentication (21 CFR 11.200), no
 * declared meaning (11.50(a)(3)), no reason and no electronic_signatures row
 * (11.50, 11.70). The Risk screen's "Accept residual" sent exactly that, and
 * the product tour calls the act "a signed human judgment"
 * (shared/navigation/demo-scripts.ts). `POST /api/mdx/risk-items` could also
 * create a hazard already accepted.
 *
 * The acceptance now runs the platform's one route-level signing ceremony,
 * signGovernedAct (server/routes/governed-signed-act.ts), wired as the labeling
 * translation approval wires it (96537cfe): the same route signs when the
 * status is `accepted`, and any other status change asks for nothing. These
 * tests drive the real risk router and the real ceremony. Its pieces are
 * stubbed at their module boundaries: signer re-verification, the signer's
 * role, the ledger pair, the signature row and the tenant context. The fake
 * transaction client records the order of statements, so "the acceptance lands
 * with its signature or not at all" is asserted, not assumed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const SIGNER = 5;
const GOOD = 'correct horse battery staple';
const REASON = 'Residual risk reviewed against the risk acceptability policy';
const SIGNATURE = { meaning: 'approval', reason: REASON, password: GOOD };
const PROGRAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  /** The caller's role on the request, which the editor gate reads. */
  role: 'member' as string | undefined,
  /** The signer's role on the membership row, which signing authority reads; an Error fails the lookup. */
  signerRole: 'approver' as string | null | Error,
  /** The hazard the transaction reads, or null when the organization has none by that id. */
  hazard: null as Row | null,
  /** Thrown by the signature-row write when set. */
  sigFail: null as unknown,
  /** Every statement, in order, on either connection. */
  statements: [] as Array<{ via: 'pool' | 'tx'; sql: string; params: unknown[] }>,
  /** What the ceremony did, in order: transaction words, the ledger, the signature. */
  log: [] as string[],
  /** Scopes of the signing-attempt limiter each request passed through. */
  limited: [] as string[],
}));

function freshHazard(): Row {
  return {
    id: 1, organization_id: ORG, program_id: PROGRAM, ref_code: 'HZ-01', hazard: 'Sensor drift', harm: 'Mis-dosing',
    status: 'verified', severity: 4, probability: 3, initial_risk: 12,
    residual_severity: 4, residual_probability: 1, residual_risk: 4, acceptable: null,
    benefit_risk_rationale: null,
  };
}

/* The request's pinned connection, on which the ceremony runs the acceptance. */
const tx = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    h.statements.push({ via: 'tx', sql, params });
    const word = sql.trim().split(/\s+/)[0].toUpperCase();
    if (word === 'BEGIN' || word === 'COMMIT' || word === 'ROLLBACK') { h.log.push(word); return { rows: [], rowCount: 0 }; }
    if (/pg_advisory_xact_lock/.test(sql)) { h.log.push(`LOCK:${String(params[0])}`); return { rows: [], rowCount: 0 }; }
    if (/FROM risk_items/.test(sql) && /FOR UPDATE/.test(sql)) {
      h.log.push('READ');
      return h.hazard ? { rows: [{ ...h.hazard }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/^\s*UPDATE risk_items/.test(sql)) {
      h.log.push('UPDATE');
      return { rows: [{ ...(h.hazard ?? {}), status: 'accepted', acceptable: true }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};

vi.mock('../../db', () => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      h.statements.push({ via: 'pool', sql, params });
      return { rows: [{ id: 1, status: 'mitigating' }], rowCount: 1 };
    },
    connect: async () => tx,
  },
  getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }),
  db: {},
}));
vi.mock('../../db/requestDb', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requestPgClient: () => tx,
}));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: (scope: string) => (_req: unknown, _res: unknown, next: () => void) => {
    h.limited.push(scope);
    next();
  },
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({
  setTenantContextTx: vi.fn(async () => { h.log.push('TENANT'); }),
}));

/* reverifySigner reduced to its verdict: only the right password is accepted.
   Its lockout and second-factor rules have their own suites. */
const reverifySigner = vi.fn(async (_userId: number, creds: { password?: string; mfaToken?: string }) =>
  creds.password === GOOD
    ? { ok: true, authenticationMethod: 'password', secondFactorVerified: false }
    : { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'The password was not accepted.' },
);
vi.mock('../../services/part11/reverify-signer', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reverifySigner: (...a: unknown[]) => reverifySigner(...(a as [number, { password?: string }])),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: vi.fn(async () => {
    if (h.signerRole instanceof Error) throw h.signerRole;
    return h.signerRole;
  }),
}));

type LedgerParams = { command: string; target: string; domain?: string; payload: Row };
const recordGovernedAction = vi.fn(async (_c: unknown, p: LedgerParams) => {
  h.log.push(`LEDGER:${p.command}:${p.target}`);
  return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' };
});
vi.mock('../../routes/c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...(a as [unknown, LedgerParams])),
}));

type SigParams = { target: string; payload: Row; authenticationMethod: string; actionId: string; secondFactorVerified: boolean };
const persistGovernedSignSignature = vi.fn(async (_c: unknown, p: SigParams) => {
  if (h.sigFail) throw h.sigFail;
  h.log.push(`SIGNATURE:${p.target}`);
  return { id: 314, signedAt: new Date('2026-10-29T10:00:00Z') };
});
vi.mock('../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedSignSignature: (...a: unknown[]) => persistGovernedSignSignature(...(a as [unknown, SigParams])),
}));

import riskRouter from '../../routes/mdx-risk-management';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: SIGNER, organizationId: ORG, role: h.role };
    next();
  });
  a.use('/api/mdx', riskRouter);
  return a;
}

const accept = (body: Row) => request(app()).patch('/api/mdx/risk-items/1').send(body);
const writes = () => h.statements.filter((s) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(s.sql));
/** Every UPDATE that sets the status to accepted, on either connection, whether as a literal or a parameter. */
const acceptances = () => h.statements.filter((s) => /^\s*UPDATE risk_items/.test(s.sql)
  && (s.sql.includes("'accepted'") || /acceptable = TRUE/i.test(s.sql) || s.params.includes('accepted') || s.params.includes(true)));
/** Nothing changed on either connection and no ledger or signature row was written. */
function nothingWritten() {
  expect(writes()).toEqual([]);
  expect(recordGovernedAction).not.toHaveBeenCalled();
  expect(persistGovernedSignSignature).not.toHaveBeenCalled();
  expect(h.log).not.toContain('COMMIT');
}

beforeEach(() => {
  h.role = 'member';
  h.signerRole = 'approver';
  h.hazard = freshHazard();
  h.sigFail = null;
  h.statements.length = 0;
  h.log.length = 0;
  h.limited.length = 0;
  tx.query.mockClear();
  reverifySigner.mockClear();
  recordGovernedAction.mockClear();
  persistGovernedSignSignature.mockClear();
});

describe('accepting residual risk without a signature', () => {
  it('is refused: no password, meaning or reason means 400 and nothing written', async () => {
    const res = await accept({ status: 'accepted' });
    // First, so a failure shows what the unsigned acceptance sent.
    expect(acceptances().map((s) => ({ via: s.via, sql: s.sql.replace(/\s+/g, ' ').trim(), params: s.params }))).toEqual([]);
    nothingWritten();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(reverifySigner).not.toHaveBeenCalled();
  });

  it.each([
    ['password', { meaning: 'approval', reason: REASON }],
    ['meaning', { reason: REASON, password: GOOD }],
    ['reason', { meaning: 'approval', password: GOOD }],
  ])('names a missing %s, and writes nothing', async (missing, partial) => {
    const res = await accept({ status: 'accepted', ...partial });
    nothingWritten();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(Object.keys(res.body.error.fieldErrors)).toContain(missing);
    expect(reverifySigner).not.toHaveBeenCalled();
  });
});

describe('the ceremony refuses, and nothing is accepted', () => {
  it('a wrong password: 401, said as the ceremony says it, and no transaction opened', async () => {
    const res = await accept({ status: 'accepted', ...SIGNATURE, password: 'wrong' });
    nothingWritten();
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'PASSWORD_VERIFICATION_FAILED', message: 'The password was not accepted. Nothing was signed.' });
    expect(reverifySigner).toHaveBeenCalledTimes(1);
    expect(h.log).not.toContain('BEGIN');
  });

  it.each(['review', 'authorship', 'release'])('a meaning an acceptance cannot carry (%s): 400 before the password is asked', async (meaning) => {
    const res = await accept({ status: 'accepted', ...SIGNATURE, meaning });
    nothingWritten();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEANING_NOT_ALLOWED');
    expect(reverifySigner).not.toHaveBeenCalled();
  });

  it('an editor whose role carries no signing authority: 403 before the password is asked', async () => {
    h.signerRole = 'member';
    const res = await accept({ status: 'accepted', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(reverifySigner).not.toHaveBeenCalled();
  });

  it('signing authority that cannot be read: 503, and the password is not asked', async () => {
    h.signerRole = new Error('connection reset');
    const res = await accept({ status: 'accepted', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SIGNING_AUTHORITY_UNVERIFIED');
    expect(JSON.stringify(res.body)).not.toContain('connection reset');
    expect(reverifySigner).not.toHaveBeenCalled();
  });

  it('a viewer is refused by the editor gate first, signature or not', async () => {
    h.role = 'viewer';
    const res = await accept({ status: 'accepted', ...SIGNATURE });
    expect(h.statements).toEqual([]);
    nothingWritten();
    expect({ status: res.status, body: res.body as unknown }).toEqual({ status: 403, body: { error: 'Insufficient permissions' } });
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(h.limited).toEqual([]);
  });

  it('a hazard already accepted: 409, rolled back, no second signature', async () => {
    h.hazard = { ...freshHazard(), status: 'accepted' };
    const res = await accept({ status: 'accepted', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RISK_ALREADY_ACCEPTED');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(h.log).toContain('ROLLBACK');
  });

  it('a hazard the organization does not hold, or one deleted: 404, rolled back', async () => {
    h.hazard = null;
    const res = await accept({ status: 'accepted', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RISK_ITEM_NOT_FOUND');
    expect(h.log).toContain('ROLLBACK');
    const read = h.statements.find((s) => /FOR UPDATE/.test(s.sql))!;
    expect(read.sql).toMatch(/organization_id = \$2/);
    expect(read.sql).toMatch(/deleted_at IS NULL/);
    expect(read.params).toEqual([1, ORG]);
  });

  it('the signature row cannot be written: the acceptance rolls back with it', async () => {
    h.sigFail = new Error('electronic_signatures insert failed');
    const res = await accept({ status: 'accepted', ...SIGNATURE });
    expect(res.status).toBe(500);
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    expect(res.body.signatureId).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('electronic_signatures');
  });

  it.each([
    ['a residual estimate', { residualProbability: 1 }],
    ['the acceptability to false', { acceptable: false }],
    ['the rationale', { benefitRiskRationale: 'Benefit outweighs' }],
  ])('an acceptance that also edits %s: 400, the signature covers the hazard as it stands', async (_what, edit) => {
    const res = await accept({ status: 'accepted', ...edit, ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESIDUAL_ACCEPTANCE_EDITS_FIELDS');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(reverifySigner).not.toHaveBeenCalled();
  });
});

describe('the signed acceptance', () => {
  it('re-verifies the signer, then sets the status, records the sign ledger pair and the signature row, then commits', async () => {
    const res = await accept({ status: 'accepted', ...SIGNATURE });
    expect(res.status).toBe(201);
    expect(h.log).toEqual([
      'BEGIN',
      'TENANT',
      `LOCK:governed-signed-act:${ORG}:risk-item:1`,
      'READ',
      'UPDATE',
      'LEDGER:sign:risk-item:1',
      'SIGNATURE:risk-item:1',
      'COMMIT',
    ]);
    expect(reverifySigner).toHaveBeenCalledWith(SIGNER, { password: GOOD, mfaToken: undefined }, expect.anything());
    // Nothing went over the shared pool: the acceptance is the transaction's.
    expect(h.statements.filter((s) => s.via === 'pool')).toEqual([]);
  });

  it('sets the status on the organization\'s live row only', async () => {
    await accept({ status: 'accepted', ...SIGNATURE });
    const [update] = writes();
    expect(update.via).toBe('tx');
    expect(update.sql).toMatch(/status = 'accepted'/);
    // The acceptability is the same judgment, set by the same signed write.
    expect(update.sql).toMatch(/acceptable = TRUE/);
    expect(update.sql).toMatch(/organization_id = \$2/);
    expect(update.sql).toMatch(/deleted_at IS NULL/);
    expect(update.params).toEqual([1, ORG]);
  });

  it('records what was accepted, under the declared meaning, on the ledger and the signature row', async () => {
    await accept({ status: 'accepted', ...SIGNATURE, meaning: 'responsibility' });
    const decided = {
      riskItemId: 1, refCode: 'HZ-01', programId: PROGRAM, hazard: 'Sensor drift', harm: 'Mis-dosing',
      previousStatus: 'verified', severity: 4, probability: 3, initialRisk: 12,
      residualSeverity: 4, residualProbability: 1, residualRisk: 4, previousAcceptable: null, acceptable: true,
      benefitRiskRationaleRecorded: false, meaning: 'responsibility',
    };
    const ledger = recordGovernedAction.mock.calls[0][1];
    expect(ledger).toMatchObject({ command: 'sign', target: 'risk-item:1', domain: 'risk', reason: REASON });
    expect(ledger.payload).toEqual(decided);
    const sig = persistGovernedSignSignature.mock.calls[0][1];
    expect(sig).toMatchObject({ target: 'risk-item:1', actionId: 'act_1', authenticationMethod: 'password', secondFactorVerified: false });
    expect(sig.payload).toEqual(decided);
  });

  it('answers with the accepted row and the signature', async () => {
    const res = await accept({ status: 'accepted', ...SIGNATURE });
    expect(res.body).toMatchObject({
      data: { id: 1, status: 'accepted', acceptable: true },
      signatureId: 314,
      signedAt: '2026-10-29T10:00:00.000Z',
      meaning: 'approval',
      actionId: 'act_1',
    });
  });

  it('goes through the per-signer signing-attempt limit; a plain status change does not', async () => {
    await accept({ status: 'accepted', ...SIGNATURE });
    expect(h.limited).toEqual(['governed-signed-act']);
    h.limited.length = 0;
    await accept({ status: 'mitigating' });
    expect(h.limited).toEqual([]);
  });
});

describe('recording the residual risk as acceptable is the same judgment', () => {
  it('a plain PATCH setting acceptable true answers 428, and nothing is written or limited', async () => {
    const res = await accept({ acceptable: true });
    // First, so a failure shows what the unsigned acceptability sent.
    expect(acceptances().map((s) => ({ via: s.via, sql: s.sql.replace(/\s+/g, ' ').trim(), params: s.params }))).toEqual([]);
    nothingWritten();
    expect(res.status).toBe(428);
    expect(res.body.details.code).toBe('RESIDUAL_ACCEPTANCE_REQUIRES_SIGNATURE');
    expect(res.body.error).toMatch(/Nothing was saved\.$/);
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(h.limited).toEqual([]);
  });

  it('with a rationale beside it, the same', async () => {
    const res = await accept({ acceptable: true, benefitRiskRationale: 'Benefit outweighs the residual risk' });
    nothingWritten();
    expect(res.status).toBe(428);
  });

  it('a signed acceptance that says acceptable true is the one act, and is signed', async () => {
    const res = await accept({ status: 'accepted', acceptable: true, ...SIGNATURE });
    expect(res.status).toBe(201);
    expect(h.log).toContain('SIGNATURE:risk-item:1');
  });

  it.each([false, null])('acceptable %s records no acceptance and asks for nothing, as before', async (acceptable) => {
    const res = await accept({ acceptable });
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].via).toBe('pool');
    expect(reverifySigner).not.toHaveBeenCalled();
  });
});

describe('what is not an acceptance asks for no signature, as before', () => {
  it.each(['open', 'mitigating', 'verified', 'closed'])('a status change to %s updates the row on the pool and signs nothing', async (status) => {
    const res = await accept({ status });
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].via).toBe('pool');
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('a new hazard is added open', async () => {
    const res = await request(app()).post('/api/mdx/risk-items').send({ hazard: 'h', harm: 'x', severity: 3, probability: 2 });
    expect(res.status).toBe(201);
    expect(writes()).toHaveLength(1);
  });

  it('a new hazard cannot be created already accepted: 428, and nothing is inserted', async () => {
    const res = await request(app()).post('/api/mdx/risk-items').send({ hazard: 'h', harm: 'x', severity: 3, probability: 2, status: 'accepted' });
    expect(writes()).toEqual([]);
    expect(res.status).toBe(428);
    expect(res.body.details.code).toBe('RESIDUAL_ACCEPTANCE_REQUIRES_SIGNATURE');
    expect(res.body.error).toMatch(/Nothing was saved\.$/);
  });
});
