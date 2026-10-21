import { describe, expect, it, vi } from 'vitest';
import { readRecordedPackageIdentity, packageIdentityRefusal, recordedPackageIdentitySnapshot, sameRecordedPackageIdentitySnapshot, lockRecordedPackageIdentity, fdaContactsForPackageIdentity, type RecordedPackageIdentitySnapshot } from '../package-identity';
import { buildPackagerInputFromCore } from '../core-to-packager';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const SPONSOR = '22222222-2222-4222-8222-222222222222';
const recordedRow = (patch: Record<string, unknown> = {}) => ({
  organization_name: 'Platform organization', application_number: '000512',
  applicant_sponsor_id: SPONSOR, sponsor_id: SPONSOR,
  sponsor_name: 'Recorded applicant', duns: '123456789',
  contact_name: 'Regulatory contact', contact_phone: '+1 212 555 0100', contact_email: 'ra@example.test',
  ...patch,
});
const read = async (patch: Record<string, unknown> = {}) => {
  const query = vi.fn(async () => ({ rows: [recordedRow(patch)] }));
  return { identity: await readRecordedPackageIdentity({ query }, 7, PROGRAM), query };
};

describe('recorded applicant identity uses the existing sponsor registry', () => {
  it('reads one tenant-scoped joined statement and uses the explicitly bound legal name', async () => {
    const { identity, query } = await read();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([expect.stringMatching(/JOIN ind_sponsors/i), [7, PROGRAM]]);
    expect(identity).toMatchObject({ programId: PROGRAM, applicationNumber: '000512',
      applicantSponsorId: SPONSOR, applicantName: 'Recorded applicant', applicantId: '123456789',
      contact: { name: 'Regulatory contact', phone: '+1 212 555 0100', email: 'ra@example.test' } });
  });
  it('preserves the organization name only when no sponsor binding was recorded', async () => {
    const { identity } = await read({ applicant_sponsor_id: null, sponsor_id: null, sponsor_name: null, duns: null });
    expect(identity.applicantName).toBe('Platform organization');
    expect(packageIdentityRefusal(identity, 'Nothing was built.')).toBeNull();
    expect(packageIdentityRefusal(identity, 'Nothing was built.', { fda: true })?.missing).toEqual(expect.arrayContaining(['applicantSponsorId', 'applicantId']));
  });
  it('never falls back to the organization for a broken or foreign explicit binding', async () => {
    const { identity } = await read({ sponsor_id: null, sponsor_name: null, duns: null,
      contact_name: null, contact_phone: null, contact_email: null });
    expect(identity.applicantName).toBeNull();
    expect(packageIdentityRefusal(identity, 'Nothing was built.', { fda: true })?.missing).toEqual(expect.arrayContaining(['applicantName', 'applicantId', 'contact']));
  });
  it.each([
    [{ application_number: 'IND000512' }, 'applicationNumber'],
    [{ duns: '12-345-6789' }, 'applicantId'],
    [{ contact_phone: 'not a telephone' }, 'contact.phone'],
    [{ contact_email: 'not an email' }, 'contact.email'],
    [{ contact_name: '\u0000' }, 'contact.name'],
  ])('FDA refuses invalid recorded facts without rewriting them: %j', async (patch, field) => {
    const { identity } = await read(patch);
    const refusal = packageIdentityRefusal(identity, 'Nothing was built.', { fda: true });
    expect(refusal?.missing).toContain(field);
    expect(refusal?.message).toMatch(/Nothing was built\.$/);
  });
  it('does not silently turn a failed identity read into an unbound record', async () => {
    const query = vi.fn(async () => { throw new Error('database unavailable'); });
    await expect(readRecordedPackageIdentity({ query }, 7, PROGRAM)).rejects.toThrow('database unavailable');
  });
  it('accepts complete recorded FDA facts', async () => {
    const { identity } = await read();
    expect(packageIdentityRefusal(identity, 'Nothing was built.', { fda: true })).toBeNull();
  });
});

