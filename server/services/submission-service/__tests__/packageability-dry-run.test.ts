/**
 * The existing packageability gate discards every temporary bundle and judges
 * the recorded facts captured by the governed signature for every known region.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ writes: 0, blockers: [] as string[], cleaned: 0, status: 'validated', intent: 'freeze',
  region: 'jp', captureAvailable: true, calls: [] as Array<Record<string, unknown>>,
  identity: { programId: '11111111-1111-4111-8111-111111111111', applicationNumber: '123456',
    applicantSponsorId: '22222222-2222-4222-8222-222222222222', applicantId: '123456789', applicantName: 'Recorded Sponsor',
    contact: { name: 'Regulatory Contact', phone: '+1 617 555 0100' as string | null, email: 'regulatory@example.test' } },
}));

vi.mock('../../../db', () => {
  const rowsFor = (name: string) =>
    name === 'ectd_sequences'
      ? [{ id: 1, submissionId: 1, region: state.region, sequenceNumber: '0000', status: state.status, type: 'original', organizationId: 7 }]
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
    if (t.includes('c2c_ana_actions')) return { rows: [{ id: 'sig-1', payload: { intent: state.intent, meaning: 'approval' } }] };
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
  deriveGovernedTargetBinding: async () => ({ digest: 'd', basis: 'ectd-sequence-leaf-manifest-sha256', note: '',
    ...(state.captureAvailable ? { recordedPackageIdentity: { version: 1, identity: state.region === 'fda' ? state.identity : { ...state.identity, applicantId: null, contact: { name: null, phone: null, email: null } } } } : {}),
  }),
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
  state.region = 'jp'; state.captureAvailable = true; state.identity.contact.phone = '+1 617 555 0100';
  state.calls.length = 0;
});

describe('known non-US governed packageability judges captured recorded facts', () => {
  it.each(['jp', 'eu', 'ca'])('assembles %s captured facts without FDA DUNS or contact, never a placeholder dry run', async region => {
    state.region = region;
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toThrow(/no state change expected/);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toMatchObject({ sequenceId: 1, organizationId: 7, applicationId: '123456', sponsorId: '',
      sponsorName: 'Recorded Sponsor', recordedPackageIdentity: { version: 1, identity: { applicationNumber: '123456',
        applicantId: null, contact: { name: null, phone: null, email: null } } } });
    expect(state.calls[0]).not.toHaveProperty('dryRun');
    expect(state.calls[0]).not.toHaveProperty('contacts');
    expect(state.cleaned).toBe(1);
  });

  it('discards the captured temporary bundle whether or not its leaves are approved', async () => {
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toThrow(/no state change expected/);
    expect(state.cleaned).toBe(1);
    state.blockers = ['m2.5'];
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toMatchObject({ code: 'DISPATCH_BLOCKED' });
    expect(state.cleaned).toBe(2);
  });

  it('refuses missing captured identity for a known non-US region', async () => {
    state.captureAvailable = false;
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/no recorded application\/applicant identity/) });
    expect(state.calls).toHaveLength(0); expect(state.writes).toBe(0);
  });

  it('refuses an unknown region even if a proof was supplied', async () => {
    state.region = 'unrecognized';
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/region/i) });
    expect(state.calls).toHaveLength(0); expect(state.writes).toBe(0);
  });
});

describe('the FDA governed packageability check uses the signature-captured recorded facts', () => {
  it('supplies the captured DUNS and regulatory contact, then discards the temporary package', async () => {
    state.region = 'fda';
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toThrow(/no state change expected/);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toMatchObject({ sequenceId: 1, organizationId: 7, applicationId: '123456',
      sponsorId: '123456789', sponsorName: 'Recorded Sponsor',
      contacts: [{ type: 'regulatory', name: 'Regulatory Contact', phone: '+1 617 555 0100', email: 'regulatory@example.test' }],
      recordedPackageIdentity: { version: 1, identity: state.identity } });
    expect(state.calls[0]).not.toHaveProperty('dryRun');
    expect(state.cleaned).toBe(1);
  });

  it('refuses an FDA binding with no captured identity before assembly or a state write', async () => {
    state.region = 'fda'; state.captureAvailable = false;
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/no recorded application\/applicant identity/) });
    expect(state.calls).toHaveLength(0); expect(state.writes).toBe(0); expect(state.cleaned).toBe(0);
  });

  it('refuses incomplete recorded FDA contact facts before assembly or a state write', async () => {
    state.region = 'fda'; state.identity.contact.phone = null;
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/telephone/) });
    expect(state.calls).toHaveLength(0); expect(state.writes).toBe(0);
  });

  it('retains the real assembly blockers and cleanup for a captured FDA package', async () => {
    state.region = 'fda'; state.blockers = ['m2.5'];
    await expect(freezeSequence(1, ctx, 'sig-1')).rejects.toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/not approved/) });
    expect(state.calls).toHaveLength(1); expect(state.cleaned).toBe(1); expect(state.writes).toBe(0);
  });
});
