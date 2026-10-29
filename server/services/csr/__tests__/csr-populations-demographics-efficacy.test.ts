/**
 * CDISC pilot defects D10, D11 and D12 (docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e):
 *   D10 an armless efficacy result (a dose-response p-value with its method and
 *       population), and a run without an efficacy file, which §11.4 states as
 *       "Efficacy results not supplied", never blank or zero;
 *   D11 further named populations declared from ADSL flags (an efficacy
 *       population, completers of a visit), shown under their define.xml label
 *       and never mapped onto mITT;
 *   D12 the descriptive §11.2 table: n, mean (SD), median, min and max, the
 *       ADSL age groups (AGEGR1, never invented bands), sex, race, ethnicity,
 *       height, declared baseline characteristics and a Total column.
 * Each is opt-in: a source that does not use it tabulates byte-identically
 * (csr-table-byte-identity.test.ts). SYNTHETIC fixture
 * (support/adam-legacy-synthetic.ts plus the invented columns below): every
 * value is invented, and no CDISC pilot value is used.
 */
import { describe, expect, it } from 'vitest';
import { CSR_EFFICACY_RESULTS_FORMAT, CsrAdamBundleSchema, CsrEfficacyResultsSchema, type CsrEfficacyResults } from '../../../../shared/csr-adam-bundle';
import { CsrSourceEnvelopeSchema, type CsrSourceEnvelope } from '../../../../shared/csr-source-input';
import { buildCSRTables } from '../../csr-tabulation-builders';
import type { AdamDataset } from '../adam-dataset-reader';
import { deriveCsrSourceFromAdam, type AdamDatasets } from '../adam-source-derivation';
import { PRIMARY } from './support/adam-lmn201-synthetic';
import { LEGACY_CONVENTIONS, legacyAdae, legacyAdsl, legacyBundle } from './support/adam-legacy-synthetic';
import { sourceFixture } from './source-input-fixture';

type Cell = string | number | null;
const efficacy = (extra: CsrEfficacyResults['results'] = []): CsrEfficacyResults => ({ format: CSR_EFFICACY_RESULTS_FORMAT, protocolNumber: 'SYN-LMN201-PROTOCOL', results: [
  { endpointName: PRIMARY, endpointType: 'primary', armId: 'DRUG', value: 1, display: 'synthetic' },
  { endpointName: PRIMARY, endpointType: 'primary', armId: 'PBO', value: 2, display: 'synthetic' }, ...extra] });
const DOSE_RESPONSE = { endpointName: `${PRIMARY}, dose response`, endpointType: 'primary' as const, value: 0.321, display: 'p = 0.321 (synthetic)',
  pValue: 0.321, method: 'Synthetic ANCOVA, dose as a continuous covariate', population: 'Synthetic efficacy population' };

/** Invented ADSL columns added to the legacy synthetic ADSL (8 subjects; DRUG 1–4, PBO 5–8; AGE 60 + i). */
const EXTRA: Record<string, (i: number) => Cell> = {
  AGEGR1: i => (60 + i < 65 ? '<65' : '65+'), AGEGR1N: i => (60 + i < 65 ? 1 : 2),
  HEIGHTBL: i => 160 + i, RACE: i => (i % 2 ? 'ASIAN' : 'WHITE'), ETHNIC: i => (i === 3 ? null : 'NOT HISPANIC OR LATINO'),
  EFFFL: i => (i === 5 ? 'N' : 'Y'), COMP24FL: i => ([0, 2, 4, 7].includes(i) ? 'Y' : 'N'),
  SCORE: i => 10 + 2 * i, GRP: i => (i < 3 ? 'LOW' : 'HIGH'),
};
function adsl(columns: string[] = Object.keys(EXTRA), override: (column: string, i: number) => Cell | undefined = () => undefined): AdamDataset {
  const base = legacyAdsl();
  return { ...base, columns: [...base.columns, ...columns],
    rows: base.rows.map((row, i) => ({ ...row, ...Object.fromEntries(columns.map(c => [c, override(c, i) !== undefined ? override(c, i)! : EXTRA[c](i)])) })) };
}
const datasets = (ADSL: AdamDataset = adsl()): AdamDatasets => ({ ADSL, ADAE: legacyAdae() } as AdamDatasets);
const minimal = (): Record<string, unknown> => {
  const c: Record<string, unknown> = { ...LEGACY_CONVENTIONS };
  delete c.rangeIndicator; delete c.lastOnTreatment;
  return c;
};
const POPULATIONS = [{ flag: 'EFFFL', label: 'Efficacy Population Flag' }, { flag: 'COMP24FL', label: 'Completers of Week 24 Population Flag' }];
const DEMOGRAPHICS = { presentation: 'descriptive', characteristics: [
  { variable: 'SCORE', label: 'Synthetic score', kind: 'continuous' },
  { variable: 'GRP', label: 'Synthetic group', kind: 'categorical', categories: ['LOW', 'HIGH'] }] };