describe('canonical adapter reaches the existing FDA contact serializer', () => {
  it('threads recorded contacts only to the FDA admin block', () => {
    const contacts = [{ type: 'regulatory', name: 'Regulatory contact', phone: '+1 212 555 0100', email: 'ra@example.test' }];
    const args = { sequence: { id: 1, region: 'fda', sequenceNumber: '0000', type: 'original' },
      submission: { applicationType: 'ind' }, leaves: [], resolveFile: () => null,
      applicationId: '000512', sponsorId: '123456789', sponsorName: 'Recorded applicant', outputDir: '/tmp/identity-test', contacts };
    expect(buildPackagerInputFromCore(args).input.fda?.contacts).toEqual(contacts);
    expect(buildPackagerInputFromCore({ ...args, sequence: { ...args.sequence, region: 'ema' } }).input.fda).toBeUndefined();
  });
});


describe('captured applicant identity proof', () => {
  it('captures facts by value and compares only complete known fields', async () => {
    const { identity } = await read();
    const snapshot = recordedPackageIdentitySnapshot(identity);
    expect(sameRecordedPackageIdentitySnapshot(snapshot, recordedPackageIdentitySnapshot(identity))).toBe(true);
    identity.contact.email = 'changed@example.test';
    expect(snapshot.identity.contact.email).toBe('ra@example.test');
    expect(sameRecordedPackageIdentitySnapshot(snapshot, recordedPackageIdentitySnapshot(identity))).toBe(false);
    expect(fdaContactsForPackageIdentity(snapshot.identity)).toEqual([{ type: 'regulatory', name: 'Regulatory contact', phone: '+1 212 555 0100', email: 'ra@example.test' }]);
  });
  it.each(['programId', 'applicationNumber', 'applicantSponsorId', 'applicantName', 'applicantId'] as const)(
    'a changed %s is different proof', async (field) => {
      const { identity } = await read();
      const before = recordedPackageIdentitySnapshot(identity);
      const after = recordedPackageIdentitySnapshot(identity);
      after.identity[field] = 'changed';
      expect(sameRecordedPackageIdentitySnapshot(before, after)).toBe(false);
    });
  it.each([undefined, null, {}, { version: 2 }, { version: 1 }, { version: 1, identity: {} },
    { version: 1, identity: { contact: null } }])('malformed or absent stored proof fails closed: %j', async (untrusted) => {
    const { identity } = await read();
    expect(sameRecordedPackageIdentitySnapshot(untrusted as RecordedPackageIdentitySnapshot, recordedPackageIdentitySnapshot(identity))).toBe(false);
  });
  it('does not invent a partial regulatory contact', async () => {
    const { identity } = await read({ contact_email: null });
    expect(fdaContactsForPackageIdentity(identity)).toEqual([]);
  });
});

describe('recorded identity transaction locking', () => {
  it('locks program before same-tenant sponsor, using the caller transaction', async () => {
    const query = vi.fn(async () => ({ rows: [{ applicant_sponsor_id: SPONSOR }] }));
    await lockRecordedPackageIdentity({ query }, 7, PROGRAM);
    expect(query.mock.calls).toEqual([
      [expect.stringMatching(/regulatory_programs[\s\S]*FOR SHARE/), [PROGRAM, 7]],
      [expect.stringMatching(/ind_sponsors[\s\S]*organization_id = \$2 FOR SHARE/), [SPONSOR, 7]],
    ]);
  });
  it('does not invent a sponsor lock for an unbound program', async () => {
    const query = vi.fn(async () => ({ rows: [{ applicant_sponsor_id: null }] }));
    await lockRecordedPackageIdentity({ query }, 7, PROGRAM);
    expect(query).toHaveBeenCalledTimes(1);
    await lockRecordedPackageIdentity({ query }, 7, null);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
