/**
 * D17 (CDISC pilot, 2026-10-30; product decision taken): a subject withdrawn
 * for an adverse event where the data record the withdrawal per subject only
 * (declared conventions.aeDiscontinuationFlag, no event-level AEACN) gets a
 * complete narrative, not a refusal. It states the withdrawal, lists every
 * treatment-emergent AE with onset on or before it, and says the data do not
 * record which event led to it. The fact gate refuses any causal attribution.
 * EVERY ROW IS SYNTHETIC: invented subjects, no CDISC or patient value.
 */
import { describe, expect, it } from 'vitest';
import { CSR_ADAM_BUNDLE_FORMAT, CsrAdamBundleSchema, type CsrAdamBundle } from '../../../../shared/csr-adam-bundle';
import { readAdamDataset, type AdamDataset } from '../adam-dataset-reader';
import { selectNarrativeSubjects } from '../narrative-subject-selection';
import { buildNarrativeIndex, subjectNarrativeFacts, type SubjectFacts } from '../narrative-subject-facts';
import { reconcileNarrative, reconcileRewrite } from '../narrative-reconciliation';
import { composeSubjectNarrative, templateNarrative, type NarrativeProseWriter } from '../narrative-compose';
import { bundle as baseBundle, datasetJson } from './support/adam-lmn201-synthetic';

type Value = string | number | null;
const STUDY = 'SYN-D17';
const id = (n: number) => `${STUDY}-${n}`;
const read = (doc: unknown): AdamDataset => {
  const out = readAdamDataset(Buffer.from(JSON.stringify(doc)), 'x.json');
  if (!out.ok) throw new Error(out.reason);
  return out.dataset;
};

/** S1 withdrawn day 20 with TEAEs before, on and after; S2 withdrawn day 6 with only a later TEAE; S3 completed; S4 withdrawn, TEAE with no onset. */
function adsl(withDate = true, eosdt = false): AdamDataset {
  const columns: Array<[string, 'string' | 'integer' | 'date']> = [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRT01P', 'string'],
    ['TRT01A', 'string'], ['SAFFL', 'string'], ['DCDECOD', 'string'], ['DSRAEFL', 'string'], ['DTHFL', 'string'], ['AGE', 'integer'],
    ['SEX', 'string'], ['TRTSDT', 'date'], ...(withDate ? [['RFENDT', 'date'] as ['RFENDT', 'date']] : []), ...(eosdt ? [['EOSDT', 'date'] as ['EOSDT', 'date']] : [])];
  /** [subject, arm, DCDECOD, AGE, SEX, RFENDT] */
  const row = ([n, arm, dc, age, sex, end]: [number, string, string, number, string, string]): Value[] =>
    [STUDY, id(n), arm, arm, 'Y', dc, dc === 'ADVERSE EVENT' ? 'Y' : null, null, age, sex, '2030-01-01', ...(withDate ? [end] : []), ...(eosdt ? [end] : [])];
  return read(datasetJson('ADSL', columns, ([
    [1, 'Drug X', 'ADVERSE EVENT', 71, 'F', '2030-01-20'],
    [2, 'Placebo', 'ADVERSE EVENT', 64, 'M', '2030-01-06'],
    [3, 'Drug X', 'COMPLETED', 58, 'M', '2030-03-01'],
    [4, 'Placebo', 'ADVERSE EVENT', 80, 'F', '2030-02-01'],
  ] as Array<[number, string, string, number, string, string]>).map(row)));
}
const AE_COLUMNS: Array<[string, 'string' | 'integer' | 'date']> = [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRTEMFL', 'string'],
  ['AEDECOD', 'string'], ['AEBODSYS', 'string'], ['ASTDT', 'date'], ['ASTDY', 'integer'], ['AESEV', 'string'], ['AESER', 'string'],
  ['AEREL', 'string'], ['AEOUT', 'string'], ['AESDTH', 'string'], ['AESHOSP', 'string'], ['AEACN', 'string']];
