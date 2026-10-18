/**
 * A CER whose equivalence claim is not recorded does not have equivalence
 * "addressed", and is not ready unless its Equivalence section is present
 * (2026-10-15).
 *
 * assessCerStructure read an unrecorded claim as "not claimed".
 * `equivalenceAddressed` was true even for an empty CER (assessCerStructure([])
 * gave presentCount 0 with equivalenceAddressed true), and a CER holding the
 * eleven other sections but no Equivalence section was ready. buildDeviceBlueprint
 * and the readiness scorecard then called the clinical evaluation ready without
 * knowing whether MDR Annex XIV requires section 5, which it does whenever
 * equivalence is claimed.
 */
import { describe, it, expect } from 'vitest';
import { CER_SECTIONS, assessCerStructure } from '../cer-structure';
import { buildDeviceBlueprint } from '../device-blueprint';
import { scorecardFromBlueprint } from '../device-readiness-scorecard';

const ALWAYS_REQUIRED = CER_SECTIONS.filter((s) => s.required && !s.equivalenceOnly).map((s) => s.id);

describe('assessCerStructure with no recorded equivalence claim', () => {
  it('does not say equivalence is addressed for an empty CER', () => {
    const a = assessCerStructure([]);
    expect(a.presentCount).toBe(0);
    expect(a.equivalenceAddressed).toBeNull();
  });

  it('is not ready without the Equivalence section, and names the fact that decides it', () => {
    const a = assessCerStructure(ALWAYS_REQUIRED);
    expect(a.missingRequiredSections).toEqual([]);
    expect(a.ready).toBe(false);
    expect(a.equivalenceAddressed).toBeNull();
    expect(a.missingFacts.map((f) => f.split(' ')[0])).toEqual(['equivalenceClaimed']);
  });

  it('is ready with the Equivalence section present, which satisfies either answer', () => {
    expect(assessCerStructure([...ALWAYS_REQUIRED, 'equivalence'])).toMatchObject({ ready: true, equivalenceAddressed: true, missingFacts: [] });
  });

  it('keeps the recorded answers', () => {
    expect(assessCerStructure(ALWAYS_REQUIRED, { equivalenceClaimed: false })).toMatchObject({ ready: true, equivalenceAddressed: true, missingFacts: [] });
    expect(assessCerStructure(ALWAYS_REQUIRED, { equivalenceClaimed: true })).toMatchObject({ ready: false, equivalenceAddressed: false, missingFacts: [] });
  });
});

describe('the blueprint and scorecard with no recorded equivalence claim', () => {
  const bp = buildDeviceBlueprint({
    submissionType: 'mdr_td',
    classification: { framework: 'mdr', facts: { implantable: true } },
    present: { cerSectionIds: ALWAYS_REQUIRED },
  });

  it('do not call a CER without its Equivalence section ready', () => {
    const cer = bp.evidenceModules.find((m) => m.id === 'clinical_evaluation')!.detail as { ready: boolean; equivalenceAddressed: boolean | null };
    expect(cer).toMatchObject({ ready: false, equivalenceAddressed: null });
    expect(bp.evidenceReady).toBe(false);
  });

  it('score the clinical evaluation not assessed, naming the fact to supply', () => {
    const sc = scorecardFromBlueprint(bp);
    expect(sc.dimensions.find((d) => d.id === 'evidence:clinical_evaluation')).toMatchObject({ status: 'not_assessed', score: 0 });
    expect(sc.topGaps.join(' ')).toMatch(/Clinical Evaluation Report \(MDR Annex XIV\) is not assessed: supply equivalenceClaimed/);
  });
});
