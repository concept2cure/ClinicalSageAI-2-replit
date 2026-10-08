/**
 * The packageability check before a governed freeze or dispatch is a dry run
 * (P-27 follow-up, 2026-10-08).
 *
 * assertSequencePackageable assembles the sequence only to ask whether transmit
 * would refuse it. It wrote its own placeholder identity (UNASSIGNED-SEQ-n,
 * UNASSIGNED-ORG-n, "UNASSIGNED (organization n)") into that assembly. That is
 * allowed only because the assembly produces no package: it asks the
 * assembler for a dry run (one dry-run identity, package-identity.ts), names
 * no identity of its own, and discards the staged bundle on every path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ writes: 0, blockers: [] as string[], cleaned: 0, status: 'validated', intent: 'freeze', calls: [] as Array<Record<string, unknown>> }));

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
    assembleSequence: async (params: Record<string, unknown>) => {
      state.calls.push(params);
      return {
        dryRun: params.dryRun === true,
        bundle: { path: '', sha256: '', sizeBytes: 0, format: 'ectd' },
        skipped: [], unresolvedLeaves: [], materialized: 1,
        unfinalized: state.blockers.length, unfinalizedSections: state.blockers.map((b) => ({ sectionCode: b, status: 'draft' })),
        cleanup: async () => { state.cleaned += 1; },
      };
    },
  };
});

import { freezeSequence } from '../submission-service';

const ctx = { organizationId: 7, userId: 11 };

beforeEach(() => {
  state.writes = 0;
  state.cleaned = 0;
  state.blockers = [];
  state.status = 'validated';
  state.intent = 'freeze';
  state.calls.length = 0;
});

describe('the governed packageability check is a dry run (P-27)', () => {
  it('asks the assembler for a dry run and supplies no identity of its own', async () => {
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toThrow(/no state change expected/);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toMatchObject({ sequenceId: 1, organizationId: 7, dryRun: true });
    expect(state.calls[0]).not.toHaveProperty('applicationId');
    expect(state.calls[0]).not.toHaveProperty('sponsorId');
    expect(state.calls[0]).not.toHaveProperty('sponsorName');
  });

  it('discards the dry-run bundle whether or not the check passes', async () => {
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toThrow(/no state change expected/);
    expect(state.cleaned).toBe(1);
    state.blockers = ['m2.5'];
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toMatchObject({ code: 'DISPATCH_BLOCKED' });
    expect(state.cleaned).toBe(2);
  });
});
