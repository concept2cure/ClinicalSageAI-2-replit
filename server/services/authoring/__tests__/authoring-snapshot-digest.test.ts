import { describe, expect, it } from 'vitest';
import { authoringSnapshotHash, fullVisibleAuthoringSnapshot, sectionsDigest } from '../authoring-content-digests';

const doc = { id: '10000000-0000-4000-8000-000000000001', title: 'Study report', module: '3',
  locale: 'en', product_code: 'TEST', version: 2 };
const sections = [
  { id: '10000000-0000-4000-8000-000000000002', code: 'A', title: 'Purpose', content: 'alpha' },
  { id: '10000000-0000-4000-8000-000000000003', code: 'B', title: 'Methods', content: 'beta' },
];
const hash = () => authoringSnapshotHash(fullVisibleAuthoringSnapshot({ doc, sections }));

describe('the full saved human-review snapshot', () => {
  it('frames ambiguous legacy delimiters without changing existing signature digest behavior', () => {
    const folded = [{ ...sections[0], content: 'alpha|||B:beta' }];
    expect(sectionsDigest(sections)).toBe(sectionsDigest(folded));
    expect(hash()).not.toBe(authoringSnapshotHash(fullVisibleAuthoringSnapshot({ doc, sections: folded })));
  });
  it('verifies the same full record after JSONB reorders every key', () => {
    const snapshot = fullVisibleAuthoringSnapshot({ doc, sections });
    const jsonbOrder = { sections: snapshot.sections.map(s => ({ content: s.content, title: s.title, code: s.code, id: s.id })),
      version: snapshot.version, productCode: snapshot.productCode, locale: snapshot.locale,
      module: snapshot.module, title: snapshot.title, id: snapshot.id };
    expect(authoringSnapshotHash(jsonbOrder)).toBe(hash());
  });
  it.each(['title', 'module', 'locale', 'product_code', 'version'] as const)('invalidates a reviewed document after %s changes', key => {
    const changed = { ...doc, [key]: key === 'version' ? 3 : 'Changed' };
    expect(authoringSnapshotHash(fullVisibleAuthoringSnapshot({ doc: changed, sections }))).not.toBe(hash());
  });
  it('invalidates a review on a section-title change or reordering even when prose stays the same', () => {
    expect(authoringSnapshotHash(fullVisibleAuthoringSnapshot({ doc, sections: [{ ...sections[0], title: 'Changed' }, sections[1]] }))).not.toBe(hash());
    expect(authoringSnapshotHash(fullVisibleAuthoringSnapshot({ doc, sections: [...sections].reverse() }))).not.toBe(hash());
  });
});
