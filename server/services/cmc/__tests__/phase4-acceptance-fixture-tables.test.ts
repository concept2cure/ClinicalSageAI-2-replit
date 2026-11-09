/**
 * Roadmap §11 phase 4 acceptance, run against one named fixture programme.
 *
 * ## What the roadmap asks for
 *
 * `docs/design/ONE_DESIGN_PLAN.md` §11, the phase 4 row: *"Fixture
 * batch/stability tables match expected cells; OOS is explicitly flagged; QOS
 * and Module 3 share atoms and method references. Existing US small-molecule
 * IND composition boundary stays enforced until separately changed."* Each
 * roadmap row is *"queued for v0.5 acceptance until its stated fixture is run
 * and recorded. A file's existence or an older local test does not mark this
 * row green."*
 *
 * ## Why this file exists when the engines are already tested
 *
 * The CMC suites test each rule a case at a time: that a declared pass over a
 * failing result is reported as a contradiction, that an unrecorded sample type
 * is attributed to neither material, that a stability point outside its
 * criterion compares OUTSIDE. What none of them says is **what this product
 * files for one programme**. That is a different statement, and the one the
 * roadmap asks for: a fixture whose recorded data is fixed, composed through
 * the real engine, with every cell of the two quantitative tables written
 * down.
 *
 * So the expectations here are **cell-for-cell and whole-table**: headers and
 * every row, in order, by equality — not `toContain`. A cell that changes is a
 * change to what would be filed, and must be read and re-stated deliberately
 * rather than absorbed by a loose matcher. The fixture's payloads are built by
 * the real register write-through mappers, so a mapper that stops emitting a
 * key fails here too
 * (`server/services/cmc/__tests__/fixtures/phase4-small-molecule-us-ind.ts`).
 *
 * ## The programme
 *
 * One small-molecule US IND — the composition boundary this platform ships
 * (P-28). Four QC results: a clean substance pass; a substance result recorded
 * as `pass` whose own criterion it fails; a product result with no disposition
 * that is outside its criterion; and a reference-standard qualification that is
 * not batch evidence at all. Two stability studies, one per side, each with an
 * in-criterion point and one outside it.
 */
import { describe, expect, it } from 'vitest';

import { buildM23QualityOverallSummary } from '../../m2-summary-builders';
import { composeModule3FromCanonicalSources, type ComposedSection } from '../../module3Composer';
import { compositionRefusal } from '../composition-scope';
import {
  PHASE4_BIOLOGIC_SUBSTANCE,
  PHASE4_DRUG_SUBSTANCE,
  PHASE4_PROGRAM,
  PHASE4_SOURCES,
} from './fixtures/phase4-small-molecule-us-ind';

const sections = composeModule3FromCanonicalSources(PHASE4_SOURCES as never);
const section = (key: string): ComposedSection => {
  const found = sections.find((s) => s.sectionKey === key);
  if (!found) throw new Error(`the composer returned no ${key}`);
  return found;
};
const table = (key: string, title: string) => {
  const found = section(key).tables.find((t) => t.title === title);
  if (!found) {
    throw new Error(`${key} composed no "${title}" (it has: ${section(key).tables.map((t) => t.title).join(', ')})`);
  }
  return found;
};

describe('the batch-analyses tables match expected cells', () => {
  it('§3.2.S.4.4 files both substance results, the second as the contradiction it is', () => {
    expect(table('3.2.S.4', 'Batch Analyses — Drug Substance (§3.2.S.4.4)')).toEqual({
      title: 'Batch Analyses — Drug Substance (§3.2.S.4.4)',
      headers: ['Sample', 'Sample Type', 'Test Method', 'Acceptance Criteria', 'Result', 'Disposition', 'Reviewed'],
      rows: [
        ['DS-2601-A', 'in-process', 'HPLC-UV assay (AM-114)', '95.0 - 105.0 %', '99.4 %', 'pass', 'reviewed'],
        [
          'DS-2601-B',
          'in-process',
          'HPLC-UV assay (AM-114)',
          '95.0 - 105.0 %',
          '91.8 % — repeat requested',
          'declared pass — the recorded result is OUTSIDE its recorded acceptance criterion',
          'reviewed',
        ],
      ],
    });
  });

  it('§3.2.P.5.4 files the product result as out of specification, and unreviewed', () => {
    expect(table('3.2.P.5', 'Batch Analyses — Drug Product (§3.2.P.5.4)')).toEqual({
      title: 'Batch Analyses — Drug Product (§3.2.P.5.4)',
      headers: ['Sample', 'Sample Type', 'Test Method', 'Acceptance Criteria', 'Result', 'Disposition', 'Reviewed'],
      rows: [
        [
          'DP-2602-A',
          'finished-product',
          'HPLC-UV assay (AM-114)',
          '95.0 - 105.0 %',
          '106.9 %',
          'out of specification (computed)',
          'not reviewed',
        ],
      ],
    });
  });

  it('files the reference-standard qualification in neither batch table', () => {
    /* It is a §3.2.S.5/§3.2.P.6 record. Admitting it would put a result that
       is not a test of the batch into the batch series, and would mark the
       section's batch-analyses input satisfied by it. */
    const cells = [
      ...table('3.2.S.4', 'Batch Analyses — Drug Substance (§3.2.S.4.4)').rows.flat(),
      ...table('3.2.P.5', 'Batch Analyses — Drug Product (§3.2.P.5.4)').rows.flat(),
    ];
    expect(cells).not.toContain('RS-114-02');
    expect(cells).not.toContain('reference-standard');
  });
});

