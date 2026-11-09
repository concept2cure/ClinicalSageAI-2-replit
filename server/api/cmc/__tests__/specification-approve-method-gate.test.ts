/**
 * A limit is approved only with a procedure fit to measure it (ICH Q2).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The Specifications tab told a CMC user this in two places — a banner reading
 * "A specification cannot be approved until its analytical method is validated
 * (ICH Q2)" and the tab's own copy — and nothing refused it.
 * `POST /api/cmc/specifications/:id/approve` checked not-found,
 * already-approved, signing authority, re-authentication, the governed reason
 * and the ledger, and never looked at the method.
 *
 * The screen's own check was weaker still: `noMethod` is `!method`, i.e. "no
 * method NAME was typed". A specification naming a method whose register row
 * was still `development` satisfied the banner, the button and the server
 * alike. And because the only check lived in the client, any caller that was
 * not the form — an AnA tool, a script, curl — approved freely in every case.
 *
 * A gate that is stated and not enforced is worse than no gate: a reader takes
 * it as having been applied.
 *
 * ── What these cases hold ────────────────────────────────────────────────────
 * The route's behaviour: which status, and that NOTHING is written on a
 * refusal. The rule itself — including why an unreadable register and an
 * unrecorded status are NOT refusals — is pinned in
 * `services/cmc/__tests__/analytical-method-source.test.ts`.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  writes: [] as string[],
  /** The specification row the route locks. */
  spec: null as Record<string, unknown> | null,
  /** Rows of `cmc_source_objects` the method register read answers with. */
  methods: [] as Array<{ sourceKey: string; sourcePayload: Record<string, unknown>; isMethod: boolean }>,
}));

/** Authority answers null (authorized) unless a case says otherwise. */
const checkSigningAuthority = vi.fn(async (): Promise<unknown> => null);
vi.mock('../../../services/part11/signing-authority-gate', () => ({
  checkSigningAuthority: (...a: unknown[]) => checkSigningAuthority(...(a as [])),
}));
const verifyReauth = vi.fn(async () => ({ ok: true }));
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => verifyReauth(...(a as [])),
  recordGovernedAction: async () => ({ actionId: 'act-1', auditId: 'aud-1', sha256Chain: 'chain' }),
}));
vi.mock('../../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedActionSignature: async () => ({ id: 1, signedAt: new Date() }),
}));
vi.mock('../../../services/cmc-write-through', () => ({ writeThroughSpecification: async () => ({ ok: true }) }));
vi.mock('../../../services/cmc/link-to-module3', () => ({ linkToModule3: async () => ({ linked: true }) }));

vi.mock('../../../db', () => {
  const query = async (sql: string, _params?: unknown[]) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
    // The method register read (analytical-method-source).
    if (/FROM cmc_source_objects/.test(sql)) return { rows: h.methods };
    // The specification, locked for the signature.
    if (/FROM quality_specifications/.test(sql)) return { rows: h.spec ? [h.spec] : [] };
    if (/^\s*UPDATE quality_specifications/i.test(sql)) {
      h.writes.push('approve');
      return { rows: [{ ...(h.spec ?? {}), approval_status: 'approved' }], rowCount: 1 };
    }
    if (/^\s*INSERT/i.test(sql)) h.writes.push('insert');
    return { rows: [] };
  };
  return {
    getPool: () => ({ query, connect: async () => ({ query, release: vi.fn() }) }),
    pool: { query },
    db: {},
  };
});

import router from '../specificationRoutes';

const ORG = 101;
const SPEC_ID = '11111111-2222-4333-8444-555555555555';
const PROJECT = '99999999-8888-4777-8666-555555555555';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = ORG;
  req.tenantContext = { organizationId: ORG };
  req.user = { id: 7, organizationId: ORG };
  next();
});
app.use('/api/cmc/specifications', router);

const specRow = (method: unknown) => ({
  id: SPEC_ID,
  tenant_id: ORG,
  project_id: PROJECT,
  material_name: 'Aggregation',
  approval_status: 'draft',
  test_methods: method,
});
const methodRow = (payload: Record<string, unknown>) => ({
  sourceKey: 'method:1',
  sourcePayload: payload,
  isMethod: true,
});
const approve = () =>
  request(app)
    .post(`/api/cmc/specifications/${SPEC_ID}/approve`)
    .send({ reason: 'Limits agreed at the CMC review on 4 November.', meaning: 'approval', reauth: { password: 'x' } });

beforeEach(() => {
  h.writes = [];
  h.spec = null;
  h.methods = [];
  verifyReauth.mockClear();
  checkSigningAuthority.mockClear();
  checkSigningAuthority.mockResolvedValue(null);
});

