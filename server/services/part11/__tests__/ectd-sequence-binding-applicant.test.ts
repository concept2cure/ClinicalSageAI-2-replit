import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  identity: {} as Record<string, unknown>,
  read: vi.fn(),
}));
vi.mock('../../ectd/package-identity', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../ectd/package-identity')>(),
  readSubmissionPackageIdentity: (...args: unknown[]) => state.read(...args),
}));

import { BINDING_BASIS, deriveGovernedTargetBinding, sha256CanonicalJson } from '../signature-persistence';

const sequence = { id: 5, submission_id: 9, region: 'fda', sequence_number: '0000', type: 'original' };
const leaf = {
  id: 1, section_code: 'm3.2', lifecycle_op: 'new', document_table: 'vault_documents',
  document_id: null, document_uuid: '11111111-1111-4111-8111-111111111111',
  document_content_sha256: 'a'.repeat(64), checksum: 'b'.repeat(32), title: 'Recorded source',
};
let region: string;
const client = {
  query: vi.fn(async (sql: string) => ({ rows: sql.includes('FROM ectd_sequences')
    ? [{ ...sequence, region }] : [{ ...leaf, study_id: null, stf_file_tag: null }] })),
};
const binding = () => deriveGovernedTargetBinding(client, 'ectd-sequence:5', 7);

beforeEach(() => {
  region = 'fda';
  state.identity = {
    programId: '22222222-2222-4222-8222-222222222222', applicationNumber: '123456',
    applicantName: 'Recorded Applicant', applicantSponsorId: '33333333-3333-4333-8333-333333333333',
    applicantId: '123456789', contact: { name: 'Regulatory Contact', phone: '+1 555 0100', email: 'ra@example.test' },
  };
  state.read.mockReset().mockImplementation(async () => globalThis.structuredClone(state.identity));
  client.query.mockClear();
});

describe('FDA sequence approval covers the recorded applicant', () => {
  it('captures the exact canonical identity read on the signing client', async () => {
    const result = await binding();
    // With the sequence's region, which names its market (P-44).
    expect(state.read).toHaveBeenCalledWith(client, 7, 9, { region: expect.anything() });
    expect(result).toMatchObject({ recordedPackageIdentity: { version: 1, identity: state.identity } });
    expect(result.digest).toBe(sha256CanonicalJson({
      sequence, leaves: [leaf], recordedPackageIdentity: { version: 1, identity: state.identity },
    }));
  });

  it.each(['applicationNumber', 'applicantName', 'applicantSponsorId', 'applicantId'])('requires re-signing when %s changes', async (field) => {
    const before = await binding();
    state.identity[field] = `${String(state.identity[field])}-changed`;
    expect((await binding()).digest).not.toBe(before.digest);
  });

  it.each(['name', 'phone', 'email'])('requires re-signing when contact.%s changes', async (field) => {
    const before = await binding();
    (state.identity.contact as Record<string, unknown>)[field] = 'changed';
    expect((await binding()).digest).not.toBe(before.digest);
  });

  it('retains the captured proof when the mutable record later changes', async () => {
    const before = await binding();
    state.identity.applicantId = '987654321';
    expect(before).toMatchObject({ recordedPackageIdentity: { identity: { applicantId: '123456789' } } });
    expect((await binding()).digest).not.toBe(before.digest);
  });

  it('binds absent facts too, so recording them changes the approval', async () => {
    state.identity.applicantSponsorId = null;
    state.identity.applicantId = null;
    const absent = await binding();
    state.identity.applicantSponsorId = '33333333-3333-4333-8333-333333333333';
    state.identity.applicantId = '123456789';
    expect((await binding()).digest).not.toBe(absent.digest);
  });

  it.each(['ema', 'pmda', 'CA', 'CN', 'KR', 'UK', 'AU', 'CH', 'BR', 'IN', 'SG'])(
    'captures %s proof alongside the unchanged sequence-content digest', async (knownRegion) => {
    region = knownRegion;
    state.identity.applicationNumber = 'MARKET-000512';
    const result = await binding();
    const recordedPackageIdentity = { version: 1, identity: { ...state.identity,
      applicantId: null, contact: { name: null, phone: null, email: null } } };
    expect(state.read).toHaveBeenCalledWith(client, 7, 9, { region });
    expect(result).toMatchObject({ recordedPackageIdentity,
      sequenceContentDigest: sha256CanonicalJson({ sequence: { ...sequence, region }, leaves: [leaf] }) });
    expect(result.digest).toBe(sha256CanonicalJson({ sequence: { ...sequence, region }, leaves: [leaf], recordedPackageIdentity }));
  });

  it.each(['programId', 'applicationNumber', 'applicantName', 'applicantSponsorId'])(
    'requires renewed non-US approval when %s changes', async (field) => {
      region = 'ema';
      const before = await binding();
      state.identity[field] = `${String(state.identity[field])}-changed`;
      expect((await binding()).digest).not.toBe(before.digest);
    });

  it('does not make non-US approval stale for FDA-only DUNS or contact changes', async () => {
    region = 'pmda';
    const before = await binding();
    state.identity.applicantId = '987654321';
    state.identity.contact = { name: 'Another contact', phone: '+1 212 555 0199', email: 'changed@example.test' };
    expect((await binding()).digest).toBe(before.digest);
    expect(before).toHaveProperty('recordedPackageIdentity.identity.applicantId', null);
  });

  it('refuses unknown regional semantics through the honest ledger fallback', async () => {
    region = 'unknown-agency';
    const result = await binding();
    expect(result).toMatchObject({ digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER });
    expect(result.note).toMatch(/region/i);
    expect(state.read).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('recordedPackageIdentity');
  });

  it('propagates a failed identity read rather than signing a guessed record', async () => {
    state.read.mockRejectedValueOnce(new Error('identity store unavailable'));
    await expect(binding()).rejects.toThrow('identity store unavailable');
  });

  it('retains the existing honest ledger-only fallback when the sequence store is absent', async () => {
    client.query.mockRejectedValueOnce(Object.assign(new Error('sequence store absent'), { code: '42P01' }));
    expect(await binding()).toMatchObject({ digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER });
  });
});