describe('the stability tables match expected cells', () => {
  it('§3.2.S.7 files all three substance pull points, the last OUTSIDE', () => {
    expect(table('3.2.S.7', 'Stability Results — Drug Substance')).toEqual({
      title: 'Stability Results — Drug Substance',
      headers: ['Batch', 'Condition', 'Attribute', 'Time Point (months)', 'Result', 'Acceptance Criterion', 'Compared'],
      rows: [
        ['DS-2601-A', '25C/60%RH', 'assay', '0', '99.4', '95.0 - 105.0 %', 'within'],
        ['DS-2601-A', '25C/60%RH', 'assay', '6', '97.2', '95.0 - 105.0 %', 'within'],
        ['DS-2601-A', '25C/60%RH', 'assay', '12', '94.1', '95.0 - 105.0 %', 'OUTSIDE'],
      ],
    });
  });

  it('§3.2.P.8 files both product pull points, the second OUTSIDE', () => {
    expect(table('3.2.P.8', 'Stability Results — Drug Product')).toEqual({
      title: 'Stability Results — Drug Product',
      headers: ['Batch', 'Condition', 'Attribute', 'Time Point (months)', 'Result', 'Acceptance Criterion', 'Compared'],
      rows: [
        ['DP-2602-A', '25C/60%RH', 'total impurities', '0', '0.21', 'NMT 1.0 %', 'within'],
        ['DP-2602-A', '25C/60%RH', 'total impurities', '6', '1.14', 'NMT 1.0 %', 'OUTSIDE'],
      ],
    });
  });

  it('files each study under its own side only', () => {
    /* A drug-substance study that reached §3.2.P.8 would set the product's
       storage period from the substance's data. The register records the side;
       the fixture's two studies record one each. */
    expect(table('3.2.S.7', 'Stability Results — Drug Substance').rows.flat()).not.toContain('DP-2602-A');
    expect(table('3.2.P.8', 'Stability Results — Drug Product').rows.flat()).not.toContain('DS-2601-A');
  });
});

describe('OOS is explicitly flagged, in the prose as well as the table', () => {
  it('§3.2.S.4 counts the comparisons, names the contradicting record, and asserts no investigation', () => {
    const narrative = section('3.2.S.4').narrativeDraft;
    expect(narrative).toContain('2 carry both a numeric result and an acceptance criterion and were compared here: 1 within criterion, 1 out of specification.');
    expect(narrative).toContain('1 recorded disposition(s) CONTRADICT the recorded result: DS-2601-B.');
    expect(narrative).toContain('That disagreement is not resolved by this section.');
    expect(narrative).toContain('Out-of-specification results are reported as recorded; their investigation and disposition are not asserted by this section.');
  });

  it('§3.2.P.5 reports the product result out of specification and not yet second-person reviewed', () => {
    const narrative = section('3.2.P.5').narrativeDraft;
    expect(narrative).toContain('1 carry both a numeric result and an acceptance criterion and were compared here: 0 within criterion, 1 out of specification.');
    expect(narrative).toContain('1 result(s) have not completed second-person review.');
  });

  it('a stability point outside its criterion withholds the stability conclusion, naming the point', () => {
    /* The filing may not say "stable" over a result its own criterion fails,
       and the reader is told WHICH point, not merely that something failed. */
    for (const [key, sentence] of [
      ['3.2.S.7', '1 of the 3 recorded result(s) compared here fall outside its recorded acceptance criterion (assay at 12 = 94.1 against 95.0 - 105.0 %).'],
      ['3.2.P.8', '1 of the 2 recorded result(s) compared here fall outside its recorded acceptance criterion (total impurities at 6 = 1.14 against NMT 1.0 %).'],
    ] as const) {
      expect(section(key).narrativeDraft, key).toContain(sentence);
      expect(section(key).narrativeDraft, key).toContain(
        'The stability conclusion and the proposed storage period are NOT established by this section.',
      );
    }
  });

  it('says the trend was not assessed rather than reporting one from too few points', () => {
    /* The regression control chart needs 4 prior points to fit and one to
       judge. This programme has three, and the section states the arithmetic
       it could not do instead of a trend nobody computed. */
    expect(section('3.2.S.7').narrativeDraft).toContain(
      'assay (25C/60%RH): trend not assessed: the regression control chart needs at least 4 prior points to fit ' +
      'and one to judge (5 numeric time points); 3 are recorded.',
    );
  });

  it('the product shelf-life claim is stated as unsigned, not as accepted', () => {
    /* The study carrying the 24-month claim has not been closed out under a
       signature, and §3.2.P.8.1 must not state that the same way as one that
       has. */
    expect(section('3.2.P.8').narrativeDraft).toContain(
      'A shelf life of 24 months is proposed, recorded on a study that has not been closed out under signature',
    );
  });
});