describe('POST /specifications/:id/approve — the method gate the screen promised', () => {
  it('refuses, and writes nothing, when the named method is still in development', async () => {
    h.spec = specRow({ method: 'SE-HPLC' });
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'development' })];

    const res = await approve();

    expect(res.status, 'a limit measured by a method in development was approved').toBe(409);
    expect(res.body.error).toBe('METHOD_NOT_FIT');
    expect(res.body.message).toMatch(/SE-HPLC/);
    expect(res.body.message).toMatch(/development/);
    expect(h.writes, 'the approval was written despite the refusal').toEqual([]);
  });

  it('refuses, and writes nothing, when the specification names no method at all', async () => {
    /* The form disables its own button here, so this case is every OTHER
       caller: an AnA tool, a script, curl. */
    h.spec = specRow({ method: '' });
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'validated' })];

    const res = await approve();

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('METHOD_NOT_NAMED');
    expect(h.writes).toEqual([]);
  });

  it('approves when the named method is validated', async () => {
    h.spec = specRow({ method: 'SE-HPLC' });
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'validated' })];

    const res = await approve();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.writes).toContain('approve');
  });

  it('refuses, and writes nothing, when the register does not hold the named method', async () => {
    /* A compendial procedure is not an exception: the register records and
       verifies one like any other. An approved specification is a filed
       commitment, so the bar is that the product can SHOW the procedure is
       fit, not merely that it has not been shown unfit. */
    h.spec = specRow({ method: 'USP <711> Dissolution' });
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'validated' })];

    const res = await approve();

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('METHOD_NOT_IN_REGISTER');
    expect(h.writes).toEqual([]);
  });

  /* ── P-110 item 1 (2026-11-09) ─────────────────────────────────────────────
     This case read "approves a procedure shown suitable without full
     validation", on the repository's own ICH Q2 reading (`q2Expectation`
     makes suitability sufficient before phase 3). That reading stands. What
     changed is where the word comes from: the coordinating session decided,
     under the founder's delegation of 2026-11-08, that suitability is a signed
     act and the unsigned word is refused, including as an interim. */
  it('refuses a suitable status that carries no signature, and writes nothing', async () => {
    h.spec = specRow({ method: 'SE-HPLC' });
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'qualified' })];

    const res = await approve();

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('METHOD_NOT_FIT');
    expect(res.body.message).toMatch(/not a signed act/i);
    expect(h.writes, 'a refused approval wrote something').toEqual([]);
  });

  it('approves a procedure shown suitable for its phase UNDER SIGNATURE', async () => {
    /* Suitability still supports an approved limit before phase 3 — the
       early-phase work P-110 was careful not to block. The signature is what
       the gate now reads, and the ceremony that writes it is the method
       register's own Validate act. */
    h.spec = specRow({ method: 'SE-HPLC' });
    h.methods = [methodRow({
      methodName: 'SE-HPLC',
      validationStatus: 'phase-appropriate',
      validatedBy: 7,
      validationDate: '2026-11-09T10:00:00Z',
    })];

    const res = await approve();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.writes).toContain('approve');
  });

  it('refuses BEFORE asking the signer to re-authenticate — nobody signs into a refusal', async () => {
    /* The gate first ran inside the write transaction, which is after the
       re-auth: a signer typed their password and was then told the act could
       never complete. The status was right and the ceremony was wrong. This
       case pins the ORDER, which the status alone cannot: with the
       precondition back inside the transaction the refusal is still a 409 and
       only this assertion goes red. */
    h.spec = specRow({ method: 'SE-HPLC' });
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'development' })];

    const res = await approve();

    expect(res.status).toBe(409);
    expect(verifyReauth, 'the signer re-authenticated into a refusal').not.toHaveBeenCalled();
  });

  it('asks signing authority before the password, and before the method', async () => {
    /* §11.10(g): identity is not authority. A viewer who cannot sign is turned
       away without typing a password, and without the register being read on
       their behalf — the order `ci:sign-ceremony` requires in the handler, and
       which that gate checks only by presence. Both ceremony calls are in the
       handler for this reason: a reader can see which comes first. */
    checkSigningAuthority.mockResolvedValue({
      status: 403, code: 'ESIGNATURE_NO_AUTHORITY', message: 'no authority',
    });
    h.spec = specRow({ method: 'SE-HPLC' });
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'validated' })];

    const res = await approve();

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(verifyReauth, 'a signer with no authority was asked for their password').not.toHaveBeenCalled();
    expect(h.writes, 'the approval was written for a signer with no authority').toEqual([]);
  });

  it('still asks for re-authentication when the specification IS approvable', async () => {
    h.spec = specRow({ method: 'SE-HPLC' });
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'validated' })];

    await approve();

    expect(verifyReauth, 'the re-auth gate was skipped for an approvable specification').toHaveBeenCalled();
  });

  it('reads the method from a bare jsonb string, as the display row does', async () => {
    /* A caller that is not the form may persist `"SE-HPLC"` rather than
       `{ method: "SE-HPLC" }`; `specRowFromApi` reads both, and the gate must
       resolve the same name the screen shows. */
    h.spec = specRow('SE-HPLC');
    h.methods = [methodRow({ methodName: 'SE-HPLC', validationStatus: 'retired' })];

    const res = await approve();

    expect(res.status, 'a bare-string method was not read, so the gate did not fire').toBe(409);
    expect(res.body.error).toBe('METHOD_NOT_FIT');
    expect(h.writes).toEqual([]);
  });
});
