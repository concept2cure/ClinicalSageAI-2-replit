/**
 * Prose forms for disposition (design §6.2, D forms; F2, F5, F19, C2).
 *
 * "randomized" in either voice is one measure (F5, F19); "received at least one
 * dose", "treated", "safety set" and "exposed to" are one population (C2), but
 * "treated with rescue medication / for hypoglycaemia" is never the treated
 * population (F2). A count followed by "to <arm>" is per arm; an arm list in
 * the same clause binds per-arm counts; a ratio ("1:1") never does. A population
 * size ("(N=574; 287 per arm)", "Full analysis set: 612") is a count of that
 * population, compared only with the same population (ITT ≡ FAS only when both
 * are defined as all randomized, C3).
 */
import { aliasesOf } from './doc';
import { armOf, ARM, ARM_HEAD, itemsIn , subgroupsIn } from './items';
import { consume, isConsumed, makeDraft, type Env } from './env';
import { populationOf, type Ctx, type Draft } from './context';
import { NUMBER_WORDS, readNumber, type WrittenNumber } from './number';
import { qualsOf } from './quals';
import type { ArmRef, PopulationSet } from './types';
import type { Sentence, Span } from './segment';

const CNT = String.raw`(?:\d{1,3}(?:[\u00a0\u202f\u2009 ,.]\d{3})+(?![\d.,]?\d)|\d+|${NUMBER_WORDS})`;
const NOUN = String.raw`(?:adult\s+|pediatric\s+)?(?:patients|subjects|participants)`;
const NOUN_WITH = String.raw`${NOUN}(?:\s+with\s+[^,.;()]{3,90}?)?`;

/** Kind of count → measure label population. */

function popFor(kind: string, doc: Env['doc']): { pop: string; population: ReturnType<typeof populationOf> } {
  if (kind === 'treated') return { pop: 'treated', population: populationOf('treated', doc) };
  if (kind === 'randomized') return { pop: 'randomized', population: populationOf('randomized', doc) };
  return { pop: kind, population: populationOf(kind as PopulationSet, doc) };
}

/** Per-arm counts of an arm list: "(306 to A and 306 to B)", "(A: 306; B: 306)", "(A n=311) or B (n=310)", "(A, n=818; B, n=409)", "(A 306, B 306)". */
export function armCountsIn(list: string, at: number, env: Env): Array<{ arm: ArmRef; count: WrittenNumber; span: Span; percent?: WrittenNumber }> | null {
  if (/\b\d+\s*:\s*\d+\b/.test(list) && !/[A-Za-z]\s*:\s*\d/.test(list)) return null; // a ratio, not counts
  const items = itemsIn(list, at, env.doc, { counts: true }).filter((i) => i.count);
  if (items.length < 1) return null;
  const out: Array<{ arm: ArmRef; count: WrittenNumber; span: Span; percent?: WrittenNumber }> = [];
  for (const it of items) {
    let arm = it.arm;
    if (!arm) {
      // "(n=311)" after an arm name: "to nerantib (n=311) or placebo (n=310)".
      const before = env.doc.text.slice(Math.max(0, it.start - 50), it.start);
      const m = new RegExp(String.raw`(${ARM})\s*[(,]\s*n\s*=\s*$`, 'i').exec(before) ?? new RegExp(String.raw`(${ARM})\s*,?\s*n\s*=\s*$`, 'i').exec(before);
      if (m) arm = armOf(m[1]) ?? undefined;
    }
    if (!arm) {
      // "306 to orbaglutide": the item's own "to <arm>".
      const after = env.doc.text.slice(it.end, it.end + 60);
      const m = new RegExp(String.raw`^\s*(?:were\s+assigned\s+)?(?:to|received)\s+(${ARM})`, 'i').exec(after);
      if (m) arm = armOf(m[1]) ?? undefined;
    }
    if (!arm) return null;
    out.push({ arm, count: it.count!, span: it, ...(it.percent ? { percent: it.percent } : {}) });
  }
  return out;
}

