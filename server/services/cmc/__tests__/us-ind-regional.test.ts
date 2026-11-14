/**
 * §3.2.R.1.US is composed for the application actually filed
 * (discovery map 2026-10-04, us-32r-written-for-nda).
 *
 * Placed into an IND, the US regional leaf said "Submission Type: NDA / ANDA /
 * BLA (as applicable)" and listed executed batch records under 21 CFR 314.50,
 * Form FDA 356h and patent information, and none of what 21 CFR 312.23(a)(7)
 * asks of an IND. Every IND row now cites a requirement the CMC regulatory
 * record holds.
 */
import { describe, expect, it } from 'vitest';
import { composeRegional } from '../../module3-extensions';
import { CMC_RECORD } from '../knowledge';
import { usIndRegionalRows } from '../us-ind-regional';

const SOURCES = [
  {
    id: 'dp-1',
    sourceType: 'drug_product',
    sourceKey: 'drug_product:1',
    sourceHash: 'h1',
    sourcePayload: {
      name: 'BX-701 tablets', dosageFormDescription: 'film-coated tablet', strength: '10 mg',
      composition: 'BX-701 10 mg; microcrystalline cellulose', manufacturingSite: 'Contract Pharma, Raleigh NC',
    },
  },
  { id: 'b-1', sourceType: 'batch', sourceKey: 'batch:1', sourceHash: 'h2', sourcePayload: { batchNumber: 'DP-001', batchSize: '5 kg' } },
] as any;

const text = (s: ReturnType<typeof composeRegional>[number]) =>
  [s.narrativeDraft, ...s.tables.flatMap((t) => [t.title, ...t.rows.flat()])].join('\n');

describe('§3.2.R.1.US for an IND', () => {
  const [ind] = composeRegional(SOURCES, 'US', { applicationType: 'ind' });

  it('says it is an IND and files none of a marketing application’s obligations', () => {
    expect(ind.sectionKey).toBe('3.2.R.1.US');
    expect(ind.narrativeDraft).toContain('Investigational New Drug application');
    expect(ind.narrativeDraft).toContain('21 CFR 312.23(a)(7)');
    expect(ind.narrativeDraft).toContain('do not apply to an IND');
    const cells = ind.tables.flatMap((t) => t.rows.flat()).join('\n');
    for (const nda of ['314.50', '314.70', '356h', 'NDA / ANDA / BLA', 'patent']) expect(cells, nda).not.toContain(nda);
  });

  it('lists what 21 CFR 312.23(a)(7) asks, Module 1 items stated and not attested', () => {
    const rows = ind.tables.find((t) => /IND/.test(t.title))!.rows.map((r) => r.join(' | '));
    expect(rows.some((r) => r.includes('Placebo') && r.includes('312.23(a)(7)(iv)(c)'))).toBe(true);
    expect(rows.some((r) => r.includes('Environmental analysis') && r.includes('not verified by this section'))).toBe(true);
    expect(rows.some((r) => r.includes('Labels and labeling') && r.includes('Module 1'))).toBe(true);
    expect(rows.some((r) => r.includes('Contract Pharma, Raleigh NC'))).toBe(true);
  });

  it('every row cites a requirement the CMC regulatory record holds', () => {
    const held = new Set(CMC_RECORD.requirements.map((q) => q.id));
    expect(usIndRegionalRows(SOURCES).map((r) => r.recordRequirementId).filter((id) => !held.has(id))).toEqual([]);
  });
});

/* 21 CFR 312.23(a)(7)(iv)(a) and (b) ask for each manufacturer separately.
   One row used to name the first site found on any source for both, and
   cross-reference both sections whichever half was recorded. */
describe('§3.2.R.1.US names each manufacturer from its own record', () => {
  const substance = (payload: Record<string, unknown>) =>
    ({ id: 'ds-1', sourceType: 'drug_substance', sourceKey: 'drug_substance:1', sourceHash: 'h0', sourcePayload: { name: 'BX-701', ...payload } }) as any;
  const row = (rows: ReturnType<typeof usIndRegionalRows>, side: string) => rows.find((r) => r.item.startsWith(side))!;

  it('a substance made at one site and a product at another are two rows, each with its own', () => {
    const rows = usIndRegionalRows([substance({ manufacturer: 'API Works GmbH', manufacturingSite: 'Visp, Switzerland' }), ...SOURCES]);
    expect(row(rows, 'Drug substance').item).toBe('Drug substance manufacturer name and address — API Works GmbH, Visp, Switzerland');
    expect(row(rows, 'Drug substance').status).toEqual({ kind: 'cross-referenced', section: '3.2.S.2.1' });
    expect(row(rows, 'Drug substance').basis).toBe('21 CFR 312.23(a)(7)(iv)(a)');
    expect(row(rows, 'Drug product').item).toBe('Drug product manufacturer name and address — Contract Pharma, Raleigh NC');
    expect(row(rows, 'Drug product').status).toEqual({ kind: 'cross-referenced', section: '3.2.P.3.1' });
    expect(row(rows, 'Drug product').recordRequirementId).toBe('fda-req-004');
  });

  it('the product’s site does not stand in for a substance manufacturer nobody recorded', () => {
    const rows = usIndRegionalRows(SOURCES);
    expect(row(rows, 'Drug substance').item).toBe('Drug substance manufacturer name and address');
    expect(row(rows, 'Drug substance').status).toEqual({ kind: 'not-recorded' });
    expect(row(rows, 'Drug product').status).toEqual({ kind: 'cross-referenced', section: '3.2.P.3.1' });
  });

  it('§3.2.S.2 carries the manufacturer and site the leaf cross-references', async () => {
    const { composeModule3FromCanonicalSources } = await import('../../module3Composer');
    const s2 = composeModule3FromCanonicalSources([substance({ manufacturer: 'API Works GmbH', manufacturingSite: 'Visp, Switzerland' })] as never)
      .find((s) => s.sectionKey === '3.2.S.2')!;
    expect(s2.tables.find((t) => t.title === 'Manufacturer(s)')?.rows).toEqual([
      ['Manufacturer', 'API Works GmbH'],
      ['Manufacturing Site', 'Visp, Switzerland'],
    ]);
  });
});

describe('§3.2.R.1.US for a marketing application is unchanged', () => {
  it('an NDA keeps the marketing obligations', () => {
    const [nda] = composeRegional(SOURCES, 'US', { applicationType: 'nda' });
    expect(text(nda)).toContain('21 CFR 314.50(d)(1)(ii)');
    expect(text(nda)).not.toContain('Investigational New Drug application');
  });
});
