import { normalizeEvidence } from '../services/research-intelligence/normalizeEvidence';

describe('normalizeEvidence', () => {
  test('normalizes canonical URL and domain', () => {
    const normalized = normalizeEvidence({
      provider: 'firecrawl',
      url: 'https://Example.com/path?q=1#frag',
      title: '  Test Title ',
      markdown: 'NCT12345678 reported efficacy endpoint p-value 0.04 with DOI 10.1000/xyz123',
    });

    expect(normalized.domain).toBe('example.com');
    expect(normalized.canonicalUrl).toBe('https://example.com/path?q=1');
    expect(normalized.title).toBe('Test Title');
    expect(normalized.regulatorySignals.nctIds).toContain('NCT12345678');
    expect(normalized.regulatorySignals.dois).toContain('10.1000/xyz123');
    expect(normalized.regulatorySignals.hasEfficacyLanguage).toBe(true);
  });

  test('throws on missing content', () => {
    expect(() => normalizeEvidence({ url: 'https://example.com' })).toThrow('normalization_failed');
  });
});
