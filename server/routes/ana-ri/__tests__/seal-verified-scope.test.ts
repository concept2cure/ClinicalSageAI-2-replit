/** The real HTTP handler must carry limited verification evidence to the real seal-service gate. */
import express, { type Request } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getPool: vi.fn(), authority: vi.fn(), reverify: vi.fn() }));
vi.mock('../../../db', () => ({ getPool: h.getPool, db: {} }));
vi.mock('../../../db.js', () => ({ getPool: h.getPool, db: {} }));
vi.mock('../../../services/part11/signing-authority-gate.js', () => ({ checkSigningAuthority: h.authority }));
vi.mock('../../../services/part11/reverify-signer.js', () => ({ reverifySigner: h.reverify }));
vi.mock('../../../services/part11/reverify-signer-deps.js', () => ({ signerReverificationDeps: () => ({}) }));

import { handleSealVerifiedVersion } from '../seal-verified';

let authenticated = true;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (authenticated) {
    const principal = req as Request & { tenantId: number; userId: number };
    principal.tenantId = 7; principal.userId = 3;
  }
  next();
});
app.post('/api/ana-ri/seal-verified-version', handleSealVerifiedVersion);
const body = {
  projectId: 11, title: 'Stability report', content: 'Shelf life is 24 months.', password: 'test-password',
  manifestation: { printedName: 'Jane Roe', meaning: 'APPROVER', reasonForChange: 'Reviewed the stability report.' },
};
const post = (verification: unknown = { ok: true }, other: Record<string, unknown> = {}) =>
  request(app).post('/api/ana-ri/seal-verified-version').send({ ...body, verification, ...other });

beforeEach(() => {
  authenticated = true;
  vi.stubEnv('ENABLE_ANA_DOCUMENT_STUDIO', 'true');
  h.getPool.mockReset().mockImplementation(() => { throw new Error('Pool must not be acquired for blocked verification'); });
  h.authority.mockReset().mockResolvedValue(null);
  h.reverify.mockReset().mockResolvedValue({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('HTTP scope retention reaches the central service refusal', () => {
  it.each([
    { scope: 'plan_text_only', artifactVerified: false, sourceVerified: false },
    { scope: 'plan_text_only', artifactVerified: true, sourceVerified: true, sourceDiffPerformed: true },
    { scope: 'document_source_diff' }, { scope: null }, { scope: { kind: 'artifact' } },
    { artifactVerified: false }, { sourceVerified: false }, { sourceDiffPerformed: false },
    { artifactVerified: null }, { sourceVerified: 'true' }, { sourceDiffPerformed: 1 },
  ])('preserves and refuses qualifiers %j instead of dropping them', async qualifiers => {
    const res = await post({ ok: true, message: 'Caller says verified.', ...qualifiers });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VERIFICATION_SCOPE_INSUFFICIENT');
    expect(h.authority).toHaveBeenCalledWith(3, 7);
    expect(h.reverify).toHaveBeenCalledWith(3, { password: 'test-password', mfaToken: undefined }, {});
    expect(h.getPool).not.toHaveBeenCalled();
  });

  it('does not accept caller-supplied positive flags when ok is false', async () => {
    const res = await post({ ok: false, artifactVerified: true, sourceVerified: true, sourceDiffPerformed: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_VERIFIED');
    expect(h.getPool).not.toHaveBeenCalled();
  });
});

describe('HTTP target selectors reach the central service validation', () => {
  it.each([
    { artifactPk: '9' }, { artifactPk: null }, { artifactPk: 0 },
    { artifactExternalId: 9 }, { artifactExternalId: '' }, { artifactExternalId: null },
    { existingVersionId: '4' }, { existingVersionId: null },
    { existingVersionNumber: '2' }, { existingVersionNumber: 1.5 },
    { existingVersionId: 4 }, { existingVersionNumber: 2 },
  ])('refuses malformed or unanchored selectors %j without falling back', async selectors => {
    const res = await post({ ok: true }, selectors);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SEAL_TARGET');
    expect(h.getPool).not.toHaveBeenCalled();
  });
});

describe('HTTP receipt qualifiers are retained without legacy fallback', () => {
  it.each([null, 'receipt', {}, { turnRecordId: 'not-a-uuid', stepIndex: 0, resultSha256: 'a'.repeat(64) }])(
    'rejects malformed receipt %j before acquiring a pool', async receipt => {
      const res = await post({ ok: true, receipt });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_VERIFICATION_RECEIPT');
      expect(h.getPool).not.toHaveBeenCalled();
    },
  );
});

describe('feature and signer gates still precede sealing', () => {
  it('retains the disabled feature refusal without checking the signer or DB', async () => {
    vi.stubEnv('ENABLE_ANA_DOCUMENT_STUDIO', 'false');
    const res = await post({ ok: true, scope: 'plan_text_only' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
    expect(h.authority).not.toHaveBeenCalled();
    expect(h.reverify).not.toHaveBeenCalled();
    expect(h.getPool).not.toHaveBeenCalled();
  });

  it('retains missing authenticated context refusal', async () => {
    authenticated = false;
    const res = await post();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
    expect(h.authority).not.toHaveBeenCalled();
    expect(h.reverify).not.toHaveBeenCalled();
  });

  it('retains missing content refusal', async () => {
    const res = await post({ ok: true }, { content: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_CONTENT');
    expect(h.authority).not.toHaveBeenCalled();
    expect(h.reverify).not.toHaveBeenCalled();
  });

  it('retains signer authority refusal before credential comparison', async () => {
    h.authority.mockResolvedValue({ status: 403, code: 'ESIGNATURE_NO_AUTHORITY', message: 'Signing is not permitted.' });
    const res = await post();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(h.reverify).not.toHaveBeenCalled();
    expect(h.getPool).not.toHaveBeenCalled();
  });

  it('retains signer reauthentication refusal before calling the seal service', async () => {
    h.reverify.mockResolvedValue({ ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'Password did not match.' });
    const res = await post();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SIGNATURE_REJECTED');
    expect(h.getPool).not.toHaveBeenCalled();
  });
});
