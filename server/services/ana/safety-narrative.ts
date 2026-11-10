/**
 * Safety (patient) narrative writer for AnA — ICH E3 §16 style.
 *
 * Turns a structured adverse-event case into a flowing, convention-following
 * narrative (subject → history/concomitants → exposure → event description with
 * seriousness/severity/causality → action & treatment → dechallenge/rechallenge
 * → outcome → investigator assessment), and reports completeness so the writer
 * knows what is missing before handoff.
 *
 * Pure and deterministic — drafts the prose from the supplied facts only and
 * NEVER invents clinical detail (a core safety-writing rule).
 *
 * @module server/services/ana/safety-narrative
 */

export interface SafetyNarrativeEvent {
  term: string;
  onsetDate?: string;
  dayOnStudy?: number | string;
  severity?: string; // mild | moderate | severe, or CTCAE grade
  seriousnessCriteria?: string[]; // e.g. hospitalization, life-threatening, death
  causality?: string; // related | possibly related | not related (investigator)
  actionTaken?: string; // drug withdrawn | dose reduced | dose interrupted | none
  treatment?: string; // treatment given for the event
  dechallenge?: string; // positive | negative | not applicable
  rechallenge?: string; // positive | negative | not done
  outcome?: string; // recovered | recovering | recovered with sequelae | fatal | unknown
  notes?: string; // additional clinical course
}

export interface SafetyNarrativeInput {
  subjectId: string;
  age?: number | string;
  sex?: string;
  studyId?: string;
  treatmentArm?: string;
  studyDrug?: string;
  dose?: string;
  firstDoseDate?: string;
  medicalHistory?: string[];
  concomitantMeds?: string[];
  event: SafetyNarrativeEvent;
}

export interface SafetyNarrativeResult {
  narrative: string;
  serious: boolean;
  /** Important fields not supplied — surface these for QC before finalizing. */
  missingFields: string[];
  /** Echo of the key facts used (traceability). */
  factsUsed: Record<string, unknown>;
}

const sentence = (s: string) => (s.trim().endsWith('.') ? s.trim() : `${s.trim()}.`);
const list = (xs?: string[]) => (xs && xs.length ? xs.join(', ') : '');
const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const conjoined = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const key = (s: string) => s.trim().toLowerCase();

/*
 * 2026-10-30: the CDISC controlled terms an ADaM row carries, as a medical
 * writer states them. Each phrase keeps the value's meaning; a value outside
 * these lists is stated as recorded, never guessed (CSR end-to-end lane).
 */
/**
 * ICH E2A seriousness criteria (ADAE AESDTH … AESMIE, as narrative-subject-facts.ts labels them): what the
 * event did. Stated without a causal word ("because"), which the CSR's withdrawal rule (D17) keeps out of a
 * narrative whose withdrawal the data do not attribute.
 */
const SERIOUSNESS_PHRASE: Record<string, string> = {
  death: 'resulted in death',
  'life-threatening': 'was life-threatening',
  hospitalization: 'required inpatient hospitalization or prolongation of existing hospitalization',
  'hospitalization or prolonged hospitalization': 'required inpatient hospitalization or prolongation of existing hospitalization',
  'persistent or significant disability or incapacity': 'resulted in persistent or significant disability or incapacity',
  'congenital anomaly or birth defect': 'was a congenital anomaly or birth defect',
  'other medically important event': 'was considered an important medical event',
};
/** CDISC AEACN (action taken with study treatment). */
const ACTION_PHRASE: Record<string, (drug: string) => string> = {
  'dose not changed': d => `The dose of ${d} was not changed`,
  'drug withdrawn': d => `${capitalized(d)} was permanently discontinued`,
  'dose reduced': d => `The dose of ${d} was reduced`,
  'dose increased': d => `The dose of ${d} was increased`,
  'drug interrupted': d => `${capitalized(d)} was temporarily interrupted`,
  'not applicable': d => `No action with ${d} was applicable`,
  unknown: d => `The action taken with ${d} is unknown`,
};
/** CDISC AEOUT (outcome of the adverse event), with the short forms callers pass, as the state a writer names. */
const OUTCOME_STATE: Record<string, string> = {
  'recovered/resolved': 'resolved', recovered: 'resolved', resolved: 'resolved',
  'recovered/resolved with sequelae': 'resolved with sequelae', 'recovered with sequelae': 'resolved with sequelae',
  'recovering/resolving': 'resolving', recovering: 'resolving',
  'not recovered/not resolved': 'not resolved', 'not recovered': 'not resolved',
  fatal: 'fatal', unknown: 'outcome unknown',
};
const OUTCOME_SENTENCE: Record<string, string> = {
  resolved: 'The event resolved', 'resolved with sequelae': 'The event resolved with sequelae',
  resolving: 'The event was recorded as resolving', 'not resolved': 'The event was recorded as not resolved',
  fatal: 'The event was fatal', 'outcome unknown': 'The outcome of the event is unknown',
};
/** AEREL categories in words, keeping the investigator's category (no SAP collapse to related / not related). */
const CAUSALITY_PHRASE: Record<string, string> = {
  none: 'not related', 'not related': 'not related', unrelated: 'not related', n: 'not related',
  remote: 'remotely related', unlikely: 'unlikely to be related', possible: 'possibly related',
  probable: 'probably related', definite: 'definitely related', related: 'related', y: 'related',
};

