import { describe, it, expect } from 'vitest';
import { generateSop } from '../../server/services/sop-generator';

describe('SOP generator', () => {
  it('produces the canonical GxP section skeleton', () => {
    const sop = generateSop({ title: 'Document Control', processType: 'document_control' });
    const titles = sop.sections.map((s) => s.title.toLowerCase());
    for (const required of ['purpose', 'scope', 'responsibilities', 'procedure', 'references', 'revision history', 'approval']) {
      expect(titles.some((t) => t.includes(required))).toBe(true);
    }
    expect(sop.version).toBe('1.0');
    expect(sop.markdown).toContain('# Document Control');
    expect(sop.markdown).toContain(sop.documentId);
  });

  it('fills a real starter procedure for a known process', () => {
    const sop = generateSop({ title: 'Change Control', processType: 'change_control' });
    const proc = sop.sections.find((s) => s.title === 'Procedure')!;
    expect(proc.content).toMatch(/regulatory reporting category/i);
    expect(proc.content.split('\n').length).toBeGreaterThan(4);
  });

  it('is region-aware: references differ by region', () => {
    const fda = generateSop({ title: 'X', processType: 'change_control', regions: ['FDA'] });
    const ema = generateSop({ title: 'X', processType: 'change_control', regions: ['EMA'] });
    const pmda = generateSop({ title: 'X', processType: 'change_control', regions: ['PMDA'] });
    expect(fda.references.join(' ')).toMatch(/21 CFR/);
    expect(ema.references.join(' ')).toMatch(/EudraLex|GVP|1234\/2008/);
    expect(pmda.references.join(' ')).toMatch(/MHLW|PMD Act|GPSP/);
  });

  it('supports a multi-region SOP (FDA + EMA + PMDA)', () => {
    const sop = generateSop({ title: 'Regulatory Submission', processType: 'regulatory_submission', regions: ['FDA', 'EMA', 'PMDA'] });
    expect(sop.regions).toEqual(['FDA', 'EMA', 'PMDA']);
    const refs = sop.references.join(' ');
    expect(refs).toMatch(/ESG/);
    expect(refs).toMatch(/CESP|eSubmission/);
    expect(refs).toMatch(/PMDA/);
  });

  it('defaults to FDA and handles a generic topic', () => {
    const sop = generateSop({ title: 'Anything Bespoke' });
    expect(sop.regions).toEqual(['FDA']);
    expect(sop.processType).toBe('generic');
    expect(sop.sections.find((s) => s.title === 'Procedure')!.content.length).toBeGreaterThan(0);
  });
});
