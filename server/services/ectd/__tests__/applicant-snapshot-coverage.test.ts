import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ readIdentity: vi.fn(), query: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: (...args: unknown[]) => h.query(...args) } }));
vi.mock('../package-identity.js', async () => ({
  ...await vi.importActual<typeof import('../package-identity.js')>('../package-identity.js'),
  readSubmissionPackageIdentity: (...args: unknown[]) => h.readIdentity(...args),
}));

import { signedManifestCoversSequence } from '../signed-manifest-covers-sequence';
import type { ECTDLeaf } from '../ectd4-validator';
import { REGION_IDENTITY } from '../../../../shared/regulatory/region-identity';

const identity = {
  programId: '11111111-1111-4111-8111-111111111111',
  applicationNumber: '123456', applicantName: 'Recorded Sponsor',
  applicantSponsorId: '22222222-2222-4222-8222-222222222222', applicantId: '123456789',
  contact: { name: 'Regulatory Contact', phone: '+1 555 0100', email: 'ra@example.test' },
};
const snapshot = { version: 1 as const, identity };
const params = { sequenceId: 3, submissionId: 7, organizationId: 42, region: 'fda', signedLeaves: [
  { sectionCode: '3.2.S.1', operation: 'new', checksum: 'a'.repeat(32) } as ECTDLeaf,
] };

beforeEach(() => {
  h.query.mockReset().mockImplementation(async (sql: string) => /FROM ectd_sequences/i.test(sql)
    ? { rows: [{ submission_id: 7, region: 'fda' }] }
    : { rows: [{ section_code: '3.2.S.1', lifecycle_op: 'new', checksum: 'a'.repeat(32) }] });
  h.readIdentity.mockReset().mockResolvedValue(identity);
});

describe('FDA signed manifest coverage includes recorded applicant facts', () => {
  it('keeps a historical signature intact but refuses coverage without its applicant snapshot', async () => {
    expect(await signedManifestCoversSequence(params)).toMatchObject({ covers: false, detail: expect.stringMatching(/applicant.*(snapshot|identity)|identity.*(proof|snapshot)/i) });
  });

  it('covers identical leaves and the identical current recorded identity', async () => {
    expect(await signedManifestCoversSequence({ ...params, recordedPackageIdentity: snapshot })).toMatchObject({ covers: true, leafCount: 1 });
    // With the sequence's region, which names its market (P-44).
    expect(h.readIdentity).toHaveBeenCalledWith(expect.anything(), 42, 7, expect.objectContaining({ region: 'fda' }));
  });

  it.each(['applicationNumber', 'applicantName', 'applicantId', 'applicantSponsorId'] as const)('does not cover changed %s', async (field) => {
    h.readIdentity.mockResolvedValue({ ...identity, [field]: field === 'applicationNumber' ? '654321' : field === 'applicantId' ? '987654321' : 'changed' });
    expect(await signedManifestCoversSequence({ ...params, recordedPackageIdentity: snapshot })).toMatchObject({ covers: false });
  });

  it('does not borrow applicant facts from a different submission with identical leaves', async () => {
    h.query.mockImplementation(async (sql: string) => /FROM ectd_sequences/i.test(sql)
      ? { rows: [{ submission_id: 8, region: 'fda' }] }
      : { rows: [{ section_code: '3.2.S.1', lifecycle_op: 'new', checksum: 'a'.repeat(32) }] });
    expect(await signedManifestCoversSequence({ ...params, recordedPackageIdentity: snapshot })).toMatchObject({ covers: false });
    expect(h.readIdentity).not.toHaveBeenCalled();
  });

  it('does not cover changed contact details', async () => {
    h.readIdentity.mockResolvedValue({ ...identity, contact: { ...identity.contact, email: 'changed@example.test' } });
    expect(await signedManifestCoversSequence({ ...params, recordedPackageIdentity: snapshot })).toMatchObject({ covers: false });
  });

  it('does not establish coverage from an unsupported stored identity version', async () => {
    const unsupported = { ...snapshot, version: 2 } as unknown as typeof snapshot;
    expect(await signedManifestCoversSequence({ ...params, recordedPackageIdentity: unsupported })).toMatchObject({ covers: false });
  });

  it('refuses coverage when current required FDA facts were cleared', async () => {
    h.readIdentity.mockResolvedValue({ ...identity, applicantId: null });
    expect(await signedManifestCoversSequence({ ...params, recordedPackageIdentity: snapshot })).toMatchObject({ covers: false });
  });

  it('reports unknown when the current identity cannot be read', async () => {
    h.readIdentity.mockRejectedValue(new Error('database unavailable'));
    expect(await signedManifestCoversSequence({ ...params, recordedPackageIdentity: snapshot })).toMatchObject({ unknown: true });
  });

});

const nonUsIdentity = { ...identity, applicantId: null, contact: { name: null, phone: null, email: null } };
const nonUsSnapshot = { version: 1 as const, identity: nonUsIdentity };

