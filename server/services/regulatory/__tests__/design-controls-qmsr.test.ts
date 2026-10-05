/**
 * The design-control element lists read the one QMSR crosswalk
 * (shared/regulatory/qmsr-crosswalk.ts).
 *
 * The QMSR has been in force since 2026-02-02. 21 CFR 820.30 is removed; design
 * and development controls are ISO 13485:2016 §7.3 reached through
 * 21 CFR 820.10(c). Three element lists still cited 820.30 as the requirement:
 *
 *   - server/services/regulatory/design-controls.ts DHF_ELEMENTS and its
 *     blockers ("No design inputs defined (820.30(c)).") — and it hard-blocked
 *     on the QSR 820.30(e) independent reviewer, a requirement the QMSR does not
 *     carry (ISO 13485:2016 §7.3.5 names the participants differently);
 *   - client/src/concept2cure/v2/surfaces/DesignControls.tsx DC_820_30, whose
 *     refs read '820.30(c) · ISO 13485 §7.3.3';
 *   - server/services/combination-products/combination-products-knowledge.ts
 *     DESIGN_CONTROL_ELEMENTS, citations '21 CFR 820.30(b)' … '(j)'.
 *
 * Each now takes its ids, order and citation from the crosswalk through
 * `citeQms(id, asOf)`: on and after the effective date the QMSR basis with the
 * QSR section named only as "formerly", before it the QSR section alone.
 */

import { describe, it, expect } from 'vitest';
import { QMSR_CROSSWALK, citeQms, QMSR_EFFECTIVE } from '../../../../shared/regulatory/qmsr-crosswalk';
import { assessDhfCompleteness, DHF_ELEMENTS, type DhfInput } from '../design-controls';
import {
  assessDeviceConstituentControls,
  listDesignControlElements,
} from '../../combination-products/combination-products-knowledge';

const AFTER = '2026-10-04';
const BEFORE = '2026-01-15';

/** The design-control element ids, in crosswalk order: the ISO 13485:2016 §7.3.x rows. */
const DESIGN_IDS = QMSR_CROSSWALK.filter((r) => /^7\.3\.\d+$/.test(r.iso13485Clause)).map((r) => r.id);

/** Removed-QSR 820.30 cited as the requirement, i.e. not inside a "formerly …" tail. */
function citesQsrAsCurrent(s: string): boolean {
  const head = s.split(/;\s*formerly\b/)[0];
  return /\b820\.30\b/.test(head);
}

function dhf(over: Partial<DhfInput> = {}): DhfInput {
  return {
    hasDesignPlan: true,
    inputs: [{ id: 'in1', requirement: 'Sensitivity ≥ 95%', category: 'performance' }],
    outputs: [{ id: 'out1', description: 'Assay protocol', satisfiesInputIds: ['in1'], hasAcceptanceCriteria: true }],
    verifications: [{ id: 'v1', description: 'Bench test', verifiesOutputIds: ['out1'], result: 'pass' }],
    validations: [
      { id: 'val1', description: 'Clinical performance', validatesInputIds: ['in1'], productionEquivalent: true, result: 'pass' },
    ],
    reviews: [{ id: 'dr1', phase: 'final', independentReviewerPresent: true, actionItemsOpen: 0 }],
    changes: [],
    designTransferDocumented: true,
    ...over,
  };
}

