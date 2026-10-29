/**
 * The fact gate for a patient safety narrative (CSR slice 7, 2026-10-29): every
 * date, study day, age, grade, severity and event in the text is reconciled
 * against the subject's ADaM facts, and a narrative that states anything the
 * rows do not is refused. It applies to the engine's own template prose and,
 * identically, to any connective prose a model writes over it, so the model
 * can change wording but never a fact (RULE 2).
 *
 * What it checks, per sentence:
 *   - every ISO date and every "study day N" is one the subject's rows record;
 *   - in a sentence that names an event, every date and day belongs to that
 *     event (its onset or end), so an onset that differs from ADAE ASTDT or
 *     ASTDY is refused even when the wrong day is another fact's;
 *   - each event is named, and its recorded onset is stated with it;
 *   - an "N-year-old" is the ADSL AGE, a "grade N" a recorded grade, and a
 *     mild/moderate/severe beside an event that event's recorded severity;
 *   - death, died or fatal only where the rows record a death.
 * It does not judge free clinical wording beyond these, and it cannot tell
 * that a model invented an unlisted clinical detail in words with no date,
 * day or number; that is why the model writes connective prose only and the
 * template stays the fallback.
 */
import type { EventFacts, SubjectFacts } from './narrative-subject-facts.js';

export type NarrativeIssueCode =
  | 'NARRATIVE_DATE_UNSOURCED' | 'NARRATIVE_DAY_UNSOURCED' | 'NARRATIVE_ONSET_MISMATCH' | 'NARRATIVE_ONSET_MISSING'
  | 'NARRATIVE_EVENT_MISSING' | 'NARRATIVE_AGE_MISMATCH' | 'NARRATIVE_GRADE_MISMATCH' | 'NARRATIVE_SEVERITY_MISMATCH'
  | 'NARRATIVE_DEATH_UNSOURCED' | 'NARRATIVE_NUMBER_UNSOURCED' | 'NARRATIVE_EMPTY';
export interface NarrativeIssue { code: NarrativeIssueCode; detail: string }
export interface NarrativeReconciliation { ok: boolean; issues: NarrativeIssue[] }

