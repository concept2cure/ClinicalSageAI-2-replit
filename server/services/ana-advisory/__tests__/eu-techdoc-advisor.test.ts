import { describe, it, expect } from 'vitest';
import { adviseEuTechnicalFileReadiness, EU_TECHDOC_TOOL_SPEC } from '../eu-techdoc-advisor';
import type { TechDocInputLeaf } from '../../pathway-engines/mdr-ivdr/tech-doc-assembler';

// Covers MDR Annex II/III required sections.
const mdrComplete: TechDocInputLeaf[] = [
  { sectionCode: '1', title: 'Device description and intended purpose' },
  { sectionCode: '2', title: 'Instructions for use and labelling' },
  { sectionCode: '3', title: 'Design and manufacturing information' },
  { sectionCode: '4', title: 'General safety and performance requirements (GSPR) checklist' },
  { sectionCode: '5', title: 'Risk management and benefit-risk analysis' },
  { sectionCode: '6', title: 'Preclinical and verification and validation' },
  { sectionCode: '7', title: 'Clinical evaluation report' },
  { sectionCode: '8', title: 'Post-market surveillance plan' },
];

describe('adviseEuTechnicalFileReadiness', () => {
  it('advises NB-ready for a complete MDR file', () => {
    const a = adviseEuTechnicalFileReadiness({ leaves: mdrComplete, regulation: 'mdr' });
    expect(a.regulation).toBe('mdr');
    expect(a.ready).toBe(true);
    expect(a.missingRequiredSections).toHaveLength(0);
    expect(a.headline).toMatch(/MDR \(EU 2017\/745\)/);
    expect(a.headline).toMatch(/Notified-Body/i);
  });

  it('advises not NB-ready with missing Annex sections for IVDR', () => {
    const a = adviseEuTechnicalFileReadiness({ leaves: [{ sectionCode: '1', title: 'Device description' }], regulation: 'ivdr' });
    expect(a.regulation).toBe('ivdr');
    expect(a.ready).toBe(false);
    expect(a.missingRequiredSections.length).toBeGreaterThan(0);
    expect(a.recommendedActions.length).toBe(a.missingRequiredSections.length);
    // IVDR-specific sections appear (performance evaluation / analytical performance)
    expect(a.missingRequiredSections.map((s) => s.id)).toContain('performance-evaluation');
    expect(a.headline).toMatch(/IVDR \(EU 2017\/746\)/);
  });

  it('each missing section carries its Annex reference', () => {
    const a = adviseEuTechnicalFileReadiness({ leaves: [], regulation: 'mdr' });
    expect(a.missingRequiredSections.every((s) => typeof s.annex === 'string' && s.annex.length > 0)).toBe(true);
  });

  it('exposes a well-formed tool spec', () => {
    expect(EU_TECHDOC_TOOL_SPEC.name).toBe('advise_eu_technical_file_readiness');
    expect(EU_TECHDOC_TOOL_SPEC.input_schema.type).toBe('object');
    expect(EU_TECHDOC_TOOL_SPEC.input_schema.properties).toHaveProperty('regulation');
    expect(EU_TECHDOC_TOOL_SPEC.input_schema.properties).toHaveProperty('leaves');
  });
});
