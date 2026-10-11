/**
 * POST /api/ana-ri/governed-action — AnA approving or locking an artifact is
 * the e-signature tier, signed with the act's own meaning (2026-10-01, D5).
 *
 * `update_artifact_status` was the reason tier for every target, so the route
 * ran an approval or a lock on a reason for change with no re-authentication.
 * Its tier now follows what the call does (part11-governance.ts
 * requiredSignatureMeaning): moving to review stays the reason tier; approving
 * is an e-signature with the meaning 'approval', locking one with 'release'
 * (the status route's ARTIFACT_ACT_MEANING). A different meaning is refused
 * before the password is checked, as the status route refuses it.
 *
 * What the handler then does with the verified sign-off is pinned in
 * services/ana-ri/__tests__/ana-signed-artifact-act.pglite.integration.test.ts.
 */
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const ORG = 1;
const USER = 42;

const executed: Array<{ commands: unknown[]; ctx: Record<string, any> }> = [];
const reverify = vi.fn(async () => ({ ok: true, authenticationMethod: 'password', secondFactorVerified: false }));
const { signerRole } = vi.hoisted(() => ({ signerRole: vi.fn(async (): Promise<string | null> => 'approver') }));
// §11.10(g): the signer's role, as the membership row holds it.
vi.mock('../../../services/part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: (...a: unknown[]) => signerRole(...(a as [])),
}));

vi.mock('../../../db/requestDb', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: vi.fn(() => ({ query: vi.fn() })),
}));
vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readPendingApproval: vi.fn(async () => null),
  recordApprovalDecision: vi.fn(async () => true),
}));
vi.mock('../../../services/part11/reverify-signer.js', () => ({ reverifySigner: reverify }));
vi.mock('../../../services/auditService.js', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true })) },
}));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  executeCommands: vi.fn(async (commands: unknown[], ctx: Record<string, unknown>) => {
    executed.push({ commands, ctx });
    return [{ success: true, message: 'Signed.' }];
  }),
}));

let app: express.Express;

beforeAll(async () => {
  const { mountUtilityRoutes } = await import('../utility');
  const router = Router();
  mountUtilityRoutes(router);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantId = ORG;
    (req as any).userId = USER;
    next();
  });
  app.use('/api/ana-ri', router);
});

beforeEach(() => {
  executed.length = 0;
  reverify.mockClear();
  signerRole.mockReset();
  signerRole.mockResolvedValue('approver');
});

const REASON = 'Reviewed against the protocol; ready for filing.';
const post = (status: string, extra: Record<string, unknown> = {}, meaning?: string) =>
  request(app)
    .post('/api/ana-ri/governed-action')
    .send({
      command: 'update_artifact_status',
      params: { projectId: 3, artifactId: 'artifact_abc', status, ...(meaning && { signatureMeaning: meaning }) },
      reasonForChange: REASON,
      ...extra,
    });

describe('moving an artifact to review stays the reason tier', () => {
  it('runs on a reason, with no password asked for', async () => {
    const res = await post('review');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(reverify).not.toHaveBeenCalled();
    expect(executed[0].ctx.signoff).toMatchObject({ reasonForChange: REASON, signatureVerified: false });
  });
});

describe('approving or locking an artifact is an electronic signature', () => {
  it.each([['approved'], ['locked']])('%s on a reason alone: refused, nothing run', async status => {
    const res = await post(status);

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error?.code ?? res.body.code).toMatch(/SIGNATURE_MEANING_REQUIRED/);
    expect(executed).toEqual([]);
  });

  it.each([
    ['approved', 'RELEASE'],
    ['approved', 'AUTHOR'],
    ['locked', 'APPROVER'],
    ['locked', 'REVIEWER'],
  ])('%s declared as %s: refused before the password is checked, nothing run', async (status, meaning) => {
    const res = await post(status, { password: 'wrong' }, meaning);

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).toContain('SIGNATURE_MEANING_MISMATCH');
    expect(reverify).not.toHaveBeenCalled();
    expect(executed).toEqual([]);
  });

  it.each([
    ['approved', 'APPROVER', 'approval'],
    ['locked', 'RELEASE', 'release'],
  ])('%s declared as %s and re-authenticated: runs with a verified signature meaning %s', async (status, token, meaning) => {
    const res = await post(status, { password: 'pw' }, token);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(reverify).toHaveBeenCalledTimes(1);
    expect(executed[0].ctx.signoff).toMatchObject({ signatureVerified: true, signaturePurpose: meaning });
  });
});

describe('Release is the meaning of a lock, not of any e-signature', () => {
  it('declared on an action that fixes no meaning: refused before the password is checked', async () => {
    const res = await request(app)
      .post('/api/ana-ri/governed-action')
      .send({
        command: 'place_in_dossier',
        params: { projectId: 3, artifactId: 'artifact_abc', ctdSection: '2.5', signatureMeaning: 'RELEASE' },
        reasonForChange: REASON,
        password: 'wrong',
      });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).toContain('SIGNATURE_MEANING_UNKNOWN');
    expect(reverify).not.toHaveBeenCalled();
    expect(executed).toEqual([]);
  });
});

/* QA 2026-10-08 (j6 sweep): every e-signature-tier action writes a `sign`
   ledger row and an electronic_signatures row (governed-command-signature.ts).
   The route re-verified the signer and never asked whether their role may sign,
   so a member's or a manager's (P-18) password approved, locked or placed under
   a signature. The platform's one policy, after the meaning and before the
   password; the reason and confirm tiers sign nothing and ask nothing of it. */
describe('the e-signature tier: signing authority before the password', () => {
  it.each([
    ['approved', 'APPROVER', 'manager'],
    ['locked', 'RELEASE', 'member'],
  ])('%s, declared %s, by a %s: refused 403 ESIGNATURE_NO_AUTHORITY, no password compared, nothing run', async (status, token, role) => {
    signerRole.mockResolvedValue(role);
    const res = await post(status, { password: 'pw' }, token);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(JSON.stringify(res.body)).toContain('ESIGNATURE_NO_AUTHORITY');
    expect(signerRole).toHaveBeenCalledWith(USER, ORG);
    expect(reverify).not.toHaveBeenCalled();
    expect(executed).toEqual([]);
  });

  it('a role lookup that cannot run refuses 503, names no cause, runs nothing', async () => {
    signerRole.mockRejectedValue(new Error('organization_users unreadable: secret-detail'));
    const res = await post('approved', { password: 'pw' }, 'APPROVER');

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toContain('SIGNING_AUTHORITY_UNVERIFIED');
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
    expect(reverify).not.toHaveBeenCalled();
    expect(executed).toEqual([]);
  });

  it('the reason tier signs nothing and does not ask for the role', async () => {
    signerRole.mockResolvedValue('member');
    const res = await post('review');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(signerRole).not.toHaveBeenCalled();
  });
});
