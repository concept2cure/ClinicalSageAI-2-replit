/**
 * Signed content is not edited in place (P-63): a hazard whose residual risk is
 * accepted, its controls, and the signed reopen of its acceptance. D5, 21 CFR
 * Part 11 §11.10(e) and §11.70; ISO 14971; docs/evidence/D5-SIGNED-CONTENT-LOCKED/2026-10-29/.
 * The label's half is signed-content-locked.pglite.test.ts.
 *
 * Until this change an accepted hazard took every edit: its rationale, its
 * estimates, a control's evidence, a new control, and a plain move out of
 * accepted. Each read "changed since it was signed" (84aada8f7): detected,
 * not refused. And no route reopened an acceptance.
 *
 * Runs for real, on an in-process PGlite (signed-records.fixture.ts): the risk
 * router and its SQL, the ceremony (signGovernedAct), persistGovernedSignSignature
 * with the content binders, the read (readSignedContentStates), and AnA's
 * control tool. Stubbed at their module boundaries: the password check, the
 * signer's role, the tenant context, the assignee's membership and the ledger.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import {
  MEMBER, ORG, PROGRAM, REOPEN, SIGNATURE, SIGNER, clearSignedRecords, createSignedRecordTables, expectLocked, manifestOf,
  signedRecords, type Db,
} from './signed-records.fixture';

const h = vi.hoisted(() => ({
  pg: null as unknown as Db,
  ledger: [] as Array<{ command: string; target: string; payload: Record<string, unknown> }>,
  role: 'member' as string,
}));

const conn = {
  query: async (sql: string, params: unknown[] = []) => {
    const r = await h.pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
  release: () => undefined,
};

vi.mock('../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<Record<string, unknown>>()), requestPgClient: () => conn }));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));
vi.mock('../../services/part11/reverify-signer', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reverifySigner: async (_u: number, creds: { password?: string }) => (creds.password === 'correct horse battery staple'
    ? { ok: true, authenticationMethod: 'password', secondFactorVerified: false }
    : { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'The password was not accepted.' }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'approver' }));
vi.mock('../../services/part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => 'approver' }));
vi.mock('../../routes/c2c/actions', () => ({
  recordGovernedAction: async (_c: unknown, p: { command: string; target: string; payload: Record<string, unknown> }) => {
    h.ledger.push({ command: p.command, target: p.target, payload: p.payload });
    return { actionId: `act_${h.ledger.length}`, auditId: `aud_${h.ledger.length}`, sha256Chain: 'c'.repeat(64) };
  },
}));
vi.mock('../../middleware/orgMembership', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  // Organization 7's members are users 3, 5 and 6 (signed-records.fixture.ts).
  checkOrgMembership: async (userId: number, orgId: number) => (orgId === 7 && [3, 5, 6].includes(userId) ? 'member' : 'revoked'),
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

const db = signedRecords({ query: (sql, params) => h.pg.query(sql, params) });
const { seedHazard, hazardRow, controlsOf, signaturesOn, signatureCount } = db;

const patchRisk = (id: number, body: Record<string, unknown>) => request(app()).patch(`/api/mdx/risk-items/${id}`).send(body);
const getRisk = (id: number) => request(app()).get(`/api/mdx/risk-items/${id}`);
const addControl = (id: number, body: Record<string, unknown> = { description: 'Dual-sensor cross-check', controlType: 'protective_measure' }) =>
  request(app()).post(`/api/mdx/risk-items/${id}/controls`).send(body);
const patchControl = (ctlId: number, body: Record<string, unknown>) => request(app()).patch(`/api/mdx/risk-controls/${ctlId}`).send(body);
const reopen = (id: number, body: Record<string, unknown>) => request(app()).post(`/api/mdx/risk-items/${id}/reopen`).send(body);

/** A hazard whose residual risk was accepted through the signed act. */
async function acceptedHazard(): Promise<number> {
  const id = await seedHazard();
  const res = await patchRisk(id, { status: 'accepted', ...SIGNATURE });
  expect(res.status).toBe(201);
  return id;
}

