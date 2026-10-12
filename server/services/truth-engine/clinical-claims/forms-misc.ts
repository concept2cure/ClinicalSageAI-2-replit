/**
 * Prose forms for exposure (ICH E1 extent of exposure), baseline demographics
 * and laboratory-abnormality lines (design §12.7 phase D: lu-05, pvs-17, lu-32,
 * lu-23, lu-24). Each is its own measure: a duration threshold (≥24 weeks) is a
 * subset with its own frame, a demographic percentage describes the population
 * (never an adverse-event rate), and a laboratory shift is not an AE term.
 */
import { armOf, ARM, ARM_HEAD } from './items';
import { consume, isConsumed, makeDraft, type Env } from './env';
import type { Ctx, Draft } from './context';
import { APPROX_OR_BOUND, readNumber, type WrittenNumber } from './number';
import type { ArmRef } from './types';
import type { Sentence, Span } from './segment';
import { termKey } from './vocabulary';

const NUM = String.raw`(?:\d{1,3}(?:[,  ]\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)`;

/** Phrases that define a demographic or exposure measure; blanked before the clause's scope is read. */
export const MEASURE_PHRASES: RegExp[] = [
  /\b(?:were|was)\s+(?:women|female|male|men|White|Black(?:\s+or\s+African\s+American)?|Asian)\b/gi,
  /\b(?:identified\s+as\s+)?Hispanic\s+or\s+Latino(?:\s+ethnicity)?\b/gi,
  /\bEthnicity:/gi,
  // A race in a demographic line ("Race: White 435 (71.1%), Black or African American 49 (8.0%)") is the measure; the same
  // words before "patients" name a subgroup and are never blanked (r1 sp-12).
  /\bRace:\s*White\b|\bBlack\s+or\s+African\s+American(?=\s+\d)|\bAsian\s+\d/gi,
  /\b(?:mean\s+(?:\(SD\)\s+)?)?age\s+was\b|\bMean\s+\(SD\)\s+age\b/gi,
  /\bduration\s+of\s+(?:diabetes|exposure)\b|\bDuration\s+of\s+exposure\b/gi,
  /\bAt\s+baseline,/gi,
  /\b(?:were\s+)?exposed\s+for\s+at\s+least\s+\d+\s+(?:weeks|months)\b|\bfor\s+at\s+least\s+\d+\s+(?:weeks|months)\b|\bfor\s+\d+\s+months\s+or\s+longer\b|(?:>=|≥)\s*\d+\s+(?:weeks|months)\b/gi,
  /\b(?:Cumulative|total)\s+exposure\b/gi,
  /\bany\s+grade\b|\bGrades?\s+3(?:\s*-\s*4|\s+or\s+4)\b/gi,
  // A predicate of the randomized count, not a scope for the paragraph (euc-08).
  /\b(?:were|was)\s+randomi[sz]ed\s+and\s+included\s+in\s+the\s+(?:full\s+analysis\s+set|FAS|ITT\s+population|intent-to-treat\s+population)\b/gi,
];

const rdW = (s: string, env: Env, countSlot = false): WrittenNumber | undefined => readNumber(s.trim(), { convention: env.doc.convention, countSlot }) ?? undefined;

function threshold(s: string): string | null {
  const m = /(\d+)\s+(weeks|months)/i.exec(s);
  return m ? `>=${m[1]}${m[2].toLowerCase().startsWith('w') ? 'w' : 'm'}` : null;
}

/** The arm an exposure sentence is about: "Of the A-treated patients,", "exposure to A", "received A", "Duration of exposure, A:". */
function exposureArm(text: string): ArmRef | undefined {
  const m =
    new RegExp(String.raw`\bOf\s+the\s+(${ARM_HEAD})-treated\s+patients\b`, 'i').exec(text) ??
    // The active voice: "541 dapralutide-treated patients were exposed for at least 24 weeks" says
    // whose figure it is in the same words as "Of the dapralutide-treated patients, 541 were exposed
    // …", which was read already. A rule that fires on one of two interchangeable phrasings of the
    // same sentence is not a gate (r2 lbl-10).
    new RegExp(String.raw`\b(${ARM_HEAD})-treated\s+(?:patients|subjects|participants)\b`, 'i').exec(text) ??
    new RegExp(String.raw`\bDuration\s+of\s+exposure,\s+(${ARM})\s*:`, 'i').exec(text) ??
    new RegExp(String.raw`\bexposure\s+to\s+(${ARM})\b`, 'i').exec(text) ??
    new RegExp(String.raw`\breceived\s+(${ARM})\s+for\b`, 'i').exec(text);
  return m ? armOf(m[1]) ?? undefined : undefined;
}

