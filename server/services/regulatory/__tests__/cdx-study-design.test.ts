/**
 * IVD study-program designer tests.
 */

import { describe, it, expect } from 'vitest';
import { designIvdStudyProgram } from '../cdx-study-design';
import { getEntry } from '../../ivd-knowledge/knowledge.service';

describe('designIvdStudyProgram', () => {
  it('quantitative assay recommends the full CLSI EP analytical set', () => {
    const r = designIvdStudyProgram({ assayType: 'quantitative', intendedUse: 'diagnosis' });
    const standards = r.analyticalStudies.map(s => s.standard).join(' ');
    expect(standards).toContain('EP05');
    expect(standards).toContain('EP17');
    expect(standards).toContain('EP06');
    expect(standards).toContain('ISO 17511');
    expect(r.clinicalStudies.length).toBeGreaterThan(0);
  });

  it('NGS assay recommends panel + bioinformatics + reference materials + variant classification', () => {
    const r = designIvdStudyProgram({ assayType: 'ngs', intendedUse: 'cdx', specimen: 'tissue' });
    const refs = r.analyticalStudies.map(s => s.knowledgeRef);
    expect(refs).toContain('sci.ngs.panel-validation');
    expect(refs).toContain('sci.ngs.bioinformatics');
    expect(refs).toContain('sci.ngs.reference-materials');
    expect(refs).toContain('sci.ngs.variant-classification');
  });

  it('ctDNA specimen adds the ultra-low-LoD / CHIP study', () => {
    const r = designIvdStudyProgram({ assayType: 'ngs', intendedUse: 'cdx', specimen: 'plasma_ctdna' });
    expect(r.analyticalStudies.some(s => s.knowledgeRef === 'sci.ngs.ctdna')).toBe(true);
  });

  it('CDx intended use adds a bridging study and a contemporaneous-review note', () => {
    const r = designIvdStudyProgram({ assayType: 'ihc', intendedUse: 'cdx', biomarker: 'PD-L1' });
    expect(r.clinicalStudies.some(s => s.knowledgeRef === 'fda.ivd.cdx')).toBe(true);
    expect(r.notes.join(' ')).toMatch(/companion diagnostic/i);
    expect(r.biomarker.recognized).toBe(true);
  });

  it('euIvdr flag pulls in the performance-evaluation framing and ISO 20916', () => {
    const r = designIvdStudyProgram({ assayType: 'quantitative', intendedUse: 'screening', euIvdr: true });
    expect(r.clinicalStudies.some(s => s.standard.includes('ISO 20916') || s.standard.includes('IVDR'))).toBe(true);
    expect(r.citations.some(c => c.id === 'eu.ivdr.performance-evaluation')).toBe(true);
  });

  it('every cited knowledge id resolves to a real corpus entry', () => {
    const r = designIvdStudyProgram({ assayType: 'molecular', intendedUse: 'diagnosis', biomarker: 'HPV' });
    for (const c of r.citations) {
      expect(getEntry(c.id), `citation ${c.id}`).not.toBeNull();
    }
    expect(r.citations.length).toBeGreaterThan(3);
  });
});
