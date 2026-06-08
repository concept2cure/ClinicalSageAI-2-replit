import { describe, it, expect } from 'vitest';
import { assessPmdaShonin, type PmdaInputLeaf } from '../pmda-shonin';

const leaf = (over: Partial<PmdaInputLeaf> & { sectionCode: string }): PmdaInputLeaf => ({
  title: over.title ?? over.sectionCode,
  ...over,
});

const complete: PmdaInputLeaf[] = [
  leaf({ sectionCode: 'dd', title: 'Device description', documentType: 'device_description' }),
  leaf({ sectionCode: 'sted', title: 'STED', documentType: 'sted' }),
  leaf({ sectionCode: 'spec', title: 'Specifications', documentType: 'specification' }),
  leaf({ sectionCode: 'qms', title: 'QMS conformity', documentType: 'qms' }),
  leaf({ sectionCode: 'perf', title: 'Bench performance', documentType: 'performance' }),
  leaf({ sectionCode: 'clin', title: 'Clinical evaluation with E5 bridging', documentType: 'clinical_evaluation' }),
  leaf({ sectionCode: 'rm', title: 'Risk management', documentType: 'risk_management' }),
  leaf({ sectionCode: 'pi', title: 'Japanese package insert', documentType: 'japanese_labelling' }),
];

describe('assessPmdaShonin', () => {
  it('is ready when every required Shōnin section is present', () => {
    const r = assessPmdaShonin({ leaves: complete });
    expect(r.summary.missingRequired).toEqual([]);
    expect(r.summary.ready).toBe(true);
  });

  it('flags missing Japanese labelling and clinical/bridging as gaps', () => {
    const partial = complete.filter((l) => l.documentType !== 'japanese_labelling' && l.documentType !== 'clinical_evaluation');
    const r = assessPmdaShonin({ leaves: partial });
    expect(r.summary.missingRequired).toContain('japanese-labelling');
    expect(r.summary.missingRequired).toContain('clinical-bridging');
    expect(r.summary.ready).toBe(false);
  });

  it('does not require optional sections (stability, foreign-approval status)', () => {
    const r = assessPmdaShonin({ leaves: complete });
    expect(r.summary.missingRequired).not.toContain('stability');
    expect(r.summary.missingRequired).not.toContain('foreign-approval-status');
  });

  it('matches Japanese-language titles (添付文書, 規格)', () => {
    const jp: PmdaInputLeaf[] = [
      leaf({ sectionCode: 'a', title: '添付文書' }),
      leaf({ sectionCode: 'b', title: '規格' }),
    ];
    const r = assessPmdaShonin({ leaves: jp });
    expect(r.sections.find((s) => s.id === 'japanese-labelling')!.present).toBe(true);
    expect(r.sections.find((s) => s.id === 'specifications')!.present).toBe(true);
  });
});
