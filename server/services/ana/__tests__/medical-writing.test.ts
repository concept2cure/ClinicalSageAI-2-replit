/**
 * Medical-writing knowledge base + composer — unit tests.
 * Deterministic, no IO. Verifies resolution (incl. aliases/disease names),
 * fallbacks, and that the composed brief carries the governing standards.
 */
import { describe, it, expect } from 'vitest';
import {
  composeMedicalWritingGuidance,
  listMedicalWritingCatalog,
} from '../medical-writing';

describe('composeMedicalWritingGuidance', () => {
  it('resolves a CSR for oncology to FDA, regulator audience, with ICH E3 + RECIST', () => {
    const g = composeMedicalWritingGuidance({
      documentType: 'csr',
      therapeuticArea: 'oncology',
      region: 'fda',
    });
    expect(g.resolved.documentType).toBe('csr');
    expect(g.resolved.therapeuticArea).toBe('oncology');
    expect(g.resolved.region).toBe('fda');
    expect(g.resolved.audience).toBe('regulator'); // CSR default audience
    expect(g.documentStandard?.governingStandards.join(' ')).toContain('ICH E3');
    expect(g.brief).toContain('RECIST');
    expect(g.brief).toContain('ICH E3');
    expect(g.brief).toContain('United States (FDA)');
  });

  it('resolves therapeutic area from a disease name via loose alias match', () => {
    const g = composeMedicalWritingGuidance({
      documentType: 'protocol',
      therapeuticArea: 'non-small cell lung cancer',
    });
    expect(g.resolved.therapeuticArea).toBe('oncology'); // matched via 'cancer' alias
  });

  it('defaults region to ICH-global and uses the document’s default audience', () => {
    const g = composeMedicalWritingGuidance({ documentType: 'plain_language_summary' });
    expect(g.resolved.region).toBe('ich');
    expect(g.resolved.audience).toBe('patient'); // PLS default audience
    expect(g.audience.readingLevel).toMatch(/grade/i);
  });

  it('honors an explicit audience override (payer) for a manuscript', () => {
    const g = composeMedicalWritingGuidance({ documentType: 'manuscript', audience: 'payer' });
    expect(g.resolved.audience).toBe('payer');
    expect(g.brief).toContain('Comparative effectiveness');
    expect(g.documentStandard?.governingStandards.join(' ')).toContain('CONSORT');
  });

  it('falls back gracefully for an unknown document type (general craft + catalog)', () => {
    const g = composeMedicalWritingGuidance({ documentType: 'totally-made-up-doc' });
    expect(g.documentStandard).toBeNull();
    expect(g.availableDocumentTypes).toContain('csr');
    expect(g.brief).toContain('general medical-writing craft');
    // universal craft rules always present
    expect(g.brief).toContain('Universal craft rules');
  });

  it('always includes the global craft rules and the evidence-grounding guidance', () => {
    const g = composeMedicalWritingGuidance({ documentType: 'cer', region: 'ema' });
    expect(g.globalStyleRules.length).toBeGreaterThan(5);
    expect(g.brief).toContain('MDR 2017/745');
    expect(g.brief).toContain('search_literature');
  });

  it('lists a non-trivial catalog for discovery', () => {
    const cat = listMedicalWritingCatalog();
    expect(cat.documentTypes.length).toBeGreaterThanOrEqual(10);
    expect(cat.therapeuticAreas.map(t => t.id)).toContain('oncology');
    expect(cat.regions.map(r => r.id)).toEqual(
      expect.arrayContaining(['fda', 'ema', 'pmda', 'ich']),
    );
    expect(cat.audiences.map(a => a.id)).toEqual(
      expect.arrayContaining(['regulator', 'payer', 'clinician', 'patient']),
    );
  });
});
