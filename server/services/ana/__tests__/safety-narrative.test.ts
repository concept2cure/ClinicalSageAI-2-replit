/**
 * Safety-narrative writer — unit tests. Deterministic; verifies prose assembly,
 * seriousness detection, completeness flags, and the never-invent rule.
 */
import { describe, it, expect } from 'vitest';
import { composeSafetyNarrative } from '../safety-narrative';

describe('composeSafetyNarrative', () => {
  it('assembles a complete serious-AE narrative in order with no missing fields', () => {
    const r = composeSafetyNarrative({
      subjectId: '1001',
      age: 67,
      sex: 'Male',
      studyId: 'ABC-301',
      treatmentArm: 'pembrolizumab',
      studyDrug: 'pembrolizumab',
      dose: '200 mg Q3W',
      firstDoseDate: '2025-02-01',
      medicalHistory: ['hypertension', 'type 2 diabetes'],
      concomitantMeds: ['metformin'],
      event: {
        term: 'immune-mediated pneumonitis',
        dayOnStudy: 45,
        severity: 'grade 3',
        seriousnessCriteria: ['hospitalization'],
        causality: 'related',
        actionTaken: 'drug withdrawn',
        treatment: 'high-dose corticosteroids',
        dechallenge: 'positive',
        outcome: 'recovered',
      },
    });
    expect(r.serious).toBe(true);
    expect(r.missingFields).toEqual([]);
    expect(r.narrative).toContain('Subject 1001, a 67-year-old male subject');
    expect(r.narrative).toContain('pembrolizumab arm in study ABC-301');
    expect(r.narrative).toContain('Relevant medical history included hypertension, type 2 diabetes');
    expect(r.narrative).toContain('On study day 45, the subject experienced a serious adverse event of immune-mediated pneumonitis, grade 3.');
    expect(r.narrative).toContain('The event was serious: it required inpatient hospitalization or prolongation of existing hospitalization.');
    expect(r.narrative).toContain('Pembrolizumab was permanently discontinued.');
    expect(r.narrative).toContain('Dechallenge was positive.');
    expect(r.narrative).toContain('The event resolved.');
    expect(r.narrative).toContain('investigator assessed the event as related to pembrolizumab');
  });

  it('flags missing required fields and never fabricates them', () => {
    const r = composeSafetyNarrative({
      subjectId: '2002',
      event: { term: 'syncope' },
    });
    expect(r.serious).toBe(false);
    expect(r.missingFields).toEqual(
      expect.arrayContaining([
        'medicalHistory', 'studyDrug', 'event.severity', 'event.seriousnessCriteria',
        'event.actionTaken', 'event.outcome', 'event.causality',
      ]),
    );
    // No invented seriousness/causality/outcome text.
    expect(r.narrative).not.toMatch(/serious/);
    expect(r.narrative).not.toMatch(/outcome|resolv|fatal/);
    expect(r.narrative).toContain('the subject experienced an adverse event of syncope.');
  });

  it('uses onset date when day-on-study is absent and closes with causality vs study drug', () => {
    const r = composeSafetyNarrative({
      subjectId: '3003',
      studyDrug: 'drug X',
      event: { term: 'rash', onsetDate: '2025-03-10', causality: 'possibly related', outcome: 'recovering' },
    });
    expect(r.narrative).toContain('On 2025-03-10, the subject experienced an adverse event of rash.');
    expect(r.narrative).toContain('possibly related to drug X');
  });
});

/**
 * 2026-10-30: a medical writer's sentences for the CDISC controlled terms an
 * ADaM row carries (AEACN, AEOUT, AEREL and the seriousness flags), instead of
 * reading the codelist value out ("Action taken with study drug: dose not
 * changed", "assessed the event as possible to …"). Each value keeps its
 * meaning; a value outside the codelist is stated as before, never guessed.
 */
