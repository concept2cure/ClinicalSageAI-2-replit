import { describe, expect, it, vi } from 'vitest';
import { readRecordedPackageIdentity, packageIdentityRefusal, recordedPackageIdentitySnapshot, sameRecordedPackageIdentitySnapshot, lockRecordedPackageIdentity, lockSubmissionPackageIdentity, fdaContactsForPackageIdentity, type RecordedPackageIdentitySnapshot } from '../package-identity';
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
  it('preserves the exact version 1 default and FDA capture bytes', async () => {
    const { identity } = await read();
    const expected = '{"version":1,"identity":{"programId":"11111111-1111-4111-8111-111111111111","applicationNumber":"000512","applicantSponsorId":"22222222-2222-4222-8222-222222222222","applicantName":"Recorded applicant","applicantId":"123456789","contact":{"name":"Regulatory contact","phone":"+1 212 555 0100","email":"ra@example.test"}}}';
    expect(JSON.stringify(recordedPackageIdentitySnapshot(identity))).toBe(expected);
    for (const region of ['US', 'FDA', 'fda']) {
      expect(JSON.stringify(recordedPackageIdentitySnapshot(identity, { region }))).toBe(expected);
    }
  });
  it.each(['EU', 'JP', 'CA', 'CN', 'KR', 'UK', 'AU', 'CH', 'BR', 'IN', 'SG', 'ema', 'pmda'])(
    'captures %s identity without assigning FDA facts another regional meaning', async (region) => {
      const { identity } = await read();
      const snapshot = recordedPackageIdentitySnapshot(identity, { region });
      expect(snapshot).toEqual({ version: 1, identity: {
        programId: PROGRAM, applicationNumber: '000512', applicantSponsorId: SPONSOR,
        applicantName: 'Recorded applicant', applicantId: null,
        contact: { name: null, phone: null, email: null },
      } });
      expect(sameRecordedPackageIdentitySnapshot(snapshot, recordedPackageIdentitySnapshot(snapshot.identity))).toBe(true);
      expect(identity.applicantId).toBe('123456789');
      expect(identity.contact.email).toBe('ra@example.test');
    });
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
    expect(sameRecordedPackageIdentitySnapshot(untrusted as unknown as RecordedPackageIdentitySnapshot, recordedPackageIdentitySnapshot(identity))).toBe(false);
  });
  it('does not invent a partial regulatory contact', async () => {
    const { identity } = await read({ contact_email: null });
    expect(fdaContactsForPackageIdentity(identity)).toEqual([]);
  });
});

describe('recorded identity transaction locking', () => {
  it('locks the organization before its same-tenant submission and returns the actual program anchor', async () => {
    const query = vi.fn(async () => ({ rows: [{ program_id: PROGRAM }] }));
    await expect(lockSubmissionPackageIdentity({ query }, 7, 9)).resolves.toEqual({ programId: PROGRAM });
    expect(query.mock.calls).toEqual([
      [expect.stringMatching(/FROM organizations WHERE id = \$1 FOR SHARE/), [7]],
      [expect.stringMatching(/FROM submissions[\s\S]*id = \$1 AND organization_id = \$2[\s\S]*deleted_at IS NULL FOR SHARE/), [9, 7]],
    ]);
  });
  it('takes one direct submission UPDATE lock for freeze, without a SHARE upgrade', async () => {
    const query = vi.fn(async () => ({ rows: [{ program_id: PROGRAM }] }));
    await expect(lockSubmissionPackageIdentity({ query }, 7, 9, { forUpdate: true })).resolves.toEqual({ programId: PROGRAM });
    expect(query.mock.calls).toEqual([
      [expect.stringMatching(/FROM organizations WHERE id = \$1 FOR SHARE/), [7]],
      [expect.stringMatching(/FROM submissions[\s\S]*deleted_at IS NULL FOR UPDATE/), [9, 7]],
    ]);
  });
  it('distinguishes a missing or foreign parent from a present unanchored submission', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('FROM submissions') ? [] : [{ id: 7 }] }));
    await expect(lockSubmissionPackageIdentity({ query }, 7, 9)).resolves.toBeNull();
    const unanchored = { query: vi.fn(async () => ({ rows: [{ program_id: null }] })) };
    await expect(lockSubmissionPackageIdentity(unanchored, 7, 9)).resolves.toEqual({ programId: null });
  });
  it('propagates a submission lock failure instead of returning a guessed anchor', async () => {
    const query = vi.fn(async () => { throw new Error('submission lock unavailable'); });
    await expect(lockSubmissionPackageIdentity({ query }, 7, 9)).rejects.toThrow('submission lock unavailable');
  });
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
