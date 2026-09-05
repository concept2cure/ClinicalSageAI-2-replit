/**
 * §3.2.S.7 / §3.2.P.8's stability verdict — computed from the recorded results,
 * not read off a sentence.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 * readStabilitySignal serialised every result-shaped field on the payload into
 * one string and ran two word regexes over it. It never read a number and never
 * compared one to an acceptance criterion. So a study whose conclusion field
 * said "meets its specification at all time points" composed as
 * "The stability results ... remain within the acceptance criteria at the
 * reported time points" while its recorded assay at 12 months was 88.1% against
 * a specification of 95.0 - 105.0 %.
 *
 * A conformance statement in a dossier is a claim about the numbers. The
 * product holds the parser it needs — parseAcceptanceCriterion, which reads the
 * two-sided ranges an assay specification is actually written in.
 *
 * @compliance ICH Q1A(R2) / Q1E — the stability conclusion states the data.
 */
import { describe, it, expect } from 'vitest';
import { composeModule3FromCanonicalSources } from '../../module3Composer';

const src = (sourceType: string, sourcePayload: Record<string, unknown>) =>
  ({ id: 's', sourceType, sourcePayload, sourceHash: 'h' }) as never;

/** A study whose own words say it passed. */
const conclusionSaysPass = 'The stability results meet the specification at all time points.';

