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
 *   - death, died or fatal only where the rows record a death;
 *   - for a withdrawal ADSL records per subject only (D17, 2026-10-30), the
 *     TEAEs on or before it are events like any other, the statement that the
 *     data do not record which one led to it must stand, and no sentence may
 *     tie the withdrawal to a cause: a named event, or a causal phrase beside
 *     a withdrawal word ("withdrawn due to …", "this led to discontinuation").
 * It does not judge free clinical wording beyond these, and it cannot tell
 * that a model invented an unlisted clinical detail in words with no date,
 * day or number; that is why the model writes connective prose only and the
 * template stays the fallback.
 */
import type { EventFacts, SubjectFacts } from './narrative-subject-facts.js';

export type NarrativeIssueCode =
  | 'NARRATIVE_DATE_UNSOURCED' | 'NARRATIVE_DAY_UNSOURCED' | 'NARRATIVE_ONSET_MISMATCH' | 'NARRATIVE_ONSET_MISSING'
  | 'NARRATIVE_EVENT_MISSING' | 'NARRATIVE_AGE_MISMATCH' | 'NARRATIVE_GRADE_MISMATCH' | 'NARRATIVE_SEVERITY_MISMATCH'
  | 'NARRATIVE_DEATH_UNSOURCED' | 'NARRATIVE_NUMBER_UNSOURCED' | 'NARRATIVE_EMPTY'
  | 'NARRATIVE_CAUSE_UNSOURCED' | 'NARRATIVE_CAUSE_STATEMENT_MISSING';
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
const WITHDRAWAL = /\b(withdr[a-z]*|discontinu[a-z]*|stopp?(?:ed|ing)?|dropped out|left the study)\b/i;
/**
 * Causal, consequential and sequencing words: beside a withdrawal word each ties the withdrawal to something
 * (review 2026-10-30: "withdrawn for <event>", "followed by", "then", "in response to", "necessitated" and
 * "required" passed the first gate). Strict on purpose: a refused rewrite costs model prose, never the narrative.
 */
const CAUSAL = /\b(due to|because|owing to|as a result|result(?:ed|s|ing)? in|led to|lead(?:s|ing)? to|caus(?:e|ed|es|ing)|prompt(?:ed|s|ing)?|secondary to|attribut(?:ed|able)|on account of|triggered|responsible|follow(?:ed|s|ing)?|after|for|reasons?|why|in (?:view|light|response|consequence) (?:of|to)|necessitat[a-z]*|requir[a-z]*|consequen[a-z]*|then|subsequent(?:ly)?|thereafter|hence|therefore|thus|so|since|as|given|warrant[a-z]*|justif[a-z]*)\b/i;
/** The one sentence the template uses to say the data do not name the cause (narrative-compose.ts WITHDRAWAL_CAUSE_NOT_RECORDED). */
export const WITHDRAWAL_CAUSE_NOT_RECORDED = 'The data do not record which adverse event led to withdrawal.';
const NO_CAUSE = WITHDRAWAL_CAUSE_NOT_RECORDED.toLowerCase();

/** The template's withdrawal sentence, built here so the gate can recognise it exactly (narrative-compose.ts uses it). */
export function withdrawalStatement(w: { date?: string; day?: number }): string {
  const when = w.date ? ` on ${w.date}${w.day !== undefined ? ` (study day ${w.day})` : ''}` : w.day !== undefined ? ` on study day ${w.day}` : '';
  return `The subject was withdrawn for an adverse event${when}.`;
}
/** The template's sentence for a TEAE with no recorded onset (narrative-compose.ts uses it). */
export const undatedStatement = (term: string) => `The onset of ${term} is not recorded, so its timing relative to the withdrawal is unknown.`;

const lower = (s: string) => s.toLowerCase();
const sentences = (text: string) => text.split(/(?<=[.;])\s+|\n+/).map(s => s.trim()).filter(Boolean);
const all = (re: RegExp, s: string) => [...s.matchAll(re)];

function eventDates(e: EventFacts) { return new Set([e.onsetDate, e.endDate].filter((x): x is string => !!x)); }
function eventDays(e: EventFacts) { return new Set([e.onsetDay, e.endDay].filter((x): x is number => x !== undefined)); }

/** Every event the narrative may name: the qualifying events and, for a subject-level withdrawal, the TEAEs listed with it. */
const narratedEvents = (f: SubjectFacts): EventFacts[] => [...f.events, ...(f.withdrawal?.events ?? []), ...(f.withdrawal?.undated ?? [])];