/** "an adverse event of X, mild in intensity" / "a serious adverse event of X, grade 3 (severe)". */
function eventClause(term: string, severity: string | undefined, serious: boolean): string {
  const intensity = !severity ? '' : /^grade\b/i.test(severity.trim()) ? `, ${severity.trim()}` : `, ${severity.trim()} in intensity`;
  return `${serious ? 'a serious adverse event' : 'an adverse event'} of ${term}${intensity}`;
}

function actionSentence(action: string, drug: string | undefined): string {
  const phrase = ACTION_PHRASE[key(action)];
  return phrase ? phrase(drug || 'study drug') : `Action taken with study drug: ${action}`;
}

/** An AEOUT value as the state a writer names ("resolved", "not resolved"); undefined outside the codelist. */
export function outcomeState(outcome: string): string | undefined {
  return OUTCOME_STATE[key(outcome)];
}

/** An AEREL value in words, its category kept ("possibly related"); undefined outside the list. */
export function causalityPhrase(causality: string): string | undefined {
  return CAUSALITY_PHRASE[key(causality)];
}

/** "an" before a word read with a vowel sound, ages included ("an 80-year-old", "an 11-year-old"). */
export function indefiniteArticle(word: string): 'a' | 'an' {
  return /^(?:8|11|18)(?!\d)|^8\d|^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

function outcomeSentence(outcome: string): string {
  const state = outcomeState(outcome);
  return state ? OUTCOME_SENTENCE[state] : `The outcome was reported as ${outcome}`;
}

function causalitySentence(causality: string, drug: string | undefined): string {
  return `The investigator assessed the event as ${causalityPhrase(causality) ?? causality} to ${drug || 'study drug'}`;
}

function seriousnessSentence(criteria: string[]): string {
  const phrases = criteria.map(c => SERIOUSNESS_PHRASE[key(c)]);
  return phrases.every(Boolean) ? `The event was serious: it ${conjoined(phrases)}` : `The event was assessed as serious (criteria: ${list(criteria)})`;
}

export function composeSafetyNarrative(input: SafetyNarrativeInput): SafetyNarrativeResult {
  const e = input.event ?? ({} as SafetyNarrativeEvent);
  const parts: string[] = [];
  const missing: string[] = [];

  // 1. Subject identification.
  const demo: string[] = [];
  if (input.age !== undefined && input.age !== '') demo.push(`${input.age}-year-old`);
  if (input.sex) demo.push(input.sex.toLowerCase());
  const who = `Subject ${input.subjectId}${demo.length ? `, ${indefiniteArticle(demo[0])} ${demo.join(' ')} subject` : ''}`;
  const arm = input.treatmentArm ? ` randomized to the ${input.treatmentArm} arm` : '';
  const study = input.studyId ? ` in study ${input.studyId}` : '';
  parts.push(sentence(`${who}${arm}${study}`));

  // 2. Relevant history & concomitant medications.
  if (input.medicalHistory?.length) {
    parts.push(sentence(`Relevant medical history included ${list(input.medicalHistory)}`));
  } else {
    missing.push('medicalHistory');
  }
  if (input.concomitantMeds?.length) {
    parts.push(sentence(`Concomitant medications included ${list(input.concomitantMeds)}`));
  }

  // 3. Study-drug exposure.
  if (input.studyDrug) {
    const dose = input.dose ? ` at a dose of ${input.dose}` : '';
    const start = input.firstDoseDate ? ` beginning ${input.firstDoseDate}` : '';
    parts.push(sentence(`The subject received ${input.studyDrug}${dose}${start}`));
  } else {
    missing.push('studyDrug');
  }

  // 4. Event onset & description.
  if (!e.term) missing.push('event.term');
  const timing =
    e.dayOnStudy !== undefined && e.dayOnStudy !== ''
      ? `On study day ${e.dayOnStudy}`
      : e.onsetDate
        ? `On ${e.onsetDate}`
        : 'During the study';
  if (!e.severity) missing.push('event.severity');
  const serious = !!(e.seriousnessCriteria && e.seriousnessCriteria.length);
  parts.push(sentence(`${timing}, the subject experienced ${eventClause(e.term || '[event not specified]', e.severity, serious)}`));

  // 5. Seriousness.
  if (serious) {
    parts.push(sentence(seriousnessSentence(e.seriousnessCriteria!)));
  } else {
    missing.push('event.seriousnessCriteria');
  }

  // 6. Action taken with study drug + treatment of the event.
  if (e.actionTaken) {
    parts.push(sentence(actionSentence(e.actionTaken, input.studyDrug)));
  } else {
    missing.push('event.actionTaken');
  }
  if (e.treatment) parts.push(sentence(`The event was treated with ${e.treatment}`));

  // 7. Dechallenge / rechallenge.
  const dr: string[] = [];
  if (e.dechallenge) dr.push(`dechallenge was ${e.dechallenge}`);
  if (e.rechallenge) dr.push(`rechallenge was ${e.rechallenge}`);
  if (dr.length) parts.push(sentence(capitalized(dr.join(' and '))));

  // 8. Additional clinical course.
  if (e.notes) parts.push(sentence(e.notes));

  // 9. Outcome.
  if (e.outcome) {
    parts.push(sentence(outcomeSentence(e.outcome)));
  } else {
    missing.push('event.outcome');
  }

  // 10. Investigator causality assessment (closing).
  if (e.causality) {
    parts.push(
      sentence(causalitySentence(e.causality, input.studyDrug))
    );
  } else {
    missing.push('event.causality');
  }

  return {
    narrative: parts.join(' '),
    serious,
    missingFields: missing,
    factsUsed: {
      subjectId: input.subjectId,
      event: e.term,
      serious,
      severity: e.severity,
      causality: e.causality,
      outcome: e.outcome,
    },
  };
}