describe('the QOS and Module 3 share atoms and method references', () => {
  const qos = buildM23QualityOverallSummary({
    module3Sections: sections,
    drugSubstanceName: PHASE4_PROGRAM.substanceName,
    drugProductName: PHASE4_PROGRAM.productName,
  });

  it('cites exactly the fixture records the summarized sections composed from', () => {
    const module3Atoms = new Map(sections.flatMap((s) => s.lineage).map((l) => [l.sourceObjectId, l.sourceHashAtCompile]));
    expect(qos.lineage.length).toBeGreaterThan(0);
    for (const atom of qos.lineage) {
      expect(module3Atoms.get(atom.sourceObjectId), `${atom.sourceObjectId} is not a record Module 3 composed from`)
        .toBe(atom.sourceHashAtCompile);
    }
    // Each record once, whatever number of sections read it.
    expect(new Set(qos.lineage.map((a) => a.sourceObjectId)).size).toBe(qos.lineage.length);
    // The records whose data the 2.3 actually summarizes.
    expect(qos.lineage.map((a) => a.sourceObjectId).sort()).toEqual([
      'src-method',
      'src-product',
      'src-qc-dp-oos',
      'src-qc-ds-oos',
      'src-qc-ds-pass',
      'src-qc-refstd',
      'src-specification-dp',
      'src-specification-ds',
      'src-stability-dp',
      'src-stability-ds',
      'src-substance',
    ]);
  });

  it('names the one analytical procedure, under both headings that cite it, with its recorded status', () => {
    expect(qos.methodReferences).toEqual([
      {
        methodName: 'HPLC-UV assay (AM-114)',
        technique: 'HPLC-UV',
        validationStatus: 'validated',
        sectionKeys: ['2.3.S.4', '2.3.P.5'],
      },
    ]);
    // The same procedure Module 3's own table files, by name.
    expect(table('3.2.S.4', 'Analytical Methods').rows.map((r) => r[0])).toEqual(['HPLC-UV assay (AM-114)']);
    expect(table('3.2.P.5', 'Analytical Methods').rows.map((r) => r[0])).toEqual(['HPLC-UV assay (AM-114)']);
    expect(qos.narrative).toContain(
      'Analytical procedures: HPLC-UV assay (AM-114) (HPLC-UV, validated) under 2.3.S.4 and 2.3.P.5.',
    );
  });

  it('reports the sections this programme has not completed rather than a finished dossier', () => {
    /* The fixture records no impurity profile, so §3.2.S.4 and §3.2.P.5 are at
       75%. A 2.3 that read 100% over that would be the falsely-green summary
       the QOS rules exist to prevent. */
    expect(qos.completeness).toBeLessThan(100);
    expect(qos.gaps).toContain('3.2.S.4 — 75% complete; missing: drugSubstanceImpurityProfileComplete');
    expect(qos.gaps).toContain('3.2.P.5 — 75% complete; missing: drugProductImpurityProfileComplete');
  });
});

describe('the US small-molecule IND composition boundary stays enforced', () => {
  it('admits this programme', () => {
    expect(compositionRefusal(PHASE4_SOURCES as never, 'ind', 'drug')).toBeNull();
  });

  it('refuses the same programme with a biologic substance, by name', () => {
    const swapped = PHASE4_SOURCES.map((s) => (s === PHASE4_DRUG_SUBSTANCE ? PHASE4_BIOLOGIC_SUBSTANCE : s));
    const refusal = compositionRefusal(swapped as never, 'ind', 'drug');
    expect(refusal?.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    expect(refusal?.message).toContain('ICH Q6B');
  });

  it('refuses the same programme filed as a marketing application', () => {
    const refusal = compositionRefusal(PHASE4_SOURCES as never, 'nda', 'drug');
    expect(refusal?.code).toBeTruthy();
    expect(refusal?.code).not.toBe('CMC_MODALITY_OUT_OF_SCOPE');
  });

  it('refuses a programme whose product class is not a drug', () => {
    expect(compositionRefusal(PHASE4_SOURCES as never, 'ind', 'device')?.code).toBe('CMC_PRODUCT_CLASS_OUT_OF_SCOPE');
  });
});
