/**
 * Protocol Templates pure logic — section merge with the required catalog +
 * template validation. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { mergeTemplateSections, validateTemplate, type TemplateSectionView } from '../protocol-templates-logic';

describe('mergeTemplateSections', () => {
  it('keeps template sections and injects missing required catalog sections', () => {
    const tmpl: TemplateSectionView[] = [
      { sectionKey: 'synopsis', title: 'Custom Synopsis', content: 'preset', orderIndex: 0 },
      { sectionKey: 'background', title: 'Background', orderIndex: 1 },
    ];
    const merged = mergeTemplateSections('clinical', tmpl);
    const synopsis = merged.find((s) => s.sectionKey === 'synopsis')!;
    expect(synopsis.origin).toBe('template');
    expect(synopsis.content).toBe('preset');
    // A required clinical section not in the template (e.g. objectives) is injected.
    const objectives = merged.find((s) => s.sectionKey === 'objectives');
    expect(objectives).toBeTruthy();
    expect(objectives!.origin).toBe('catalog');
    // order indices are contiguous from 0
    expect(merged.map((s) => s.orderIndex)).toEqual(merged.map((_, i) => i));
  });

  it('dedupes repeated section keys', () => {
    const merged = mergeTemplateSections('irb', [
      { sectionKey: 'summary', title: 'A' }, { sectionKey: 'summary', title: 'B' },
    ]);
    expect(merged.filter((s) => s.sectionKey === 'summary')).toHaveLength(1);
  });
});

describe('validateTemplate', () => {
  it('flags missing required sections but stays valid with >=1 section', () => {
    const v = validateTemplate('clinical', [{ sectionKey: 'synopsis', title: 'Synopsis' }]);
    expect(v.valid).toBe(true);
    expect(v.coversRequired).toBe(false);
    expect(v.findings.length).toBeGreaterThan(0);
  });
  it('is invalid with no sections', () => {
    const v = validateTemplate('iacuc', []);
    expect(v.valid).toBe(false);
  });
});
