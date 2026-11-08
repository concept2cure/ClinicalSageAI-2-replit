/**
 * draft_quality_overall_summary_m2_3 hands the author the records the summary
 * was composed from, and the analytical procedures it names.
 *
 * ## Why the draft needs them
 *
 * The tool composes the 2.3 from the open program's own `cmc_source_objects`
 * by the Module 3 compile engine, and returned only prose, tables,
 * completeness and gaps. So a 2.3 promoted into authoring carried no record
 * identity, while the identical figure in 3.2 could be traced to the record
 * that produced it and to its hash at compile — one dossier, the same number,
 * two levels of traceability. Roadmap phase 4 (S7) asks that "QOS and Module 3
 * share atoms and method references"; a draft that drops them on the way to
 * the editor does not share them.
 *
 * It also instructed the model to state completeness and gaps honestly while
 * telling it nothing about the procedures, whose validation status is exactly
 * the thing a model will otherwise describe as "validated" because the word
 * fits the sentence.
 *
 * Both come from the sections the builder already returned — nothing is read a
 * second time.
 */
import { describe, expect, it } from 'vitest';

import { draftQualityOverallSummary } from '../cmc-quality-summary-tool';

const ORG = 7;
const PROGRAM = '9a4c4a2e-5d1e-4c6b-9c0a-1f2e3d4c5b6a';

const SOURCES = [
  { id: 'so-1', sourceType: 'drug_substance', sourcePayload: { name: 'BX-115', manufacturer: 'Acme', modality: 'small_molecule' }, sourceHash: 'h1' },
  { id: 'so-2', sourceType: 'specification', sourcePayload: { acceptanceCriteria: { assay: '95.0-105.0%' } }, sourceHash: 'h3' },
  {
    id: 'so-method-1',
    sourceType: 'method',
    sourcePayload: { methodName: 'HPLC-UV assay', technique: 'HPLC', validationStatus: 'qualified' },
    sourceHash: 'h4',
  },
];

const query = async (sql: string, params: unknown[] = []) => {
  if (/regulatory_programs/i.test(sql)) {
    return { rows: [{ id: PROGRAM, programType: 'ind', productType: 'drug', productName: 'BX-115', name: 'BX-115 IND', code: 'BX115' }] };
  }
  if (/FROM cmc_source_objects/i.test(sql)) return { rows: params[0] === ORG && params[1] === PROGRAM ? SOURCES : [] };
  return { rows: [] };
};
const poolOf = async () => ({ query, connect: async () => ({ query, release: () => undefined }) });

const draft = async () =>
  JSON.parse(await draftQualityOverallSummary(poolOf, {}, { organizationId: ORG, projectRef: PROGRAM } as never));

describe('the 2.3 draft carries the records it was composed from', () => {
  it('names each source record by id and by its hash at compile', async () => {
    const out = await draft();

    expect(out.drafted).toBe(true);
    const atoms = out.lineage as Array<{ sourceObjectId: string; sourceHashAtCompile: string }>;
    expect(atoms.map((a) => a.sourceObjectId).sort()).toEqual(['so-1', 'so-2', 'so-method-1']);
    expect(atoms.find((a) => a.sourceObjectId === 'so-method-1')?.sourceHashAtCompile).toBe('h4');
  });

  it('names the procedure with the status the register recorded, not a kinder one', async () => {
    const out = await draft();

    expect(out.methodReferences).toEqual([
      {
        methodName: 'HPLC-UV assay',
        technique: 'HPLC',
        validationStatus: 'qualified',
        sectionKeys: ['2.3.S.4', '2.3.P.5'],
      },
    ]);
    // The prose the author reads says the same, so the two cannot drift apart.
    expect(out.content).toContain('HPLC-UV assay (HPLC, qualified)');
  });

  it('tells the model to name no procedure the record does not hold', async () => {
    const out = await draft();

    expect(out.instruction).toContain('methodReferences');
    expect(out.instruction).toMatch(/do not describe a procedure as validated when its status says otherwise/);
  });

  it('every atom in the draft is a record the program actually holds', async () => {
    /* The point of deriving them from the composition: the draft cannot cite a
       record the program does not hold, because it never names one itself. */
    const held = new Set(SOURCES.map((s) => s.id));
    const out = await draft();
    for (const atom of out.lineage as Array<{ sourceObjectId: string }>) {
      expect(held.has(atom.sourceObjectId), `${atom.sourceObjectId} is not a record of this program`).toBe(true);
    }
  });
});
