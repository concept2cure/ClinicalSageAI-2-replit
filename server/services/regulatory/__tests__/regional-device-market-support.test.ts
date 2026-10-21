import { describe, expect, it, vi } from 'vitest';
import { marketSupport, documentAgencyFor } from '../market-support';

const cases = [
  ['hde', 'FDA', 'fda'], ['mdl', 'Health Canada', 'hc'], ['ivd_licence', 'Health Canada', 'hc'],
  ['shonin', 'PMDA', 'pmda'], ['ninsho', 'Registered certification body', 'jp_rcb'],
  ['todokede', 'PMDA', 'pmda'], ['ivd_approval', 'PMDA', 'pmda'], ['jp_cdx', 'PMDA', 'pmda'],
] as const;

describe('regional device offers judge the exact authoring application and authority', () => {
  it.each(cases)('%s offers only its exact outline and no package or transport', (applicationType, market, agency) => {
    const find = vi.fn((type, code) => type === applicationType && code === agency ? { version: 'test', label: 'exact preparation' } : null);
    const status = marketSupport({ applicationType, market }, { find }, '2026-10-20');
    expect(status.offer.tier).toBe('author_only');
    expect(status).toMatchObject({ buildable: false, channel: { state: 'none' }, module1: { state: null }, outline: { state: 'outline' } });
    expect(status.line).toMatch(/no device package or transmit/);
    expect(documentAgencyFor({ applicationType, market })).toBe(market === 'Health Canada' ? 'Health_Canada' : market === 'Registered certification body' ? 'Registered_Certification_Body' : market);
    expect(find).toHaveBeenCalledExactlyOnceWith(applicationType, agency);
  });
  it.each(cases)('%s refuses missing exact outline even if an ICH outline exists', (applicationType, market) => {
    const find = vi.fn((_type, agency) => agency === 'ich' ? { version: 'wrong', label: 'wrong' } : null);
    const status = marketSupport({ applicationType, market }, { find }, '2026-10-20');
    expect(status.offer.tier).toBe('not_offered');
    expect(find.mock.calls.some(c => c[1] === 'ich')).toBe(false);
  });
  it.each(cases)('%s refuses another authority even when that authority has a same-name pack', (applicationType, _market, agency) => {
    const market = agency === 'fda' ? 'PMDA' : 'FDA';
    const status = marketSupport({ applicationType, market }, { find: () => ({ version: 'wrong', label: 'wrong' }) }, '2026-10-20');
    expect(status.offer.tier).toBe('not_offered');
    expect(documentAgencyFor({ applicationType, market })).toBeNull();
  });
  it('certification does not become PMDA approval when Japan is selected', () => {
    expect(documentAgencyFor({ applicationType: 'ninsho', market: 'JP' })).toBeNull();
    expect(documentAgencyFor({ applicationType: 'ninsho', market: 'Registered_Certification_Body' })).toBe('Registered_Certification_Body');
  });
});
