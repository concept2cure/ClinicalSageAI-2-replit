/**
 * Freeze and dispatch refuse a sequence whose package transmit would refuse.
 *
 * 2026-09-23 (W5/D7), found by the round-2 review. Transmit refuses a package
 * that leaves out a placed leaf, carries an unapproved document, or cannot
 * materialize a source. Readiness does not assemble, so those refusals surfaced
 * only at transmit — after freeze had made the leaves immutable and dispatch
 * had removed every way back. The governed freeze/dispatch now run the same
 * assembly and the same rule (assembledTransmitBlockers) before the lock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ writes: 0, blockers: [] as string[], cleaned: 0, status: 'validated', intent: 'freeze' }));

vi.mock('../../../db', () => {
  const rowsFor = (name: string) =>
    name === 'ectd_sequences'
      ? [{ id: 1, submissionId: 1, region: 'fda', sequenceNumber: '0000', status: state.status, type: 'original', organizationId: 7 }]
      : [];
  const tableNameOf = (t: any) => t?.[Symbol.for('drizzle:Name')] ?? t?._?.name ?? '';
  const select = () => {
    let name = '';
    const chain: any = {
      from: (t: any) => { name = tableNameOf(t); return chain; },
      where: () => chain,
      limit: async () => rowsFor(name),
      then: (res: any, rej: any) => Promise.resolve(rowsFor(name)).then(res, rej),
    };
    return chain;
  };
  const textOf = (q: any): string => (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join('') : '?')).join('');
  const execute = async (q: any) => {
    const t = textOf(q);
    if (t.includes('c2c_ana_actions')) return { rows: [{ id: 'sig-1', payload: { intent: state.intent } }] };
    if (t.includes('electronic_signatures')) {
      return { rows: [{ bound_payload_digest: 'd', binding_basis: 'ectd-sequence-leaf-manifest-sha256', superseded_by: null, is_valid: true, verification_status: 'valid' }] };
    }
    return { rows: [] };
  };
  const pool = {
    query: async () => ({ rowCount: 0, rows: [] }),
    connect: async () => { state.writes += 1; throw new Error('no state change expected'); },
  };
  return { db: { select, execute }, pool };
});
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) }, writeChainedAuditRow: vi.fn() }));
vi.mock('../../part11/signature-persistence', async (orig) => ({
  ...(await orig<any>()),
  deriveGovernedTargetBinding: async () => ({ digest: 'd', basis: 'ectd-sequence-leaf-manifest-sha256', note: '' }),
  isSignatureWithdrawn: () => false,
}));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({
    gate: { cleared: true, blockers: [] }, freezeGate: { cleared: true, blockers: [] },
    validationErrors: 0, unacknowledgedShadowCriticals: 0,
  }),
}));
vi.mock('../../ectd/assemble-from-core', async (orig) => {
  const real = await orig<any>();
  return {
    ...real,
    assembleSequence: async () => ({
      bundle: { path: '', sha256: '', sizeBytes: 0, format: 'ectd' },
      skipped: [], unresolvedLeaves: [], materialized: 1,
      unfinalized: state.blockers.length, unfinalizedSections: state.blockers.map((b) => ({ sectionCode: b, status: 'draft' })),
      cleanup: async () => { state.cleaned += 1; },
    }),
  };
});

import { freezeSequence, dispatchSequence } from '../submission-service';

const ctx = { organizationId: 7, userId: 11 };

beforeEach(() => {
  state.writes = 0;
  state.cleaned = 0;
  state.blockers = [];
  state.status = 'validated';
  state.intent = 'freeze';
});

describe('governed freeze/dispatch — the package must be transmittable before the lock', () => {
  it('refuses to freeze a sequence carrying an unapproved document, and changes nothing', async () => {
    state.blockers = ['m2.5'];
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toMatchObject({
      code: 'DISPATCH_BLOCKED',
      message: expect.stringMatching(/Refusing to freeze: 1 leaf document\(s\) are not approved \(m2\.5: draft\)/),
    });
    expect(state.writes).toBe(0);
    expect(state.cleaned).toBe(1);
  });

  it('reaches the state change when the package is transmittable', async () => {
    // The mocked pool refuses the write; reaching it is the proof the new gate passed.
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toThrow(/no state change expected/);
    expect(state.writes).toBe(1);
    expect(state.cleaned).toBe(1);
  });

  it('applies to dispatch as well', async () => {
    state.status = 'frozen';
    state.intent = 'dispatch';
    state.blockers = ['m2.5'];
    await expect(dispatchSequence(1, ctx, 'sig-1')).rejects.toMatchObject({ code: 'DISPATCH_BLOCKED' });
    expect(state.writes).toBe(0);
  });
});
