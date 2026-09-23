/**
 * POST /api/ana/submission-chat/apply-rewrite: an e-signature on an applied
 * rewrite re-verifies the signer, with the platform's one ceremony.
 *
 * ── The defect this pins (reproduced 2026-09-23, before the fix) ─────────────
 * The optional `signature` took `authenticationMethod` and `secondFactorVerified`
 * from the request body and wrote both, verbatim, onto the concept2cure_signatures
 * row the rewrite produced. No password was asked for and none was checked: the
 * session alone signed, and the row said whatever the caller said about how. That
 * is the defect POST /api/part11/signatures was deleted for, and the reason
 * services/part11/reverify-signer.ts exists (its header). The route has no
 * browser caller; it is reachable by any session through the API.
 *
 * The ceremony runs for real here. Only its wiring (reverify-signer-deps) is the
 * account's state, and the rewrite service is a spy: what it is handed is what
 * would be persisted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  applyRewrite: vi.fn(),
  compare: vi.fn(),
  failures: vi.fn(),
  account: { mfa: false, locked: false, active: true },
}));

vi.mock('../../server/middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 7, userId: 7, email: 'signer@example.test', role: 'admin', organizationId: 3 };
    req.userId = 7;
    next();
  },
}));
vi.mock('../../server/middleware/tenantContext', () => ({
  requireOrganizationContext: (req: any, _res: any, next: any) => {
    req.tenantContext = { organizationId: 3 };
    next();
  },
  requireTenantContext: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/services/ana/submission-chat-apply-rewrite', () => ({
  applyRewrite: (...a: unknown[]) => h.applyRewrite(...a),
  previewRewrite: vi.fn(),
}));
// The signing ceremony runs for real; its wiring is the account's state.
vi.mock('../../server/services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: (plain: string, hash: string) => h.compare(plain, hash),
    isMfaEnabled: async () => h.account.mfa,
    verifyMfaToken: async (_id: number, token: string) => token === '135790',
    isAccountActive: async () => h.account.active,
    isAccountLocked: async () => h.account.locked,
    recordFailedAttempt: (id: number) => h.failures(id),
    warn: () => {},
  }),
}));

const MEANING = 'I have reviewed and approve this rewrite for filing.';
const BASE = {
  artifactId: 'art-1',
  proposedContent: '<p>Rewritten body with a citation. [SRC-1]</p>',
  reasonForChange: 'Align the overview with the EMA question list.',
};

async function app() {
  const router = (await import('../../server/routes/ana-features')).default;
  const a = express();
  a.use(express.json());
  a.use('/api/ana', router);
  return a;
}
const applyWith = async (body: Record<string, unknown>) =>
  request(await app()).post('/api/ana/submission-chat/apply-rewrite').send({ ...BASE, ...body });

beforeEach(() => {
  h.applyRewrite.mockReset();
  h.applyRewrite.mockResolvedValue({ applied: true, newVersion: 2 });
  h.compare.mockReset();
  h.compare.mockImplementation(async (plain: string) => plain === 'right-password');
  h.failures.mockReset();
  h.failures.mockResolvedValue(undefined);
  h.account = { mfa: false, locked: false, active: true };
});

describe('apply-rewrite: a signature is a re-verified signer, not a claim', () => {
  it('a signature without the password is refused, and nothing is applied', async () => {
    const res = await applyWith({ signature: { meaning: MEANING } });
    expect(res.status, 'a rewrite was signed on the session alone').toBe(400);
    expect(res.body.code).toBe('PASSWORD_REQUIRED');
    expect(h.applyRewrite).not.toHaveBeenCalled();
  });

  it('a second factor the caller asserts is not a second factor', async () => {
    h.account.mfa = true;
    const res = await applyWith({
      signature: { meaning: MEANING, password: 'right-password', authenticationMethod: 'mfa', secondFactorVerified: true },
    });
    expect(res.status, 'a client-asserted second factor was accepted').toBe(400);
    expect(res.body.code).toBe('MFA_TOKEN_REQUIRED');
    expect(h.applyRewrite).not.toHaveBeenCalled();
  });

  it('a wrong password is refused and counted against the account', async () => {
    const res = await applyWith({ signature: { meaning: MEANING, password: 'wrong' } });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('PASSWORD_VERIFICATION_FAILED');
    expect(h.failures).toHaveBeenCalledWith(7);
    expect(h.applyRewrite).not.toHaveBeenCalled();
  });

  it('an account taken out of use cannot sign it (F-28)', async () => {
    h.account.active = false;
    const res = await applyWith({ signature: { meaning: MEANING, password: 'right-password' } });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
    expect(h.applyRewrite).not.toHaveBeenCalled();
  });

  it('a verified signer: the service is handed what the ceremony verified, never the credentials', async () => {
    h.account.mfa = true;
    const res = await applyWith({
      signature: { meaning: MEANING, password: 'right-password', mfaToken: '135790', secondFactorVerified: false },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const input = h.applyRewrite.mock.calls[0][0] as { signature: unknown };
    expect(input.signature).toEqual({
      meaning: MEANING,
      reverified: { ok: true, authenticationMethod: 'password+mfa', secondFactorVerified: true },
    });
    expect(JSON.stringify(input)).not.toContain('right-password');
    expect(JSON.stringify(input)).not.toContain('135790');
  });

  it('a rewrite applied without a signature asks for no credential', async () => {
    const res = await applyWith({});
    expect(res.status).toBe(200);
    expect(h.compare).not.toHaveBeenCalled();
    expect((h.applyRewrite.mock.calls[0][0] as { signature: unknown }).signature).toBeNull();
  });
});
