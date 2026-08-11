import { describe, expect, it, vi, beforeEach } from 'vitest';

const verifySigningPin = vi.hoisted(() => vi.fn());
vi.mock('../../part11/pin-verification', () => ({
  verifySigningPin,
  TASK_SIGNATURE_MEANINGS: ['APPROVED', 'REVIEWED', 'RESPONSIBILITY', 'AUTHORSHIP'] as const,
}));

import { requireTaskSignoff } from '../task-signoff';

const gatedTask = {
  taskId: 'TASK-1',
  title: 'Freeze gate',
  approvalRequired: true,
  approvalStatus: 'pending',
};
const actor = { userId: 7, email: 'maya@acme.co', name: 'Maya Lin' };

beforeEach(() => {
  verifySigningPin.mockReset();
});

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
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor,
    });
    expect(r).toMatchObject({ required: true, ok: false, status: 428, code: 'ESIGN_REQUIRED' });
    expect(verifySigningPin).not.toHaveBeenCalled();
  });
});

describe('requireTaskSignoff — ceremony validation', () => {
  it('rejects an unknown meaning before touching the PIN store', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor,
      signature: { pin: '1234', meaning: 'VIBES' }, reason: 'looks good',
    });
    expect(r).toMatchObject({ ok: false, status: 400, code: 'ESIGN_MEANING_INVALID' });
    expect(verifySigningPin).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor,
      signature: { pin: '1234', meaning: 'APPROVED' }, reason: '  ',
    });
    expect(r).toMatchObject({ ok: false, status: 400, code: 'ESIGN_REASON_REQUIRED' });
  });

  it('requires a signer identity (email)', async () => {
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed',
      actor: { userId: 7, email: null },
      signature: { pin: '1234', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    expect(r).toMatchObject({ ok: false, status: 401, code: 'ESIGN_IDENTITY_REQUIRED' });
  });

  it('maps a failed PIN to 403 with the verifier’s own message', async () => {
    verifySigningPin.mockResolvedValue({ ok: false, code: 'INVALID', message: 'Incorrect PIN (attempt 1 of 3).' });
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor,
      signature: { pin: '9999', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    expect(r).toMatchObject({ ok: false, status: 403, code: 'ESIGN_INVALID' });
    expect(verifySigningPin).toHaveBeenCalledWith('maya@acme.co', '9999', 2);
  });

  it('verifies closed (503) when the PIN store is unavailable', async () => {
    verifySigningPin.mockResolvedValue({ ok: false, code: 'UNAVAILABLE', message: 'unavailable' });
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor,
      signature: { pin: '1234', meaning: 'APPROVED' }, reason: 'reviewed',
    });
    expect(r).toMatchObject({ ok: false, status: 503, code: 'ESIGN_UNAVAILABLE' });
  });

  it('a verified PIN yields the §11.50 manifestation (name, time, meaning — never the PIN)', async () => {
    verifySigningPin.mockResolvedValue({ ok: true });
    const r = await requireTaskSignoff({
      organizationId: 2, task: gatedTask, toStatus: 'completed', actor,
      signature: { pin: '1234', meaning: 'REVIEWED' }, reason: '  Checked against CSR-201.  ',
    });
    expect(r.required).toBe(true);
    if (!r.required || !('ok' in r) || !r.ok) throw new Error('expected ok');
    expect(r.manifestation).toMatchObject({
      signedById: 7,
      signedByName: 'Maya Lin',
      meaning: 'REVIEWED',
      reason: 'Checked against CSR-201.',
      method: 'pin',
    });
    expect(new Date(r.manifestation.signedAt).getTime()).toBeGreaterThan(0);
    expect(JSON.stringify(r.manifestation)).not.toContain('1234');
  });
});
