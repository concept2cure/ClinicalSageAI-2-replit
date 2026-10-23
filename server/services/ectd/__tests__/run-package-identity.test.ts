import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ readIdentity: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../package-identity.js', async () => ({
  ...await vi.importActual<typeof import('../package-identity.js')>('../package-identity.js'),
  readSubmissionPackageIdentity: (...args: unknown[]) => h.readIdentity(...args),
}));

import { REGION_IDENTITY } from '../../../../shared/regulatory/region-identity';
import { resolveRunPackageIdentity } from '../run-package-identity';

const identity = {
  programId: '11111111-1111-4111-8111-111111111111', applicationNumber: '123456',
  applicantSponsorId: '22222222-2222-4222-8222-222222222222', applicantName: 'Recorded Sponsor',
  applicantId: '123456789', contact: { name: 'Regulatory Contact', phone: '+1 555 0100', email: 'ra@example.test' },
};
const inputs = { organizationId: 42, submissionId: '7', applicationNumber: '123456', region: 'US' };

beforeEach(() => h.readIdentity.mockReset().mockResolvedValue(identity));

describe('run package identity uses the captured regional projection', () => {
  it.each(Object.values(REGION_IDENTITY).filter((region) => region.code !== 'US'))(
    'captures $code proof without borrowing FDA DUNS/contact', async (region) => {
      const expected = { ...identity, applicantId: null, contact: { name: null, phone: null, email: null } };
      h.readIdentity.mockResolvedValue(expected);
      expect(await resolveRunPackageIdentity({ ...inputs, region: region.gatewaySlug })).toMatchObject({
        recorded: true, applicantId: null, contact: expected.contact,
        recordedPackageIdentity: { version: 1, identity: expected },
      });
      expect(h.readIdentity).toHaveBeenCalledWith(expect.anything(), 42, 7, { region: region.gatewaySlug });
    },
  );

  it('projects FDA facts out of an otherwise recorded non-US package', async () => {
    expect(await resolveRunPackageIdentity({ ...inputs, region: 'EU' })).toMatchObject({
      recorded: true, applicantId: null, contact: { name: null, phone: null, email: null },
      recordedPackageIdentity: { version: 1, identity: { applicantId: null, contact: { name: null, phone: null, email: null } } },
    });
  });

  it.each(['applicationNumber', 'applicantName'] as const)('keeps missing non-US %s a dry run', async (field) => {
    h.readIdentity.mockResolvedValue({ ...identity, [field]: null });
    expect(await resolveRunPackageIdentity({ ...inputs, region: 'EU' })).toMatchObject({ recorded: false });
  });

  it.each([undefined, 'GLOBAL', 'unknown-agency'])('keeps unresolved region %s a dry run without reading guessed facts', async (region) => {
    expect(await resolveRunPackageIdentity({ ...inputs, region })).toMatchObject({ recorded: false, reason: expect.stringMatching(/region/i) });
    expect(h.readIdentity).not.toHaveBeenCalled();
  });

  it('keeps the FDA proof byte-compatible and requires FDA DUNS/contact', async () => {
    const result = await resolveRunPackageIdentity(inputs);
    expect(result).toMatchObject({ recorded: true, recordedPackageIdentity: { version: 1, identity } });
    h.readIdentity.mockResolvedValue({ ...identity, applicantId: null });
    expect(await resolveRunPackageIdentity(inputs)).toMatchObject({ recorded: false });
    h.readIdentity.mockResolvedValue({ ...identity, contact: { ...identity.contact, email: null } });
    expect(await resolveRunPackageIdentity(inputs)).toMatchObject({ recorded: false });
  });
});