export function dispositionForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  const rd = (s: string) => readNumber(s, { convention: env.doc.convention, countSlot: true }) ?? undefined;
  const add = (kind: string, count: WrittenNumber | undefined, span: Span, arm: ArmRef, extra: Partial<Draft> = {}, percent?: WrittenNumber) => {
    if (!count || isConsumed(env, span)) return;
    consume(env, span);
    const { pop, population } = popFor(kind, env.doc);
    const d = makeDraft(`D-${kind}`, 'n', { pop }, { count, ...(percent ? { percent } : {}) }, span, ctx, env, { arm, ...extra, own: { ...(extra.own ?? {}) } });
    d.own.population = population;
    out.push(d);
  };
  const addArms = (kind: string, list: string, listAt: number, extra: Partial<Draft> = {}) => {
    // "(306 per treatment group: obrelimab or placebo)": the same count for each named arm.
    const per = new RegExp(String.raw`^\s*(${CNT})\s+per\s+(?:treatment\s+)?(?:group|arm)\s*:\s*(${ARM})\s+(?:or|and)\s+(${ARM})\s*$`, 'i').exec(list);
    if (per) {
      const a1 = armOf(per[2]);
      const a2 = armOf(per[3]);
      const at = listAt + per[0].indexOf(per[1]);
      const span = { start: at, end: at + per[1].length };
      if (!a1 || !a2 || isConsumed(env, span)) return false;
      consume(env, span);
      for (const a of [a1, a2]) {
        const d = makeDraft(`D4-per`, 'n', { pop: popFor(kind, env.doc).pop }, { count: rd(per[1])! }, span, ctx, env, { arm: a, ...extra, own: { ...(extra.own ?? {}) } });
        d.own.population = popFor(kind, env.doc).population;
        out.push(d);
      }
      env.state.lastArms = [a1, a2];
      return true;
    }
    // "(306 per arm)": the same count for each arm the sentence, paragraph or source names; a source that names no arm
    // leaves the count's arm unidentified (C8: an arm is never borrowed from another document) (r1 pv-per-arm-shorthand).
    const bare = new RegExp(String.raw`^\s*(${CNT})\s+per\s+(?:treatment\s+)?(?:arm|group)\s*$`, 'i').exec(list);
    if (bare) {
      const at = listAt + bare[0].indexOf(bare[1]);
      const span = { start: at, end: at + bare[1].length };
      if (isConsumed(env, span)) return false;
      consume(env, span);
      const roster = [...env.doc.roster.values()];
      const rosterArms: ArmRef[] | undefined =
        roster.length === 2 && roster.every((r) => r.doses.size === 0) ? roster.map((r) => ({ kind: 'arm' as const, drug: r.drug, label: r.drug })) : undefined;
      const arms = env.sentenceArms ?? ctx.armOrder ?? env.state.armOrder ?? rosterArms;
      for (const a of arms && arms.length >= 2 ? arms : [undefined]) {
        const d = makeDraft('D4-per-arm', 'n', { pop: popFor(kind, env.doc).pop }, { count: rd(bare[1])! }, span, ctx, env, { arm: a, ...extra, own: { ...(extra.own ?? {}) } });
        d.own.population = popFor(kind, env.doc).population;
        if (!a) d.issues.push({ reason: 'arm_unidentified', slot: 'arm', detail: `"${bare[0].trim()}": the source names no arm for "per arm" to apply to (C8).` });
        out.push(d);
      }
      return true;
    }
    const arms = armCountsIn(list, listAt, env);
    if (!arms) return false;
    for (const a of arms) add(kind, a.count, a.span, a.arm, { ...extra, own: { ...(extra.own ?? {}) } }, a.percent);
    env.state.lastArms = arms.map((a) => a.arm);
    return true;
  };
  const listAfter = (from: number): { list: string; at: number } | null => {
    const rest = text.slice(from);
    // A scope phrase may stand between the count and its arm list ("randomised in Japan (102 Drug X, 102 placebo)",
    // "randomised under the original protocol (…)", "204 patients in the second stage (…)"): the list is the per-arm split.
    const m = /^\s*(?:in\s+(?:Study\s+[\w-]+|the\s+study|a\s+\d:\d\s+ratio)\s*|(?:in|at|under|after|before|during)\s+[A-Za-z][^().;,:]{0,50}?\s*)?(?:\(\s*\d:\d\s*\)\s*)?(?:in\s+a\s+\d:\d\s+ratio\s*)?\((?!\s*\d:\d\s*\))([^()]*(?:\([^()]*\)[^()]*)*)\)/.exec(rest);
    if (m) return { list: m[1], at: base + from + m[0].indexOf(m[1]) };
    const colon = /^\s*:\s*([^;.]*)/.exec(rest);
    if (colon && /\bto\b/.test(colon[1])) return { list: colon[1], at: base + from + colon[0].indexOf(colon[1]) };
    const to = new RegExp(String.raw`^\s*(?:\(\s*\d:\d\s*\)\s*|\d:\d\s+|in\s+a\s+\d:\d\s+ratio\s+)?to\s+(?:receive\s+)?((?:${ARM})\s*\(\s*n\s*=\s*\d[\d,. ]*\)\s*(?:or|and)\s*(?:${ARM})\s*\(\s*n\s*=\s*\d[\d,. ]*\))`, 'i').exec(rest);
    if (to) return { list: to[1], at: base + from + to[0].indexOf(to[1]) };
    return null;
  };

  /**
   * A window written right after a count's own verb ("388 patients were randomized after Protocol Amendment 3",
   * "204 patients were randomised under the original protocol") is the count's own period: randomization takes a
   * period only from its own words, never from a lead sentence (euc-08) or a neighbouring step (sbx-035 run-in).
   */
  const tailOwn = (from: number): Partial<Draft> => {
    const rest = text.slice(from);
    const stop = rest.search(/[.;(]|,\s|$/);
    const tail = rest.slice(0, stop < 0 ? rest.length : stop);
    if (!tail.trim()) return {};
    const q = qualsOf(tail, base + from, env.doc);
    return q.period ? { own: { period: q.period } } : {};
  };
  let m: RegExpExecArray | null;
  // Planned / approximate figures are never counts of the population.
  for (const p of text.matchAll(/\b(?:Approximately|approximately|about|ca\.)\s+(\d[\d,. ]*)\s+(?:subjects|patients)\s+were\s+planned\b|\bPlanned:\s*(\d[\d,. ]*)/g)) {
    const at = base + p.index! + p[0].indexOf(p[1] ?? p[2]);
    const span = { start: at, end: at + (p[1] ?? p[2]).trim().length };
    consume(env, span);
    const w = readNumber(/approx|about|ca\./i.test(p[0]) ? `approximately ${(p[1] ?? p[2]).trim()}` : (p[1] ?? p[2]).trim(), { convention: env.doc.convention, countSlot: true });
    if (w) {
      const d = makeDraft('D-planned', 'n', { pop: 'planned' }, { count: w }, span, ctx, env, { arm: { kind: 'total' } });
      d.issues.push({ reason: w.kind === 'approximate' ? 'approximate_value' : 'measure_unidentified', slot: 'measure', detail: 'A planned sample size is not a count of a population.' });
      out.push(d);
    }
  }

  // D1 passive: "[A total of] N <noun> (were|was|have been) randomized [to …]".
  // "621 patients in total were randomised" (word order), "a total of 621 patients (of 1,204 screened) were
  // randomised" (a parenthetical aside between the count and its verb) and "621 patients has been randomized"
  // (non-native agreement, ordinary in a translated CSR) are the same statement (r2 pv-n-in-total-were-randomised,
  // pv-randomised-paren-*-aside, pv-nonnative-has-been-randomized).
  const passive = new RegExp(
    String.raw`(?:^|[\s,;:(])(?:(?:A\s+total\s+of|a\s+total\s+of|in\s+total|Overall,)\s+)?(${CNT})\s+(?:${NOUN_WITH}\s+)?(?:(?:in\s+total|in\s+all)\s+)?(?:\([^()]*\)\s*)?(?:(?:were|was|have\s+been|had\s+been|has\s+been)\s+(?:subsequently\s+)?(?:randomi[sz]ed|randomly\s+(?:assigned|allocated)|(?:included|enrolled)\s+and\s+randomi[sz]ed)|underwent\s+randomi[sz]ation|were\s+randomi[sz]ed\s+and\s+included)\b`,
    'g',
  );
  while ((m = passive.exec(text)) !== null) {
    const numAt = m.index + m[0].indexOf(m[1]);
    const span = { start: base + numAt, end: base + numAt + m[1].length };
    // "(of 1,204 screened)", "(84 sites in 12 countries)": the aside belongs to this form, so its words are not
    // read as the figure's scope (r2 pv-randomised-paren-*-aside). Only its words are consumed, never its
    // figures: a figure no form reads is still reported, never dropped (F13).
    const aside = /\(([^()]*)\)\s*(?=(?:were|was|have\s+been|had\s+been|has\s+been|underwent)\b)/i.exec(m[0]);
    if (aside) {
      const at = m.index + aside.index;
      for (const w of aside[0].matchAll(/[^\d]+/g)) consume(env, { start: base + at + w.index!, end: base + at + w.index! + w[0].length });
    }
    const after = text.slice(m.index + m[0].length);
    const before = text.slice(0, numAt);
    // "In the Japanese subpopulation, 120 patients were randomized": the opener's subgroup is in the context.
    // "N were randomized to <A>" without "or" → per arm.
    const toArm = new RegExp(String.raw`^\s*to\s+(?:receive\s+)?(${ARM})(?!\s*(?:\(|,?\s*n\s*=|\s+or\b|\s+once\s+weekly\s+or|\s+\d))`, 'i').exec(after);
    if (toArm && !/\bor\b/.test(after.slice(0, 80))) {
      const arm = armOf(toArm[1]);
      if (arm) {
        add('randomized', rd(m[1]), span, arm);
        continue;
      }
    }
    if (/\b(?:planned|did\s+not)\b/i.test(after.slice(0, 30))) continue;
    // "306 subjects were randomised to each arm": a per-arm count, never a total (read below from the arm order).
    if (/^\s*to\s+each\s+(?:arm|group|treatment\s+group)\b/i.test(after)) continue;
    // "604 patients were randomised and treated": the treated set, never the randomized total (r1 sp-37).
    const andTreated = /^\s+and\s+(?:treated|dosed)\b/i.exec(after);
    const kind = andTreated ? 'treated' : 'randomized';
    const tail = tailOwn(m.index + m[0].length + (andTreated ? andTreated[0].length : 0));
    if (/\bof\s+whom\s*$/i.test(before) || /\bof\s+whom\b/i.test(before.slice(-20))) {
      add(kind, rd(m[1]), span, { kind: 'total' }, tail);
      continue;
    }
    add(kind, rd(m[1]), span, { kind: 'total' }, tail);
    // "(204 in Japan)": a regional N stated beside the study total is that region's own count, never the total's
    // scope and never the figure a regional N in another document is set against (r2 scope-10).
    const regional = new RegExp(String.raw`^\s*\(\s*(${CNT})\s+in\s+([^()]{2,60}?)\s*\)`, 'i').exec(text.slice(m.index + m[0].length));
    if (regional) {
      const subs = subgroupsIn(regional[2]);
      const at = base + m.index + m[0].length + regional[0].indexOf(regional[1]);
      if (subs.length > 0 && !/\b(?:[A-Z]{1,5}-\d{2,4}|NCT\d{8})\b/.test(regional[2])) {
        add(kind, rd(regional[1]), { start: at, end: at + regional[1].length }, { kind: 'total' }, { own: { subgroups: subs } });
      }
    }
    const l = listAfter(m.index + m[0].length + (andTreated ? andTreated[0].length : 0));
    if (l) addArms(kind, l.list, l.at, tail);
  }
  // "Randomization of 621 patients in Study NRX-301 was completed …": the nominalised verb (r1 pv-randomization-noun).
  const noun = new RegExp(String.raw`\bRandomi[sz]ation\s+of\s+(${CNT})\s+${NOUN}\b`, 'gi');
  while ((m = noun.exec(text)) !== null) {
    const numAt = m.index + m[0].indexOf(m[1]);
    add('randomized', rd(m[1]), { start: base + numAt, end: base + numAt + m[1].length }, { kind: 'total' });
  }

  /**
   * The randomized total written as a noun phrase, the way CSR section 10.1 usually writes it:
   * "the randomised population comprised 621 patients", "the total number of patients randomised was 621",
   * "patients were randomised in a 1:1 ratio (n = 621)" (r2 pv-randomised-population-comprised,
   * pv-total-number-randomised-was, pv-randomised-ratio-then-n-equals). Each is the study's randomized total.
   */
  const nominalised = [
    new RegExp(String.raw`\b(?:the\s+)?randomi[sz]ed\s+(?:population|set|analysis\s+set|cohort)(?:\s+of\s+Study\s+[\w-]+)?\s+(?:comprised|comprises|consisted\s+of|consists\s+of|included|contained|numbered|was\s+made\s+up\s+of)\s+(${CNT})\s+${NOUN}`, 'gi'),
    new RegExp(String.raw`\b(?:the\s+)?(?:total\s+)?number\s+of\s+(?:randomi[sz]ed\s+${NOUN}|${NOUN}\s+randomi[sz]ed)\s+(?:was|were|totalled|totaled|was\s+equal\s+to|came\s+to|amounted\s+to)\s+(${CNT})\b`, 'gi'),
    new RegExp(String.raw`\brandomi[sz]ed(?:\s+${NOUN})?(?:\s+in\s+a\s+\d+\s*:\s*\d+\s+ratio)?\s*\(\s*n\s*=\s*(${CNT})\s*\)`, 'gi'),
  ];
  for (const re of nominalised) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const numAt = m.index + m[0].indexOf(m[1]);
      const span = { start: base + numAt, end: base + numAt + m[1].length };
      if (isConsumed(env, span)) continue;
      add('randomized', rd(m[1]), span, { kind: 'total' });
    }
  }

  // D2 verb-first: "<subject> randomi[sz]ed [a total of] N <noun>", "we randomized 612 patients", "Study TNV-302 randomised 615 patients".
  const verbFirst = new RegExp(String.raw`\brandomi[sz]ed\s+(?:a\s+total\s+of\s+)?(${CNT})\s+${NOUN}\b`, 'g');
  while ((m = verbFirst.exec(text)) !== null) {
    const numAt = m.index + m[0].indexOf(m[1]);
    const span = { start: base + numAt, end: base + numAt + m[1].length };
    if (isConsumed(env, span)) continue;
    const before = text.slice(Math.max(0, m.index - 90), m.index);
    // The passive form already read "N patients were randomized"; but "In Study DX-301 were randomized 621
    // patients" — verb before subject, a Romance-language calque ordinary in a translated CSR — has no such
    // subject, and is the same statement (r2 pv-nonnative-inverted-subject).
    const passiveSubject = new RegExp(
      String.raw`(?:^|[\s,;:(])(?:${CNT})\s+(?:${NOUN_WITH}\s+)?(?:(?:in\s+total|in\s+all)\s+)?(?:\([^()]*\)\s*)?(?:were|was|have\s+been|had\s+been|has\s+been)\s+(?:subsequently\s+)?$`,
      'i',
    );
    if (/\b(?:of|who)\s*$/i.test(before) || passiveSubject.test(before)) continue;
    const after = text.slice(m.index + m[0].length);
    // "randomized 306 patients to obrelimab and 306 to placebo": per arm.
    const toArm = new RegExp(String.raw`^\s*to\s+(${ARM})\s+and\s+(${CNT})\s+to\s+(${ARM})`, 'i').exec(after);
    if (toArm) {
      const a1 = armOf(toArm[1]);
      const a2 = armOf(toArm[3]);
      const at2 = base + m.index + m[0].length + toArm[0].indexOf(toArm[2], toArm[1].length);
      if (a1) add('randomized', rd(m[1]), span, a1);
      if (a2) add('randomized', rd(toArm[2]), { start: at2, end: at2 + toArm[2].length }, a2);
      continue;
    }
    add('randomized', rd(m[1]), span, { kind: 'total' });
    const colon = /^\s*:\s*([^.;]*)/.exec(after);
    if (colon) addArms('randomized', colon[1], base + m.index + m[0].length + colon[0].indexOf(colon[1]));
    else {
      const l = listAfter(m.index + m[0].length);
      if (l) addArms('randomized', l.list, l.at);
    }
  }

  // D3 "Of the N (<noun>) randomi[sz]ed (<noun>)", "N of M randomized <noun>", "of whom N were (subsequently) randomised".
  const ofThe = new RegExp(String.raw`\bOf\s+(?:the\s+)?(${CNT})\s+(?:(?:${NOUN})\s+)?randomi[sz]ed\b`, 'gi');
  while ((m = ofThe.exec(text)) !== null) {
    const numAt = m.index + m[0].indexOf(m[1]);
    add('randomized', rd(m[1]), { start: base + numAt, end: base + numAt + m[1].length }, { kind: 'total' });
    // "Of the 621 subjects randomized, 311 were assigned to A and 310 to B": the per-arm split of that total (D4).
    const rest = text.slice(m.index + m[0].length);
    const split = new RegExp(String.raw`^\s*,\s*((${CNT})\s+(?:${NOUN}\s+)?were\s+(?:assigned|randomi[sz]ed)\s+to\s+(?:${ARM})\s+and\s+(?:${CNT})\s+to\s+(?:${ARM}))(?=\s*[.;,(]|\s*$)`, 'i').exec(rest);
    if (split) addArms('randomized', split[1], base + m.index + m[0].length + split[0].indexOf(split[1]));
    // "Of the 1,227 patients randomised in the two Phase 3 studies (612 in Study TNV-301 and 615 in Study TNV-302)":
    // each study's own randomized total, its study named by its own phrase (C1).
    const perStudy = new RegExp(String.raw`^\s*in\s+[^()]{0,80}?\(\s*(${CNT})\s+in\s+(?:Study\s+)?([A-Z]{1,5}-\d{2,4})\s+and\s+(${CNT})\s+in\s+(?:Study\s+)?([A-Z]{1,5}-\d{2,4})\s*\)`).exec(rest);
    if (perStudy) {
      const restAt = base + m.index + m[0].length;
      const at1 = perStudy[0].indexOf(perStudy[1], perStudy[0].indexOf('('));
      const at2 = perStudy[0].indexOf(perStudy[3], perStudy[0].indexOf(perStudy[2], at1) + perStudy[2].length);
      for (const [at, count, code] of [
        [at1, perStudy[1], perStudy[2]],
        [at2, perStudy[3], perStudy[4]],
      ] as const) {
        const span = { start: restAt + at, end: restAt + at + count.length };
        add('randomized', rd(count), span, { kind: 'total' }, { own: { study: { kind: 'study', aliases: aliasesOf(code, env.doc) } } });
      }
    }
  }
  const nOfM = new RegExp(String.raw`\b(${CNT})\s+of\s+(${CNT})\s+randomi[sz]ed\s+${NOUN}`, 'gi');
  while ((m = nOfM.exec(text)) !== null) {
    const at = base + m.index + m[0].indexOf(m[2], m[1].length);
    add('randomized', rd(m[2]), { start: at, end: at + m[2].length }, { kind: 'total' });
  }
  // "Of N subjects screened, 612 were randomized" handled by passive; screened totals here.
  const screened = new RegExp(String.raw`\b(?:Of\s+(?:the\s+)?)?(${CNT})\s+${NOUN}\s+(?:were\s+)?screened\b|\bScreened:\s*(${CNT})`, 'gi');
  while ((m = screened.exec(text)) !== null) {
    const g = m[1] ?? m[2];
    const numAt = m.index + m[0].indexOf(g);
    add('screened', rd(g), { start: base + numAt, end: base + numAt + g.length }, { kind: 'total' });
  }
  const enrolled = new RegExp(String.raw`\b(${CNT})\s+${NOUN}\s+were\s+enrolled\b(\s+into\s+the\s+[^,;.]*run-in)?|\bEnrolled:\s*(${CNT})`, 'gi');
  while ((m = enrolled.exec(text)) !== null) {
    const g = m[1] ?? m[3];
    const numAt = m.index + m[0].indexOf(g);
    const span = { start: base + numAt, end: base + numAt + g.length };
    add('enrolled', rd(g), span, { kind: 'total' }, m[2] ? { own: { period: 'run-in' } } : {});
  }

  // D5 treated: "N <noun> received at least one dose", "N were treated", "N (x%) received at least one dose",
  // "the safety population … comprised N patients", "These N patients form the safety population", "N patients were exposed to …".
  const treatedForms = [
    new RegExp(String.raw`(?:^|[\s,;:(])(?:of\s+whom\s+)?(${CNT})(?:\s*\(\s*([\d.,]+\s*%)\s*\))?\s+(?:${NOUN_WITH}\s+)?(?:who\s+)?(?:received|were\s+treated\s+with)\s+(?:at\s+least\s+one|any)\s+dose\b`, 'gi'),
    new RegExp(String.raw`(?:^|[\s,;:(])(${CNT})\s+(?:${NOUN}\s+)?were\s+treated(?=\s*[.;,)]|\s*$)`, 'gi'),
    new RegExp(String.raw`\bsafety\s+(?:analysis\s+)?(?:population|set)(?:\s+of\s+Study\s+[\w-]+)?\s+comprised\s+(${CNT})\s+${NOUN}`, 'gi'),
    new RegExp(String.raw`\bThese\s+(${CNT})\s+${NOUN}\s+form\s+the\s+safety\s+population`, 'gi'),
    new RegExp(String.raw`(?:^|[\s,;:(])(${CNT})\s+${NOUN}\s+were\s+exposed\s+to\s+(?!.*\bfor\s+at\s+least\b)`, 'gi'),
    // The participle, with no "were": "…, including 621 patients exposed to dapralutide 1.5 mg once
    // weekly" — how a 21 CFR 201.57(c)(7) exposure sentence names the per-arm count (r2 lbl-08).
    new RegExp(String.raw`(?:^|[\s,;:(])(?:including\s+)?(${CNT})\s+${NOUN}\s+exposed\s+to\s+(?!.*\bfor\s+at\s+least\b)`, 'gi'),
    new RegExp(String.raw`\bin\s+which\s+(${CNT})\s+${NOUN_WITH}\s+received\s+(${ARM})`, 'gi'),
    // SmPC 4.8: "The safety of X has been evaluated in N patients" — the exposed (treated) set.
    new RegExp(String.raw`\bsafety\s+(?:of\s+[\w-]+(?:\s+[\w-]+){0,3}\s+)?(?:has\s+been|was|were)\s+(?:evaluated|assessed|studied)\s+in\s+(${CNT})\s+${NOUN}`, 'gi'),
    // The passive: "at least one dose of study drug was administered to 604", "604 patients were dosed" (r1).
    new RegExp(String.raw`\b(?:at\s+least\s+one|any)\s+dose\s+of\s+(?:study\s+(?:drug|treatment|medication)|the\s+study\s+drug)\s+was\s+(?:administered|given)\s+to\s+(${CNT})\b`, 'gi'),
    new RegExp(String.raw`(?:^|[\s,;:(])(${CNT})\s+(?:${NOUN}\s+)?were\s+dosed\b`, 'gi'),
  ];
  for (const re of treatedForms) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const g = m[1];
      const numAt = m.index + m[0].indexOf(g);
      const span = { start: base + numAt, end: base + numAt + g.length };
      const after = text.slice(m.index + m[0].length);
      if (/^\s*(?:with|for|by|using|in|on|as|at)\s+(?!at\s+least|least|study\s+drug|study\s+treatment)/i.test(after) && /were\s+treated$/.test(m[0])) continue;
      const pct = m[2] ? readNumber(m[2], { convention: env.doc.convention }) ?? undefined : undefined;
      // "304 patients received at least one dose of Drug X": the count of that arm, never the treated total. In a
      // single-arm source the arm is the total by the single-arm rule (compare.ts), never by this form (r1 sp-52).
      // "of tazoglitin or placebo" names every arm: the total (fs-05).
      const named = new RegExp(String.raw`^\s+of\s+(?:the\s+)?(${ARM})(?![\w-])(?!\s+(?:or|and)\s)`, 'i').exec(after);
      // An exposure sentence names its arm straight after "exposed to", with no "of": "621 patients
      // were exposed to dapralutide 1.5 mg and 607 patients were exposed to placebo" states two arm
      // counts, not the total twice (r2 lbl-08, lbl-09). Read as the total, the per-arm guard that
      // stops false conflicts (lu-25) then blocked the genuine per-arm comparison instead.
      // "exposed to dapralutide or placebo" names every arm, so that one stays the total (fs-05).
      const toArm = /exposed\s+to\s*$/i.test(m[0])
        ? new RegExp(String.raw`^\s*(?:the\s+)?(${ARM})(?![\w-])(?!\s+(?:or|and)\s)`, 'i').exec(after)
        : null;
      const namedArm = named ? armOf(named[1]) : toArm ? armOf(toArm[1]) : null;
      if (namedArm && (/dose$/.test(m[0]) || !!toArm)) {
        add('treated', rd(g), span, namedArm, {}, pct);
        continue;
      }
      add('treated', rd(g), span, { kind: 'total' }, {}, pct);
      // "1,219 patients received at least one dose of study drug: 612 received A and 607 received B".
      const colon = new RegExp(String.raw`^[^:;.]*?:\s*(${CNT})\s+received\s+(${ARM})\s+and\s+(${CNT})\s+received\s+(${ARM})`, 'i').exec(after);
      if (colon) {
        const at1 = base + m.index + m[0].length + colon[0].indexOf(colon[1]);
        const at2 = base + m.index + m[0].length + colon[0].lastIndexOf(colon[3]);
        const a1 = armOf(colon[2]);
        const a2 = armOf(colon[4]);
        if (a1) add('treated', rd(colon[1]), { start: at1, end: at1 + colon[1].length }, a1);
        if (a2) add('treated', rd(colon[3]), { start: at2, end: at2 + colon[3].length }, a2);
        continue;
      }
      const l = /^[^(;.]*?\(([^()]*)\)/.exec(after);
      if (l && !/\bsafety\s+population\b/i.test(l[1]) && /\d/.test(l[1])) addArms('treated', l[1], base + m.index + m[0].length + l[0].indexOf(l[1]));
    }
  }

  // D6 label-first: "Randomised: 612 (A 408; B 204)", "Treated: 608", "Safety set: 608", "Full analysis set: 612",
  // "randomized 612 (A 306, B 306); Safety Set (received at least one dose) 609 (A 304, B 305)", "N randomized; N treated (Safety Set: A N, B N)".
  const labels: Array<[RegExp, string]> = [
    [new RegExp(String.raw`\bRandomi[sz]ed:?\s+(${CNT})\b(?!\s*%)`, 'g'), 'randomized'],
    [new RegExp(String.raw`\brandomi[sz]ed\s+(${CNT})\s*\(`, 'g'), 'randomized'],
    [new RegExp(String.raw`(?:^|[:;]\s*)(${CNT})\s+randomi[sz]ed\b(?![\s\w]*\b(?:to|in)\b)`, 'g'), 'randomized'],
    [new RegExp(String.raw`\bTreated:\s*(${CNT})`, 'g'), 'treated'],
    [new RegExp(String.raw`[;]\s*(${CNT})\s+treated\b`, 'g'), 'treated'],
    [new RegExp(String.raw`\bSafety\s+(?:Analysis\s+)?(?:set|Set|population|Population)(?:\s*\([^)]*\))?:?\s+(${CNT})\b(?!\s*%)`, 'g'), 'treated'],
    // A disposition table flattened to "Patients randomised, n 621": the row label, the unit declaration and the
    // value, with no column padding left to split on (r2 pv-disposition-table-row-n-column).
    [new RegExp(String.raw`(?:^|[\s;])(?:Patients|Subjects|Participants)\s+randomi[sz]ed\s*[,:]?\s*[nN]\s*[:=]?\s+(${CNT})\b(?!\s*%)`, 'g'), 'randomized'],
    [new RegExp(String.raw`(?:^|[\s;])(?:Patients|Subjects|Participants)\s+treated\s*[,:]?\s*[nN]\s*[:=]?\s+(${CNT})\b(?!\s*%)`, 'g'), 'treated'],
  ];
  for (const [re, kind] of labels) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const numAt = m.index + m[0].indexOf(m[1]);
      const span = { start: base + numAt, end: base + numAt + m[1].length };
      if (isConsumed(env, span)) continue;
      add(kind, rd(m[1]), span, { kind: 'total' });
      const rest = text.slice(numAt + m[1].length);
      const l = /^\s*(?:patients\s*)?\(([^()]*)\)/.exec(rest);
      if (l) {
        const inner = l[1].replace(/^Safety\s+Set:\s*/i, '');
        addArms(kind, inner, base + numAt + m[1].length + l[0].indexOf(l[1]) + (l[1].length - inner.length));
      }
    }
  }
  // "N treated (Safety Set: A N, B N)"
  const treatedList = new RegExp(String.raw`(${CNT})\s+treated\s*\(\s*Safety\s+Set:\s*([^)]*)\)`, 'gi');
  while ((m = treatedList.exec(text)) !== null) {
    const numAt = m.index + m[0].indexOf(m[1]);
    add('treated', rd(m[1]), { start: base + numAt, end: base + numAt + m[1].length }, { kind: 'total' });
    addArms('treated', m[2], base + m.index + m[0].indexOf(m[2], m[1].length));
  }
  // "306 subjects were randomised to each arm": per arm from the roster.
  const each = new RegExp(String.raw`\b(${CNT})\s+${NOUN}\s+were\s+randomi[sz]ed\s+to\s+each\s+arm`, 'gi');
  while ((m = each.exec(text)) !== null) {
    const numAt = m.index + m[0].indexOf(m[1]);
    const span = { start: base + numAt, end: base + numAt + m[1].length };
    const arms = ctx.armOrder ?? env.state.armOrder ?? env.sentenceArms;
    if (arms && arms.length >= 2) {
      for (const a of arms) {
        const d = makeDraft('D4-each', 'n', { pop: 'randomized' }, { count: rd(m[1])! }, span, ctx, env, { arm: a });
        d.own.population = populationOf('randomized', env.doc);
        out.push(d);
      }
      consume(env, span);
    }
  }

  // Population sizes: "<population> (…; N=574; 287 per arm)", "Full analysis set: 612", "(efficacy-evaluable population, N=184)",
  // "(all randomised; placebo N=304, dapralutide N=303)", "Safety Analysis Set, N=156", "(N=128)" after a named population.
  out.push(...populationSizes(clause, ctx, env));
  // Completed and discontinued the study.
  out.push(...completed(clause, ctx, env));
  return out;
}