beforeAll(async () => {
  const pg = new PGlite();
  h.pg = pg as unknown as Db;
  await createSignedRecordTables(pg as unknown as Parameters<typeof createSignedRecordTables>[0]);
}, 60_000);
afterAll(async () => { await (h.pg as unknown as PGlite)?.close(); });
beforeEach(async () => {
  await clearSignedRecords(h.pg);
  h.ledger.length = 0;
  h.role = 'member';
});

/** An AnA turn whose write a person confirmed, as the tool wrapper requires before it runs one. */
const ANA_CTX = { organizationId: ORG, userId: SIGNER, humanConfirmed: true } as never;

/* ─── P-63: the hazard ───────────────────────────────────────────────────── */

const HAZARD_EDITS: Array<[string, unknown]> = [
  ['refCode', 'HZ-99'], ['hazard', 'Sensor drift, reworded'], ['hazardousSituation', 'Reading low'], ['harm', 'Hypoglycaemia'],
  ['sequenceOfEvents', 'Drift only'], ['severity', 5], ['probability', 2], ['detectability', 3], ['controlStrategy', 'protective'],
  ['source', 'complaint'], ['residualSeverity', 3], ['residualProbability', 2], ['benefitRiskRationale', 'Accepted on commercial grounds'],
];

describe('P-63: a hazard whose residual risk is accepted refuses an edit of what the acceptance binds', () => {
  it.each(HAZARD_EDITS)('%s: 409 SIGNED_CONTENT_LOCKED, the row as it was, the acceptance still matching', async (field, value) => {
    const id = await acceptedHazard();
    const before = await hazardRow(id);
    const res = await patchRisk(id, { [field]: value });
    expectLocked(res, 'risk-item', { fields: [field] });
    expect(res.body.error).toMatch(/reopen the acceptance/);
    expect(await hazardRow(id)).toEqual(before);
    expect((await getRisk(id)).body.data.signedContent.state).toBe('matches');
  });

  it('adding a control: 409, naming the controls, and none is added', async () => {
    const id = await acceptedHazard();
    const res = await addControl(id);
    expectLocked(res, 'risk-item', { child: 'risk_controls' });
    expect(await controlsOf(id)).toHaveLength(1);
  });

  it.each([
    ['description', 'Edited'], ['verificationEvidence', 'none'], ['status', 'proposed'], ['newRiskItemId', 31],
  ])("editing a control's %s: 409, and it is as it was", async (field, value) => {
    const id = await acceptedHazard();
    const [before] = await controlsOf(id);
    expectLocked(await patchControl(before.id, { [field]: value }), 'risk-item', { child: 'risk_controls' });
    expect((await controlsOf(id))[0]).toEqual(before);
  });

  it('fields the acceptance does not bind stay editable: the assignee, the project, and closing it', async () => {
    const id = await acceptedHazard();
    expect((await patchRisk(id, { assignedTo: MEMBER })).status).toBe(200);
    expect((await patchRisk(id, { programId: PROGRAM })).status).toBe(200);
    expect((await patchRisk(id, { status: 'closed' })).status).toBe(200);
    expect(await hazardRow(id)).toMatchObject({ assigned_to: MEMBER, program_id: PROGRAM, status: 'closed', acceptable: true });
    // Closed, its acceptance is still in force: what it binds is still refused.
    expectLocked(await patchRisk(id, { harm: 'Hypoglycaemia' }), 'risk-item', { fields: ['harm'] });
    expect((await getRisk(id)).body.data.signedContent.state).toBe('matches');
  });

  it.each([
    [{ status: 'open' }], [{ status: 'mitigating' }], [{ status: 'verified' }], [{ acceptable: false }], [{ acceptable: null }],
  ])('taking the acceptance off without a signature (%j): 409, the reopen named, nothing saved', async (body) => {
    const id = await acceptedHazard();
    const before = await hazardRow(id);
    const res = await patchRisk(id, body);
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('RESIDUAL_ACCEPTANCE_REOPEN_REQUIRED');
    expect(res.body.error).toMatch(/\/api\/mdx\/risk-items\/:id\/reopen.*Nothing was saved\.$/);
    expect(await hazardRow(id)).toEqual(before);
  });

  it('a hazard recorded acceptable before the signed acceptance (acceptable true, status verified) is held the same way', async () => {
    const id = await seedHazard({ status: 'verified', acceptable: true });
    expectLocked(await patchRisk(id, { benefitRiskRationale: 'Rewritten' }), 'risk-item', { fields: ['benefitRiskRationale'] });
    expectLocked(await addControl(id), 'risk-item', { child: 'risk_controls' });
  });

  it('a hazard not accepted takes every edit, control and status move, as before', async () => {
    const id = await seedHazard();
    expect((await patchRisk(id, { severity: 5, benefitRiskRationale: 'Rewritten', status: 'mitigating', acceptable: false })).status).toBe(200);
    expect((await addControl(id)).status).toBe(201);
    const [ctl] = await controlsOf(id);
    expect((await patchControl(ctl.id, { verificationEvidence: 'VER-0043' })).status).toBe(200);
    expect(await hazardRow(id)).toMatchObject({ severity: 5, initial_risk: 15, status: 'mitigating' });
  });

  it('a rationale rewritten before this rule is still detected: the acceptance reads "changed"', async () => {
    const id = await acceptedHazard();
    await h.pg.query(`UPDATE risk_items SET benefit_risk_rationale = 'Rewritten' WHERE id = $1`, [id]);
    expect((await getRisk(id)).body.data.signedContent.state).toBe('changed');
  });
});