export function exposureForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  if (!/exposure|exposed|patient-years|received\s+\S+\s+for\s+\d+\s+months/i.test(env.sentence.text)) return out;
  const arm = exposureArm(text) ?? exposureArm(env.sentence.text) ?? env.state.exposureArm;
  if (arm) env.state.exposureArm = arm;
  const push = (form: string, key: Record<string, string>, value: Draft['value'], span: Span) => {
    if (isConsumed(env, span)) return;
    consume(env, span);
    out.push(makeDraft(form, 'exposure', key, value, span, ctx, env, { arm }));
  };
  let m: RegExpExecArray | null;
  // "Cumulative exposure to A was 2,134 patient-years", "total exposure to A amounted to 2,143 patient-years".
  const py = new RegExp(String.raw`\b(?:cumulative|total)\s+exposure\s+to\s+${ARM}\s+(?:was|amounted\s+to)\s+(${NUM})\s+patient-years`, 'gi');
  while ((m = py.exec(text)) !== null) {
    const at = base + m.index + m[0].lastIndexOf(m[1]);
    const w = rdW(m[1], env, true);
    if (w) push('EX-py', { kind: 'patient_years' }, { estimate: w }, { start: at, end: at + m[1].length });
  }
  // "541 were exposed for at least 24 weeks", "1,108 patients were exposed for at least 6 months and 812 for at least 12 months",
  // "812 patients received A for 12 months or longer".
  // The figure carries any approximation or bound written with it, so "more than 500 … were exposed
  // for at least 24 weeks" stays a lower bound and is never compared as a value (lu-06).
  const dur = new RegExp(
    String.raw`(${APPROX_OR_BOUND}${NUM})\s+(?:(?:[A-Za-z][\w-]*\s+)?(?:patients|subjects|participants)\s+)?(?:were\s+exposed|received\s+${ARM})?\s*for\s+(at\s+least\s+\d+\s+(?:weeks|months)|\d+\s+months\s+or\s+longer)`,
    'gi',
  );
  while ((m = dur.exec(text)) !== null) {
    const th = threshold(m[2]);
    const at = base + m.index;
    const w = rdW(m[1], env, true);
    if (th && w) push('EX-dur', { kind: 'duration', threshold: th }, { count: w }, { start: at, end: at + m[1].length });
  }
  // ">=12 weeks, 588 (96.1%); >=24 weeks, 514 (84.0%)".
  const thr = new RegExp(String.raw`(?:>=|≥)\s*(\d+\s+(?:weeks|months)),\s*(${NUM})(?:\s*\(\s*(${NUM})\s*%\s*\))?`, 'gi');
  while ((m = thr.exec(text)) !== null) {
    const th = threshold(m[1]);
    const at = base + m.index + m[0].indexOf(m[2], m[1].length + 2);
    const w = rdW(m[2], env, true);
    const pct = m[3] ? rdW(`${m[3]}%`, env) : undefined;
    if (th && w) push('EX-dur', { kind: 'duration', threshold: th }, { count: w, ...(pct ? { percent: pct } : {}) }, { start: at, end: at + m[0].length - m[0].indexOf(m[2], m[1].length + 2) });
  }
  // "the mean duration of exposure was 24.1 weeks", "mean (SD) 24.1 (4.0) weeks".
  const mean = new RegExp(String.raw`\bmean\s+(?:duration\s+of\s+exposure\s+was\s+|\(SD\)\s+)(${NUM})(\s*\(\s*${NUM}\s*\))?\s+weeks`, 'gi');
  while ((m = mean.exec(text)) !== null) {
    const at = base + m.index + m[0].indexOf(m[1], 5);
    const w = rdW(m[1], env);
    if (w) push('EX-mean', { kind: 'mean_duration' }, { estimate: w }, { start: at, end: at + m[1].length + (m[2]?.length ?? 0) });
  }
  return out;
}