function sequenceRegion(region: string | null, submissionId = 7) {
  h.query.mockImplementation(async (sql: string) => /FROM ectd_sequences/i.test(sql)
    ? { rows: [{ submission_id: submissionId, region }] }
    : { rows: [{ section_code: '3.2.S.1', lifecycle_op: 'new', checksum: 'a'.repeat(32) }] });
}

describe('known-region signed manifest identity coverage', () => {
  beforeEach(() => sequenceRegion('ema'));

  it.each(Object.values(REGION_IDENTITY).filter((region) => region.code !== 'US'))(
    'covers $code recorded number/name without FDA DUNS or contact', async (region) => {
      sequenceRegion(region.gatewaySlug);
      h.readIdentity.mockResolvedValue(nonUsIdentity);
      expect(await signedManifestCoversSequence({ ...params, region: region.code, recordedPackageIdentity: nonUsSnapshot }))
        .toMatchObject({ covers: true, leafCount: 1 });
      expect(h.readIdentity).toHaveBeenCalledWith(expect.anything(), 42, 7, { region: region.gatewaySlug });
    },
  );

  it('requires proof for current EU coverage while preserving the historical record', async () => {
    expect(await signedManifestCoversSequence({ ...params, region: 'ema' })).toMatchObject({ covers: false });
  });

  it.each(['applicationNumber', 'applicantName', 'applicantSponsorId', 'programId'] as const)(
    'refuses changed non-US %s despite identical leaves', async (field) => {
      h.readIdentity.mockResolvedValue({ ...nonUsIdentity, [field]: 'changed' });
      expect(await signedManifestCoversSequence({ ...params, region: 'EU', recordedPackageIdentity: nonUsSnapshot }))
        .toMatchObject({ covers: false });
    },
  );

  it.each(['applicationNumber', 'applicantName'] as const)('refuses missing current non-US %s', async (field) => {
    h.readIdentity.mockResolvedValue({ ...nonUsIdentity, [field]: null });
    expect(await signedManifestCoversSequence({ ...params, region: 'EU', recordedPackageIdentity: nonUsSnapshot }))
      .toMatchObject({ covers: false });
  });

  it('does not bind non-US coverage to mutable FDA-only facts', async () => {
    h.readIdentity.mockResolvedValue({ ...identity, applicantId: '987654321', contact: { ...identity.contact, email: 'updated@example.test' } });
    expect(await signedManifestCoversSequence({ ...params, region: 'EU', recordedPackageIdentity: nonUsSnapshot }))
      .toMatchObject({ covers: true });
  });

  it.each([snapshot, { ...nonUsSnapshot, version: 2 }, { ...nonUsSnapshot, identity: { ...nonUsIdentity, contact: null } }])(
    'refuses malformed or unprojected non-US proof', async (proof) => {
      h.readIdentity.mockResolvedValue(nonUsIdentity);
      expect(await signedManifestCoversSequence({ ...params, region: 'EU', recordedPackageIdentity: proof as typeof snapshot }))
        .toMatchObject({ covers: false });
    },
  );

  it.each([
    { caller: 'EU', actual: 'fda', proof: snapshot },
    { caller: 'US', actual: 'ema', proof: snapshot },
    { caller: 'JP', actual: 'ema', proof: nonUsSnapshot },
  ])('cannot borrow region $caller for an actual $actual sequence', async ({ caller, actual, proof }) => {
    sequenceRegion(actual);
    expect(await signedManifestCoversSequence({ ...params, region: caller, recordedPackageIdentity: proof }))
      .toMatchObject({ covers: false, detail: expect.stringMatching(/region/i) });
    expect(h.readIdentity).not.toHaveBeenCalled();
  });

  it('cannot borrow another non-US submission with the same leaves and facts', async () => {
    sequenceRegion('ema', 8);
    expect(await signedManifestCoversSequence({ ...params, region: 'EU', recordedPackageIdentity: nonUsSnapshot }))
      .toMatchObject({ covers: false });
    expect(h.readIdentity).not.toHaveBeenCalled();
  });

  it.each([undefined, 'GLOBAL', 'unknown-agency'])('reports unknown for unresolved caller region %s', async (region) => {
    expect(await signedManifestCoversSequence({ ...params, region, recordedPackageIdentity: nonUsSnapshot }))
      .toMatchObject({ unknown: true });
    expect(h.readIdentity).not.toHaveBeenCalled();
  });

  it.each([null, 'unknown-agency'])('reports unknown for unresolved actual sequence region %s', async (region) => {
    sequenceRegion(region);
    expect(await signedManifestCoversSequence({ ...params, region: 'EU', recordedPackageIdentity: nonUsSnapshot }))
      .toMatchObject({ unknown: true });
    expect(h.readIdentity).not.toHaveBeenCalled();
  });
});