/** [subject, TRTEMFL, AEDECOD, AEBODSYS, ASTDT, ASTDY, AESEV, AESER, AEREL, AEOUT]; AESHOSP follows AESER, AEACN never collected. */
type AeSpec = [number, string, string, string, string | null, number | null, string, string, string, string];
const ae = ([n, te, term, soc, date, day, sev, ser, rel, out]: AeSpec): Value[] => [STUDY, id(n), te, term, soc, date, day, sev, ser, rel, out, 'N', ser, null];
const ADAE_ROWS: Value[][] = [
  ae([1, 'N', 'Back pain', 'Musculoskeletal disorders', '2029-12-29', -3, 'MILD', 'N', 'NONE', 'RECOVERED/RESOLVED']),
  ae([1, 'Y', 'Headache', 'Nervous system disorders', '2030-01-03', 3, 'MILD', 'N', 'POSSIBLE', 'RECOVERED/RESOLVED']),
  ae([1, 'Y', 'Syncope', 'Nervous system disorders', '2030-01-20', 20, 'SEVERE', 'Y', 'PROBABLE', 'RECOVERING/RESOLVING']),
  ae([1, 'Y', 'Nausea', 'Gastrointestinal disorders', '2030-01-25', 25, 'MODERATE', 'N', 'REMOTE', 'RECOVERED/RESOLVED']),
  ae([2, 'Y', 'Erythema', 'Skin disorders', '2030-01-09', 9, 'MILD', 'N', 'NONE', 'NOT RECOVERED/NOT RESOLVED']),
  ae([3, 'Y', 'Cough', 'Respiratory disorders', '2030-01-10', 10, 'MILD', 'N', 'NONE', 'RECOVERED/RESOLVED']),
  ae([4, 'Y', 'Fatigue', 'General disorders', null, null, 'MILD', 'N', 'NONE', 'RECOVERED/RESOLVED']),
  ae([4, 'Y', 'Dizziness', 'Nervous system disorders', '2030-01-11', 11, 'MODERATE', 'N', 'POSSIBLE', 'RECOVERED/RESOLVED']),
];
const adae = () => read(datasetJson('ADAE', AE_COLUMNS, ADAE_ROWS));

function d17Bundle(conventions: Record<string, unknown> = { disposition: 'DCDECOD', aeDiscontinuationFlag: 'DSRAEFL', aeDiscontinuationDate: 'RFENDT' }): CsrAdamBundle {
  const base = baseBundle();
  return { ...base, format: CSR_ADAM_BUNDLE_FORMAT, studyInfo: { ...base.studyInfo, sampleSize: 4 },
    arms: [{ treatment: 'Drug X', armId: 'DRUG', armName: 'Drug X' }, { treatment: 'Placebo', armId: 'PBO', armName: 'Placebo' }],
    conventions } as CsrAdamBundle;
}
function facts(n: number, bundle = d17Bundle(), datasets = { ADSL: adsl(), ADAE: adae() }): SubjectFacts {
  const subject = selectNarrativeSubjects(bundle, datasets).subjects.find(s => s.subjectId === id(n));
  if (!subject) throw new Error(`subject ${n} not selected`);
  return subjectNarrativeFacts(datasets, buildNarrativeIndex(datasets), subject);
}
const writer = (rewrite: (t: string) => string): NarrativeProseWriter => ({ model: 'test-model@pinned', write: async ({ template }) => rewrite(template) });
const codes = (text: string, f: SubjectFacts) => reconcileNarrative(text, f).issues.map(i => i.code);
const NO_CAUSE = 'The data do not record which adverse event led to withdrawal.';

describe('D17: subject-level AE withdrawal facts', () => {
  it('the bundle accepts a declared withdrawal date variable', () => {
    expect(CsrAdamBundleSchema.safeParse(d17Bundle()).success).toBe(true);
  });

  it('reads the withdrawal date and study day, and the TEAEs with onset on or before it, each from its row', () => {
    const f = facts(1);
    expect(f.withdrawal).toMatchObject({ date: '2030-01-20', day: 20, recordedBy: 'DSRAEFL = Y' });
    expect(f.withdrawal!.events.map(e => [e.term, e.onsetDay, e.severity, e.serious, e.relatedness, e.outcome])).toEqual([
      ['Headache', 3, 'mild', false, 'possible', 'recovered/resolved'],
      ['Syncope', 20, 'severe', true, 'probable', 'recovering/resolving'],
    ]);
    expect(f.withdrawal!.undated).toEqual([]);
    expect(f.facts).toContainEqual({ field: 'withdrawalDate', value: '2030-01-20', source: 'ADSL[1].RFENDT' });
    expect(f.facts.find(x => x.field === 'withdrawalDay')?.source).toBe('ADSL[1].RFENDT − ADSL[1].TRTSDT + 1');
    expect(f.facts.find(x => x.field === 'withdrawalEvent2.term')).toBeUndefined();
    expect(f.facts).toContainEqual(expect.objectContaining({ field: 'term', value: 'Syncope' }));
    // The event after withdrawal (Nausea) and the non-emergent one (Back pain) are not candidates.
    expect(JSON.stringify(f.withdrawal)).not.toMatch(/Nausea|Back pain/);
  });
});

