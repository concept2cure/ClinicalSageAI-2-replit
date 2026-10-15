/**
 * postMarketStatusQuery — the documentation-status query string.
 *
 * What matters: a device fact the program has not stated is never sent as
 * false. The server reads an absent `implantable` as unknown (the SSCP stays
 * undetermined) and `implantable=false` as a statement that removes an
 * obligation, so sending false for "not stated" would silently drop the SSCP.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

import { postMarketStatusQuery } from '../useCerPostMarket';

const parse = (q: string) => Object.fromEntries(new URLSearchParams(q));

describe('postMarketStatusQuery', () => {
  it('sends no implantable or customMade when no fact is stated', () => {
    expect(parse(postMarketStatusQuery('IIb', 'MDR', {}))).toEqual({ regulation: 'MDR', deviceClass: 'IIb' });
    expect(parse(postMarketStatusQuery('IIb', 'MDR'))).toEqual({ regulation: 'MDR', deviceClass: 'IIb' });
  });

  it('sends a stated false as false', () => {
    expect(parse(postMarketStatusQuery('IIa', 'MDR', { implantable: false, customMade: false }))).toEqual({
      regulation: 'MDR',
      deviceClass: 'IIa',
      implantable: 'false',
      customMade: 'false',
    });
  });

  it('sends nothing for a null fact', () => {
    const q = parse(postMarketStatusQuery('IIa', 'MDR', { implantable: null, customMade: null }));
    expect(q).not.toHaveProperty('implantable');
    expect(q).not.toHaveProperty('customMade');
  });

  it('sends the regulation, and omits an unset class rather than inventing one', () => {
    expect(parse(postMarketStatusQuery(null, 'IVDR', { implantable: true }))).toEqual({
      regulation: 'IVDR',
      implantable: 'true',
    });
  });
});