/** results null: the manifest names no efficacy file. */
const derive = (over: Record<string, unknown> = {}, data: AdamDatasets = datasets(), results: CsrEfficacyResults | null = efficacy()) => {
  const bundle = legacyBundle({ ...minimal(), ...over });
  return deriveCsrSourceFromAdam(results ? bundle : { ...bundle, efficacyResults: undefined }, data, results ?? undefined);
};
const refusal = (fn: () => unknown) => {
  try { fn(); } catch (error) { return error as { code: string; issues?: Array<{ path: string; message: string }> }; }
  throw new Error('expected a refusal');
};
const issues = (source: unknown) => {
  const parsed = CsrSourceEnvelopeSchema.safeParse(source);
  return parsed.success ? [] : parsed.error.issues.map(i => i.message);
};

describe('D11: further named populations from declared ADSL flags', () => {
  it('shows each declared population under its declared label, between the built-in populations and Completed', () => {
    const source = derive({ populations: POPULATIONS });
    const rows = buildCSRTables(source.studyData).analysisPopulations.rows;
    expect(rows.map(r => r[0])).toEqual(['Randomized', 'Safety', 'ITT', 'Efficacy Population Flag', 'Completers of Week 24 Population Flag', 'Completed']);
    expect(rows[3]).toEqual(['Efficacy Population Flag', '4', '3', '7']);
    expect(rows[4]).toEqual(['Completers of Week 24 Population Flag', '2', '2', '4']);
  });

  it('never maps a declared population onto mITT or per-protocol', () => {
    const source = derive({ populations: POPULATIONS });
    expect(source.participants.every(p => p.mitt === undefined && p.perProtocol === undefined)).toBe(true);
    expect(source.studyData.treatmentArms.every(a => a.populations.mitt === undefined)).toBe(true);
    expect(buildCSRTables(source.studyData).analysisPopulations.rows.some(r => r[0] === 'mITT' || r[0] === 'Per-Protocol')).toBe(false);
  });

  it('refuses a flag the table already reports, a missing flag and a non-Y/N value', () => {
    expect(refusal(() => derive({ populations: [{ flag: 'SAFFL', label: 'Safety again' }] }))).toMatchObject({ code: 'CSR_ADAM_CONVENTION_CONFLICT' });
    expect(refusal(() => derive({ populations: [{ flag: 'ITTFL', label: 'Randomized again' }] }))).toMatchObject({ code: 'CSR_ADAM_CONVENTION_CONFLICT' });
    expect(refusal(() => derive({ populations: [{ flag: 'COMP8FL', label: 'Absent' }] }))).toMatchObject({ code: 'CSR_ADAM_VARIABLE_MISSING', issues: [{ path: 'ADSL.COMP8FL' }] });
    const odd = datasets(adsl(undefined, (c, i) => (c === 'EFFFL' && i === 2 ? 'X' : undefined)));
    expect(refusal(() => derive({ populations: POPULATIONS }, odd))).toMatchObject({ code: 'CSR_ADAM_VALUE_UNMAPPED', issues: [{ path: 'ADSL[3].EFFFL' }] });
  });

  it('refuses a duplicate declaration in the manifest', () => {
    const bundle = legacyBundle({ ...minimal(), populations: [POPULATIONS[0], { flag: 'EFFFL', label: 'Twice' }] });
    expect(CsrAdamBundleSchema.safeParse(bundle).success).toBe(false);
  });

  it('holds a hand-built source to its declared counts and flags', () => {
    const source = sourceFixture() as CsrSourceEnvelope & Record<string, unknown>;
    source.participants = source.participants.map(p => ({ ...p, additionalPopulations: { EVAL: p.subjectId !== 'synthetic-b' } }));
    source.studyData.additionalPopulations = [{ key: 'EVAL', label: 'Evaluable', counts: { A: 1, B: 1 } }];
    expect(issues(source)).toEqual([]);
    expect(buildCSRTables(CsrSourceEnvelopeSchema.parse(source).studyData).analysisPopulations.rows.find(r => r[0] === 'Evaluable')).toEqual(['Evaluable', '1', '1', '2']);
    source.studyData.additionalPopulations = [{ key: 'EVAL', label: 'Evaluable', counts: { A: 2, B: 1 } }];
    expect(issues(source)).toContain('The EVAL population count does not match explicit participant flags.');
    // Review 2026-10-30: a declared label never repeats a built-in row's, so two "Safety" rows cannot show different counts.
    for (const label of ['Safety', 'mITT', 'completed']) {
      source.studyData.additionalPopulations = [{ key: 'EVAL', label, counts: { A: 1, B: 1 } }];
      expect(issues(source)).toContain('A declared population label repeats a built-in population row.');
    }
    source.studyData.additionalPopulations = undefined;
    expect(issues(source)).toContain('Declare the EVAL population in studyData.additionalPopulations when participant flags are supplied.');
  });
});