describe('D17: the composed narrative', () => {
  it('composes, states the withdrawal, lists every preceding TEAE, and attributes no cause', async () => {
    const f = facts(1);
    const composed = await composeSubjectNarrative(f);
    expect(composed.status).toBe('composed');
    const text = composed.status === 'composed' ? composed.text : '';
    expect(text).toContain('Subject SYN-D17-1, a 71-year-old female subject randomized to the Drug X arm in study SYN-D17.');
    expect(text).toContain('The subject was withdrawn for an adverse event on 2030-01-20 (study day 20).');
    expect(text).toContain('ADSL records the withdrawal per subject (DSRAEFL = Y), not on an adverse event record.');
    expect(text).toContain('On study day 3 the subject experienced Headache (mild, not serious, relationship to study treatment recorded as possible, outcome recovered/resolved).');
    expect(text).toContain('On study day 20 the subject experienced Syncope (severe, serious: hospitalization or prolonged hospitalization');
    expect(text).toContain(NO_CAUSE);
    expect(text).not.toMatch(/Nausea|Back pain/);
    expect(text).not.toMatch(/due to|because|led to (?!withdrawal\.)|caused/i);
    expect(reconcileNarrative(text, f)).toEqual({ ok: true, issues: [] });
  });

  it('says so, as a QC item, when no TEAE precedes the withdrawal; still composed', async () => {
    const f = facts(2);
    const composed = await composeSubjectNarrative(f);
    expect(composed).toMatchObject({ status: 'composed' });
    const text = composed.status === 'composed' ? composed.text : '';
    expect(text).toContain('No treatment-emergent adverse event is recorded with onset on or before the withdrawal.');
    expect(text).toContain(NO_CAUSE);
    expect(text).not.toContain('Erythema');
    expect(composed.status === 'composed' && composed.missingFields).toContain('withdrawalEvents (no treatment-emergent ADAE event has onset on or before the withdrawal)');
  });

  it('names a TEAE whose onset is not recorded rather than placing it, and lists it for QC', async () => {
    const f = facts(4);
    const composed = await composeSubjectNarrative(f);
    const text = composed.status === 'composed' ? composed.text : '';
    expect(text).toContain('On study day 11 the subject experienced Dizziness');
    expect(text).toContain('The onset of Fatigue is not recorded, so its timing relative to the withdrawal is unknown.');
    expect(composed.status === 'composed' && composed.missingFields).toContain('withdrawalEvents.Fatigue.onset (ASTDT and ASTDY blank)');
  });

  it('refuses by name when no withdrawal date is declared or recorded: the preceding events cannot be identified', async () => {
    const bundle = d17Bundle({ disposition: 'DCDECOD', aeDiscontinuationFlag: 'DSRAEFL' });
    const composed = await composeSubjectNarrative(facts(1, bundle, { ADSL: adsl(false), ADAE: adae() }));
    expect(composed).toMatchObject({ status: 'refused' });
    expect(composed.status === 'refused' && composed.reason).toMatch(/no withdrawal date/);
  });
});

describe('D17: the fact gate refuses an invented cause', () => {
  const template = () => { const f = facts(1); return { f, text: templateNarrative(f).text }; };

  it('refuses "withdrawn due to <event>", "<event> led to withdrawal" and a pronoun attribution', () => {
    const { f, text } = template();
    expect(codes(`${text} The subject was withdrawn due to Syncope.`, f)).toContain('NARRATIVE_CAUSE_UNSOURCED');
    expect(codes(`${text} Headache led to the withdrawal of study treatment.`, f)).toContain('NARRATIVE_CAUSE_UNSOURCED');
    expect(codes(`${text} This resulted in discontinuation.`, f)).toContain('NARRATIVE_CAUSE_UNSOURCED');
    expect(codes(`${text} Syncope was the reason for discontinuation.`, f)).toContain('NARRATIVE_CAUSE_UNSOURCED');
  });

  it('keeps the template when a model rewrite attributes the withdrawal, and records the refusal', async () => {
    const f = facts(1);
    const composed = await composeSubjectNarrative(f, writer(t => t.replace(NO_CAUSE, 'The subject was withdrawn due to Syncope.')));
    expect(composed).toMatchObject({ status: 'composed', prose: 'template' });
    const issues = composed.status === 'composed' ? composed.modelProseRefused!.map(i => i.code) : [];
    expect(issues).toEqual(expect.arrayContaining(['NARRATIVE_CAUSE_UNSOURCED', 'NARRATIVE_CAUSE_STATEMENT_MISSING']));
  });

  it('refuses a rewrite that drops a candidate event, states an event after withdrawal, or moves the withdrawal day', () => {
    const { f, text } = template();
    expect(codes(text.replace(/On study day 3 the subject experienced Headache[^.]*\./, ''), f)).toContain('NARRATIVE_EVENT_MISSING');
    expect(codes(`${text} On study day 25 the subject experienced Nausea.`, f)).toContain('NARRATIVE_DAY_UNSOURCED');
    expect(codes(text.replace('(study day 20)', '(study day 21)'), f)).toContain('NARRATIVE_DAY_UNSOURCED');
    expect(codes(text.replace('Syncope (severe', 'Syncope (mild'), f)).toContain('NARRATIVE_SEVERITY_MISMATCH');
  });

  it('accepts a rewrite of the connective prose that keeps every fact and no cause', () => {
    const { f, text } = template();
    expect(reconcileRewrite(text.replace('ADSL records the withdrawal per subject', 'The withdrawal is recorded per subject'), text, f)).toEqual({ ok: true, issues: [] });
  });

  it('applies the cause rule only to a subject-level withdrawal: an event-basis narrative is unaffected', () => {
    const { f, text } = template();
    const eventBasis = { ...f, withdrawal: undefined };
    expect(codes(`${text} Headache led to the withdrawal of study treatment.`, eventBasis)).not.toContain('NARRATIVE_CAUSE_UNSOURCED');
  });
});

