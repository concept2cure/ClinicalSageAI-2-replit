/**
 * The 2.3 Quality Overall Summary and Module 3 cite the SAME records and the
 * SAME analytical procedures.
 *
 * ## The gap (roadmap phase 4, S7)
 *
 * The §11 build order's phase 4 acceptance asks that "QOS and Module 3 share
 * atoms and method references" (`docs/design/ONE_DESIGN_PLAN.md` §11 table).
 * They did not.
 *
 * `ComposedSection` carries both: `lineage` is the atoms — every source record
 * the section composed from, by id and by its hash at compile — and
 * `structuredPayload.sourceObjects` holds those records, the `method` register
 * rows among them. `buildM23QualityOverallSummary` received the sections and
 * dropped both. What it kept was `inputSectionKeys`, which names sections, not
 * records.
 *
 * Two consequences, both visible to a reviewer of the filed dossier:
 *
 * 1. A figure in 3.2 can be traced to the record it came from and the same
 *    figure in 2.3 cannot, so one dossier carries the same number at two
 *    levels of traceability.
 * 2. The QOS closed with "Cross-references: Full data and analytical methods
 *    are provided in Module 3" — a promise, printed whether or not a single
 *    analytical procedure was recorded, naming none of them. ICH M4Q(R1) asks
 *    2.3.S.4.2 and 2.3.P.5.2 to summarize the analytical procedures
 *    themselves. The QOS also takes `tables[0]` from each section, and for
 *    3.2.S.4 that is the acceptance-criteria table — so the composed
 *    "Analytical Methods" table reached the QOS by no route at all.
 *
 * ## What these cases hold
 *
 * The QOS's atoms are exactly the atoms of the sections it summarized —
 * deduped, never a section it did not draw on — and its method references are
 * the composed `method` records, carrying each procedure's recorded validation
 * status and the 2.3 headings that cite it. Nothing is read a second time:
 * both are derived from the sections the builder is given, so they are shared
 * by construction rather than by two reads agreeing.
 */
import { describe, expect, it } from 'vitest';

import { buildM23QualityOverallSummary } from '../m2-summary-builders';
import { composeModule3FromCanonicalSources, type CanonicalSource, type ComposedSection } from '../module3Composer';

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
    lineage: [{ sourceObjectId: `so-${sectionKey}`, sourceHashAtCompile: `h-${sectionKey}` }],
    ...over,
  };
}

/** A `method` register row as the composer puts it in `structuredPayload`. */
const methodObject = (payload: Record<string, unknown>) => ({ type: 'method', payload });

