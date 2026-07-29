/**
 * Regulatory-pathway advisor — unit tests. Deterministic; verifies direct
 * pathway resolution (incl. aliases), domain/jurisdiction candidate filtering
 * and ranking, brief content, and the advisory caveat.
 */
import { describe, it, expect } from 'vitest';
import { adviseRegulatoryPathway, listRegulatoryPathways } from '../regulatory-pathway';

describe('adviseRegulatoryPathway', () => {
  it('resolves 505(b)(2) by alias and surfaces basis + pitfalls', () => {
    const r = adviseRegulatoryPathway({ pathway: '505b2' });
    expect(r.resolved.pathway).toBe('nda_505b2');
    expect(r.pathway?.basis).toContain('505(b)(2)');
    expect(r.brief).toContain('bridge');
    expect(r.brief).toContain('Common pitfalls');
  });

  it('resolves a biosimilar via alias to BLA 351(k)', () => {
    const r = adviseRegulatoryPathway({ pathway: 'biosimilar' });
    expect(r.resolved.pathway).toBe('bla_351k');
    expect(r.brief).toContain('totality');
  });

  it('returns ranked device candidates for domain=device, jurisdiction=us', () => {
    const r = adviseRegulatoryPathway({ domain: 'device', jurisdiction: 'us' });
    expect(r.pathway).toBeNull();
    const ids = r.candidates.map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(['fda_510k', 'fda_pma', 'fda_de_novo']));
    // No EU/drug routes leak in.
    expect(ids).not.toContain('eu_mdr');
    expect(ids).not.toContain('nda_505b1');
  });

  it('maps jurisdiction synonyms (fda → us, europe → eu)', () => {
    const us = adviseRegulatoryPathway({ domain: 'drug', jurisdiction: 'fda' });
    expect(us.resolved.jurisdiction).toBe('us');
    expect(us.candidates.every(c => c.id.startsWith('nda') || c.id === 'anda')).toBe(true);

    const eu = adviseRegulatoryPathway({ domain: 'ivd', jurisdiction: 'europe' });
    expect(eu.resolved.jurisdiction).toBe('eu');
    expect(eu.candidates.map(c => c.id)).toContain('eu_ivdr');
  });

  it('always appends the advisory caveat', () => {
    const r = adviseRegulatoryPathway({ pathway: '510k' });
    expect(r.brief).toContain('Advisory only');
  });

  it('lists the full pathway catalog', () => {
    const all = listRegulatoryPathways();
    expect(all.map(p => p.id)).toEqual(
      expect.arrayContaining(['nda_505b1', 'anda', 'bla_351a', 'fda_pma', 'eu_mdr', 'eu_ivdr']),
    );
  });
});