/** Adversarial review of D17 (2026-10-30): attributions the first gate accepted, a guessed date, and a blank AESER (already refused). */
describe('D17 review: no implied cause, nothing guessed, blank is not N', () => {
  it('refuses every attribution form, including "for <event>", sequence words and a cause stated in the next sentence', () => {
    const f = facts(1);
    const text = templateNarrative(f).text;
    for (const attribution of [
      'The subject was withdrawn for Syncope.',
      'Syncope was followed by withdrawal.',
      'The subject experienced Syncope. This was the reason for withdrawal.',
      'The investigator withdrew the subject in view of Syncope.',
      'Syncope necessitated withdrawal.',
      'Syncope; the subject was then withdrawn.',
      'In response to Syncope, the subject was withdrawn.',
      'The subject was discontinued from treatment as Syncope occurred.',
      'Syncope required discontinuation of study drug.',
      'Before withdrawal, the subject experienced Syncope.',
    ]) expect(codes(`${text} ${attribution}`, f), attribution).toContain('NARRATIVE_CAUSE_UNSOURCED');
    expect(reconcileNarrative(text, f)).toEqual({ ok: true, issues: [] });
  });

  it('does not refuse the template when an event term itself contains a withdrawal word', async () => {
    const rows = ADAE_ROWS.map(r => (r[1] === id(2) ? [...r.slice(0, 3), 'Drug withdrawal syndrome', ...r.slice(4)] : r)).map(r => (r[1] === id(2) ? [...r.slice(0, 5), '2030-01-04', 4, ...r.slice(7)] : r));
    const datasets = { ADSL: adsl(), ADAE: read(datasetJson('ADAE', AE_COLUMNS, rows)) };
    const composed = await composeSubjectNarrative(facts(2, d17Bundle(), datasets));
    expect(composed).toMatchObject({ status: 'composed' });
    expect(composed.status === 'composed' && composed.text).toContain('On study day 4 the subject experienced Drug withdrawal syndrome');
  });

  it('never guesses the withdrawal date: an undeclared ADSL EOSDT is not used, and the subject is refused by name', async () => {
    const withEosdt = adsl(false, true);
    const bundle = d17Bundle({ disposition: 'DCDECOD', aeDiscontinuationFlag: 'DSRAEFL' });
    const f = facts(1, bundle, { ADSL: withEosdt, ADAE: adae() });
    expect(f.withdrawal?.date).toBeUndefined();
    const composed = await composeSubjectNarrative(f);
    expect(composed).toMatchObject({ status: 'refused' });
    expect(composed.status === 'refused' && composed.reason).toMatch(/conventions\.aeDiscontinuationDate/);
  });

  it('never reads a blank AESER on a listed TEAE as "not serious": the selection is refused by name', () => {
    const rows = ADAE_ROWS.map(r => (r[1] === id(1) && r[3] === 'Headache' ? [...r.slice(0, 8), null, ...r.slice(9)] : r));
    const datasets = { ADSL: adsl(), ADAE: read(datasetJson('ADAE', AE_COLUMNS, rows)) };
    expect(() => selectNarrativeSubjects(d17Bundle(), datasets)).toThrow(/AESER must be Y or N/);
  });
});