describe('design-controls.ts reads the crosswalk', () => {
  it('DHF_ELEMENTS is the crosswalk §7.3.x ids, in crosswalk order', () => {
    expect(DESIGN_IDS).toHaveLength(9);
    expect([...DHF_ELEMENTS]).toEqual(DESIGN_IDS);
  });

  it(`a DHF with no design inputs as of ${AFTER} cites ISO 13485:2016 §7.3.3 via 820.10(c), 820.30(c) only as "formerly"`, () => {
    const c = assessDhfCompleteness(dhf({ inputs: [], outputs: [], verifications: [], validations: [] }), AFTER);
    const b = c.blockers.find((x) => /design inputs/i.test(x));
    expect(b, c.blockers.join(' | ')).toBeDefined();
    expect(b).toContain(citeQms('designInputs', AFTER));
    expect(b).toContain('ISO 13485:2016 §7.3.3');
    expect(citesQsrAsCurrent(b as string), b).toBe(false);
    for (const x of c.blockers) expect(citesQsrAsCurrent(x), x).toBe(false);
  });

  it(`as of ${AFTER} a review without an independent reviewer is an advisory citing ISO 13485:2016 §7.3.5, not a blocker`, () => {
    const c = assessDhfCompleteness(
      dhf({ reviews: [{ id: 'dr1', phase: 'final', independentReviewerPresent: false, actionItemsOpen: 0 }] }),
      AFTER,
    );
    expect(c.blockers.some((b) => /independent reviewer/i.test(b)), c.blockers.join(' | ')).toBe(false);
    expect(c.gaps).not.toContain('designReviews');
    expect(c.auditReady).toBe(true);
    const adv = c.advisories.find((a) => /independent reviewer/i.test(a));
    expect(adv).toBeDefined();
    expect(adv).toContain('ISO 13485:2016 §7.3.5');
    expect(citesQsrAsCurrent(adv as string), adv).toBe(false);
  });

  it(`before ${QMSR_EFFECTIVE} the QSR rule and citation apply: no independent reviewer blocks, citing 21 CFR 820.30(e)`, () => {
    const c = assessDhfCompleteness(
      dhf({ reviews: [{ id: 'dr1', phase: 'final', independentReviewerPresent: false, actionItemsOpen: 0 }] }),
      BEFORE,
    );
    const b = c.blockers.find((x) => /independent reviewer/i.test(x));
    expect(b).toBeDefined();
    expect(b).toContain('21 CFR 820.30(e)');
    expect(c.gaps).toContain('designReviews');
    expect(c.auditReady).toBe(false);
  });

  it('no review recorded at all is still a gap after the effective date', () => {
    const c = assessDhfCompleteness(dhf({ reviews: [] }), AFTER);
    expect(c.gaps).toContain('designReviews');
  });

  it('a malformed asOf fails closed rather than guessing a regime', () => {
    expect(() => assessDhfCompleteness(dhf(), '2026-02-30')).toThrow(/YYYY-MM-DD/);
  });
});

describe('combination-products-knowledge.ts design-control elements read the crosswalk', () => {
  const params = { deviceConstituentDescription: 'prefilled syringe', asOf: AFTER };

  it(`as of ${AFTER} every element cites citeQms(id, asOf), in crosswalk order`, () => {
    const r = assessDeviceConstituentControls(params);
    expect(r.designControls.map((e) => e.citation)).toEqual(DESIGN_IDS.map((id) => citeQms(id, AFTER)));
    for (const e of r.designControls) expect(citesQsrAsCurrent(e.citation), e.citation).toBe(false);
  });

  it(`as of ${AFTER} the design-review expectation does not require an independent reviewer`, () => {
    const r = assessDeviceConstituentControls(params);
    const review = r.designControls[DESIGN_IDS.indexOf('designReviews')];
    expect(review.expectation).not.toMatch(/independent reviewer/i);
    expect(review.expectation).toMatch(/specialist personnel/i);
    expect(r.designHistoryFileContents.join(' ')).not.toMatch(/independent reviewer/i);
    expect(r.validationActivities.join(' ')).not.toMatch(/\(820\.30\(g\)\)/);
    expect(r.rationale.join(' ')).not.toMatch(/Design History File/);
    expect(r.rationale.join(' ')).toMatch(/ISO 13485:2016 §7\.3\.10/);
  });

  it(`before ${QMSR_EFFECTIVE} the elements cite 21 CFR 820.30(b)…(j)`, () => {
    const r = assessDeviceConstituentControls({ ...params, asOf: BEFORE });
    expect(r.designControls.map((e) => e.citation)).toEqual(DESIGN_IDS.map((id) => citeQms(id, BEFORE)));
    expect(r.designControls[0].citation).toBe('21 CFR 820.30(b)');
  });

  it('listDesignControlElements(asOf) is the same list', () => {
    expect(listDesignControlElements(AFTER)).toEqual(
      assessDeviceConstituentControls(params).designControls.map(({ citation, element, expectation }) => ({
        citation,
        element,
        expectation,
      })),
    );
  });
});

describe('DesignControls.tsx checklist reads the crosswalk', () => {
  it(`as of ${AFTER} each element ref is citeQms(id, asOf), in crosswalk order, labels unchanged`, async () => {
    const { designControlChecklistDefs } = await import(
      '../../../../client/src/concept2cure/v2/surfaces/DesignControls'
    );
    const defs = designControlChecklistDefs(AFTER);
    expect(defs.map((d) => d.el)).toEqual(DESIGN_IDS);
    expect(defs.map((d) => d.ref)).toEqual(DESIGN_IDS.map((id) => citeQms(id, AFTER)));
    for (const d of defs) expect(citesQsrAsCurrent(d.ref), d.ref).toBe(false);
    expect(defs.find((d) => d.el === 'designPlan')?.label).toBe('Design & development plan');
    expect(defs.find((d) => d.el === 'traceability')?.label).toBe('Full requirements<->V&V traceability');
    expect(defs.find((d) => d.el === 'designReviews')?.label).not.toMatch(/independent/i);
  });
});
