/**
 * CSR slice 7: every date, study day, age, grade, severity and event in a
 * patient narrative reconciles to the subject's ADaM rows, or the text is
 * refused. The model may rewrite connective prose only; a rewrite that moves a
 * fact is discarded and the fact-only template narrative is kept. SYNTHETIC data.
 */
import { describe, expect, it } from 'vitest';
import { selectNarrativeSubjects } from '../narrative-subject-selection';
import { buildNarrativeIndex, subjectNarrativeFacts, adamDate, type SubjectFacts } from '../narrative-subject-facts';
import { reconcileNarrative } from '../narrative-reconciliation';
import { composeSubjectNarrative, templateNarrative, type NarrativeProseWriter } from '../narrative-compose';
import { adaeRows, narrativeBundle, narrativeDatasets, subjectId } from './support/adam-narrative-synthetic';

function factsFor(i: number, n = 120, adae?: ReturnType<typeof adaeRows>): SubjectFacts {
  const datasets = narrativeDatasets(n, adae ? { adae } : {});
  const selection = selectNarrativeSubjects(narrativeBundle(), datasets);
  const subject = selection.subjects.find(s => s.subjectId === subjectId(i));
  if (!subject) throw new Error(`subject ${i} not selected`);
  return subjectNarrativeFacts(datasets, buildNarrativeIndex(datasets), subject);
}
const writer = (rewrite: (t: string) => string): NarrativeProseWriter => ({ model: 'test-model@pinned', write: async ({ template }) => rewrite(template) });
const codes = (text: string, f: SubjectFacts) => reconcileNarrative(text, f).issues.map(i => i.code);

describe('narrative facts come from the rows', () => {
  it('reads the fatal SAE of subject 8 (index 7) with its onset, seriousness and source rows', () => {
    const f = factsFor(7);
    const shock = f.events.find(e => e.term === 'Septic shock')!;
    expect(shock).toMatchObject({ onsetDay: 19, onsetDate: '2026-01-30', severity: 'severe', serious: true, outcome: 'fatal', action: 'drug withdrawn' });
    expect(shock.seriousnessCriteria).toContain('death');
    expect(f).toMatchObject({ age: 37, deathDay: 21, exposureDays: 19, medicalHistory: ['Hypertension'] });
    expect(f.concomitantMedications).toEqual(['PARACETAMOL']); // AMOXICILLIN ended before onset
    expect(f.facts.find(x => x.field === 'onsetDay' && x.value === 19)?.source).toMatch(/^ADAE\[\d+\]\.ASTDY$/);
  });

  it('converts an ADaM numeric date (SAS days since 1960-01-01) and refuses partial dates', () => {
    expect(adamDate(0)).toBe('1960-01-01');
    expect(adamDate(24_107)).toBe('2026-01-01');
    expect(adamDate('2026-02')).toBeNull();
    expect(adamDate('2026-02-30')).toBeNull();
  });
});

