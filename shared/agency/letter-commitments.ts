/**
 * The commitments an agency letter imposes, found in its text without a model
 * (P-81 "extract commitments"; P-84). It finishes the `extract-commitments`
 * capability registered in server/services/ana-capability-registry.ts, on the
 * same path as the letter's questions (shared/agency/letter-questions.ts, G3):
 * the Agency inbox proposes what this returns, and a person records each one,
 * with a reason, in the commitments register.
 *
 * What it reads is the shape FDA uses in an approval letter. A section heading
 * names the kind and its legal basis:
 *   POSTMARKETING REQUIREMENTS UNDER 505(o)                      → PMR, FDCA 505(o)(3)
 *   PEDIATRIC (RESEARCH EQUITY ACT) REQUIREMENTS / PREA          → PMR, PREA (FDCA 505B)
 *   ACCELERATED APPROVAL REQUIREMENTS / SUBPART H                → PMR, 21 CFR 314.510 / 601.41
 *   POSTMARKETING COMMITMENTS SUBJECT TO … SECTION 506B          → PMC, FDCA 506B
 *   POSTMARKETING COMMITMENTS NOT SUBJECT TO … 506B              → PMC, not reportable under 506B
 * Under it, each item opens a line with its number, as FDA numbers them
 * ("4321-1  Conduct a randomized …"), and runs to its schedule
 * ("Final Protocol Submission: 09/2026" … "Final Report Submission: 06/2029"),
 * the next item, the next heading or the letter's closing.
 *
 * Each commitment is returned verbatim: `text` is exactly
 * `letter.slice(start, end)`. Its due date is the schedule's final report
 * submission (or its last dated milestone), read as the last day of that month
 * when only a month is given: a date the letter states, never one inferred.
 * An EU Annex II, a PMDA approval condition or a REMS is not read here; the
 * inbox says when a letter yields none, and a person records it by hand.
 *
 * @module shared/agency/letter-commitments
 */

export type LetterCommitmentType = 'pmr' | 'pmc';

export interface LetterCommitmentMilestone {
  /** The milestone as the letter names it: "Final Report Submission". */
  label: string;
  /** Its date as the letter writes it: "06/2029". */
  when: string;
  /** That date as ISO (YYYY-MM-DD), or null when the letter's form is not a date. */
  date: string | null;
}

export interface LetterCommitment {
  /** The agency's number for it: "4321-1". */
  ref: string;
  commitmentType: LetterCommitmentType;
  /** The legal basis its section names. */
  basis: string;
  /** Its words, exactly as they stand in the letter. */
  text: string;
  /** Offsets into the letter text: `text === letter.slice(start, end)`. */
  start: number;
  end: number;
  milestones: LetterCommitmentMilestone[];
  /** The final report submission's date, else the last dated milestone's; null when none is dated. */
  dueDate: string | null;
}

const SECTIONS: Array<{ test: RegExp; commitmentType: LetterCommitmentType; basis: string }> = [
  { test: /POST-?MARKETING\s+COMMITMENTS?\s+NOT\s+SUBJECT\s+TO/i, commitmentType: 'pmc', basis: 'Postmarketing commitment, not subject to FDCA 506B reporting' },
  { test: /POST-?MARKETING\s+COMMITMENTS?\s+SUBJECT\s+TO/i, commitmentType: 'pmc', basis: 'FDCA 506B' },
  { test: /POST-?MARKETING\s+REQUIREMENTS?\s+UNDER\s+(?:SECTION\s+)?505\s*\(o\)/i, commitmentType: 'pmr', basis: 'FDCA 505(o)(3)' },
  { test: /PEDIATRIC\s+(?:RESEARCH\s+EQUITY\s+ACT\b|REQUIREMENTS?\b)|\bPREA\b/i, commitmentType: 'pmr', basis: 'PREA (FDCA 505B)' },
  { test: /ACCELERATED\s+APPROVAL\s+(?:REQUIREMENTS?|CONFIRMATORY)|\bSUBPART\s+[HE]\b/i, commitmentType: 'pmr', basis: '21 CFR 314.510 / 601.41' },
];

/** A heading is a line of capitals (as FDA sets them), not a sentence that mentions the words. */
function isHeading(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.8;
}

/** An item opens a line with FDA's number ("4321-1"), then its words. */
const ITEM = /^[ \t]*(\d{3,6}-\d{1,3})[ \t]+(?=\S)/;

