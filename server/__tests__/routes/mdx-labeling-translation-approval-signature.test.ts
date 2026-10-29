/**
 * Approving a labeling translation is an electronic signature (D5, 2026-10-29;
 * docs/evidence/D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/).
 *
 * `PATCH /api/mdx/labeling/translations/:transId` with status `approved`
 * stamped approved_by and approved_at from a session alone. Since 43fb57cc it
 * needed an editor, but there was still no re-authentication (21 CFR 11.200),
 * no declared meaning (11.50(a)(3)), no reason and no electronic_signatures row
 * (11.50, 11.70). `POST /api/mdx/labeling/:id/translations` could also create a
 * translation that was already approved.
 *
 * The approval now runs the platform's one route-level signing ceremony,
 * signGovernedAct (server/routes/governed-signed-act.ts). That is the ceremony
 * the QMS periodic review and the RIM label approval use, and it is used here
 * the way RIM uses it: the same route signs when the status is `approved`, and
 * a plain status change asks for nothing. These tests drive the real labeling
 * router and the real ceremony. Its pieces are stubbed at their module
 * boundaries: signer re-verification, the signer's role, the ledger pair, the
 * signature row and the tenant context. The fake transaction client records
 * the order of statements, so "the approval lands with its signature or not at
 * all" is asserted, not assumed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const SIGNER = 5;
const GOOD = 'correct horse battery staple';
const REASON = 'Back-translation checked against the English IFU';
const SIGNATURE = { meaning: 'approval', reason: REASON, password: GOOD };

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  /** The caller's role on the request, which the editor gate reads. */
  role: 'member' as string | undefined,
  /** The signer's role on the membership row, which signing authority reads; an Error fails the lookup. */
  signerRole: 'approver' as string | null | Error,
  /** The translation the transaction reads, or null when the organization has none by that id. */
  translation: null as Row | null,
  /** Thrown by the signature-row write when set. */
  sigFail: null as unknown,
  /** Every statement, in order, on either connection. */
  statements: [] as Array<{ via: 'pool' | 'tx'; sql: string; params: unknown[] }>,
  /** What the ceremony did, in order: transaction words, the ledger, the signature. */
  log: [] as string[],
  /** Scopes of the signing-attempt limiter each request passed through. */
  limited: [] as string[],
}));

function freshTranslation(): Row {
  return {
    id: 1, labeling_document_id: 4, organization_id: ORG, language: 'de', status: 'review',
    translation_method: 'human', back_translation_verified: true, artifact_id: null,
    approved_by: null, approved_at: null,
    // Who added it (20261029b): someone other than the signer, so separation of duties admits the approval.
    created_by: 3,
  };
}

/* The request's pinned connection, on which the ceremony runs the approval. */
const tx = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    h.statements.push({ via: 'tx', sql, params });
    const word = sql.trim().split(/\s+/)[0].toUpperCase();
    if (word === 'BEGIN' || word === 'COMMIT' || word === 'ROLLBACK') { h.log.push(word); return { rows: [], rowCount: 0 }; }
    if (/pg_advisory_xact_lock/.test(sql)) { h.log.push(`LOCK:${String(params[0])}`); return { rows: [], rowCount: 0 }; }
    // Separation of duties reads the translation's creator on the signing transaction.
    if (/SELECT created_by FROM labeling_translations/.test(sql)) {
      h.log.push('AUTHORS');
      return h.translation ? { rows: [{ created_by: h.translation.created_by }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/FROM labeling_translations/.test(sql) && /FOR UPDATE/.test(sql)) {
      h.log.push('READ');
      return h.translation ? { rows: [{ ...h.translation }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/^\s*UPDATE labeling_translations/.test(sql)) {
      h.log.push('UPDATE');
      const row = { ...(h.translation ?? {}), status: 'approved', approved_by: params[2], approved_at: '2026-10-29T10:00:00.000Z' };
      return { rows: [row], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};

vi.mock('../../db', () => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      h.statements.push({ via: 'pool', sql, params });
      // requireDocInOrg and every plain write find document 4 / translation 1.
      return { rows: [{ id: 1, labeling_document_id: 4, language: 'de', status: 'review' }], rowCount: 1 };
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

import labelingRouter from '../../routes/mdx-labeling';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: SIGNER, organizationId: ORG, role: h.role };
    next();
  });
  a.use('/api/mdx', labelingRouter);
  return a;
}

const approve = (body: Row) => request(app()).patch('/api/mdx/labeling/translations/1').send(body);
const writes = () => h.statements.filter((s) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(s.sql));
/** Statements that set an approval stamp to a value. Clearing one (`= NULL`) withdraws an approval, as ci:sign-ceremony reads it. */
const stamps = () => h.statements.filter((s) => /\bapproved_(by|at)\s*=\s*(?!NULL\b)[^\s,]/.test(s.sql));
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
  h.translation = freshTranslation();
  h.sigFail = null;
  h.statements.length = 0;
  h.log.length = 0;
  h.limited.length = 0;
  tx.query.mockClear();
  reverifySigner.mockClear();
  recordGovernedAction.mockClear();
  persistGovernedSignSignature.mockClear();
});

