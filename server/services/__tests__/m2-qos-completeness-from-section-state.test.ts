/**
 * The 2.3 Quality Overall Summary counts a Module 3 section complete only when
 * that section says so — completeness 100, no missing inputs, and source
 * lineage — and takes completeness over the ICH M4Q 2.3.S.1–S.7 / 2.3.P.1–P.8
 * list it summarizes.
 *
 * What it used to do (until 2026-10-15): a section counted as present whenever
 * composeModule3FromCanonicalSources returned an object for it, which it does
 * for all 17 sections, "has no source data available" ones included. The
 * section's own completeness and missingInputs were never read, and the
 * percentage was taken over an invented `expected = 10`. So one recorded
 * drug-substance name produced "Quality Overall Summary: 100% complete, no
 * gaps", and the AnA tool handed exactly that to the model.
 */
import { describe, expect, it } from 'vitest';

import { buildM23QualityOverallSummary } from '../m2-summary-builders';
import { composeModule3FromCanonicalSources, type CanonicalSource, type ComposedSection } from '../module3Composer';

const QOS_KEYS = [
  '3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.4', '3.2.S.5', '3.2.S.6', '3.2.S.7',
  '3.2.P.1', '3.2.P.2', '3.2.P.3', '3.2.P.4', '3.2.P.5', '3.2.P.6', '3.2.P.7', '3.2.P.8',
];

/** A section in the state the composer reports for a fully recorded one. */
function recorded(sectionKey: string, over: Partial<ComposedSection> = {}): ComposedSection {
  return {
    sectionKey,
    sectionPath: sectionKey,
    structuredPayload: {},
    narrativeDraft: `Section ${sectionKey} as recorded.`,
    tables: [],
    completeness: 100,
    missingInputs: [],
    lineage: [{ sourceObjectId: `so-${sectionKey}`, sourceHashAtCompile: 'h' }],
    ...over,
  };
}

describe('QOS completeness and gaps come from each Module 3 section’s own state', () => {
  it('one recorded drug-substance name is not a 100%-complete QOS with no gaps', () => {
    const sections = composeModule3FromCanonicalSources([
      { id: 'ds1', sourceType: 'drug_substance', sourcePayload: { name: 'ABC-123' } } as CanonicalSource,
    ]);
    // The composer returns every section whether or not anything was recorded for it.
    expect(sections).toHaveLength(17);

    const qos = buildM23QualityOverallSummary({ module3Sections: sections, drugSubstanceName: 'ABC-123' });

    expect(qos.completeness).toBe(0);
    expect(qos.gaps).toHaveLength(15);
    expect(qos.gaps).toContain('3.2.S.1 — 50% complete; missing: manufacturer');
    expect(qos.gaps).toContain(
      '3.2.S.4 — no source data; 0% complete; missing: acceptanceCriteria, validationStatus, drugSubstanceBatchAnalyses, drugSubstanceImpurityProfileComplete',
    );
    // An input is a section that carried recorded data; S.4 carried none.
    expect(qos.inputSectionKeys).toEqual(['3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.5', '3.2.P.2']);
    // The narrative a model or reader sees says the same thing.
    expect(qos.narrative).not.toMatch(/full quality dossier is provided in Module 3/);
    expect(qos.narrative).toContain('2.3.S.1 General Information\n');
    expect(qos.narrative).toContain('[Open in Module 3: 50% complete; missing: manufacturer.]');
    expect(qos.narrative).toContain('Open items: 3.2.S.1 — 50% complete; missing: manufacturer;');
    expect(qos.narrative).not.toMatch(/Full data and analytical methods are provided in Module 3/);
  });

  it('a section with no source lineage is a gap even when it reports 100%', () => {
    const sections = QOS_KEYS.map((key) => (key === '3.2.S.5' ? recorded(key, { lineage: [] }) : recorded(key)));
    const qos = buildM23QualityOverallSummary({ module3Sections: sections });
    expect(qos.gaps).toEqual(['3.2.S.5 — no source data']);
    expect(qos.completeness).toBe(93); // 14 of 15
    expect(qos.inputSectionKeys).not.toContain('3.2.S.5');
  });

  it('a section that lists missing inputs is a gap even when it reports 100%', () => {
    const sections = QOS_KEYS.map((key) =>
      key === '3.2.P.4' ? recorded(key, { missingInputs: ['excipientControlComplete'] }) : recorded(key),
    );
    const qos = buildM23QualityOverallSummary({ module3Sections: sections });
    expect(qos.gaps).toEqual(['3.2.P.4 — missing: excipientControlComplete']);
    expect(qos.completeness).toBe(93);
  });

  it('takes completeness over the 15 ICH M4Q sections it summarizes, not a constant', () => {
    const qos = buildM23QualityOverallSummary({ module3Sections: [recorded('3.2.S.7'), recorded('3.2.P.8')] });
    expect(qos.completeness).toBe(13); // 2 of 15
    expect(qos.gaps).toHaveLength(13);
    expect(qos.gaps).toContain('3.2.P.7 — not composed');
    for (const heading of [
      '2.3.S.5 Reference Standards or Materials',
      '2.3.S.6 Container Closure System',
      '2.3.P.4 Control of Excipients',
      '2.3.P.6 Reference Standards or Materials',
      '2.3.P.7 Container Closure System',
    ]) {
      expect(qos.narrative).toContain(`${heading}\n`);
    }
  });

  it('states 100% and no gaps only when every summarized section is recorded in full', () => {
    const qos = buildM23QualityOverallSummary({ module3Sections: QOS_KEYS.map((key) => recorded(key)) });
    expect(qos.completeness).toBe(100);
    expect(qos.gaps).toEqual([]);
    expect(qos.inputSectionKeys).toEqual(QOS_KEYS);
    expect(qos.narrative).toContain('The full quality dossier is provided in Module 3.');
    expect(qos.narrative).not.toMatch(/\[Open in Module 3/);
  });
});