const DEMO: Array<{ re: RegExp; kind: string; stat: 'percent' | 'mean' }> = [
  { re: new RegExp(String.raw`(${NUM})\s?%\s+were\s+(?:women|female)\b|(${NUM})\s+subjects\s*\(\s*(${NUM})\s?%\s*\)\s+were\s+female\b`, 'gi'), kind: 'female', stat: 'percent' },
  { re: new RegExp(String.raw`(${NUM})\s?%\s+were\s+White\b|\bWhite\s+(${NUM})\s*\(\s*(${NUM})\s?%\s*\)`, 'g'), kind: 'race:white', stat: 'percent' },
  { re: new RegExp(String.raw`(${NUM})\s?%\s+were\s+Black(?:\s+or\s+African\s+American)?|\bBlack\s+or\s+African\s+American\s+(${NUM})\s*\(\s*(${NUM})\s?%\s*\)`, 'g'), kind: 'race:black', stat: 'percent' },
  { re: new RegExp(String.raw`(${NUM})\s?%\s+were\s+Asian\b|\bAsian\s+(${NUM})\s*\(\s*(${NUM})\s?%\s*\)`, 'g'), kind: 'race:asian', stat: 'percent' },
  { re: new RegExp(String.raw`(${NUM})\s?%\s+identified\s+as\s+Hispanic\s+or\s+Latino|\bHispanic\s+or\s+Latino\s+(${NUM})\s*\(\s*(${NUM})\s?%\s*\)`, 'g'), kind: 'ethnicity:hispanic', stat: 'percent' },
  { re: new RegExp(String.raw`\b(?:the\s+)?mean\s+age\s+was\s+(${NUM})\s+years|\bMean\s+\(SD\)\s+age\s+was\s+(${NUM})\s*\(\s*${NUM}\s*\)\s+years`, 'gi'), kind: 'age', stat: 'mean' },
  { re: new RegExp(String.raw`\bmean\s+(?:\(SD\)\s+)?duration\s+of\s+diabetes\s+was\s+(${NUM})(?:\s*\(\s*${NUM}\s*\))?\s+years`, 'gi'), kind: 'diabetes_duration', stat: 'mean' },
  { re: new RegExp(String.raw`\bmean\s+BMI\s+(?:was\s+)?(${NUM})(?:\s*\(\s*${NUM}\s*\))?\s+kg\/m2`, 'gi'), kind: 'bmi', stat: 'mean' },
];

export function demographicForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  for (const row of DEMO) {
    row.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = row.re.exec(text)) !== null) {
      const at = base + m.index;
      const span = { start: at, end: at + m[0].length };
      if (isConsumed(env, span)) continue;
      let value: Draft['value'];
      if (row.stat === 'mean') {
        const raw = m.slice(1).find(Boolean)!;
        const w = rdW(raw, env);
        if (!w) continue;
        value = { estimate: w };
      } else if (m[1]) {
        const w = rdW(`${m[1]}%`, env);
        if (!w) continue;
        value = { percent: w };
      } else {
        const c = rdW(m[2], env, true);
        const p = rdW(`${m[3]}%`, env);
        if (!c || !p) continue;
        value = { count: c, percent: p };
      }
      consume(env, span);
      const d = makeDraft('DEM', 'demographic', { kind: row.kind }, value, span, ctx, env, { arm: { kind: 'total' } });
      d.own.subgroups = [];
      out.push(d);
    }
  }
  return out;
}

/** "Hemoglobin decreased (n=148): any grade 77 (52.0%), Grade 3-4 12 (8.1%)". */
export function labLineForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const m = /^\s*([A-Z][A-Za-z ]{2,40}?\s+(?:decreased|increased))\s*\(\s*n\s*=\s*(\d+)\s*\)\s*:\s*(.*)$/.exec(clause.text);
  if (!m) return out;
  const lab = termKey(m[1]);
  const restAt = clause.start + m[0].length - m[3].length;
  const parts = [...m[3].matchAll(/(any\s+grade|Grades?\s+3(?:\s*-\s*4|\s+or\s+4))\s+(\d+)\s*\(\s*(\d+(?:[.,]\d+)?)\s?%\s*\)/gi)];
  for (const p of parts) {
    const at = restAt + p.index!;
    const span = { start: at, end: at + p[0].length };
    if (isConsumed(env, span)) continue;
    consume(env, span);
    const grade = /any/i.test(p[1]) ? 'any' : 'grade3-4';
    const value: Draft['value'] = { count: rdW(p[2], env, true)!, percent: rdW(`${p[3]}%`, env)!, denominator: rdW(m[2], env, true)! };
    out.push(makeDraft('LAB-line', 'lab', { lab, grade }, value, span, ctx, env, { arm: { kind: 'total' } }));
  }
  const nAt = clause.start + m[0].indexOf(m[2], m[1].length);
  consume(env, { start: nAt, end: nAt + m[2].length });
  return out;
}

export function miscForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  return [...labLineForms(clause, ctx, env), ...exposureForms(clause, ctx, env), ...demographicForms(clause, ctx, env)];
}
