/**
 * assembleTechDoc must recognise the section keys the EU MDR / IVDR rule packs
 * actually write (migrations/20260810b_eu_mdr_ivdr_outlines.sql). Before this
 * the matchers knew only free-text titles / documentType hints and CTD module
 * codes, so an authored Annex II/III section reached the packager with no slot
 * and was silently dropped.
 */
import { describe, it, expect } from 'vitest';
import { assembleTechDoc } from '../mdr-ivdr/tech-doc-assembler';

function sourcesOf(result: ReturnType<typeof assembleTechDoc>, id: string): string[] {
  const slot = result.sections.find((s) => s.id === id);
  if (!slot) throw new Error(`slot ${id} missing`);
  return slot.sources;
}

describe('assembleTechDoc — 20260810b rule-pack section keys', () => {
  it('maps the MDR Annex II/III pack keys onto the technical-file slots', () => {
    const result = assembleTechDoc({
      regulation: 'mdr',
      leaves: [
        { sectionCode: 'II.1.b', title: 'Basic UDI-DI and UDI-DI assigned by the manufacturer' },
        { sectionCode: 'II.2.b', title: 'Instructions for use, in the required Union languages' },
        { sectionCode: 'II.3.b', title: 'Manufacturing processes and their validation' },
        { sectionCode: 'II.4.b', title: 'Harmonised standards and common specifications applied' },
        { sectionCode: 'II.5.b', title: 'Benefit-risk determination and residual risk acceptability' },
        { sectionCode: 'II.6.1.a', title: 'Biocompatibility — EN ISO 10993 series' },
        { sectionCode: 'II.6.1.g', title: 'Clinical evaluation report — Annex XIV Part A' },
        { sectionCode: 'III.1', title: '1 · Post-market surveillance plan (Article 84)' },
      ],
    });

    expect(sourcesOf(result, 'device-description')).toContain('II.1.b');
    expect(sourcesOf(result, 'manufacturer-information')).toContain('II.2.b');
    expect(sourcesOf(result, 'design-manufacturing')).toContain('II.3.b');
    expect(sourcesOf(result, 'gspr')).toContain('II.4.b');
    expect(sourcesOf(result, 'risk-management')).toContain('II.5.b');
    expect(sourcesOf(result, 'preclinical-clinical')).toContain('II.6.1.a');
    expect(sourcesOf(result, 'pms-plan')).toContain('III.1');
    // The CER key lands in the CER slot and ONLY there (no double placement).
    expect(sourcesOf(result, 'clinical-evaluation')).toContain('II.6.1.g');
    expect(sourcesOf(result, 'preclinical-clinical')).not.toContain('II.6.1.g');
    expect(result.summary.ready).toBe(true);
  });

  it('maps the IVDR Annex II/III pack keys onto the analytical / clinical / PER slots', () => {
    const result = assembleTechDoc({
      regulation: 'ivdr',
      leaves: [
        { sectionCode: 'II.1.d', title: 'Scientific principle, mode of action and analyte/marker measured' },
        { sectionCode: 'II.6.1.a', title: 'Analytical sensitivity — limit of detection and limit of quantitation' },
        { sectionCode: 'II.6.2.b', title: 'Clinical performance — sensitivity, specificity, predictive values, likelihood ratios' },
        { sectionCode: 'II.6.2.c', title: 'Performance evaluation plan and report (PER) — Annex XIII' },
        { sectionCode: 'III.3', title: '3 · Post-market performance follow-up plan — Annex XIII Part B' },
      ],
    });

    expect(sourcesOf(result, 'device-description')).toContain('II.1.d');
    expect(sourcesOf(result, 'analytical-performance')).toContain('II.6.1.a');
    expect(sourcesOf(result, 'clinical-performance')).toContain('II.6.2.b');
    expect(sourcesOf(result, 'performance-evaluation')).toContain('II.6.2.c');
    expect(sourcesOf(result, 'clinical-performance')).not.toContain('II.6.2.c');
    expect(sourcesOf(result, 'pms-plan')).toContain('III.3');
  });

  it('does not treat a key prefix as a dotted-path ancestor (II.1 must not claim II.10-style codes)', () => {
    const result = assembleTechDoc({
      regulation: 'mdr',
      leaves: [{ sectionCode: 'II.10', title: 'Not a real pack key' }],
    });
    expect(sourcesOf(result, 'device-description')).not.toContain('II.10');
  });
});