const POP_NAMES: Array<[RegExp, PopulationSet]> = [
  [/\b(?:intent(?:ion)?[\s-]to[\s-]treat|ITT)(?:\s+(?:population|set))?/i, 'itt'],
  [/\bfull\s+analysis\s+set|\bFAS\b/i, 'fas'],
  [/\befficacy(?:-evaluable)?\s+(?:analysis\s+)?(?:set|population)|\bEfficacy\s+Analysis\s+Set/i, 'efficacy_evaluable'],
  [/\bsafety\s+(?:analysis\s+)?(?:set|population)|\bSafety\s+Analysis\s+Set/i, 'treated'],
  [/\bper[\s-]protocol(?:\s+(?:set|population))?|\bPP\b/i, 'pp'],
  [/\bmITT\b/i, 'mitt'],
  [/\ball\s+randomi[sz]ed(?:\s+(?:patients|subjects))?/i, 'randomized'],
];

function populationSizes(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  const rd = (s: string) => readNumber(s, { convention: env.doc.convention, countSlot: true }) ?? undefined;
  const popAt = (before: string): PopulationSet | undefined => {
    let best: { set: PopulationSet; at: number } | undefined;
    for (const [re, set] of POP_NAMES) {
      const g = new RegExp(re.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = g.exec(before)) !== null) if (!best || m.index >= best.at) best = { set, at: m.index };
    }
    if (!best) return undefined;
    // "full analysis set (all randomised patients, N=612)": a set defined as all randomized counts the randomized.
    const defined = /\ball\s+randomi[sz]ed\b/i.test(before.slice(best.at));
    return defined || env.doc.allRandomized.has(best.set) || best.set === 'randomized' ? 'randomized' : best.set;
  };
  const push = (set: PopulationSet, count: ReturnType<typeof rd>, span: Span, arm: ArmRef, subgroups?: string[]) => {
    if (!count || isConsumed(env, span)) return;
    consume(env, span);
    const pop = set === 'treated' || set === 'randomized' ? set : set;
    const d = makeDraft('D10', 'n', { pop }, { count }, span, ctx, env, { arm });
    d.own.population = populationOf(set, env.doc);
    if (subgroups) d.own.subgroups = subgroups;
    out.push(d);
  };
  // "N=574; 287 per arm", "N=612; 306 per arm"
  let m: RegExpExecArray | null;
  const nEq = /\bN\s*=\s*([\d][\d,. ]*\d|\d)(?:\s*;\s*(\d+)\s+per\s+arm)?/g;
  while ((m = nEq.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 140), m.index);
    // A header Ns of arms ("dapralutide N=305, placebo N=303") binds per arm.
    const armBefore = new RegExp(String.raw`(?:^|[\s(;,])(${ARM})\s*[,(]?\s*$`, 'i').exec(before);
    // An arm's N with no population named in its clause takes the population its paragraph states
    // ("Study DPL-301, Safety Analysis Set. … with dapralutide 1.5 mg (N=305) compared with placebo (N=303)").
    const ctxSet = armBefore && armOf(armBefore[1]) && ctx.population?.stated ? ctx.population.set : undefined;
    const set = popAt(before.slice(Math.max(0, before.lastIndexOf('('))) || before) ?? popAt(before) ?? ctxSet;
    if (!set) continue;
    const numAt = m.index + m[0].indexOf(m[1]);
    const span = { start: base + numAt, end: base + numAt + m[1].length };
    if (armBefore && armOf(armBefore[1])) {
      push(set, rd(m[1]), span, armOf(armBefore[1])!);
      continue;
    }
    if (/(?:Part|Parts)\s+[A-D]/.test(before.slice(-40)) && !/(?:population|set)/i.test(before.slice(-60))) continue;
    push(set, rd(m[1]), span, { kind: 'total' });
    if (m[2]) {
      const perAt = base + m.index + m[0].lastIndexOf(m[2]);
      // The arms in order, else the study's two undosed arms by the roster (D10: "N per arm" applies to each arm).
      const roster = [...env.doc.roster.values()];
      const rosterArms: ArmRef[] | undefined =
        roster.length === 2 && roster.every((r) => r.doses.size === 0) ? roster.map((r) => ({ kind: 'arm' as const, drug: r.drug, label: r.drug })) : undefined;
      const arms = env.sentenceArms ?? ctx.armOrder ?? env.state.armOrder ?? rosterArms;
      const perSpan = { start: perAt, end: perAt + m[2].length };
      if (arms && arms.length >= 2 && !isConsumed(env, perSpan)) {
        consume(env, perSpan);
        for (const a of arms) {
          const d = makeDraft('D10-each', 'n', { pop: set }, { count: rd(m[2])! }, perSpan, ctx, env, { arm: a });
          d.own.population = populationOf(set, env.doc);
          out.push(d);
        }
      }
    }
  }
  // "Full analysis set: 612", "Safety set: 608".
  const labelled = /\b(Full\s+analysis\s+set|Safety\s+set|Per-protocol\s+set|Efficacy\s+analysis\s+set):\s*(\d[\d,. ]*\d|\d)/gi;
  while ((m = labelled.exec(text)) !== null) {
    const set = popAt(m[1]);
    if (!set) continue;
    const numAt = m.index + m[0].lastIndexOf(m[2]);
    push(set, rd(m[2]), { start: base + numAt, end: base + numAt + m[2].length }, { kind: 'total' });
  }
  // "Among dapralutide-treated subjects aged >=65 years (n=100)", "(dapralutide n=48, placebo n=50)".
  const sub = new RegExp(String.raw`\b(?:Among|among)\s+(${ARM_HEAD})-treated\s+${NOUN}\s+(aged\s*(?:>=|≥)\s*(\d+)\s*years)\s*\(\s*n\s*=\s*(\d+)\s*\)`, 'g');
  while ((m = sub.exec(text)) !== null) {
    const arm = armOf(m[1]);
    const at = base + m.index + m[0].lastIndexOf(m[4]);
    if (arm) push('treated', rd(m[4]), { start: at, end: at + m[4].length }, arm, [`age>=${m[3]}`]);
  }
  // "100 (33%) of the 305 dapralutide-treated patients were 65 years of age and older".
  const share = new RegExp(String.raw`\b(\d+)\s*\(\s*(\d+(?:[.,]\d+)?\s*%)\s*\)\s+of\s+the\s+(\d+)\s+(${ARM_HEAD})-treated\s+${NOUN}\s+were\s+(\d+)\s+years\s+of\s+age\s+and\s+older`, 'g');
  while ((m = share.exec(text)) !== null) {
    const arm = armOf(m[4]);
    if (!arm) continue;
    const at1 = base + m.index;
    const at3 = base + m.index + m[0].indexOf(m[3], m[1].length + m[2].length);
    const pct = readNumber(m[2], { convention: env.doc.convention }) ?? undefined;
    const s1 = { start: at1, end: at1 + m[1].length };
    if (!isConsumed(env, s1)) {
      consume(env, { start: at1, end: at1 + m[0].indexOf(m[3]) });
      const d = makeDraft('D10-sub', 'n', { pop: 'treated' }, { count: rd(m[1])!, ...(pct ? { percent: pct } : {}) }, s1, ctx, env, { arm });
      d.own.population = populationOf('treated', env.doc);
      d.own.subgroups = [`age>=${m[5]}`];
      out.push(d);
    }
    push('treated', rd(m[3]), { start: at3, end: at3 + m[3].length }, arm, []);
  }
  // "of 305 dapralutide-treated subjects", "55 of 305 dapralutide-treated subjects (18.0%)": the arm's treated N (lu-21).
  const ofArm = new RegExp(String.raw`\b(?:\d+\s+)?of\s+(?:the\s+)?(\d+)\s+(${ARM_HEAD})-treated\s+${NOUN}`, 'g');
  while ((m = ofArm.exec(text)) !== null) {
    const arm = armOf(m[2]);
    const at = base + m.index + m[0].indexOf(m[1], m[0].indexOf('of'));
    if (arm && !out.some((d) => d.span.start === at)) {
      const span = { start: at, end: at + m[1].length };
      const d = makeDraft('D10-arm', 'n', { pop: 'treated' }, { count: rd(m[1])! }, span, ctx, env, { arm });
      d.own.population = populationOf('treated', env.doc);
      d.own.subgroups = [];
      out.push(d);
    }
  }
  return out;
}

