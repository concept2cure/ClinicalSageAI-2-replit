/**
 * The approval-gated task sign-off: when a signature is required, and what it
 * takes. Since 2026-09-23 the signer is re-verified by the platform's one
 * ceremony (services/part11/reverify-signer.ts): the account password, the
 * enrolled second factor, the account's lockout. It was a separate signing PIN
 * that a session could set and that ignored the second factor (VSR-001 §13.3
 * item 3). The ceremony's dependencies are injected, as in its own suite.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReverifySignerDeps } from '../../part11/reverify-signer';
import { requireTaskSignoff } from '../task-signoff';

const gatedTask = {
  taskId: 'TASK-1',
  title: 'Freeze gate',
  approvalRequired: true,
  approvalStatus: 'pending',
};
const actor = { userId: 7, email: 'maya@acme.co', name: 'Maya Lin' };

/** An account whose password is 'right-password'; with `mfa`, its code is 135790. */
function account(over: Partial<ReverifySignerDeps> & { mfa?: boolean } = {}) {
  const { mfa = false, ...rest } = over;
  const deps: ReverifySignerDeps = {
    loadPasswordHash: vi.fn(async () => 'stored-hash'),
    comparePassword: vi.fn(async (plain: string) => plain === 'right-password'),
    isMfaEnabled: vi.fn(async () => mfa),
    verifyMfaToken: vi.fn(async (_id: number, token: string) => token === '135790'),
    isAccountActive: vi.fn(async () => true),
    isAccountLocked: vi.fn(async () => false),
    recordFailedAttempt: vi.fn(async () => {}),
    warn: () => {},
    ...rest,
  };
  return deps;
}

describe('requireTaskSignoff — when a signature is (not) required', () => {
  it('not required for a non-completion transition', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'review', actor,
    });
    expect(r).toEqual({ required: false });
  });

  it('not required when the task carries no approval gate', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2,
      task: { ...gatedTask, approvalRequired: false },
      toStatus: 'completed',
      actor,
    });
    expect(r).toEqual({ required: false });
  });

  it('not required while the gate still reads approved', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2,
      task: { ...gatedTask, approvalStatus: 'approved' },
      toStatus: 'completed',
      actor,
    });
    expect(r).toEqual({ required: false });
  });

  // The reopen carve-out this test used to assert is gone. Reopening a
  // completed task now RESETS approvalStatus to 'pending' at the write sites
  // (taskManagement.routes / unifiedTaskService), because the stored
  // manifestation attests to the record as it stood at first completion. So
  // re-completion after a reopen arrives here with 'pending', not 'approved',
  // and must run the ceremony again.
  it('required again after a reopen has retired the signature', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2,
      task: { ...gatedTask, approvalStatus: 'pending' },
      toStatus: 'completed',
      actor,
    });
    expect(r).toMatchObject({ required: true, ok: false, status: 428, code: 'ESIGN_REQUIRED' });
  });

  it('428 ESIGN_REQUIRED when completing the gate without a signature', async () => {
    const deps = account();
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps,
    });
    expect(r).toMatchObject({ required: true, ok: false, status: 428, code: 'ESIGN_REQUIRED' });
    expect(deps.comparePassword).not.toHaveBeenCalled();
  });
});

describe('requireTaskSignoff — ceremony validation', () => {
  it('rejects an unknown meaning before any credential is checked', async () => {
    const deps = account();
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps,
      signature: { password: 'right-password', meaning: 'VIBES' }, reason: 'looks good',
    });
    expect(r).toMatchObject({ ok: false, status: 400, code: 'ESIGN_MEANING_INVALID' });
    expect(deps.comparePassword).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps: account(),
      signature: { password: 'right-password', meaning: 'APPROVED' }, reason: '  ',
    });
    expect(r).toMatchObject({ ok: false, status: 400, code: 'ESIGN_REASON_REQUIRED' });
  });

  it('requires a signer the server can re-verify (an account id)', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed',
      actor: { userId: null, email: 'maya@acme.co' }, deps: account(),
      signature: { password: 'right-password', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    expect(r).toMatchObject({ ok: false, status: 401, code: 'ESIGN_IDENTITY_REQUIRED' });
  });

  it('a signing PIN signs nothing: the password is required', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps: account(),
      signature: { pin: '246810', meaning: 'APPROVED' } as never, reason: 'reviewed',
    });
    expect(r).toMatchObject({ ok: false, status: 400, code: 'ESIGN_PASSWORD_REQUIRED' });
  });

  it('refuses a wrong password as the refusal of the act (403), not of the session, and counts it', async () => {
    const deps = account();
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps,
      signature: { password: 'wrong', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    expect(r).toMatchObject({ ok: false, status: 403, code: 'ESIGN_PASSWORD_VERIFICATION_FAILED' });
    expect(deps.recordFailedAttempt).toHaveBeenCalledWith(7);
  });

  it('requires the enrolled code, and refuses a wrong one', async () => {
    const without = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps: account({ mfa: true }),
      signature: { password: 'right-password', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    expect(without).toMatchObject({ ok: false, status: 400, code: 'ESIGN_MFA_TOKEN_REQUIRED' });
    const wrong = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps: account({ mfa: true }),
      signature: { password: 'right-password', mfaToken: '000000', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    expect(wrong).toMatchObject({ ok: false, status: 403, code: 'ESIGN_MFA_VERIFICATION_FAILED' });
  });

  it('a locked account cannot sign', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor,
      deps: account({ isAccountLocked: vi.fn(async () => true) }),
      signature: { password: 'right-password', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    expect(r).toMatchObject({ ok: false, status: 423, code: 'ESIGN_ACCOUNT_LOCKED' });
  });

  it('a verified signer yields the §11.50 manifestation, recording what was verified and never the credentials', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps: account({ mfa: true }),
      signature: { password: 'right-password', mfaToken: '135790', meaning: 'REVIEWED' },
      reason: '  Checked against CSR-201.  ',
    });
    expect(r.required).toBe(true);
    if (!r.required || !('ok' in r) || !r.ok) throw new Error('expected ok');
    expect(r.manifestation).toMatchObject({
      signedById: 7,
      signedByName: 'Maya Lin',
      meaning: 'REVIEWED',
      reason: 'Checked against CSR-201.',
      method: 'password+mfa',
    });
    expect(new Date(r.manifestation.signedAt).getTime()).toBeGreaterThan(0);
    expect(JSON.stringify(r.manifestation)).not.toContain('right-password');
    expect(JSON.stringify(r.manifestation)).not.toContain('135790');
  });

  it('records a password-only signature as such', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor, deps: account(),
      signature: { password: 'right-password', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    if (!r.required || !('ok' in r) || !r.ok) throw new Error('expected ok');
    expect(r.manifestation.method).toBe('password');
  });
});
