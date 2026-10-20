/**
 * postMarketStatusQuery — the documentation-status query string.
 *
 * What matters: the query carries the regulation and nothing else. The device
 * class and the implantable / custom-made facts the obligations turn on come
 * from the programme record, read server-side
 * (server/services/gspr-postmarket/programme-eu-device-record.ts).
 *
 * Until 2026-10-19 this surface sent all four. `deviceClass` was
 * `profile.deviceClass` — the US 21 CFR 860 class — so a European programme's
 * MDR assessment was computed from "class II" and answered `"class II" is not
 * an MDR device class` while its MDR class sat unread in `eu_mdr_class`.
 * `implantable=false` and `customMade=true` each REMOVE an obligation, so a
 * caller-sent fact could drop the SSCP from a programme that owes one.
 *
 * This test is the pin against any of the four coming back: a governed
 * obligation set is not computed from what the client happens to hold.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

import { postMarketStatusQuery } from '../useCerPostMarket';

const parse = (q: string) => Object.fromEntries(new URLSearchParams(q));

describe('postMarketStatusQuery', () => {
  it('sends the regulation, and only the regulation', () => {
    expect(parse(postMarketStatusQuery('MDR'))).toEqual({ regulation: 'MDR' });
    expect(parse(postMarketStatusQuery('IVDR'))).toEqual({ regulation: 'IVDR' });
  });

  it.each(['deviceClass', 'implantable', 'customMade'])(
    'never sends %s — the record states it, not the caller',
    key => {
      for (const regulation of ['MDR', 'IVDR'] as const) {
        expect(parse(postMarketStatusQuery(regulation))).not.toHaveProperty(key);
      }
    },
  );
});