describe("P-63: AnA's control tool is refused the same way", () => {
  it('add_risk_control on an accepted hazard: the one refusal, and no control', async () => {
    const { getToolHandler } = await import('../../services/ana/AnaToolExecutor');
    const id = await acceptedHazard();
    const out = JSON.parse(await getToolHandler('add_risk_control')!({ risk_item_id: id, description: 'Dual-sensor cross-check', control_type: 'protective_measure' }, ANA_CTX));
    expect(out).toMatchObject({ code: 'SIGNED_CONTENT_LOCKED' });
    expect(await controlsOf(id)).toHaveLength(1);
  }, 60_000);

  it('add_risk_control on a hazard not accepted adds it, as before', async () => {
    const { getToolHandler } = await import('../../services/ana/AnaToolExecutor');
    const id = await seedHazard();
    const out = JSON.parse(await getToolHandler('add_risk_control')!({ risk_item_id: id, description: 'Dual-sensor cross-check', control_type: 'protective_measure' }, ANA_CTX));
    expect(out).toMatchObject({ ok: true, control_type: 'protective_measure', status: 'proposed' });
    expect(await controlsOf(id)).toHaveLength(2);
  }, 60_000);
});

/* ─── P-63: reopening an accepted hazard ─────────────────────────────────── */

describe("P-63: reopening a hazard's accepted residual risk is a signed act", () => {
  it('returns it to the status it had before acceptance, clears the acceptability, and signs the hazard as it stood', async () => {
    const id = await acceptedHazard();
    const [acceptance] = await signaturesOn(`risk-item:${id}`);
    const res = await reopen(id, REOPEN);
    expect(res.status).toBe(201);
    expect(await hazardRow(id)).toMatchObject({ status: 'verified', acceptable: null });
    const rows = await signaturesOn(`risk-item:${id}`);
    expect(rows).toHaveLength(2);
    const reopened = rows[1];
    expect(reopened).toMatchObject({ binding_basis: 'risk-residual-acceptance-content-sha256', signature_meaning: 'responsibility' });
    // Nothing it binds moved while it was accepted, so the reopen signs the digest the acceptance signed.
    expect(reopened.bound_payload_digest).toBe(acceptance.bound_payload_digest);
    expect(manifestOf(reopened).act).toMatchObject({
      kind: 'reopen-residual-acceptance', riskItemId: id, previousStatus: 'accepted', previousAcceptable: true, status: 'verified',
      reopenedAcceptanceSignatureId: acceptance.id,
    });
    expect(h.ledger.map((l) => `${l.command}:${l.target}`)).toEqual([`sign:risk-item:${id}`, `sign:risk-item:${id}`]);
  });

  it('then the hazard takes edits, and its residual risk is accepted and signed again', async () => {
    const id = await acceptedHazard();
    expect((await reopen(id, REOPEN)).status).toBe(201);
    expect((await patchRisk(id, { probability: 2, benefitRiskRationale: 'Re-estimated after the complaint' })).status).toBe(200);
    expect((await addControl(id)).status).toBe(201);
    expect((await patchRisk(id, { status: 'accepted', ...SIGNATURE })).status).toBe(201);
    expect((await getRisk(id)).body.data.signedContent).toMatchObject({ state: 'matches', meaning: 'approval' });
    expectLocked(await patchRisk(id, { probability: 3 }), 'risk-item', { fields: ['probability'] });
  });

  it('may name the pre-acceptance status it returns to', async () => {
    const id = await acceptedHazard();
    expect((await reopen(id, { ...REOPEN, status: 'mitigating' })).status).toBe(201);
    expect((await hazardRow(id)).status).toBe('mitigating');
  });

  it('a hazard accepted with no signed acceptance on record must be told the status: 409, nothing signed; then it reopens', async () => {
    const id = await seedHazard({ status: 'accepted', acceptable: true });
    const res = await reopen(id, REOPEN);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RISK_REOPEN_STATUS_REQUIRED');
    expect(await signatureCount()).toBe(0);
    expect((await reopen(id, { ...REOPEN, status: 'verified' })).status).toBe(201);
    expect(await hazardRow(id)).toMatchObject({ status: 'verified', acceptable: null });
  });

  it('an acceptance withdrawn from force records no status to return to: the reopen must be told it', async () => {
    const id = await acceptedHazard();
    await h.pg.query(`UPDATE electronic_signatures SET is_valid = false, verification_status = 'revoked' WHERE signed_target = $1`, [`risk-item:${id}`]);
    const res = await reopen(id, REOPEN);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RISK_REOPEN_STATUS_REQUIRED');
    expect(await signatureCount()).toBe(1);
  });

  it('a hazard not accepted has nothing to reopen: 409, nothing signed, nothing changed', async () => {
    const id = await seedHazard();
    const res = await reopen(id, REOPEN);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RISK_NOT_ACCEPTED');
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(await signatureCount()).toBe(0);
    expect((await hazardRow(id)).status).toBe('verified');
  });

  it('without the signature: 400, and the acceptance stands', async () => {
    const id = await acceptedHazard();
    const res = await reopen(id, { reason: REOPEN.reason });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(await hazardRow(id)).toMatchObject({ status: 'accepted', acceptable: true });
  });

  it('a wrong password: 401, and the acceptance stands', async () => {
    const id = await acceptedHazard();
    expect((await reopen(id, { ...REOPEN, password: 'wrong' })).status).toBe(401);
    expect(await hazardRow(id)).toMatchObject({ status: 'accepted', acceptable: true });
    expect(await signatureCount()).toBe(1);
  });

  it('a status that is not before acceptance: 422, nothing signed', async () => {
    const id = await acceptedHazard();
    expect((await reopen(id, { ...REOPEN, status: 'closed' })).status).toBe(422);
    expect(await signatureCount()).toBe(1);
  });

  it('a viewer is refused by the editor gate, and a hazard the organization does not hold is a 404', async () => {
    const id = await acceptedHazard();
    h.role = 'viewer';
    expect((await reopen(id, REOPEN)).status).toBe(403);
    h.role = 'member';
    expect((await reopen(424242, REOPEN)).status).toBe(404);
    expect(await hazardRow(id)).toMatchObject({ status: 'accepted' });
  });
});