describe('D12: the descriptive demographics table', () => {
  const table = () => buildCSRTables(derive({ demographics: DEMOGRAPHICS }).studyData).demographics;

  it('has a Total column and states n, mean (SD), median and min, max for age', () => {
    const t = table();
    expect(t.headers).toEqual(['Characteristic', 'Statistic', 'Drug X', 'Placebo', 'Total']);
    const age = t.rows.filter(r => r[0] === 'Age (years)');
    expect(age).toEqual([
      ['Age (years)', 'n', '4', '4', '8'],
      ['Age (years)', 'Mean (SD)', '61.5 (1.29)', '65.5 (1.29)', '63.5 (2.45)'],
      ['Age (years)', 'Median', '61.5', '65.5', '63.5'],
      ['Age (years)', 'Min, max', '60.0, 63.0', '64.0, 67.0', '60.0, 67.0'],
    ]);
    expect(t.rows[0]).toEqual(['Subjects', 'n', '4', '4', '8']);
  });

  it('takes age groups from ADSL AGEGR1 in AGEGR1N order, and invents none without it', () => {
    expect(table().rows.filter(r => r[0] === 'Age group')).toEqual([
      ['Age group', '<65', '4 (100.0%)', '1 (25.0%)', '5 (62.5%)'],
      ['Age group', '65+', '0 (0.0%)', '3 (75.0%)', '3 (37.5%)'],
    ]);
    const noGroups = derive({ demographics: DEMOGRAPHICS }, datasets(adsl(Object.keys(EXTRA).filter(c => !c.startsWith('AGEGR1')))));
    expect(noGroups.studyData.ageGroups).toBeUndefined();
    expect(buildCSRTables(noGroups.studyData).demographics.rows.some(r => r[0] === 'Age group')).toBe(false);
  });

  it('orders age groups by the youngest age in each when AGEGR1N is absent', () => {
    const source = derive({ demographics: DEMOGRAPHICS }, datasets(adsl(Object.keys(EXTRA).filter(c => c !== 'AGEGR1N'))));
    expect(source.studyData.ageGroups).toEqual(['<65', '65+']);
  });

  it('counts sex, race and ethnicity, and states an unrecorded ethnicity as not recorded', () => {
    const rows = table().rows;
    expect(rows.filter(r => r[0] === 'Sex')).toEqual([['Sex', 'Male', '2 (50.0%)', '2 (50.0%)', '4 (50.0%)'], ['Sex', 'Female', '2 (50.0%)', '2 (50.0%)', '4 (50.0%)']]);
    expect(rows.filter(r => r[0] === 'Race')).toEqual([['Race', 'ASIAN', '2 (50.0%)', '2 (50.0%)', '4 (50.0%)'], ['Race', 'WHITE', '2 (50.0%)', '2 (50.0%)', '4 (50.0%)']]);
    expect(rows.filter(r => r[0] === 'Ethnicity')).toEqual([
      ['Ethnicity', 'NOT HISPANIC OR LATINO', '3 (75.0%)', '4 (100.0%)', '7 (87.5%)'],
      ['Ethnicity', 'Not recorded', '1 (25.0%)', '0 (0.0%)', '1 (12.5%)']]);
  });

  it('summarises height and the declared characteristics, and omits weight and BMI the ADSL does not hold', () => {
    const rows = table().rows;
    expect(rows.find(r => r[0] === 'Height (cm)' && r[1] === 'Mean (SD)')).toEqual(['Height (cm)', 'Mean (SD)', '161.5 (1.29)', '165.5 (1.29)', '163.5 (2.45)']);
    expect(rows.filter(r => r[0] === 'Synthetic score')).toEqual([
      ['Synthetic score', 'n', '4', '4', '8'], ['Synthetic score', 'Mean (SD)', '13.0 (2.58)', '21.0 (2.58)', '17.0 (4.90)'],
      ['Synthetic score', 'Median', '13.0', '21.0', '17.0'], ['Synthetic score', 'Min, max', '10.0, 16.0', '18.0, 24.0', '10.0, 24.0']]);
    expect(rows.filter(r => r[0] === 'Synthetic group')).toEqual([
      ['Synthetic group', 'LOW', '3 (75.0%)', '0 (0.0%)', '3 (37.5%)'], ['Synthetic group', 'HIGH', '1 (25.0%)', '4 (100.0%)', '5 (62.5%)']]);
    expect(rows.some(r => /Weight|BMI/.test(r[0]))).toBe(false);
  });

  it('refuses a categorical value outside its declared categories and a non-numeric continuous value', () => {
    const odd = datasets(adsl(undefined, (c, i) => (c === 'GRP' && i === 1 ? 'MEDIUM' : undefined)));
    expect(refusal(() => derive({ demographics: DEMOGRAPHICS }, odd))).toMatchObject({ code: 'CSR_ADAM_VALUE_UNMAPPED', issues: [{ path: 'ADSL[2].GRP' }] });
    const text = datasets(adsl(undefined, (c, i) => (c === 'SCORE' && i === 1 ? 'high' : undefined)));
    expect(refusal(() => derive({ demographics: DEMOGRAPHICS }, text))).toMatchObject({ code: 'CSR_ADAM_VALUE_UNMAPPED', issues: [{ path: 'ADSL[2].SCORE' }] });
    // Review 2026-10-30: a recorded height that is not a positive number is refused, never dropped from n.
    for (const bad of ['tall', 0, -170]) {
      const height = datasets(adsl(undefined, (c, i) => (c === 'HEIGHTBL' && i === 1 ? bad : undefined)));
      expect(refusal(() => derive({ demographics: DEMOGRAPHICS }, height))).toMatchObject({ code: 'CSR_ADAM_VALUE_UNMAPPED', issues: [{ path: 'ADSL[2].HEIGHTBL' }] });
    }
    const blankHeight = derive({ demographics: DEMOGRAPHICS }, datasets(adsl(undefined, (c, i) => (c === 'HEIGHTBL' && i === 1 ? null : undefined))));
    expect(buildCSRTables(blankHeight.studyData).demographics.rows.find(r => r[0] === 'Height (cm)' && r[1] === 'n')).toEqual(['Height (cm)', 'n', '3', '4', '7']);
    const bundle = legacyBundle({ ...minimal(), demographics: { presentation: 'descriptive', characteristics: [{ variable: 'GRP', label: 'x', kind: 'categorical' }] } });
    expect(CsrAdamBundleSchema.safeParse(bundle).success).toBe(false);
  });

  it('refuses descriptive-only fields on a source that does not declare the descriptive table', () => {
    const source = sourceFixture() as CsrSourceEnvelope;
    source.studyData.demographics[0].height = 170;
    expect(issues(source)).toContain('Declare demographicsPresentation "descriptive" to report height, age groups or further baseline characteristics.');
  });
});