function completed(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  // "22 patients in the Drug X group discontinued the study", "25 patients (8.2%) in the Drug X group discontinued the
  // study": the arm's count of study discontinuations, of any reason (r1 pv-discontinued-study-per-arm).
  const disc = new RegExp(
    String.raw`(?:^|[\s,;:(])(${CNT})\s+(?:${NOUN}\s+)?(?:\(\s*(\d+(?:[.,]\d+)?\s?%)\s*\)\s+)?(?:in\s+the\s+(${ARM})\s+(?:group|arm)\s+)?(?:prematurely\s+)?(?:discontinued|withdrew\s+from)\s+(?:from\s+)?the\s+study\b(?!\s+(?:due\s+to|because\s+of))`,
    'gi',
  );
  let dm: RegExpExecArray | null;
  while ((dm = disc.exec(text)) !== null) {
    const numAt = base + dm.index + dm[0].indexOf(dm[1]);
    const span = { start: numAt, end: numAt + dm[1].length };
    if (isConsumed(env, span)) continue;
    const count = readNumber(dm[1], { convention: env.doc.convention, countSlot: true }) ?? undefined;
    if (!count) continue;
    const percent = dm[2] ? readNumber(dm[2], { convention: env.doc.convention }) ?? undefined : undefined;
    const arm = dm[3] ? armOf(dm[3]) ?? undefined : ({ kind: 'total' } as ArmRef);
    consume(env, span);
    if (percent) consume(env, { start: base + dm.index + dm[0].indexOf(dm[2]), end: base + dm.index + dm[0].indexOf(dm[2]) + dm[2].length });
    out.push(makeDraft('D-disc-study', 'discontinued_study', { reason: 'any' }, { count, ...(percent ? { percent } : {}) }, span, ctx, env, { arm }));
  }
  if (!/completed\s+the\s+study|withdrawal\s+by\s+subject|Discontinuation\s+from\s+the\s+study/i.test(text)) return out;
  const items = itemsIn(text, base, env.doc, { counts: true }).filter((i) => !isConsumed(env, i));
  const comp = /completed\s+the\s+study/i.exec(text);
  if (comp) {
    // "551 of 612 randomized subjects (90.0%) completed the study: 271 (88.6%) in the A group and 280 (91.5%) in the B group",
    // "515 of 612 randomised subjects (84.2%) completed the study (A 271 [88.6%]; B 244 [79.7%])", "551 (90.0%) completed the study".
    const head = /(\d[\d,]*)\s+(?:of\s+\d[\d,]*\s+randomi[sz]ed\s+\w+\s+)?\(\s*([\d.,]+\s*%)\s*\)\s+completed\s+the\s+study/i.exec(text) ?? /(\d[\d,]*)\s*\(\s*([\d.,]+\s*%)\s*\)\s+completed/i.exec(text);
    if (head) {
      const at = base + head.index;
      const span = { start: at, end: at + head[1].length };
      if (!isConsumed(env, span)) {
        consume(env, { start: at, end: at + head[0].length });
        const pct = readNumber(head[2], { convention: env.doc.convention }) ?? undefined;
        const d = makeDraft('D9', 'completed_study', {}, { count: readNumber(head[1], { countSlot: true })!, ...(pct ? { percent: pct } : {}) }, span, ctx, env, { arm: { kind: 'total' } });
        out.push(d);
      }
    }
    const tail = text.slice(comp.index + comp[0].length);
    const tailItems = itemsIn(tail, base + comp.index + comp[0].length, env.doc, { counts: true }).filter((i) => i.count && i.arm && !isConsumed(env, i));
    for (const it of tailItems) {
      consume(env, it);
      out.push(makeDraft('D9', 'completed_study', {}, { count: it.count!, ...(it.percent ? { percent: it.percent } : {}) }, it, ctx, env, { arm: it.arm }));
    }
  }
  // "Discontinuation from the study due to an adverse event occurred in 3.9% of randomized subjects in the A group and 2.4% in the B group;
  //  withdrawal by subject accounted for 3.6% and 3.3%, respectively."
  const reasons: Array<[RegExp, string]> = [
    [/Discontinuation\s+from\s+the\s+study\s+(?:due\s+to|because\s+of)\s+an?\s+adverse\s+event/i, 'adverse_event'],
    [/withdrawal\s+by\s+subject/i, 'withdrawal_by_subject'],
  ];
  let lastArms: ArmRef[] | undefined = env.clauseArms;
  for (const [re, reason] of reasons) {
    const m = re.exec(text);
    if (!m) continue;
    const from = m.index + m[0].length;
    const next = reasons.map(([r]) => r.exec(text.slice(from))).filter(Boolean).map((x) => from + x!.index);
    const to = Math.min(text.length, ...next.filter((x) => x > from), text.slice(from).search(/;/) >= 0 ? from + text.slice(from).search(/;/) : text.length);
    const seg = text.slice(from, to);
    const segItems = itemsIn(seg, base + from, env.doc, { counts: false }).filter((i) => i.percent && !isConsumed(env, i));
    // "of randomized subjects in the orbaglutide group and 2.4% in the placebo group": arms by own phrase.
    const arms = segItems.map((i) => i.arm);
    const inGroup = [...seg.matchAll(new RegExp(String.raw`in\s+the\s+(${ARM})\s+group`, 'gi'))].map((g) => armOf(g[1]) ?? undefined);
    for (let k = 0; k < segItems.length; k++) if (!arms[k] && inGroup[k]) arms[k] = inGroup[k];
    if (!arms.some(Boolean) && /respectively/i.test(seg) && lastArms && lastArms.length === segItems.length) lastArms.forEach((a, k) => (arms[k] = a));
    segItems.forEach((it, k) => {
      consume(env, it);
      const d = makeDraft('D-disc', 'discontinued_study', { reason }, { percent: it.percent! }, it, ctx, env, { arm: arms[k] });
      if (/of\s+randomi[sz]ed\s+subjects/i.test(seg)) d.own.population = populationOf('randomized', env.doc);
      out.push(d);
    });
    if (arms.length > 0 && arms.every(Boolean)) {
      lastArms = arms as ArmRef[];
      env.clauseArms = lastArms;
    }
  }
  void items;
  return out;
}
