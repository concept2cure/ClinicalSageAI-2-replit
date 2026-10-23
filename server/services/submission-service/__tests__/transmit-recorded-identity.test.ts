/** The existing transmit claim pins the identity approved by the signature. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const identity = () => ({
    programId: '11111111-1111-4111-8111-111111111111', applicationNumber: '123456',
    applicantName: 'Recorded Applicant', applicantSponsorId: '22222222-2222-4222-8222-222222222222',
    applicantId: '123456789', contact: { name: 'Regulatory Contact', phone: '+1 617 555 0100', email: 'regulatory@example.test' },
  });
  return { identity, currentIdentity: identity(), digest: 'approved', region: 'fda', dispatchStatus: 'pending', changeAtLock: false,
    changeDuringAssembly: false, wrongAssemblyEcho: false, omitAssemblyEcho: false, calls: [] as string[],
    assemble: vi.fn(), gateway: vi.fn(), cleaned: vi.fn(), readIdentity: vi.fn(), lockIdentity: vi.fn() };
});

vi.mock('../../../db', () => {
  const rows = (name: string) => name === 'ectd_sequences'
    ? [{ id: 1, submissionId: 1, organizationId: 7, region: h.region, sequenceNumber: '0000', type: 'original', status: 'dispatched', dispatchStatus: h.dispatchStatus }]
    : name === 'submissions' ? [{ id: 1, organizationId: 7, programId: h.identity().programId, applicationType: 'ind', clientType: 'biotech' }] : [];
  const select = () => {
    let name = '';
    const chain = { from: (t: any) => { name = t?.[Symbol.for('drizzle:Name')] ?? ''; return chain; }, where: () => chain,
      limit: async () => rows(name) };
    return chain;
  };
  const textOf = (q: any) => (q?.queryChunks ?? []).map((c: any) => Array.isArray(c?.value) ? c.value.join('') : '?').join('');
  const execute = async (q: any) => {
    const text = textOf(q);
    if (text.includes('c2c_ana_actions')) return { rows: [{ id: 'signature', payload: { intent: 'transmit', meaning: 'release' } }] };
    if (text.includes('electronic_signatures')) return { rows: [{ id: 5, bound_payload_digest: 'approved', binding_basis: 'ectd-sequence-leaf-manifest-sha256', is_valid: true, verification_status: 'valid', superseded_by: null }] };
    return { rows: [] };
  };
  const query = async (raw: string | { text: string }, params?: unknown[]) => {
    const text = typeof raw === 'string' ? raw : raw.text;
    h.calls.push(text);
    if (/FROM ectd_sequences.*FOR UPDATE/.test(text) && h.changeAtLock) {
      h.currentIdentity = { ...h.currentIdentity, applicantId: '987654321' }; h.digest = 'changed';
    }
    if (/SET dispatch_status = \$3/.test(text)) h.dispatchStatus = String(params?.[2]);
    if (/SET dispatch_status = 'pending'/.test(text)) h.dispatchStatus = 'pending';
    return { rowCount: 1, rows: /audit_logs/.test(text) ? [] : [{ id: 1 }] };
  };
  return { db: { select, execute }, pool: { query, connect: async () => ({ query, release: () => undefined }) } };
});
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true })) },
  writeChainedAuditRow: vi.fn(async () => undefined) }));
vi.mock('../../ectd/package-identity', async original => ({
  ...await original<object>(),
  readRecordedPackageIdentity: h.readIdentity,
  // Transmit reads by submission since P-44 (a market's own number); the same stand-in.
  readSubmissionPackageIdentity: h.readIdentity,
  lockRecordedPackageIdentity: h.lockIdentity,
}));
vi.mock('../../part11/signature-persistence', async original => ({
  ...await original<object>(), isSignatureWithdrawn: () => false,
  deriveGovernedTargetBinding: async () => ({ digest: h.digest, basis: 'ectd-sequence-leaf-manifest-sha256', note: '',
    ...(h.region === 'fda' ? { recordedPackageIdentity: { version: 1, identity: globalThis.structuredClone(h.currentIdentity) } } : {}) }),
}));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({ gate: { cleared: true, blockers: [] } }),
}));
vi.mock('../../ectd/assemble-from-core', () => ({ assembleSequence: h.assemble, assembledTransmitBlockers: () => [] }));
vi.mock('../../submission-gateways/index', () => ({
  getGateway: () => ({ isConfigured: async () => true, transmit: h.gateway }),
  refusedBeforeWire: () => true, preTransmitFindings: () => ({ failedChecks: [], warnings: [] }),
}));

import { transmitSequence } from '../submission-service';

const transmit = (extra: Record<string, unknown> = {}) => transmitSequence({ sequenceId: 1,
  ctx: { organizationId: 7, userId: 11 }, signatureActionId: 'signature', environment: 'staging',
  applicationId: '123456', ...extra }).catch(error => error);

beforeEach(() => {
  h.currentIdentity = h.identity(); h.digest = 'approved'; h.region = 'fda'; h.dispatchStatus = 'pending'; h.changeAtLock = false;
  h.changeDuringAssembly = false; h.wrongAssemblyEcho = false; h.omitAssemblyEcho = false; h.calls.length = 0;
  h.assemble.mockReset(); h.gateway.mockReset(); h.cleaned.mockReset(); h.lockIdentity.mockReset(); h.readIdentity.mockReset();
  h.readIdentity.mockImplementation(async () => globalThis.structuredClone(h.currentIdentity));
  h.assemble.mockImplementation(async args => {
    if (h.changeDuringAssembly) { h.digest = 'changed'; h.currentIdentity = { ...h.currentIdentity, applicantName: 'Changed Applicant' }; }
    const snapshot = h.wrongAssemblyEcho ? { version: 1, identity: { ...h.identity(), applicantId: '999999999' } } : args.recordedPackageIdentity;
    return { bundle: { path: '/unused', sha256: 'a'.repeat(64), sizeBytes: 1, format: 'ectd' },
      ...(!h.omitAssemblyEcho ? { recordedPackageIdentity: snapshot } : {}),
      skipped: [], unresolvedLeaves: [], unfinalized: 0, cleanup: h.cleaned };
  });
  h.gateway.mockRejectedValue(new Error('wire checkpoint reached'));
});

describe('transmit binds approved recorded FDA identity to the assembled package', () => {
  it('assembles only the claim-captured DUNS and contact, ignoring a caller override', async () => {
    const error = await transmit({ sponsorId: 'CALLER-OVERRIDE' });
    expect(error.message).toContain('wire checkpoint reached');
    expect(h.assemble).toHaveBeenCalledWith(expect.objectContaining({ applicationId: '123456', sponsorId: '123456789',
      sponsorName: 'Recorded Applicant', contacts: [{ type: 'regulatory', name: 'Regulatory Contact', phone: '+1 617 555 0100', email: 'regulatory@example.test' }],
      recordedPackageIdentity: { version: 1, identity: h.identity() } }));
    expect(h.lockIdentity).toHaveBeenCalledWith(expect.anything(), 7, h.identity().programId);
    expect(h.gateway).toHaveBeenCalledOnce();
    expect(h.gateway.mock.calls[0][0].metadata.recordedPackageIdentity).toEqual({ version: 1, identity: h.identity() });
  });

  it('refuses identity changed while waiting for the transmit claim, before assembly', async () => {
    h.changeAtLock = true;
    const error = await transmit();
    expect(error).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(error.message).toMatch(/changed|identity|applicant/i);
    expect(h.assemble).not.toHaveBeenCalled(); expect(h.gateway).not.toHaveBeenCalled();
    expect(h.calls.some(text => /SET dispatch_status = \$3/.test(text))).toBe(false);
  });

  it('refuses identity changed during assembly and releases the pre-wire claim', async () => {
    h.changeDuringAssembly = true;
    const error = await transmit();
    expect(error).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(h.gateway).not.toHaveBeenCalled(); expect(h.cleaned).toHaveBeenCalledOnce();
    expect(h.dispatchStatus).toBe('pending');
  });

  it.each(['wrong', 'missing'])('refuses %s assembly identity proof before gateway entry', async kind => {
    h.wrongAssemblyEcho = kind === 'wrong'; h.omitAssemblyEcho = kind === 'missing';
    const error = await transmit();
    expect(error).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(h.gateway).not.toHaveBeenCalled(); expect(h.cleaned).toHaveBeenCalledOnce();
    expect(h.dispatchStatus).toBe('pending');
  });

  it.each([undefined, 'PMDA-42'])('keeps the non-FDA regional id contract (%s), never borrowing the FDA DUNS', async sponsorId => {
    h.region = 'jp';
    const error = await transmit(sponsorId === undefined ? {} : { sponsorId });
    expect(error.message).toContain('wire checkpoint reached');
    expect(h.assemble).toHaveBeenCalledWith(expect.objectContaining({ sponsorId: sponsorId ?? '' }));
    expect(h.assemble.mock.calls[0][0]).not.toHaveProperty('recordedPackageIdentity');
    expect(h.assemble.mock.calls[0][0]).not.toHaveProperty('contacts');
    expect(h.gateway).toHaveBeenCalledOnce();
  });

  it('refuses a supplied non-FDA id that cannot be carried safely, and releases its claim', async () => {
    h.region = 'jp';
    const error = await transmit({ sponsorId: '../unsafe' });
    expect(error).toMatchObject({ code: 'VALIDATION' });
    expect(h.assemble).not.toHaveBeenCalled(); expect(h.gateway).not.toHaveBeenCalled();
    expect(h.dispatchStatus).toBe('pending');
  });
});
