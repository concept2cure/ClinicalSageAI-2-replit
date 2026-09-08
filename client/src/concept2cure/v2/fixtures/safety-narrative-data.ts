/**
 * Safety-narrative fixture data -- ported from kit app/safety-narrative.jsx.
 * Structured SAE cases grounded in the app's PV signals, plus the
 * deterministic ICH E3 section 16 narrative composer (pure function).
 */

/* -- Interfaces -- */

export interface SaeEvent {
  term: string;
  dayOnStudy?: number;
  onsetDate?: string;
  severity?: string;
  seriousnessCriteria?: string[];
  causality?: string;
  actionTaken?: string;
  treatment?: string;
  dechallenge?: string;
  rechallenge?: string;
  outcome?: string;
  notes?: string;
}

export interface SaeCase {
  id: string;
  due: string;
  clock: string;
  dueDays: number;
  subjectId: string;
  age?: number;
  sex?: string;
  studyId?: string;
  treatmentArm?: string;
  studyDrug?: string;
  dose?: string;
  firstDoseDate?: string;
  medicalHistory?: string[];
  concomitantMeds?: string[];
  event: SaeEvent;
}

export interface NarrativeResult {
  narrative: string;
  serious: boolean;
  missingFields: string[];
  factsUsed: {
    subjectId: string;
    event: string | undefined;
    serious: boolean;
    severity: string | undefined;
    causality: string | undefined;
    outcome: string | undefined;
  };
}

/* -- Deterministic composer (verbatim port of composeSafetyNarrative) -- */

function sentence(s: string): string {
  const t = s.trim();
  return t.endsWith('.') ? t : t + '.';
}

function listJoin(xs: string[] | undefined): string {
  return xs && xs.length ? xs.join(', ') : '';
}

export function composeSafetyNarrative(input: SaeCase): NarrativeResult {
  const e = input.event || ({} as SaeEvent);
  const parts: string[] = [];
  const missing: string[] = [];

  // 1. Subject identification.
  const demo: string[] = [];
  if (input.age !== undefined && input.age !== ('' as unknown as number)) demo.push(input.age + '-year-old');
  if (input.sex) demo.push(String(input.sex).toLowerCase());
  const who = 'Subject ' + input.subjectId + (demo.length ? ', a ' + demo.join(' ') + ' subject' : '');
  const arm = input.treatmentArm ? ' randomized to the ' + input.treatmentArm + ' arm' : '';
  const study = input.studyId ? ' in study ' + input.studyId : '';
  parts.push(sentence(who + arm + study));

  // 2. Relevant history and concomitant medications.
  if (input.medicalHistory && input.medicalHistory.length) {
    parts.push(sentence('Relevant medical history included ' + listJoin(input.medicalHistory)));
  } else {
    missing.push('medicalHistory');
  }
  if (input.concomitantMeds && input.concomitantMeds.length) {
    parts.push(sentence('Concomitant medications included ' + listJoin(input.concomitantMeds)));
  }

  // 3. Study-drug exposure.
  if (input.studyDrug) {
    const dose = input.dose ? ' at a dose of ' + input.dose : '';
    const start = input.firstDoseDate ? ' beginning ' + input.firstDoseDate : '';
    parts.push(sentence('The subject received ' + input.studyDrug + dose + start));
  } else {
    missing.push('studyDrug');
  }

  // 4. Event onset and description.
  if (!e.term) missing.push('event.term');
  const timing =
    e.dayOnStudy !== undefined && e.dayOnStudy !== ('' as unknown as number)
      ? 'On study day ' + e.dayOnStudy
      : e.onsetDate
        ? 'On ' + e.onsetDate
        : 'During the study';
  const sev = e.severity ? ' ' + e.severity : '';
  if (!e.severity) missing.push('event.severity');
  parts.push(sentence(timing + ', the subject experienced' + sev + ' ' + (e.term || '[event not specified]')));

  // 5. Seriousness.
  const serious = !!(e.seriousnessCriteria && e.seriousnessCriteria.length);
  if (serious) {
    parts.push(sentence('The event was assessed as serious (criteria: ' + listJoin(e.seriousnessCriteria) + ')'));
  } else {
    missing.push('event.seriousnessCriteria');
  }

  // 6. Action taken and treatment of the event.
  if (e.actionTaken) parts.push(sentence('Action taken with study drug: ' + e.actionTaken));
  else missing.push('event.actionTaken');
  if (e.treatment) parts.push(sentence('The event was treated with ' + e.treatment));

  // 7. Dechallenge / rechallenge.
  const dr: string[] = [];
  if (e.dechallenge) dr.push('dechallenge was ' + e.dechallenge);
  if (e.rechallenge) dr.push('rechallenge was ' + e.rechallenge);
  if (dr.length) parts.push(sentence('On ' + dr.join(' and ')));

  // 8. Additional clinical course.
  if (e.notes) parts.push(sentence(e.notes));

  // 9. Outcome.
  if (e.outcome) parts.push(sentence('The outcome was reported as ' + e.outcome));
  else missing.push('event.outcome');

  // 10. Investigator causality assessment (closing).
  if (e.causality) {
    parts.push(sentence('The investigator assessed the event as ' + e.causality + ' to ' + (input.studyDrug || 'study drug')));
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

/* -- Fixture SAE cases -- */