describe('D10: armless efficacy results, and a run without efficacy', () => {
  it('imports an armless dose-response result with its method and population, and shows them', () => {
    const t = buildCSRTables(derive({}, datasets(), efficacy([DOSE_RESPONSE])).studyData).primaryEfficacy;
    expect(t.headers).toEqual(['Endpoint', 'Arm', 'Result', 'CI', 'p-value', 'Method', 'Population', 'vs Comparator']);
    expect(t.rows.at(-1)).toEqual([DOSE_RESPONSE.endpointName, '—', 'p = 0.321 (synthetic)', '—', '0.321', DOSE_RESPONSE.method, DOSE_RESPONSE.population, '—']);
    expect(t.rows[0]).toEqual([PRIMARY, 'Drug X', 'synthetic', '—', '—', '—', '—', '—']);
  });

  it('refuses an armless result without its method or population, or with a comparator', () => {
    const parse = (r: Record<string, unknown>) => CsrEfficacyResultsSchema.safeParse({ ...efficacy(), results: [...efficacy().results, r] }).success;
    expect(parse(DOSE_RESPONSE)).toBe(true);
    expect(parse({ ...DOSE_RESPONSE, method: undefined })).toBe(false);
    expect(parse({ ...DOSE_RESPONSE, population: undefined })).toBe(false);
    expect(parse({ ...DOSE_RESPONSE, comparatorArmId: 'PBO' })).toBe(false);
  });

  it('states “Efficacy results not supplied” in §11.4 when the manifest names no efficacy file', () => {
    const source = derive({}, datasets(), null);
    expect(source.studyData.efficacy).toEqual([]);
    expect(source.studyData.efficacyStatus).toBe('not-supplied');
    // The source does not claim a complete efficacy domain it does not carry.
    expect(source.completeDomains.efficacy).toBe(false);
    const tables = buildCSRTables(source.studyData);
    expect(tables.primaryEfficacy.rows).toEqual([['Efficacy results not supplied', '—', '—', '—', '—', '—']]);
    expect(tables.primaryEfficacy.rows.flat().some(c => c === '' || c === '0')).toBe(false);
    expect(tables.secondaryEfficacy).toBeUndefined();
  });

  it('refuses a mismatch between the manifest and the efficacy file supplied', () => {
    const bundle = legacyBundle(minimal());
    expect(refusal(() => deriveCsrSourceFromAdam(bundle, datasets(), undefined))).toMatchObject({ code: 'CSR_ADAM_EFFICACY_MISSING' });
    expect(refusal(() => deriveCsrSourceFromAdam({ ...bundle, efficacyResults: undefined }, datasets(), efficacy()))).toMatchObject({ code: 'CSR_ADAM_EFFICACY_UNDECLARED' });
  });

  it('holds a hand-built source: empty efficacy needs the declaration, and the declaration needs empty efficacy', () => {
    const source = sourceFixture();
    source.studyData.efficacy = [];
    expect(issues(source)).toContain('Supply efficacy results, or declare efficacyStatus "not-supplied".');
    source.studyData.efficacyStatus = 'not-supplied';
    expect(issues(source)).toContain('completeDomains.efficacy must be false when efficacy is not supplied, and true when it is.');
    source.completeDomains.efficacy = false;
    expect(issues(source)).toEqual([]);
    source.studyData.efficacy = sourceFixture().studyData.efficacy;
    expect(issues(source)).toContain('A source that declares efficacy not supplied cannot carry efficacy results.');
  });

  it('refuses a source that supplies efficacy yet says its efficacy domain is incomplete', () => {
    const source = sourceFixture();
    source.completeDomains.efficacy = false;
    expect(issues(source)).toContain('completeDomains.efficacy must be false when efficacy is not supplied, and true when it is.');
  });
});
