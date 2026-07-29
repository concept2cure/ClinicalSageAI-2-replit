import { describe, it, expect } from 'vitest';
import { assembleTechDoc, type TechDocInputLeaf } from '../tech-doc-assembler';

const leaf = (over: Partial<TechDocInputLeaf> & { sectionCode: string }): TechDocInputLeaf => ({
  title: over.title ?? over.sectionCode,
  ...over,
});

const mdrComplete: TechDocInputLeaf[] = [
  leaf({ sectionCode: 'dd', title: 'Device description', documentType: 'device_description' }),
  leaf({ sectionCode: 'ifu', title: 'Instructions for use', documentType: 'ifu' }),
  leaf({ sectionCode: 'dm', title: 'Design and manufacturing', documentType: 'design_manufacturing' }),
  leaf({ sectionCode: 'gspr', title: 'GSPR checklist', documentType: 'gspr' }),
  leaf({ sectionCode: 'rm', title: 'Risk management file', documentType: 'risk_management' }),
  leaf({ sectionCode: 'vv', title: 'Verification and validation', documentType: 'verification_validation' }),
  leaf({ sectionCode: 'cer', title: 'Clinical Evaluation Report', documentType: 'cer' }),
  leaf({ sectionCode: 'pms', title: 'Post-market surveillance plan', documentType: 'pms_plan' }),
];

describe('assembleTechDoc — MDR', () => {
  it('marks every required MDR Annex II/III section present for a complete file', () => {
    const r = assembleTechDoc({ leaves: mdrComplete, regulation: 'mdr' });
    expect(r.regulation).toBe('mdr');
    expect(r.summary.missingRequired).toEqual([]);
    expect(r.summary.ready).toBe(true);
    expect(r.sections.find((s) => s.id === 'clinical-evaluation')!.annex).toBe('Annex XIV');
  });

  it('reports missing GSPR and CER as gaps, never invents them', () => {
    const partial = mdrComplete.filter((l) => l.documentType !== 'gspr' && l.documentType !== 'cer');
    const r = assembleTechDoc({ leaves: partial, regulation: 'mdr' });
    expect(r.summary.missingRequired).toContain('gspr');
    expect(r.summary.missingRequired).toContain('clinical-evaluation');
    expect(r.summary.ready).toBe(false);
  });
});

describe('assembleTechDoc — IVDR', () => {
  it('requires analytical + clinical performance and the PER (not a CER)', () => {
    const r = assembleTechDoc({ leaves: mdrComplete, regulation: 'ivdr' });
    // IVDR registry has no 'clinical-evaluation'; it needs performance evidence instead.
    expect(r.sections.some((s) => s.id === 'clinical-evaluation')).toBe(false);
    expect(r.summary.missingRequired).toContain('analytical-performance');
    expect(r.summary.missingRequired).toContain('performance-evaluation');
  });

  it('is ready when IVDR performance evidence is supplied', () => {
    const ivdr: TechDocInputLeaf[] = [
      leaf({ sectionCode: 'dd', title: 'Device description', documentType: 'device_description' }),
      leaf({ sectionCode: 'ifu', title: 'IFU', documentType: 'ifu' }),
      leaf({ sectionCode: 'dm', title: 'Design & manufacturing', documentType: 'design_manufacturing' }),
      leaf({ sectionCode: 'gspr', title: 'GSPR', documentType: 'gspr' }),
      leaf({ sectionCode: 'rm', title: 'Risk management', documentType: 'risk_management' }),
      leaf({ sectionCode: 'ap', title: 'Analytical performance', documentType: 'analytical_performance' }),
      leaf({ sectionCode: 'cp', title: 'Clinical performance', documentType: 'clinical_performance' }),
      leaf({ sectionCode: 'per', title: 'Performance Evaluation Report', documentType: 'per' }),
      leaf({ sectionCode: 'pms', title: 'PMS plan', documentType: 'pms_plan' }),
    ];
    const r = assembleTechDoc({ leaves: ivdr, regulation: 'ivdr' });
    expect(r.summary.ready).toBe(true);
  });
});