describe('the fact gate', () => {
  it('passes the template narrative, which states each onset by study day', async () => {
    const f = factsFor(7);
    const { text } = templateNarrative(f);
    expect(text).toContain('On study day 19, the subject experienced a serious adverse event of Septic shock, severe in intensity');
    expect(reconcileNarrative(text, f)).toEqual({ ok: true, issues: [] });
    const composed = await composeSubjectNarrative(f);
    expect(composed).toMatchObject({ status: 'composed', prose: 'template' });
  });

  it('refuses a narrative whose onset day differs from ADAE ASTDY, even when the wrong day is another recorded fact', () => {
    const f = factsFor(7);
    const { text } = templateNarrative(f);
    expect(codes(text.replace('On study day 19, the subject experienced a serious adverse event of Septic shock, severe in intensity', 'On study day 20, the subject experienced a serious adverse event of Septic shock, severe in intensity'), f))
      .toContain('NARRATIVE_ONSET_MISMATCH');
    // Day 21 is the recorded death day, but not this event's onset.
    expect(codes(text.replace('On study day 19,', 'On study day 21,'), f)).toContain('NARRATIVE_ONSET_MISMATCH');
  });

  it('refuses a narrative whose onset date differs from ADAE ASTDT', () => {
    const f = factsFor(7);
    expect(codes('On 2026-01-31, Subject had severe Septic shock on study day 19.', f)).toContain('NARRATIVE_ONSET_MISMATCH');
    expect(codes('On 2026-01-30, the subject had severe Septic shock (study day 19).', f).filter(c => c === 'NARRATIVE_ONSET_MISMATCH')).toEqual([]);
  });

  it('refuses unsourced age, grade, severity, death and omitted events', () => {
    const f = factsFor(3); // non-fatal SAE, pre-treatment (index 13 is the pre-treatment one; 3 is on treatment)
    const { text } = templateNarrative(f);
    expect(codes(text.replace(`${f.age}-year-old`, `${f.age! + 1}-year-old`), f)).toContain('NARRATIVE_AGE_MISMATCH');
    expect(codes(`${text} The event was grade 4.`, f)).toContain('NARRATIVE_GRADE_MISMATCH');
    expect(codes(text.replace('Pneumonia, moderate in intensity', 'Pneumonia, severe in intensity'), f)).toContain('NARRATIVE_SEVERITY_MISMATCH');
    expect(codes(`${text} The subject died.`, f)).toContain('NARRATIVE_DEATH_UNSOURCED');
    expect(codes(text.split('\n\n').filter(p => !p.includes('Pneumonia')).join('\n\n'), f)).toContain('NARRATIVE_EVENT_MISSING');
  });

  it('discards a model rewrite that moves the onset, keeps the template, and records why', async () => {
    const f = factsFor(7);
    const composed = await composeSubjectNarrative(f, writer(t => t.replace('study day 19', 'study day 18')));
    expect(composed.status).toBe('composed');
    if (composed.status !== 'composed') return;
    expect(composed.prose).toBe('template');
    expect(composed.text).toContain('study day 19');
    expect(composed.modelProseRefused?.map(i => i.code)).toContain('NARRATIVE_ONSET_MISMATCH');
  });

  it('discards a model rewrite that changes a number the gate has no pattern for (exposure days), or restates a date or day in another form', async () => {
    const f = factsFor(7);
    const exposure = await composeSubjectNarrative(f, writer(t => t.replace('for 19 days', 'for 28 days')));
    expect(exposure).toMatchObject({ status: 'composed', prose: 'template' });
    if (exposure.status === 'composed') expect(exposure.modelProseRefused?.map(i => i.code)).toContain('NARRATIVE_NUMBER_UNSOURCED');
    const bareDay = await composeSubjectNarrative(f, writer(t => `${t} The Septic shock began on Day 18.`));
    expect(bareDay).toMatchObject({ status: 'composed', prose: 'template' });
    const monthDate = await composeSubjectNarrative(f, writer(t => `${t} The Septic shock began on January 30, 2026.`));
    expect(monthDate).toMatchObject({ status: 'composed', prose: 'template' });
    if (monthDate.status === 'composed') expect(monthDate.modelProseRefused?.map(i => i.code)).toContain('NARRATIVE_DATE_UNSOURCED');
  });

  it('refuses a severity stated for an event whose rows record none', () => {
    const f = factsFor(7);
    const unrecorded: SubjectFacts = { ...f, events: f.events.map(e => (e.term === 'Septic shock' ? { ...e, severity: undefined } : e)) };
    const { text } = templateNarrative(unrecorded);
    expect(reconcileNarrative(text, unrecorded).ok).toBe(true);
    expect(codes(`${text} The Septic shock was severe.`, unrecorded)).toContain('NARRATIVE_SEVERITY_MISMATCH');
  });

  it('accepts a model rewrite that changes only connective prose, and names the model', async () => {
    const f = factsFor(7);
    const composed = await composeSubjectNarrative(f, writer(t => t.replace('Relevant medical history included', 'The subject’s medical history included')));
    expect(composed).toMatchObject({ status: 'composed', prose: 'model', model: 'test-model@pinned' });
  });

  it('refuses a subject whose ADSL death has no fatal ADAE event, by name', async () => {
    const rows = adaeRows(10, (row, i, ae) => (i === 7 && ae.term === 'Septic shock' ? row.map((v, c) => (c === 10 ? 'N' : c === 12 ? 'NOT RECOVERED/NOT RESOLVED' : c === 8 ? 'N' : c === 13 ? 'DOSE NOT CHANGED' : v)) : row));
    const f = factsFor(7, 10, rows);
    const composed = await composeSubjectNarrative(f);
    expect(composed).toMatchObject({ status: 'refused' });
    if (composed.status === 'refused') expect(composed.reason).toMatch(/ADSL records a death/);
  });
});