function subjectDates(f: SubjectFacts): Set<string> {
  const dates = new Set([f.firstDoseDate, f.lastDoseDate, f.deathDate, f.withdrawal?.date].filter((x): x is string => !!x));
  for (const e of narratedEvents(f)) for (const d of eventDates(e)) dates.add(d);
  return dates;
}
function subjectDays(f: SubjectFacts): Set<number> {
  const days = new Set([f.deathDay, f.withdrawal?.day].filter((x): x is number => x !== undefined));
  for (const e of narratedEvents(f)) for (const d of eventDays(e)) days.add(d);
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
  const named = eventsIn(sentence, narratedEvents(f));
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
  for (const e of narratedEvents(f)) {
    const withTerm = parts.filter(s => lower(s).includes(lower(e.term)));
    if (!withTerm.length) { issues.push({ code: 'NARRATIVE_EVENT_MISSING', detail: `${e.term} is not described.` }); continue; }
    const onsetStated = withTerm.some(s => (e.onsetDay !== undefined && all(DAY, s).some(m => Number(m[1]) === e.onsetDay))
      || (!!e.onsetDate && s.includes(e.onsetDate)));
    if ((e.onsetDay !== undefined || e.onsetDate) && !onsetStated) issues.push({ code: 'NARRATIVE_ONSET_MISSING', detail: `The recorded onset of ${e.term} is not stated with it.` });
  }
}

function checkSubject(text: string, f: SubjectFacts, issues: NarrativeIssue[]) {
  for (const m of all(AGE, text)) if (Number(m[1]) !== f.age) issues.push({ code: 'NARRATIVE_AGE_MISMATCH', detail: `${m[1]} years is not the recorded age.` });
  const grades = new Set(narratedEvents(f).map(e => e.grade).filter((g): g is number => g !== undefined));
  for (const m of all(GRADE, text)) if (!grades.has(Number(m[1]))) issues.push({ code: 'NARRATIVE_GRADE_MISMATCH', detail: `Grade ${m[1]} is not a recorded toxicity grade.` });
  const deathRecorded = f.categories.includes('death') || narratedEvents(f).some(e => e.outcome === 'fatal' || e.seriousnessCriteria.includes('death'));
  if (DEATH.test(text) && !deathRecorded) issues.push({ code: 'NARRATIVE_DEATH_UNSOURCED', detail: 'The narrative states a death the rows do not record.' });
}

/**
 * A withdrawal recorded per subject names no event as its cause (D17): the
 * statement saying so must stand, and no sentence may attribute the
 * withdrawal, to a named event or through a causal phrase.
 */
function checkWithdrawalCause(text: string, f: SubjectFacts, issues: NarrativeIssue[]) {
  const w = f.withdrawal;
  if (!w) return;
  if (!lower(text).includes(NO_CAUSE)) issues.push({ code: 'NARRATIVE_CAUSE_STATEMENT_MISSING', detail: 'The narrative must state that the data do not record which adverse event led to withdrawal.' });
  // The template's own sentences, exactly as composed from these facts, are the only ones that may join a withdrawal word to these words.
  const exempt = new Set([NO_CAUSE, withdrawalStatement(w), ...w.undated.map(e => undatedStatement(e.term)),
    ...(f.discontinuationReason ? [`The recorded reason for discontinuation was ${f.discontinuationReason.toLowerCase()}.`] : [])].map(lower));
  const events = narratedEvents(f);
  for (const s of sentences(text)) {
    if (exempt.has(lower(s))) continue;
    const named = eventsIn(s, events);
    // An event term is not a withdrawal or causal word ("Drug withdrawal syndrome"): test the sentence without the terms.
    const rest = events.reduce((acc, e) => acc.split(lower(e.term)).join(' '), lower(s));
    if (!WITHDRAWAL.test(rest)) continue;
    if (named.length || CAUSAL.test(rest)) {
      issues.push({ code: 'NARRATIVE_CAUSE_UNSOURCED', detail: `"${s}" ${named.length ? `places ${named[0].term} beside` : 'attributes'} the withdrawal; ADSL records it per subject and no ADAE event records which event led to it.` });
    }
  }
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
  checkWithdrawalCause(text, facts, issues);
  return { ok: issues.length === 0, issues };
}
