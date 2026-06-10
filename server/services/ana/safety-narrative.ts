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

export function composeSafetyNarrative(input: SafetyNarrativeInput): SafetyNarrativeResult {
  const e = input.event ?? ({} as SafetyNarrativeEvent);
  const parts: string[] = [];
  const missing: string[] = [];

  // 1. Subject identification.
  const demo: string[] = [];
  if (input.age !== undefined && input.age !== '') demo.push(`${input.age}-year-old`);
  if (input.sex) demo.push(input.sex.toLowerCase());
  const who = `Subject ${input.subjectId}${demo.length ? `, a ${demo.join(' ')} subject` : ''}`;
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
  const sev = e.severity ? ` ${e.severity}` : '';
  if (!e.severity) missing.push('event.severity');
  parts.push(sentence(`${timing}, the subject experienced${sev} ${e.term || '[event not specified]'}`));

  // 5. Seriousness.
  const serious = !!(e.seriousnessCriteria && e.seriousnessCriteria.length);
  if (serious) {
    parts.push(
      sentence(`The event was assessed as serious (criteria: ${list(e.seriousnessCriteria)})`)
    );
  } else {
    missing.push('event.seriousnessCriteria');
  }

  // 6. Action taken with study drug + treatment of the event.
  if (e.actionTaken) {
    parts.push(sentence(`Action taken with study drug: ${e.actionTaken}`));
  } else {
    missing.push('event.actionTaken');
  }
  if (e.treatment) parts.push(sentence(`The event was treated with ${e.treatment}`));

  // 7. Dechallenge / rechallenge.
  const dr: string[] = [];
  if (e.dechallenge) dr.push(`dechallenge was ${e.dechallenge}`);
  if (e.rechallenge) dr.push(`rechallenge was ${e.rechallenge}`);
  if (dr.length) parts.push(sentence(`On ${dr.join(' and ')}`));

  // 8. Additional clinical course.
  if (e.notes) parts.push(sentence(e.notes));

  // 9. Outcome.
  if (e.outcome) {
    parts.push(sentence(`The outcome was reported as ${e.outcome}`));
  } else {
    missing.push('event.outcome');
  }

  // 10. Investigator causality assessment (closing).
  if (e.causality) {
    parts.push(
      sentence(`The investigator assessed the event as ${e.causality} to ${input.studyDrug || 'study drug'}`)
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