const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
// "study day 19" and "Day 19" alike: a day stated without "study" is still a day (review 2026-10-29).
const DAY = /\b(?:study\s+)?day\s+(-?\d+)\b/gi;
/** A date in any form other than the ISO 8601 the rows record ("January 30, 2026", "30 Jan 2026"). */
const NON_ISO_DATE = /\b(?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi;
const NUMBER = /\d+(?:\.\d+)?/g;
const AGE = /\b(\d+)-year-old\b/gi;
const GRADE = /\bgrade\s+(\d)\b/gi;
const SEVERITY = /\b(mild|moderate|severe)\b/gi;
const DEATH = /\b(death|died|dies|fatal)\b/i;

const lower = (s: string) => s.toLowerCase();
const sentences = (text: string) => text.split(/(?<=[.;])\s+|\n+/).map(s => s.trim()).filter(Boolean);
const all = (re: RegExp, s: string) => [...s.matchAll(re)];

function eventDates(e: EventFacts) { return new Set([e.onsetDate, e.endDate].filter((x): x is string => !!x)); }
function eventDays(e: EventFacts) { return new Set([e.onsetDay, e.endDay].filter((x): x is number => x !== undefined)); }

function subjectDates(f: SubjectFacts): Set<string> {
  const dates = new Set([f.firstDoseDate, f.lastDoseDate, f.deathDate].filter((x): x is string => !!x));
  for (const e of f.events) for (const d of eventDates(e)) dates.add(d);
  return dates;
}
function subjectDays(f: SubjectFacts): Set<number> {
  const days = new Set([f.deathDay].filter((x): x is number => x !== undefined));
  for (const e of f.events) for (const d of eventDays(e)) days.add(d);
  return days;
}

/** The events a sentence names, by preferred term (several events may share one term). */
function eventsIn(sentence: string, events: EventFacts[]): EventFacts[] {
  const s = lower(sentence);
  return events.filter(e => s.includes(lower(e.term)));
}

function checkSentence(sentence: string, f: SubjectFacts, issues: NarrativeIssue[]) {
  const dates = all(DATE, sentence).map(m => m[0]);
  const days = all(DAY, sentence).map(m => Number(m[1]));
  const named = eventsIn(sentence, f.events);
  const allowedDates = named.length ? new Set(named.flatMap(e => [...eventDates(e)])) : subjectDates(f);
  const allowedDays = named.length ? new Set(named.flatMap(e => [...eventDays(e)])) : subjectDays(f);
  const code = named.length ? 'NARRATIVE_ONSET_MISMATCH' : null;
  for (const d of dates) if (!allowedDates.has(d)) issues.push({ code: code ?? 'NARRATIVE_DATE_UNSOURCED', detail: `${d} is not recorded${named.length ? ` for ${named[0].term} (ADAE ASTDT/AENDT)` : ' for this subject'}.` });
  for (const d of days) if (!allowedDays.has(d)) issues.push({ code: code ?? 'NARRATIVE_DAY_UNSOURCED', detail: `Study day ${d} is not recorded${named.length ? ` for ${named[0].term} (ADAE ASTDY/AENDY)` : ' for this subject'}.` });
  checkSeverity(sentence, named, issues);
}

/** A severity the rows do not record for the named event is as unsourced as a different one (review 2026-10-29). */
function checkSeverity(sentence: string, named: EventFacts[], issues: NarrativeIssue[]) {
  if (!named.length) return;
  for (const m of all(SEVERITY, sentence)) {
    const word = lower(m[1]);
    if (!named.some(e => e.severity === word)) issues.push({ code: 'NARRATIVE_SEVERITY_MISMATCH', detail: `${named[0].term} is recorded as ${named[0].severity ?? 'no severity (ASEV/AESEV blank)'}, not ${word}.` });
  }
}

function checkEvents(text: string, f: SubjectFacts, issues: NarrativeIssue[]) {
  const parts = sentences(text);
  for (const e of f.events) {
    const withTerm = parts.filter(s => lower(s).includes(lower(e.term)));
    if (!withTerm.length) { issues.push({ code: 'NARRATIVE_EVENT_MISSING', detail: `${e.term} is not described.` }); continue; }
    const onsetStated = withTerm.some(s => (e.onsetDay !== undefined && all(DAY, s).some(m => Number(m[1]) === e.onsetDay))
      || (!!e.onsetDate && s.includes(e.onsetDate)));
    if ((e.onsetDay !== undefined || e.onsetDate) && !onsetStated) issues.push({ code: 'NARRATIVE_ONSET_MISSING', detail: `The recorded onset of ${e.term} is not stated with it.` });
  }
}

function checkSubject(text: string, f: SubjectFacts, issues: NarrativeIssue[]) {
  for (const m of all(AGE, text)) if (Number(m[1]) !== f.age) issues.push({ code: 'NARRATIVE_AGE_MISMATCH', detail: `${m[1]} years is not the recorded age.` });
  const grades = new Set(f.events.map(e => e.grade).filter((g): g is number => g !== undefined));
  for (const m of all(GRADE, text)) if (!grades.has(Number(m[1]))) issues.push({ code: 'NARRATIVE_GRADE_MISMATCH', detail: `Grade ${m[1]} is not a recorded toxicity grade.` });
  const deathRecorded = f.categories.includes('death') || f.events.some(e => e.outcome === 'fatal' || e.seriousnessCriteria.includes('death'));
  if (DEATH.test(text) && !deathRecorded) issues.push({ code: 'NARRATIVE_DEATH_UNSOURCED', detail: 'The narrative states a death the rows do not record.' });
}

/**
 * A model rewrite of the template may state no number the template does not:
 * exposure, counts and any figure the patterns above do not name are bound
 * here (review 2026-10-29). Applied on top of reconcileNarrative.
 */
export function reconcileRewrite(rewrite: string, template: string, facts: SubjectFacts): NarrativeReconciliation {
  const base = reconcileNarrative(rewrite, facts);
  if (typeof rewrite !== 'string' || !rewrite.trim()) return base;
  const known = new Set(template.match(NUMBER) ?? []);
  const unsourced = [...new Set((rewrite.match(NUMBER) ?? []).filter(n => !known.has(n)))];
  const issues = [...base.issues, ...unsourced.map(n => ({ code: 'NARRATIVE_NUMBER_UNSOURCED' as const, detail: `${n} is not a figure the fact-only narrative states.` }))];
  return { ok: issues.length === 0, issues };
}

/** Reconcile a narrative's text with the subject's ADaM facts. */
export function reconcileNarrative(text: string, facts: SubjectFacts): NarrativeReconciliation {
  const issues: NarrativeIssue[] = [];
  if (typeof text !== 'string' || !text.trim()) return { ok: false, issues: [{ code: 'NARRATIVE_EMPTY', detail: 'The narrative is empty.' }] };
  for (const m of all(NON_ISO_DATE, text)) issues.push({ code: 'NARRATIVE_DATE_UNSOURCED', detail: `"${m[0]}" is not an ISO 8601 date as the rows record it, so it cannot be reconciled.` });
  for (const sentence of sentences(text)) checkSentence(sentence, facts, issues);
  checkEvents(text, facts, issues);
  checkSubject(text, facts, issues);
  return { ok: issues.length === 0, issues };
}