describe('the QOS cites the Module 3 sections’ own atoms', () => {
  it('carries every atom of the sections it summarized, by id and compile hash', () => {
    const qos = buildM23QualityOverallSummary({
      module3Sections: [recorded('3.2.S.1'), recorded('3.2.P.1')],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.lineage).toEqual([
      { sourceObjectId: 'so-3.2.S.1', sourceHashAtCompile: 'h-3.2.S.1' },
      { sourceObjectId: 'so-3.2.P.1', sourceHashAtCompile: 'h-3.2.P.1' },
    ]);
  });

  it('counts one record once when two sections composed from it', () => {
    /* A specification feeds 3.2.S.4 and 3.2.P.5 alike. The 2.3 cites the
       record, not the number of sections that read it. */
    const shared = { sourceObjectId: 'spec-1', sourceHashAtCompile: 'h-spec' };
    const qos = buildM23QualityOverallSummary({
      module3Sections: [
        recorded('3.2.S.4', { lineage: [shared] }),
        recorded('3.2.P.5', { lineage: [shared] }),
      ],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.lineage).toEqual([shared]);
  });

  it('claims no atom from a section it did not summarize', () => {
    /* 3.2.A.2 (adventitious agents) is a Module 3 section that the M4Q 2.3
       list does not summarize. Its record is in Module 3's lineage and must
       not appear in the 2.3's. */
    const qos = buildM23QualityOverallSummary({
      module3Sections: [
        recorded('3.2.S.1'),
        recorded('3.2.A.2', { lineage: [{ sourceObjectId: 'adventitious-1', sourceHashAtCompile: 'h-a2' }] }),
      ],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.lineage.map((l) => l.sourceObjectId)).toEqual(['so-3.2.S.1']);
  });

  it('reports no atoms, rather than undefined, for a composition with no recorded data', () => {
    const qos = buildM23QualityOverallSummary({ module3Sections: [], drugSubstanceName: 'ABC-123' });
    expect(qos.lineage).toEqual([]);
  });
});

describe('the QOS names the analytical procedures Module 3 composed', () => {
  it('carries each method the summarized sections hold, with its recorded status', () => {
    const qos = buildM23QualityOverallSummary({
      module3Sections: [
        recorded('3.2.S.4', {
          structuredPayload: {
            sourceObjects: [
              methodObject({ methodName: 'HPLC-UV assay', technique: 'HPLC', validationStatus: 'validated' }),
              methodObject({ methodName: 'SE-HPLC', technique: 'SEC', validationStatus: 'qualified' }),
            ],
          },
        }),
      ],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.methodReferences).toEqual([
      { methodName: 'HPLC-UV assay', technique: 'HPLC', validationStatus: 'validated', sectionKeys: ['2.3.S.4'] },
      { methodName: 'SE-HPLC', technique: 'SEC', validationStatus: 'qualified', sectionKeys: ['2.3.S.4'] },
    ]);
  });

  it('names one procedure once, under every 2.3 heading that cites it', () => {
    const m = methodObject({ methodName: 'HPLC-UV assay', technique: 'HPLC', validationStatus: 'validated' });
    const qos = buildM23QualityOverallSummary({
      module3Sections: [
        recorded('3.2.S.4', { structuredPayload: { sourceObjects: [m] } }),
        recorded('3.2.P.5', { structuredPayload: { sourceObjects: [m] } }),
      ],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.methodReferences).toHaveLength(1);
    expect(qos.methodReferences[0].sectionKeys).toEqual(['2.3.S.4', '2.3.P.5']);
  });

  it('says a status was not recorded rather than reporting one', () => {
    const qos = buildM23QualityOverallSummary({
      module3Sections: [
        recorded('3.2.S.4', { structuredPayload: { sourceObjects: [methodObject({ methodName: 'HPLC-UV assay' })] } }),
      ],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.methodReferences[0]).toEqual({
      methodName: 'HPLC-UV assay',
      technique: 'not recorded',
      validationStatus: 'not recorded',
      sectionKeys: ['2.3.S.4'],
    });
  });

  it('names a method by its code when it has no name', () => {
    const qos = buildM23QualityOverallSummary({
      module3Sections: [
        recorded('3.2.P.5', { structuredPayload: { sourceObjects: [methodObject({ methodCode: 'AM-014', technique: 'KF' })] } }),
      ],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.methodReferences.map((m) => m.methodName)).toEqual(['AM-014']);
  });

  it('ignores a source that is not a method', () => {
    const qos = buildM23QualityOverallSummary({
      module3Sections: [
        recorded('3.2.S.4', {
          structuredPayload: {
            sourceObjects: [
              { type: 'specification', payload: { methodName: 'HPLC-UV assay' } },
              methodObject({ methodName: 'SE-HPLC', technique: 'SEC', validationStatus: 'validated' }),
            ],
          },
        }),
      ],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.methodReferences.map((m) => m.methodName)).toEqual(['SE-HPLC']);
  });
});

describe('the procedures table itself reaches the 2.3', () => {
  it('carries the Analytical Methods table beside the section headline', () => {
    /* The QOS takes each section's FIRST table as its headline, and 3.2.S.4's
       first table is the acceptance criteria — so the composed Analytical
       Methods table, the one a reviewer reads beside those criteria, reached
       the 2.3 by no route at all. */
    const criteria = { title: 'Drug Substance Specification — Acceptance Criteria', headers: ['A'], rows: [['x']] };
    const methods = { title: 'Analytical Methods', headers: ['Method'], rows: [['HPLC-UV assay']] };
    const qos = buildM23QualityOverallSummary({
      module3Sections: [recorded('3.2.S.4', { tables: [criteria, methods] })],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.tables.map((t) => t.title)).toEqual([
      'Drug Substance Specification — Acceptance Criteria',
      'Analytical Methods',
    ]);
  });

  it('carries a section whose headline IS the procedures table once', () => {
    const methods = { title: 'Analytical Methods', headers: ['Method'], rows: [['SE-HPLC']] };
    const qos = buildM23QualityOverallSummary({
      module3Sections: [recorded('3.2.P.5', { tables: [methods] })],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.tables).toEqual([methods]);
  });
});

describe('the QOS narrative says which procedures, or that none is recorded', () => {
  it('lists the procedures and their status instead of promising them', () => {
    const qos = buildM23QualityOverallSummary({
      module3Sections: [
        ...['3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.5', '3.2.S.6', '3.2.S.7',
          '3.2.P.1', '3.2.P.2', '3.2.P.3', '3.2.P.4', '3.2.P.6', '3.2.P.7', '3.2.P.8'].map((k) => recorded(k)),
        recorded('3.2.S.4', {
          structuredPayload: { sourceObjects: [methodObject({ methodName: 'HPLC-UV assay', technique: 'HPLC', validationStatus: 'validated' })] },
        }),
        recorded('3.2.P.5', {
          structuredPayload: { sourceObjects: [methodObject({ methodName: 'Dissolution (USP <711>)', technique: 'UV', validationStatus: 'verified' })] },
        }),
      ],
      drugSubstanceName: 'ABC-123',
    });

    expect(qos.gaps, JSON.stringify(qos.gaps)).toEqual([]);
    expect(qos.narrative).toContain('Analytical procedures: HPLC-UV assay (HPLC, validated) under 2.3.S.4');
    expect(qos.narrative).toContain('Dissolution (USP <711>) (UV, verified) under 2.3.P.5');
    // The sentence that printed whether or not a procedure existed.
    expect(qos.narrative).not.toContain('Full data and analytical methods are provided in Module 3.');
  });

  it('says no analytical procedure is recorded rather than cross-referring to Module 3', () => {
    const complete = ['3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.4', '3.2.S.5', '3.2.S.6', '3.2.S.7',
      '3.2.P.1', '3.2.P.2', '3.2.P.3', '3.2.P.4', '3.2.P.5', '3.2.P.6', '3.2.P.7', '3.2.P.8'].map((k) => recorded(k));
    const qos = buildM23QualityOverallSummary({ module3Sections: complete, drugSubstanceName: 'ABC-123' });

    expect(qos.gaps).toEqual([]);
    expect(qos.methodReferences).toEqual([]);
    expect(qos.narrative).toContain('No analytical procedure is recorded in the Module 3 sections this summary covers.');
  });
});

describe('against the composer, not a fixture of it', () => {
  it('shares the atoms and the method the composer actually produced', () => {
    /* The cases above pin the rule on hand-built sections. This one runs the
       real composer, so a change to what IT puts in `lineage` or
       `structuredPayload.sourceObjects` fails here rather than passing a
       fixture that no longer matches. */
    const sources: CanonicalSource[] = [
      { id: 'ds-1', sourceType: 'drug_substance', sourcePayload: { name: 'ABC-123', manufacturer: 'Acme' } } as CanonicalSource,
      {
        id: 'method-1',
        sourceType: 'method',
        sourcePayload: { methodName: 'HPLC-UV assay', technique: 'HPLC', validationStatus: 'validated' },
      } as CanonicalSource,
    ];
    const sections = composeModule3FromCanonicalSources(sources);
    const qos = buildM23QualityOverallSummary({ module3Sections: sections, drugSubstanceName: 'ABC-123' });

    const m3Atoms = new Set(sections.flatMap((s) => s.lineage.map((l) => l.sourceObjectId)));
    expect(m3Atoms.has('method-1')).toBe(true);
    // Every atom the 2.3 cites is one Module 3 composed from. Nothing invented.
    for (const atom of qos.lineage) expect(m3Atoms.has(atom.sourceObjectId)).toBe(true);
    expect(qos.lineage.map((l) => l.sourceObjectId)).toContain('method-1');

    expect(qos.methodReferences.map((m) => m.methodName)).toEqual(['HPLC-UV assay']);
    expect(qos.methodReferences[0].validationStatus).toBe('validated');
    // The composed Analytical Methods table is the same procedure, by name.
    const m3MethodTable = sections.flatMap((s) => s.tables).find((t) => t.title === 'Analytical Methods');
    expect(m3MethodTable?.rows.map((r) => r[0])).toContain('HPLC-UV assay');
  });
});
