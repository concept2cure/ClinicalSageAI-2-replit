/** Limited or malformed verification evidence cannot qualify the legacy seal service. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getPool: vi.fn() }));
vi.mock('../../../db', () => ({ getPool: h.getPool, db: {} }));
vi.mock('../../../db.js', () => ({ getPool: h.getPool, db: {} }));

import { sealVerifiedVersion, type SealPool, type SealVerifiedVersionInput } from '../verifiedSealService';

type Verification = { ok: boolean; [key: string]: unknown };
const input = (verification: Verification = { ok: true }): SealVerifiedVersionInput => ({
  organizationId: 7, projectId: 11, userId: 3,
  signerName: 'Jane Roe', title: 'Stability report', content: 'Shelf life is 24 months.',
  manifestation: { printedName: 'Jane Roe', meaning: 'APPROVER', reasonForChange: 'Reviewed the stability report.' },
  verification,
});
function stoppedPool() {
  const connect = vi.fn(async () => { throw new Error('Legacy transaction boundary reached'); });
  const pool: SealPool = { connect };
  return { pool, connect };
}
beforeEach(() => {
  h.getPool.mockReset().mockImplementation(() => { throw new Error('Pool must not be acquired for blocked verification'); });
});

describe('the service rejects provided scope before transaction access', () => {
  it.each(['plan_text_only', 'document_source_diff', '', null, true, { type: 'artifact' }])(
    'rejects scope %j without connecting', async scope => {
      const { pool, connect } = stoppedPool();
      await expect(sealVerifiedVersion(input({ ok: true, scope }), pool)).rejects.toMatchObject({ code: 'VERIFICATION_SCOPE_INSUFFICIENT' });
      expect(connect).not.toHaveBeenCalled();
      expect(h.getPool).not.toHaveBeenCalled();
    },
  );

  it('does not let forged positive flags override a plan-text receipt', async () => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input({
      ok: true, scope: 'plan_text_only', artifactVerified: true, sourceVerified: true, sourceDiffPerformed: true,
    }), pool)).rejects.toMatchObject({ code: 'VERIFICATION_SCOPE_INSUFFICIENT' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses before default pool acquisition when a plan-text receipt is supplied', async () => {
    await expect(sealVerifiedVersion(input({ ok: true, scope: 'plan_text_only' }))).rejects.toMatchObject({ code: 'VERIFICATION_SCOPE_INSUFFICIENT' });
    expect(h.getPool).not.toHaveBeenCalled();
  });
});

describe('explicit negative and malformed qualifiers remain fail closed', () => {
  it.each([
    { artifactVerified: false }, { sourceVerified: false }, { sourceDiffPerformed: false },
    { artifactVerified: null }, { sourceVerified: 'true' }, { sourceDiffPerformed: 1 },
  ])('refuses %j without starting a transaction', async qualifiers => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input({ ok: true, ...qualifiers }), pool)).rejects.toMatchObject({ code: 'VERIFICATION_SCOPE_INSUFFICIENT' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('does not let two positive flags override a required-string-only result', async () => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input({ ok: true, artifactVerified: true, sourceVerified: true, sourceDiffPerformed: false }), pool))
      .rejects.toMatchObject({ code: 'VERIFICATION_SCOPE_INSUFFICIENT' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('preserves the NOT_VERIFIED refusal even when all qualifiers claim success', async () => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input({ ok: false, artifactVerified: true, sourceVerified: true, sourceDiffPerformed: true }), pool))
      .rejects.toMatchObject({ code: 'NOT_VERIFIED' });
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('unscoped legacy compatibility is not new source qualification', () => {
  it.each([
    { ok: true },
    { ok: true, artifactVerified: true, sourceVerified: true, sourceDiffPerformed: true },
    { ok: true, scope: undefined, artifactVerified: undefined, sourceVerified: undefined, sourceDiffPerformed: undefined },
  ])('keeps %j on the existing legacy transaction path', async verification => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input(verification), pool)).rejects.toThrow('Legacy transaction boundary reached');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(h.getPool).not.toHaveBeenCalled();
  });
});