describe('composeSafetyNarrative — CDISC terms as a medical writer states them', () => {
  const event = (over: Record<string, unknown>) => composeSafetyNarrative({
    subjectId: '01-701-1015', studyDrug: 'Xanomeline', event: { term: 'Pneumonia', dayOnStudy: 10, ...over },
  }).narrative;

  it('names the event as a (serious) adverse event with its intensity or grade', () => {
    expect(event({ severity: 'moderate', seriousnessCriteria: ['hospitalization or prolonged hospitalization'] }))
      .toContain('On study day 10, the subject experienced a serious adverse event of Pneumonia, moderate in intensity.');
    expect(event({ severity: 'mild' })).toContain('On study day 10, the subject experienced an adverse event of Pneumonia, mild in intensity.');
    expect(event({ severity: 'grade 3 (severe)' })).toContain('experienced an adverse event of Pneumonia, grade 3 (severe).');
    expect(event({})).toContain('On study day 10, the subject experienced an adverse event of Pneumonia.');
  });

  it('states each seriousness criterion as what the event did', () => {
    expect(event({ seriousnessCriteria: ['hospitalization or prolonged hospitalization'] }))
      .toContain('The event was serious: it required inpatient hospitalization or prolongation of existing hospitalization.');
    expect(event({ seriousnessCriteria: ['death', 'life-threatening', 'other medically important event'] }))
      .toContain('The event was serious: it resulted in death, was life-threatening and was considered an important medical event.');
    // A criterion outside the list is stated as recorded.
    expect(event({ seriousnessCriteria: ['not recorded in ADAE'] })).toContain('The event was assessed as serious (criteria: not recorded in ADAE).');
  });

  it('states the action taken with the study drug (AEACN) as a sentence', () => {
    expect(event({ actionTaken: 'dose not changed' })).toContain('The dose of Xanomeline was not changed.');
    expect(event({ actionTaken: 'drug withdrawn' })).toContain('Xanomeline was permanently discontinued.');
    expect(event({ actionTaken: 'dose reduced' })).toContain('The dose of Xanomeline was reduced.');
    expect(event({ actionTaken: 'drug interrupted' })).toContain('Xanomeline was temporarily interrupted.');
    expect(event({ actionTaken: 'not applicable' })).toContain('No action with Xanomeline was applicable.');
    expect(event({ actionTaken: 'per protocol' })).toContain('Action taken with study drug: per protocol.');
  });

  it('states the outcome (AEOUT) as a sentence', () => {
    expect(event({ outcome: 'recovered/resolved' })).toContain('The event resolved.');
    expect(event({ outcome: 'recovered/resolved with sequelae' })).toContain('The event resolved with sequelae.');
    expect(event({ outcome: 'recovering/resolving' })).toContain('The event was recorded as resolving.');
    expect(event({ outcome: 'not recovered/not resolved' })).toContain('The event was recorded as not resolved.');
    expect(event({ outcome: 'fatal' })).toContain('The event was fatal.');
    expect(event({ outcome: 'unknown' })).toContain('The outcome of the event is unknown.');
    expect(event({ outcome: 'transferred' })).toContain('The outcome was reported as transferred.');
  });

  it('takes "an" before an age read with a vowel sound (8, 11, 18, 80–89)', () => {
    const intro = (age: number) => composeSafetyNarrative({ subjectId: 'S', age, sex: 'female', event: { term: 'Rash' } }).narrative;
    expect(intro(80)).toContain('Subject S, an 80-year-old female subject');
    expect(intro(8)).toContain('an 8-year-old');
    expect(intro(11)).toContain('an 11-year-old');
    expect(intro(18)).toContain('an 18-year-old');
    expect(intro(67)).toContain('a 67-year-old');
    expect(intro(81)).toContain('an 81-year-old');
  });

  it('states dechallenge and rechallenge as a sentence', () => {
    expect(event({ dechallenge: 'positive' })).toContain('Dechallenge was positive.');
    expect(event({ dechallenge: 'positive', rechallenge: 'not done' })).toContain('Dechallenge was positive and rechallenge was not done.');
    expect(event({ dechallenge: 'positive' })).not.toContain('On dechallenge');
  });

  it('states the investigator\'s causality category (AEREL) in words, keeping the category', () => {
    expect(event({ causality: 'none' })).toContain('The investigator assessed the event as not related to Xanomeline.');
    expect(event({ causality: 'remote' })).toContain('as remotely related to Xanomeline.');
    expect(event({ causality: 'possible' })).toContain('as possibly related to Xanomeline.');
    expect(event({ causality: 'probable' })).toContain('as probably related to Xanomeline.');
    expect(event({ causality: 'unlikely' })).toContain('as unlikely to be related to Xanomeline.');
    expect(event({ causality: 'possibly related' })).toContain('as possibly related to Xanomeline.');
  });
});