describe('the stability verdict is computed from the recorded results', () => {
  it('an out-of-specification result outweighs a conclusion sentence that says otherwise', () => {
    const composed = composeModule3FromCanonicalSources([
      src('stability', {
        studyName: 'LT-25C-60RH',
        conclusion: conclusionSaysPass,
        results: [
          { timePoint: 0, parameter: 'Assay', result: '99.8 %', specification: '95.0 - 105.0 %' },
          { timePoint: 6, parameter: 'Assay', result: '96.2 %', specification: '95.0 - 105.0 %' },
          { timePoint: 12, parameter: 'Assay', result: '88.1 %', specification: '95.0 - 105.0 %' },
        ],
      }),
    ]);
    const s7 = composed.find((c) => c.sectionKey === '3.2.S.7')!;
    expect(s7.narrativeDraft).not.toContain('remain within the acceptance criteria');
    expect(s7.narrativeDraft).toMatch(/outside its recorded acceptance criterion|out of specification/i);
    /* And it names the point, because "a result is out of spec" without saying
       which one sends the reader to read the whole study. */
    expect(s7.narrativeDraft).toContain('88.1');
    expect(s7.narrativeDraft).toContain('12');
  });

  it('states conformance when every recorded result is actually within its criterion', () => {
    const composed = composeModule3FromCanonicalSources([
      src('stability', {
        studyName: 'LT-25C-60RH',
        results: [
          { timePoint: 0, parameter: 'Assay', result: '99.8 %', specification: '95.0 - 105.0 %' },
          { timePoint: 12, parameter: 'Assay', result: '97.4 %', specification: '95.0 - 105.0 %' },
        ],
      }),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.7')!.narrativeDraft)
      .toMatch(/within (?:its|their) recorded acceptance criteri|remain within the acceptance criteria/i);
  });

  it('reads an unspaced two-sided range, the way a specification is typed', () => {
    const composed = composeModule3FromCanonicalSources([
      src('stability', {
        studyName: 'LT',
        results: [{ timePoint: 12, parameter: 'Assay', result: '88.1', specification: '95.0-105.0%' }],
      }),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.7')!.narrativeDraft)
      .toMatch(/outside its recorded acceptance criterion|out of specification/i);
  });

  it('does not claim conformance from a sentence when no result carries a criterion', () => {
    /* Nothing to compare is not a pass. The section says the conclusion is the
       applicant's, and that this section did not verify it. */
    const composed = composeModule3FromCanonicalSources([
      src('stability', {
        studyName: 'LT',
        conclusion: conclusionSaysPass,
        results: [{ timePoint: 12, parameter: 'Assay', result: '88.1 %' }],
      }),
    ]);
    const s7 = composed.find((c) => c.sectionKey === '3.2.S.7')!;
    expect(s7.narrativeDraft).not.toContain('remain within the acceptance criteria');
    expect(s7.narrativeDraft).toMatch(/not verified by this section|no recorded acceptance criterion/i);
  });

  it('a study with no recorded results at all defers, as it always did', () => {
    const composed = composeModule3FromCanonicalSources([
      src('stability', { studyName: 'LT', storageCondition: '25C/60RH' }),
    ]);
    const s7 = composed.find((c) => c.sectionKey === '3.2.S.7')!;
    expect(s7.narrativeDraft).not.toContain('remain within the acceptance criteria');
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * The batch-analyses disposition — the same class, one section over.
 *
 * `passFailStatus` is typed by whoever entered the result and nothing checked
 * it. Verified live before this fix: a QC result of 3.4 % against a recorded
 * acceptance criterion of "<= 2.0 %", submitted as passFailStatus "pass", was
 * accepted, written verbatim into the canonical source object, and composed
 * into §3.2.P.5 as "1 conforming, 0 out of specification".
 * ────────────────────────────────────────────────────────────────────────── */
describe('the batch-analyses disposition is computed where the record allows it', () => {
  const qc = (over: Record<string, unknown> = {}) => src('qc_result', {
    sampleId: 'S-2026-001',
    sampleType: 'finished-product',
    testMethod: 'HPLC related substances',
    acceptanceCriteria: '<= 2.0 %',
    result: '3.4 %',
    passFailStatus: 'pass',
    reviewed: true,
    ...over,
  });

  it('a declared pass over a failing number is named as the contradiction it is', () => {
    const composed = composeModule3FromCanonicalSources([
      qc(), src('drug_product', { dosageFormDescription: 'Tablet' }),
    ]);
    const p5 = composed.find((c) => c.sectionKey === '3.2.P.5')!;
    expect(p5.narrativeDraft).not.toContain('1 conforming, 0 out of specification');
    expect(p5.narrativeDraft).toContain('1 out of specification');
    expect(p5.narrativeDraft).toMatch(/CONTRADICT the recorded result/);
    expect(p5.narrativeDraft).toContain('S-2026-001');
  });

  it('counts a genuinely conforming result as within criterion', () => {
    const composed = composeModule3FromCanonicalSources([
      qc({ result: '0.8 %' }), src('drug_product', { dosageFormDescription: 'Tablet' }),
    ]);
    const p5 = composed.find((c) => c.sectionKey === '3.2.P.5')!;
    expect(p5.narrativeDraft).toContain('1 within criterion, 0 out of specification');
    expect(p5.narrativeDraft).not.toMatch(/CONTRADICT/);
  });

  it('does not verify a disposition it cannot compare, and says so', () => {
    const composed = composeModule3FromCanonicalSources([
      qc({ acceptanceCriteria: 'Conforms', result: 'Complies' }),
      src('drug_product', { dosageFormDescription: 'Tablet' }),
    ]);
    const p5 = composed.find((c) => c.sectionKey === '3.2.P.5')!;
    expect(p5.narrativeDraft).toMatch(/were NOT compared/);
    expect(p5.narrativeDraft).toMatch(/is the applicant's and is not verified by this section/);
  });

  it('reads a two-sided assay range on either side', () => {
    const low = composeModule3FromCanonicalSources([
      qc({ acceptanceCriteria: '95.0-105.0%', result: '93.2', passFailStatus: 'pass' }),
      src('drug_product', { dosageFormDescription: 'Tablet' }),
    ]).find((c) => c.sectionKey === '3.2.P.5')!;
    expect(low.narrativeDraft).toContain('1 out of specification');

    const high = composeModule3FromCanonicalSources([
      qc({ acceptanceCriteria: '95.0-105.0%', result: '107.1', passFailStatus: 'pass' }),
      src('drug_product', { dosageFormDescription: 'Tablet' }),
    ]).find((c) => c.sectionKey === '3.2.P.5')!;
    expect(high.narrativeDraft).toContain('1 out of specification');
  });
});