describe('approving a translation without a signature', () => {
  it('is refused: no password, meaning or reason means 400 and nothing written', async () => {
    const res = await approve({ status: 'approved' });
    // First, so a failure shows what the unsigned approval sent.
    expect(stamps().map((s) => ({ via: s.via, sql: s.sql.replace(/\s+/g, ' ').trim(), params: s.params }))).toEqual([]);
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
    const res = await approve({ status: 'approved', ...partial });
    nothingWritten();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(Object.keys(res.body.error.fieldErrors)).toContain(missing);
    expect(reverifySigner).not.toHaveBeenCalled();
  });
});

describe('the ceremony refuses, and nothing is approved', () => {
  it('a wrong password: 401, said as the ceremony says it, and no transaction opened', async () => {
    const res = await approve({ status: 'approved', ...SIGNATURE, password: 'wrong' });
    nothingWritten();
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'PASSWORD_VERIFICATION_FAILED', message: 'The password was not accepted. Nothing was signed.' });
    expect(reverifySigner).toHaveBeenCalledTimes(1);
    expect(h.log).not.toContain('BEGIN');
  });

  it.each(['review', 'authorship', 'release'])('a meaning an approval cannot carry (%s): 400 before the password is asked', async (meaning) => {
    const res = await approve({ status: 'approved', ...SIGNATURE, meaning });
    nothingWritten();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEANING_NOT_ALLOWED');
    expect(reverifySigner).not.toHaveBeenCalled();
  });

  it('an editor whose role carries no signing authority: 403 before the password is asked', async () => {
    h.signerRole = 'member';
    const res = await approve({ status: 'approved', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(reverifySigner).not.toHaveBeenCalled();
  });

  it('signing authority that cannot be read: 503, and the password is not asked', async () => {
    h.signerRole = new Error('connection reset');
    const res = await approve({ status: 'approved', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SIGNING_AUTHORITY_UNVERIFIED');
    expect(JSON.stringify(res.body)).not.toContain('connection reset');
    expect(reverifySigner).not.toHaveBeenCalled();
  });

  it('a viewer is refused by the editor gate first, signature or not', async () => {
    h.role = 'viewer';
    const res = await approve({ status: 'approved', ...SIGNATURE });
    expect(h.statements).toEqual([]);
    nothingWritten();
    expect({ status: res.status, body: res.body as unknown }).toEqual({ status: 403, body: { error: 'Insufficient permissions' } });
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(h.limited).toEqual([]);
  });

  it('a translation already approved: 409, rolled back, no second signature', async () => {
    h.translation = { ...freshTranslation(), status: 'approved', approved_by: 9, approved_at: '2026-10-01T00:00:00Z' };
    const res = await approve({ status: 'approved', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRANSLATION_ALREADY_APPROVED');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(h.log).toContain('ROLLBACK');
  });

  it('the person who added the translation: 403 separation of duties, read on the signing transaction, before any stamp', async () => {
    h.translation = { ...freshTranslation(), created_by: SIGNER };
    const res = await approve({ status: 'approved', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SEPARATION_OF_DUTIES');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(h.log).toEqual(['BEGIN', 'TENANT', `LOCK:governed-signed-act:${ORG}:labeling-translation:1`, 'READ', 'AUTHORS', 'ROLLBACK']);
    const authors = h.statements.find((s) => /SELECT created_by/.test(s.sql))!;
    expect(authors.via).toBe('tx');
    expect(authors.sql).toMatch(/organization_id = \$2/);
  });

  it("a translation the organization does not hold, or whose document is deleted: 404, rolled back", async () => {
    h.translation = null;
    const res = await approve({ status: 'approved', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRANSLATION_NOT_FOUND');
    expect(h.log).toContain('ROLLBACK');
    const read = h.statements.find((s) => /FOR UPDATE/.test(s.sql))!;
    expect(read.sql).toMatch(/organization_id = \$2/);
    expect(read.sql).toMatch(/deleted_at IS NULL/);
    expect(read.params).toEqual([1, ORG]);
  });

  it('the signature row cannot be written: the approval rolls back with it', async () => {
    h.sigFail = new Error('electronic_signatures insert failed');
    const res = await approve({ status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(500);
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    expect(res.body.signatureId).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('electronic_signatures');
  });

  it('an approval that also edits the translation: 400, the signature covers the translation as it stands', async () => {
    const res = await approve({ status: 'approved', language: 'fr', ...SIGNATURE });
    nothingWritten();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TRANSLATION_APPROVAL_EDITS_FIELDS');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(reverifySigner).not.toHaveBeenCalled();
  });
});

describe('the signed approval', () => {
  it('re-verifies the signer, then stamps, records the sign ledger pair and the signature row, then commits', async () => {
    const res = await approve({ status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(201);
    expect(h.log).toEqual([
      'BEGIN',
      'TENANT',
      `LOCK:governed-signed-act:${ORG}:labeling-translation:1`,
      'READ',
      'AUTHORS',
      'UPDATE',
      'LEDGER:sign:labeling-translation:1',
      'SIGNATURE:labeling-translation:1',
      'COMMIT',
    ]);
    expect(reverifySigner).toHaveBeenCalledWith(SIGNER, { password: GOOD, mfaToken: undefined }, expect.anything());
    // Nothing went over the shared pool: the approval is the transaction's.
    expect(h.statements.filter((s) => s.via === 'pool')).toEqual([]);
  });

  it('stamps the signer as the approver, on the organization\'s row only', async () => {
    await approve({ status: 'approved', ...SIGNATURE });
    const [update] = writes();
    expect(update.via).toBe('tx');
    expect(update.sql).toMatch(/status = 'approved'/);
    expect(update.sql).toMatch(/approved_by = \$3/);
    expect(update.sql).toMatch(/organization_id = \$2/);
    expect(update.params).toEqual([1, ORG, SIGNER]);
  });

  it('records what was approved, under the declared meaning, on the ledger and the signature row', async () => {
    await approve({ status: 'approved', ...SIGNATURE, meaning: 'responsibility' });
    const decided = {
      translationId: 1, labelingDocumentId: 4, language: 'de', previousStatus: 'review',
      translationMethod: 'human', backTranslationVerified: true, meaning: 'responsibility',
      // Separation of duties, recorded as the QMS approval records it.
      twoPersonRule: 'enforced', originalAuthorId: 3,
    };
    const ledger = recordGovernedAction.mock.calls[0][1];
    expect(ledger).toMatchObject({ command: 'sign', target: 'labeling-translation:1', domain: 'labeling', reason: REASON });
    expect(ledger.payload).toEqual(decided);
    const sig = persistGovernedSignSignature.mock.calls[0][1];
    expect(sig).toMatchObject({ target: 'labeling-translation:1', actionId: 'act_1', authenticationMethod: 'password', secondFactorVerified: false });
    expect(sig.payload).toEqual(decided);
  });

  it('answers with the approved row and the signature', async () => {
    const res = await approve({ status: 'approved', ...SIGNATURE });
    expect(res.body).toMatchObject({
      data: { id: 1, status: 'approved', approved_by: SIGNER },
      signatureId: 314,
      signedAt: '2026-10-29T10:00:00.000Z',
      meaning: 'approval',
      actionId: 'act_1',
    });
  });

  it('goes through the per-signer signing-attempt limit; a plain status change does not', async () => {
    await approve({ status: 'approved', ...SIGNATURE });
    expect(h.limited).toEqual(['governed-signed-act']);
    h.limited.length = 0;
    await approve({ status: 'review' });
    expect(h.limited).toEqual([]);
  });
});

describe('what is not an approval asks for no signature, as before', () => {
  it('a status change short of approved updates the row and stamps nothing', async () => {
    const res = await approve({ status: 'review' });
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].via).toBe('pool');
    expect(stamps()).toEqual([]);
    expect(reverifySigner).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('a new translation is added as pending', async () => {
    const res = await request(app()).post('/api/mdx/labeling/4/translations').send({ language: 'fr', status: 'pending' });
    expect(res.status).toBe(201);
    expect(writes()).toHaveLength(1);
  });

  it('a new translation cannot be created already approved: 428, and nothing is inserted', async () => {
    const res = await request(app()).post('/api/mdx/labeling/4/translations').send({ language: 'fr', status: 'approved' });
    expect(writes()).toEqual([]);
    expect(res.status).toBe(428);
    expect(res.body.details.code).toBe('TRANSLATION_APPROVAL_REQUIRES_SIGNATURE');
    expect(res.body.error).toMatch(/Nothing was saved\.$/);
  });
});
