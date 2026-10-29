/**
 * Compose one subject's patient safety narrative from its ADaM facts (CSR
 * slice 7, 2026-10-29). The prose is the existing deterministic composer's
 * (server/services/ana/safety-narrative.ts composeSafetyNarrative, imported,
 * unchanged), one paragraph per qualifying event in the order E3 §12.3.2 sets,
 * followed by the subject's treatment course and, where recorded, death or
 * withdrawal. Every value comes from the facts; nothing is typed in.
 *
 * A model may rewrite the connective prose only through NarrativeProseWriter,
 * and only an approved model may be passed (production passes none until
 * PQ-DRAFT-001 passes, ADR-0015 §3). Its text is held to the same fact gate
 * (narrative-reconciliation.ts); a refused rewrite is discarded, the template
 * narrative is kept, and the refusal is recorded for QC. The template narrative
 * itself must pass the gate too, or the subject is refused.
 */
import { composeSafetyNarrative, type SafetyNarrativeEvent } from '../ana/safety-narrative.js';
import type { NarrativeCategory } from './narrative-subject-selection.js';
import type { EventFacts, SubjectFacts } from './narrative-subject-facts.js';
import { reconcileNarrative, reconcileRewrite, type NarrativeIssue } from './narrative-reconciliation.js';

export interface NarrativeProseWriter {
  /** The approved-models entry id and pinned version that writes the prose. */
  readonly model: string;
  write(input: { subjectId: string; facts: SubjectFacts; template: string }): Promise<string>;
}

export type ComposedNarrative =
  | { status: 'composed'; subjectId: string; text: string; prose: 'template' | 'model'; model?: string;
      categories: NarrativeCategory[]; missingFields: string[]; modelProseRefused?: NarrativeIssue[] }
  | { status: 'refused'; subjectId: string; categories: NarrativeCategory[]; reason: string; issues?: NarrativeIssue[] };

const sentence = (s: string) => (s.trim().endsWith('.') ? s.trim() : `${s.trim()}.`);

function eventInput(e: EventFacts): SafetyNarrativeEvent {
  const severity = e.grade !== undefined ? `grade ${e.grade}${e.severity ? ` (${e.severity})` : ''}` : e.severity;
  return {
    term: e.term,
    // E3 §12.3.2: study days, not calendar dates, unless the authority asks; the date only when no day is recorded.
    ...(e.onsetDay !== undefined ? { dayOnStudy: e.onsetDay } : e.onsetDate ? { onsetDate: e.onsetDate } : {}),
    ...(severity ? { severity } : {}),
    ...(e.serious ? { seriousnessCriteria: e.seriousnessCriteria.length ? e.seriousnessCriteria : ['not recorded in ADAE'] } : {}),
    ...(e.action ? { actionTaken: e.action } : {}),
    ...(e.outcome ? { outcome: e.outcome } : {}),
    ...(e.relatedness ? { causality: e.relatedness } : {}),
    ...(!e.serious ? { notes: 'The event was not serious' } : {}),
  };
}

/** CDISC SEX codelist to the word the narrative uses; any other recorded value is stated as recorded. */
const SEX_WORD: Record<string, string> = { M: 'male', F: 'female', U: 'sex unknown', UNDIFFERENTIATED: 'undifferentiated' };

function eventParagraph(f: SubjectFacts, e: EventFacts, first: boolean): string {
  const subject = first ? {
    age: f.age, sex: f.sex ? SEX_WORD[f.sex.toUpperCase()] ?? f.sex : undefined, studyId: f.studyId, treatmentArm: f.armName,
    medicalHistory: f.medicalHistory, concomitantMeds: f.concomitantMedications, firstDoseDate: f.firstDoseDate,
  } : {};
  const result = composeSafetyNarrative({ subjectId: f.subjectId, studyDrug: f.treatment, ...subject, event: eventInput(e) });
  // A later event repeats only the event: drop the composer's subject sentence.
  const lead = `Subject ${f.subjectId}.`;
  // The composer's own missingFields are not used: the facts reader records every unrecorded value by event and variable.
  return !first && result.narrative.startsWith(lead) ? result.narrative.slice(lead.length).trim() : result.narrative;
}

function courseParagraph(f: SubjectFacts): string {
  const parts: string[] = [];
  if (f.exposureDays !== undefined) parts.push(sentence(`The subject received ${f.treatment} for ${f.exposureDays} days`));
  if (f.discontinuationReason) parts.push(sentence(`The recorded reason for discontinuation was ${f.discontinuationReason.toLowerCase()}`));
  if (f.categories.includes('death')) {
    const when = f.deathDay !== undefined ? ` on study day ${f.deathDay}` : f.deathDate ? ` on ${f.deathDate}` : '';
    parts.push(sentence(`The subject died${when}`));
    // A separate sentence: a cause that is also an event term must not bind the death day to that event.
    if (f.deathCause) parts.push(sentence(`The recorded cause of death was ${f.deathCause.toLowerCase()}`));
  }
  return parts.join(' ');
}

/** The fact-only template narrative and its missing fields. */
export function templateNarrative(f: SubjectFacts): { text: string; missingFields: string[] } {
  const paragraphs = f.events.map((e, i) => eventParagraph(f, e, i === 0));
  const course = courseParagraph(f);
  const text = [...paragraphs, course].filter(Boolean).join('\n\n');
  return { text, missingFields: [...new Set(f.missing)] };
}

/**
 * Why a selected subject cannot have a narrative from these rows, or null. A
 * narrative describes the event; a death or AE withdrawal that ADSL records
 * with no qualifying ADAE event is a source inconsistency for the data
 * manager, refused by name rather than narrated around.
 */
function refusalReason(f: SubjectFacts): string | null {
  if (f.events.length) return null;
  if (f.categories.includes('death')) return 'ADSL records a death, but no ADAE event for this subject is fatal (AESDTH or AEOUT).';
  return 'ADSL records discontinuation for an adverse event, but no ADAE event records the study treatment as withdrawn (AEACN).';
}

/** Compose and gate one subject's narrative. */
export async function composeSubjectNarrative(f: SubjectFacts, writer?: NarrativeProseWriter): Promise<ComposedNarrative> {
  const base = { subjectId: f.subjectId, categories: f.categories };
  const reason = refusalReason(f);
  if (reason) return { status: 'refused', ...base, reason };
  const template = templateNarrative(f);
  const gate = reconcileNarrative(template.text, f);
  if (!gate.ok) return { status: 'refused', ...base, reason: 'The composed narrative did not reconcile with its ADaM rows.', issues: gate.issues };
  const composed = { status: 'composed' as const, ...base, text: template.text, prose: 'template' as const, missingFields: template.missingFields };
  if (!writer) return composed;
  let rewritten: string;
  try { rewritten = await writer.write({ subjectId: f.subjectId, facts: f, template: template.text }); }
  catch { return { ...composed, modelProseRefused: [{ code: 'NARRATIVE_EMPTY', detail: 'The prose model did not return a narrative.' }] }; }
  const check = reconcileRewrite(rewritten, template.text, f);
  if (!check.ok) return { ...composed, modelProseRefused: check.issues };
  return { ...composed, text: rewritten.trim(), prose: 'model', model: writer.model };
}