const MILESTONE = /^[ \t]*(Draft Protocol Submission|Final Protocol Submission|Study Completion|Trial Completion|Interim (?:Analysis|Report)(?: Submission)?|Final Report Submission|Other)[ \t]*:[ \t]*(\S.*?)[ \t]*$/i;

/** The schedule's lead-in: the description ends where it begins. */
const SCHEDULE_INTRO = /^[ \t]*(?:the timetable you submitted|according to the following (?:time)?schedule|you will conduct this|submit (?:the|your) (?:protocol|final report))/i;

/** The letter's closing (as for the questions): nothing after it is a commitment. */
const CLOSING = /^[ \t]*(?:sincerely|regards|respectfully|if you have any questions|\{?see appended electronic signature)/i;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A milestone's date as the letter writes it, as ISO; a month alone is its last day. */
export function milestoneDate(when: string): string | null {
  const s = when.trim();
  let m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) { const mo = Number(m[1]); const y = Number(m[2]); return mo >= 1 && mo <= 12 ? `${y}-${pad(mo)}-${pad(lastDay(y, mo))}` : null; }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const mo = Number(m[1]); const d = Number(m[2]); const y = Number(m[3]);
    return mo >= 1 && mo <= 12 && d >= 1 && d <= lastDay(y, mo) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = /^([A-Za-z]+)\s+(?:(\d{1,2}),\s*)?(\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    if (!mo) return null;
    const y = Number(m[3]);
    const d = m[2] ? Number(m[2]) : lastDay(y, mo);
    return d >= 1 && d <= lastDay(y, mo) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}

interface Line { text: string; start: number; end: number }

function linesOf(letter: string): Line[] {
  const out: Line[] = [];
  const re = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(letter)) !== null) {
    if (m[0] === '' && m.index >= letter.length) break;
    const body = m[0].replace(/(?:\r\n|\r|\n)$/, '');
    out.push({ text: body, start: m.index, end: m.index + body.length });
    if (m[0] === '') re.lastIndex += 1;
  }
  return out;
}

interface Open {
  ref: string; commitmentType: LetterCommitmentType; basis: string;
  start: number; end: number; describing: boolean; milestones: LetterCommitmentMilestone[];
}

function finish(letter: string, open: Open): LetterCommitment {
  const raw = letter.slice(open.start, open.end);
  const end = open.start + raw.replace(/\s+$/, '').length;
  const finalReport = open.milestones.find((ms) => /final report/i.test(ms.label) && ms.date);
  const lastDated = [...open.milestones].reverse().find((ms) => ms.date);
  return {
    ref: open.ref, commitmentType: open.commitmentType, basis: open.basis,
    text: letter.slice(open.start, end), start: open.start, end,
    milestones: open.milestones, dueDate: (finalReport ?? lastDated)?.date ?? null,
  };
}

export function splitLetterCommitments(letter: string): LetterCommitment[] {
  const out: LetterCommitment[] = [];
  let section: (typeof SECTIONS)[number] | null = null;
  let open: Open | null = null;
  let blanks = 0;
  const close = () => { if (open && open.end > open.start) out.push(finish(letter, open)); open = null; };

  for (const line of linesOf(letter)) {
    if (CLOSING.test(line.text)) { close(); section = null; continue; }
    if (isHeading(line.text)) {
      const named = SECTIONS.find((s) => s.test.test(line.text));
      close();
      section = named ?? null;
      continue;
    }
    const item = section ? ITEM.exec(line.text) : null;
    if (item && section) {
      close();
      open = { ref: item[1], commitmentType: section.commitmentType, basis: section.basis,
        start: line.start + item[0].length, end: line.end, describing: true, milestones: [] };
      blanks = 0;
      continue;
    }
    if (!open) continue;
    const ms = MILESTONE.exec(line.text);
    if (ms) {
      open.describing = false;
      open.milestones.push({ label: ms[1], when: ms[2], date: milestoneDate(ms[2]) });
      continue;
    }
    if (SCHEDULE_INTRO.test(line.text)) { open.describing = false; continue; }
    if (line.text.trim() === '') { blanks += 1; if (blanks >= 1 && open.milestones.length) open.describing = false; continue; }
    blanks = 0;
    if (open.describing) open.end = line.end;
  }
  close();
  return out;
}
