/**
 * assertTransmitterIndependent — separation of duties on the agency gateway.
 *
 * Transmit to an agency re-authenticated the human and recorded their declared
 * meaning, but never asked whether they were independent of the package: the
 * person who assembled a package could send it to FDA themselves, under any
 * meaning including "Authorship". These run the REAL separation-of-duties logic
 * (requiresIndependence, resolveTargetAuthors, assertSignerIsNotAuthor) with only
 * the database stubbed, so what is asserted is the rule as it runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// One fixed implementation, steered by state — the pattern the
// separation-of-duties suite uses.
const h = vi.hoisted(() => ({
  creator: undefined as number | null | undefined,
  fail: null as unknown,
  calls: [] as Array<[string, unknown[]]>,
}));
vi.mock('../../../db', () => ({
  pool: {
    query: async (sql: string, params: unknown[]) => {
      h.calls.push([sql, params]);
      if (h.fail) throw h.fail;
      return { rows: h.creator === undefined ? [] : [{ created_by_id: h.creator }] };
    },
  },
}));

import { assertTransmitterIndependent } from '../governed-transmit-checks';

const ORG = 7;
const PKG = 42;
const CREATOR = 11;
const COLLEAGUE = 12;

beforeEach(() => {
  h.creator = undefined;
  h.fail = null;
  h.calls.length = 0;
});

/** The settled error, or null if the call resolved. */
const refusalOf = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);

describe('assertTransmitterIndependent', () => {
  it('lets a colleague who did not create the package transmit it', async () => {
    h.creator = CREATOR;
    await expect(assertTransmitterIndependent(PKG, ORG, COLLEAGUE, 'release')).resolves.toBeUndefined();
  });

  it('refuses the package creator — 403, and says a colleague must transmit', async () => {
    h.creator = CREATOR;
    const err = await refusalOf(assertTransmitterIndependent(PKG, ORG, CREATOR, 'release'));
    expect(err?.name).toBe('GovernedTransmitRefusal');
    expect(err.code).toBe('SIGNER_IS_AUTHOR');
    expect(err.httpStatus).toBe(403);
    expect(err.message).toMatch(/You created this package.*different colleague.*Nothing was transmitted/s);
  });

  it('refuses "authorship" in either spelling, before any lookup — a transmission is a release', async () => {
    h.creator = CREATOR;
    for (const meaning of ['authorship', 'Author']) {
      const err = await refusalOf(assertTransmitterIndependent(PKG, ORG, COLLEAGUE, meaning));
      expect(err?.code).toBe('AUTHORSHIP_NOT_A_RELEASE');
      expect(err.httpStatus).toBe(422);
    }
    expect(h.calls, 'an authorship signature was looked up as if it could pass').toHaveLength(0);
  });

  it('refuses a package with no recorded creator — never guessed, never waved through', async () => {
    // AnA's create-package path did not record the creator; such a package
    // cannot be shown independent of anyone, so nobody can transmit it.
    h.creator = null;
    const err = await refusalOf(assertTransmitterIndependent(PKG, ORG, COLLEAGUE, 'release'));
    expect(err?.code).toBe('SIGNER_INDEPENDENCE_UNRESOLVED');
    expect(err.httpStatus).toBe(409);
  });

  it('a failed lookup is not independence: it fails closed as an internal error', async () => {
    h.fail = { code: '08006', message: 'connection reset' };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = await refusalOf(assertTransmitterIndependent(PKG, ORG, COLLEAGUE, 'release'));
    quiet.mockRestore();
    expect(err, 'a failed authorship lookup let the transmit proceed').not.toBeNull();
    expect(err.name).toBe('GovernedTransmitInternalError');
    expect(err.stage).toBe('transmit-separation-of-duties');
    expect(err.cause?.name, 'the lookup failure is not recorded as "could not verify"').toBe('SeparationOfDutiesUnverifiedError');
  });

  it('reads the creator of THIS package in THIS organization', async () => {
    h.creator = CREATOR;
    await assertTransmitterIndependent(PKG, ORG, COLLEAGUE, 'release');
    const [sql, params] = h.calls[0];
    expect(String(sql)).toMatch(/FROM c2c_submission_packages WHERE id = \$1::int AND org_id = \$2/);
    expect(params).toEqual([String(PKG), ORG]);
  });
});
