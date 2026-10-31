/**
 * A signed act whose tenant role is the platform role is refused before
 * anything is asked (P-72 slice 1b;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 *
 * signGovernedAct writes SignedAct.tenantRole to app.current_user_role on the
 * signing transaction (through setTenantContextTx), and the platform arm of
 * about 977 tenant policies compares that setting with 'app_super_admin'. The
 * route took the string as given: it checked the signer's authority, verified
 * the password, opened the transaction and then wrote the role. Now the act is
 * refused, 403 PLATFORM_SCOPE_ROLE_REFUSED, before the precheck, the authority
 * check or the credential, so it spends no password guess and opens nothing.
 * setTenantContextTx is the real one here: it is the writer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  authority: vi.fn(), deps: vi.fn(), reverify: vi.fn(), audit: vi.fn(), signature: vi.fn(),
  query: vi.fn(), run: vi.fn(), precheck: vi.fn(),
}));
vi.mock('../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: h.authority }));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: h.deps }));
vi.mock('../../services/part11/reverify-signer', () => ({ reverifySigner: h.reverify }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: h.audit }));
vi.mock('../../services/part11/signature-persistence', () => ({ persistGovernedSignSignature: h.signature }));
import { signGovernedAct } from '../governed-signed-act';

const client = { query: h.query };
const body = { password: 'synthetic-password', reason: 'Synthetic committee approval', meaning: 'APPROVED' };

function app(tenantRole: string) {
  const a = express(); a.use(express.json());
  a.post('/sign', (req, res) => {
    Object.assign(req, { user: { id: 42, organizationId: 7, role: 'member' }, dbClient: client });
    return signGovernedAct(req, res, {
      domain: 'committee', target: 'committee:3', meanings: ['APPROVED'], codeStatus: {},
      tenantRole, precheck: h.precheck, run: h.run,
    });
  });
  return a;
}
const roleWrites = () => h.query.mock.calls.filter((c) => String(c[0]).includes('app.current_user_role'));

beforeEach(() => {
  vi.clearAllMocks();
  h.authority.mockResolvedValue(null); h.deps.mockReturnValue({ scoped: true });
  h.reverify.mockResolvedValue({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
  h.query.mockResolvedValue({ rows: [] });
  h.precheck.mockResolvedValue(undefined);
  h.run.mockResolvedValue({ target: 'committee:3', body: { signed: true } });
  h.audit.mockResolvedValue({ actionId: 'action', auditId: 'audit', sha256Chain: 'chain' });
  h.signature.mockResolvedValue({ id: 501, signedAt: new Date('2026-10-30T00:00:00Z') });
});

describe('signGovernedAct and the platform role', () => {
  it.each(['app_super_admin', 'APP_SUPER_ADMIN', ' app_super_admin ', 'App_Super_Admin\t'])(
    'tenant role %j: 403 before the precheck, the authority or the password, and nothing reaches the database',
    async (role) => {
      const res = await request(app(role)).post('/sign').send(body);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.error.code).toBe('PLATFORM_SCOPE_ROLE_REFUSED');
      expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
      expect(h.precheck).not.toHaveBeenCalled();
      expect(h.authority).not.toHaveBeenCalled();
      expect(h.reverify).not.toHaveBeenCalled();
      expect(h.query).not.toHaveBeenCalled();
      expect(h.signature).not.toHaveBeenCalled();
    },
  );

  it('an ordinary tenant role signs, and is the role the transaction carries', async () => {
    const res = await request(app('chair')).post('/sign').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(roleWrites().map((c) => c[1])).toEqual([['chair']]);
  });
});
