/**
 * Prose forms for safety figures (design §6.2, R and X forms; C4–C6, C20–C22).
 *
 * Incidence: an event-category phrase (or a term subject) owns the value items
 * of its stretch of the clause; arms come from each item's own phrase, else the
 * clause's arm list ("respectively", "(A vs B)"), else the paragraph's order.
 * Sub-rates after "the most common being", "including", "these included",
 * "driven by" are preferred-term claims of their parent, never further arm
 * rates (F6, F10). Event shares ("mild (45%)", "90% of them resolved"),
 * exposure-adjusted rates and frequency bands are reported as not compared.
 *
 * Deaths: a total never comes from a per-arm count, and per-arm counts are never
 * summed into a total (F14, F18, C22).
 */
import { armLabel, ARM, ARM_HEAD, armOf, explicitZeros, itemsIn, type Item } from './items';
import { consume, isConsumed, makeDraft, type Env } from './env';
import type { Ctx, Draft } from './context';
import { NUMBER_WORDS, readNumber } from './number';
import { eairEventOf, EAIR_NAMED_EVENTS, groupingKey, termKey, EVENT_ROWS, SOC_ROWS, isAdverseReaction, type EventCategory } from './vocabulary';
import type { ArmRef, ClaimValue } from './types';
import type { Sentence, Span } from './segment';

const NOUN = String.raw`(?:patients|subjects|participants|patient|subject)`;

interface Anchor extends Span {
  category: EventCategory;
  basis: 'adverse_event' | 'adverse_reaction';
  term?: { name: string; kind: 'pt' | 'soc' | 'grouped'; grouping?: string };
  /** The anchor follows its values ("… experienced at least one serious adverse event"). */
  predicate?: boolean;
  /** "the most common being", "including": a sub-rate list of the anchor before it. */
  subrates?: boolean;
  ascertainment?: 'adjudicated' | 'investigator';
  lab?: string;
  /** A restriction of the event set the anchor's own words state ("non-fatal", "more than one", "requiring hospitalisation"). */
  qual?: string;
}

const SUBRATE_INTRO = /,?\s*(?:the\s+most\s+(?:common|frequent)(?:\s+\w+){0,3}\s+(?:being|were|was)|most\s+commonly|(?:these\s+)?included|including|driven\s+by|such\s+as)\b/gi;

/** Event-category anchors of a clause, most specific first, non-overlapping. */
function eventAnchors(text: string, base: number, env: Env): Anchor[] {
  const out: Anchor[] = [];
  const taken: Span[] = [];
  for (const row of EVENT_ROWS) {
    row.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = row.re.exec(text)) !== null) {
      const s = { start: base + m.index, end: base + m.index + m[0].length };
      if (taken.some((t) => t.start < s.end && s.start < t.end) || isConsumed(env, s)) continue;
      // "adverse events" inside "exposure-adjusted … rates of SAEs" etc. are handled by the share/EAIR forms.
      taken.push(s);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      const predicate =
        /(?:experienced|reported|had|discontinued|with)\s+(?:(?:at\s+least\s+one|an?|any)\s+)?$/i.test(before) ||
        /^\s*\(SOC\)/.test(after) ||
        // "6.4% of the Drug X group withdrew from study drug owing to an adverse event": the value and its arm stand
        // before the phrase that says what the figure measures (r2 pv-withdrew-owing-to-read-as-any-ae).
        /\d[\d.,]*\s*%?\s+(?:of\s+)?(?:the\s+)?[^.;]{0,40}?(?:group|arm|patients|subjects)\s+$/i.test(before);
      out.push({ ...s, category: row.key, basis: isAdverseReaction(m[0]) ? 'adverse_reaction' : 'adverse_event', predicate });
    }
  }
  // SOC phrases: "gastrointestinal adverse reactions", "Gastrointestinal disorders (SOC)", "GI TEAEs".
  for (const row of SOC_ROWS) {
    row.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = row.re.exec(text)) !== null) {
      const s = { start: base + m.index, end: base + m.index + m[0].length };
      const next = text.slice(m.index + m[0].length);
      const ev = /^\s*(?:\(SOC\)\s+)?(?:adverse\s+reactions?|adverse\s+events?|TEAEs?|AEs?|disorders)/i.exec(next);
      if (!ev && !/\(SOC\)/.test(m[0])) continue;
      const span = { start: s.start, end: s.end + (ev ? ev[0].length : 0) };
      // Inside a category anchor ("discontinued treatment due to gastrointestinal adverse reactions"), the SOC is that
      // anchor's term: the SOC's discontinuation rate, not its incidence.
      const host = out.find((a) => a.start <= span.start && span.end <= a.end && !a.term);
      if (host) {
        host.term = { name: row.key, kind: 'soc' };
        continue;
      }
      // The SOC replaces the category anchor it qualifies.
      const inner = out.findIndex((a) => a.start >= span.start && a.start <= span.end + 2);
      const cat = inner >= 0 ? out[inner] : undefined;
      if (inner >= 0) out.splice(inner, 1);
      const basis = cat?.basis ?? (ev && /reaction/i.test(ev[0]) ? 'adverse_reaction' : 'adverse_event');
      out.push({ ...span, end: Math.max(span.end, cat?.end ?? 0), category: cat?.category === 'disc_treatment' ? 'disc_treatment' : 'any', basis, term: { name: row.key, kind: 'soc' } });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Words that may stand right before an event phrase without restricting it (hardening r1). Any other word there
 * ("non-fatal SAEs", "serious cardiac adverse events", "other SAEs") restricts the event set: the figure is a
 * different measure from the unrestricted one, never compared with it (fail closed, §5.2).
 */
const PRE_NEUTRAL = new Set(
  (
    'serious of any common all a an the to fatal and or most one reported frequently frequent discontinuation exposure-adjusted ' +
    'period trials trial had has have treatment-related drug-related related treatment-emergent emergent gastrointestinal gi ' +
    // An arm's own noun ("of the Drug X group withdrew …") restricts nothing: it is part of the arm phrase (r2
    // pv-withdrew-owing-to-read-as-any-ae).
    'group groups arm arms cohort cohorts ' +
    'with these those such total overall no in were was by on for that which who patients subjects participants their as at ' +
    'least first incidence rate rates number percentage proportion grade grades level vs versus investigator-reported ' +
    'adjudicated post-treatment overview summary experienced experiencing developed'
  ).split(' '),
);
/** "more than one SAE", "two or more TEAEs": patients with repeated events, not with at least one (r1 pv-more-than-one-sae). */
const COUNT_THRESHOLD = /\b(?:more\s+than\s+one|two\s+or\s+more|at\s+least\s+two|multiple|recurrent|(?:≥|>=)\s*2)\s+$/i;
/** A restriction written right after the event phrase, before its verb: "SAEs requiring hospitalisation were reported". */
const POST_RESTRICTION = /^\s+((?:requiring|other\s+than|excluding|except|not\s+including)\b[^,;()]*?)(?=\s+(?:were|was|occurred|have|had|has|reported)\b)/i;
/** A trailing relative clause naming the events' outcome: "… (Drug X vs placebo) that led to dose interruption." */
const OUTCOME_TAIL =
  /^\s*(?:\([^()]*\)\s*)?(?:that|which)\s+(?:led|resulted)\s+(?:to|in)\s+((?:permanent\s+|temporary\s+|premature\s+)?(?:dose\s+|dosage\s+)?(?:interruptions?|discontinuation(?:\s+of\s+(?:study\s+(?:drug|treatment|medication)|treatment|the\s+study))?|death|hospitali[sz]ation))\b/i;

/** Restrictions an event anchor's own neighbouring words state (hardening r1); the words are the measure, so consumed. */
function restrictAnchors(anchors: Anchor[], clause: Sentence, env: Env): void {
  for (const a of anchors) {
    if (a.term || a.lab) continue;
    const from = Math.max(clause.start, a.start - 60);
    const pre = env.doc.text.slice(from, a.start);
    const thr = COUNT_THRESHOLD.exec(pre);
    if (thr) {
      a.qual = 'count>1';
      consume(env, { start: from + thr.index, end: a.start });
    } else {
      // Consecutive restricting words right before the phrase: "serious cardiac adverse events" → serious, restricted to cardiac.
      const words: Array<{ w: string; at: number }> = [];
      let end = pre.length;
      for (;;) {
        const m = /(?:^|[\s(])([A-Za-z][\w-]*)\s+$/.exec(pre.slice(0, end));
        if (!m) break;
        const at = m.index + m[0].indexOf(m[1]);
        words.unshift({ w: m[1], at });
        end = at;
        if (words.length >= 3) break;
      }
      const restricting: typeof words = [];
      for (let k = words.length - 1; k >= 0; k--) {
        const w = words[k].w;
        const lw = w.toLowerCase();
        const armName = env.doc.roster.has(lw) || (/^[A-Z]$/.test(w) && /\bDrug\s+$/.test(pre.slice(0, words[k].at)));
        if (PRE_NEUTRAL.has(lw) || armName || /^\d/.test(w) || /^Drug$/.test(w)) break;
        restricting.unshift(words[k]);
      }
      if (restricting.length > 0) {
        a.qual = restricting.map((x) => x.w.toLowerCase()).join(' ');
        const before = restricting[0].at > 0 ? words[words.indexOf(restricting[0]) - 1] : undefined;
        if (a.category === 'any' && before && /^serious$/i.test(before.w)) a.category = 'serious';
        consume(env, { start: from + restricting[0].at, end: a.start });
      }
    }
    const post = POST_RESTRICTION.exec(env.doc.text.slice(a.end, clause.end));
    if (post) {
      const phrase = post[1].toLowerCase().replace(/\s+/g, ' ');
      a.qual = a.qual ? `${a.qual}|${phrase}` : phrase;
      consume(env, { start: a.end + post.index, end: a.end + post.index + post[0].length });
    }
  }
}

/** The category or restriction a trailing outcome clause gives the events it follows ("that led to dose interruption"). */
function outcomeOf(phrase: string): { category?: EventCategory; qual?: string } {
  if (/interruption/i.test(phrase)) return { category: 'interruption' };
  if (/discontinuation\s+of\s+(?:study\s+(?:drug|treatment|medication)|treatment)/i.test(phrase)) return { category: 'disc_treatment' };
  if (/discontinuation\s+of\s+the\s+study/i.test(phrase)) return { category: 'disc_study' };
  if (/discontinuation/i.test(phrase)) return { category: 'disc_unstated' };
  if (/death/i.test(phrase)) return { category: 'fatal' };
  return { qual: phrase.toLowerCase() };
}

/** "Serious infections", "Level 2 hypoglycemia (…)", "nausea" as the subject of "was reported in" / "occurred in" / ":". */
const TERM_SUBJECT = new RegExp(
  String.raw`(?:^|[;:,]\s*|\b(?:Of\s+these|In\s+[^,]{1,80}),\s*)(?:the\s+)?(?<term>(?:[A-Z]?[a-z][\w'-]*|Level\s+\d|GI)(?:\s+(?:\([^)]{1,60}\)|[a-z][\w'-]*|Level\s+\d|\d)){0,6}?)(?:,\s+the\s+most\s+frequent\s+TEAE,)?\s+(?:events\s+)?(?:was|were)\s+(?:reported|observed)\s+(?:in|for)\b`,
  'g',
);
const TERM_OCCURRED = new RegExp(String.raw`(?:^|[;:,]\s*)(?<term>[A-Z][a-z][\w-]*(?:\s+[a-z][\w-]*){0,4}?)\s+(?:events\s+)?occurred\s+in\b`, 'g');
const TERM_LABEL = new RegExp(String.raw`(?:^|[.;]\s+)(?<term>[A-Z][\w'-]*(?:\s+(?:\([^)]{1,80}\)|[A-Za-z][\w'>=<.-]*|\d)){0,8}?)\s*:\s*(?=\d|[A-Za-z][a-z]+\s+\d)`, 'g');
/**
 * "Of these, the independent Clinical Events Committee confirmed acute pancreatitis in 1 (0.3%) dapralutide subject
 * and 0 (0.0%) placebo subjects": the adjudicated incidence of the term, over each arm (lu-28). The whole phrase is the
 * anchor, so "Of these" is read as the subset the committee reviewed, not as an event share.
 */
const TERM_CONFIRMED = /(?:\bOf\s+these,\s*)?\b(?:the\s+)?(?:independent\s+)?(?:Clinical\s+Events\s+Committee|CEC|adjudication\s+committee)\s+confirmed\s+(?<term>[a-z][\w-]*(?:\s+[a-z][\w-]*){0,3}?)\s+in\b/g;
const TERM_ELLIPTIC = new RegExp(String.raw`(?:;\s*|,\s+and\s+|^)(?<term>[a-z][\w-]*(?:\s+[a-z][\w-]*){0,2})\s+in\s+(?=\d)`, 'g');

const NOT_A_TERM = /\b(?:SAEs?|TEAEs?|AEs?|adverse|events?|reactions?|deaths?|incidence|patients|subjects|rates?|proportion|population|safety|study|studies|trial|discontinu\w*|interruption|randomi[sz]\w*|treated|received|response|remission|ORR|disposition|exposure|mortality|deaths)\b/i;

/** Normalise a term subject; null when it is no term (a category word, a population, a disposition). */
function termOf(raw: string, ctx: Ctx): Anchor['term'] & { ascertainment?: 'adjudicated' | 'investigator'; category?: EventCategory } | null {
  let t = raw.trim();
  let ascertainment: 'adjudicated' | 'investigator' | undefined;
  let category: EventCategory | undefined;
  if (/^investigator-reported\s+/i.test(t)) {
    ascertainment = 'investigator';
    t = t.replace(/^investigator-reported\s+/i, '');
  }
  if (/\s+confirmed\s+by\s+adjudication$/i.test(t)) {
    ascertainment = 'adjudicated';
    t = t.replace(/\s+confirmed\s+by\s+adjudication$/i, '');
  }
  if (/^serious\s+/i.test(t)) {
    category = 'serious';
    t = t.replace(/^serious\s+/i, '');
  }
  // Hypoglycaemia levels: "Level 2 hypoglycemia (…)", "Severe hypoglycemia (Level 3)", "Level 3 (severe)" under a hypoglycaemia heading.
  const lvl = /level\s+(\d)/i.exec(t);
  if (lvl && /hypoglyc/i.test(`${t} ${ctx.headingTerm ?? ''}`)) return { name: `hypoglycemia level ${lvl[1]}`, kind: 'pt', ascertainment, category };
  if (/^severe\s+hypoglyc/i.test(t)) return { name: 'hypoglycemia level 3', kind: 'pt', ascertainment, category };
  if (/^documented\s+symptomatic\s+hypoglyc/i.test(t)) return { name: 'hypoglycemia documented symptomatic', kind: 'pt', ascertainment, category };
  t = t.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (!t || NOT_A_TERM.test(t) || /\d/.test(t) || t.split(/\s+/).length > 4) return null;
  if (/^(?:the|a|an|this|these|it|they|there|which|in|of|and|or|most|majority)$/i.test(t.split(/\s+/)[0])) return null;
  return { name: termKey(t), kind: /\(PT\)/i.test(raw) ? 'pt' : 'pt', ascertainment, category };
}

/** Term-subject anchors: "Nausea was reported in …", "Cholelithiasis: 2 (0.7%) …", "; hypoglycaemia in 8% vs 2%". */
function termAnchors(text: string, base: number, ctx: Ctx, env: Env, events: Anchor[]): Anchor[] {
  const out: Anchor[] = [];
  const basis = ctx.basis ?? (env.doc.role === 'uspi' || env.doc.role === 'smpc' ? 'adverse_reaction' : 'adverse_event');
  // "The grouped term 'injection site reactions' (injection site erythema, pain, pruritus and swelling; SAP …) was
  // reported in 47 (11.7%) vs 8 (4.0%)": a grouped term, identified by its members (C18, lu-10).
  for (const g of text.matchAll(/\b[Tt]he\s+grouped\s+term\s+'([^']+)'\s*\(([^;)]+)(?:;[^)]*)?\)\s+(?:was|were)\s+reported\s+(?:in|for)\b/g)) {
    const span = { start: base + g.index!, end: base + g.index! + g[0].length - /(?:was|were)\s+reported\s+(?:in|for)$/.exec(g[0])![0].length };
    const grouping = groupingKey(g[1], g[2]);
    if (grouping && !isConsumed(env, span)) out.push({ ...span, category: 'any', basis, term: { name: termKey(g[1]), kind: 'grouped', grouping } });
  }
  for (const re of [TERM_CONFIRMED, TERM_SUBJECT, TERM_OCCURRED, TERM_LABEL, TERM_ELLIPTIC]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m.groups?.term ?? '';
      const at = m.index + m[0].indexOf(raw);
      const confirmed = re === TERM_CONFIRMED;
      // A committee-confirmed term's anchor is its whole phrase ("Of these, the … Committee confirmed acute pancreatitis").
      const span = confirmed ? { start: base + m.index, end: base + at + raw.length } : { start: base + at, end: base + at + raw.length };
      if (events.some((e) => e.start < span.end && span.start < e.end) || out.some((e) => e.start < span.end && span.start < e.end)) continue;
      if (isConsumed(env, span)) continue;
      // The grouped term of the CSR: "The grouped term 'injection site reactions' (…)".
      const grouped = /grouped\s+term\s+'([^']+)'\s*\(([^;)]+)/i.exec(text.slice(Math.max(0, at - 30), at + raw.length + 120));
      if (grouped) {
        const grouping = groupingKey(grouped[1], grouped[2]);
        if (grouping) out.push({ ...span, category: 'any', basis, term: { name: termKey(grouped[1]), kind: 'grouped', grouping } });
        continue;
      }
      // A list whose rows are labelled with the study's arms, one of them its control, is a per-arm list: its labels
      // are arms, never preferred terms ("1. Drug X: 19 (6.4%)" / "2. Placebo: 10 (3.3%)", r2 pv-arm-list-numbered-ordinals).
      const armRow = /(?:^|[\n\r.;]\s*)(?:\d{1,2}[.)]\s*|[-–•*]\s*)?(?:placebo|vehicle|comparator)\s*[:–—-]\s*\d/i.test(env.doc.text);
      if (armRow && env.doc.roster.has(raw.trim().toLowerCase())) continue;
      const term = termOf(raw, ctx);
      if (!term) continue;
      out.push({ ...span, category: term.category ?? 'any', basis, term: { name: term.name, kind: term.kind }, ascertainment: confirmed ? 'adjudicated' : term.ascertainment });
    }
  }
  return out;
}

/** "increases in lipase greater than 3 times the upper limit of normal (ULN)", "Lipase >ULN at any post-baseline visit", "lipase >3xULN". */
function labAnchors(text: string, base: number): Anchor[] {
  const out: Anchor[] = [];
  const re = /\b(?:increases?\s+in\s+)?(lipase|amylase|ALT|AST|bilirubin|creatinine)\s*(?:greater\s+than\s+(\d+)\s+times\s+the\s+upper\s+limit\s+of\s+normal(?:\s*\(ULN\))?|>\s*(\d+)\s*x\s*ULN|>\s*ULN(?:\s+at\s+any\s+post-baseline\s+visit)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const k = m[2] ?? m[3] ?? '1';
    out.push({ start: base + m.index, end: base + m.index + m[0].length, category: 'any', basis: 'adverse_event', lab: `${m[1].toLowerCase()}>${k}xuln` });
  }
  return out;
}

/** Items of a stretch of text not already consumed by another form; an arm size ("(N=305)") is never an incidence value. */
function freeItems(text: string, base: number, env: Env, counts = true): Item[] {
  return itemsIn(text, base, env.doc, { counts }).filter((i) => !isConsumed(env, i) && !/\b[Nn]\s*=\s*$/.test(env.doc.text.slice(Math.max(0, i.start - 6), i.start)));
}

/**
 * R6 with a stated arm order and no parent values: "The most frequently reported TEAEs with A (N=305) compared with
 * B (N=303) were nausea (55 subjects, 18.0% vs 14 subjects, 4.6%), diarrhoea (8.9% vs 4.3%) and vomiting (…)".
 */
function mostFrequentList(text: string, base: number, ctx: Ctx, env: Env): Draft[] {
  const SIZE = String.raw`(?:\s*\(\s*N\s*=\s*[\d,.]+\s*\))?`;
  const re = new RegExp(
    String.raw`\b(?:the\s+)?most\s+(?:frequently\s+reported|commonly\s+reported|common|frequent)\s+(treatment-emergent\s+adverse\s+events|TEAEs|adverse\s+events|AEs|adverse\s+reactions)\s+(?:with|in)\s+(${ARM})${SIZE}\s+(?:compared\s+with|vs\.?|versus)\s+(${ARM})${SIZE}\s+(?:were|was)\s+`,
    'i',
  );
  const m = re.exec(text);
  if (!m) return oneArmMostCommonList(text, base, ctx, env) ?? mostCommonOfCategory(text, base, ctx, env);
  const a1 = armOf(m[2]);
  const a2 = armOf(m[3]);
  if (!a1 || !a2) return [];
  // The category words are this form's anchor: the R forms do not read them again.
  const catAt = base + m.index + m[0].indexOf(m[1]);
  consume(env, { start: catAt, end: catAt + m[1].length });
  env.state.armOrder = [a1, a2];
  const basis = isAdverseReaction(m[1]) ? 'adverse_reaction' : 'adverse_event';
  return subrates(text.slice(m.index + m[0].length), base + m.index + m[0].length, { category: 'any' }, [a1, a2], basis, ctx, env);
}

/**
 * The list sentence a product label states about one arm: "the most common adverse reactions
 * (incidence >=5%) in dapralutide-treated patients were nausea (12%) and diarrhea (9%)" (USPI 6.1
 * and the HIGHLIGHTS adverse-reactions bullet), "the most commonly reported adverse reactions in
 * patients treated with dapralutide 1.5 mg were nausea (12.0%), diarrhoea (8.9%) and vomiting
 * (7.5%)" (SmPC 4.8 "Summary of the safety profile"). Each term is a preferred-term incidence of
 * that one arm.
 *
 * `mostFrequentList` reads only the two-arm "with A … compared with B … were" shape, so this
 * sentence left every figure unframed with `arm_unidentified` although its arm is written in the
 * same clause, immediately before the list (r2 lbl-06, lbl-07). An incidence threshold in brackets
 * after the category words — "(incidence >=5%)", "(>=2%)" — is the list's inclusion rule and is
 * consumed with them, never read as a rate.
 *
 * Returns null, not [], when the sentence is not this shape, so the caller can try the next form.
 */
function oneArmMostCommonList(text: string, base: number, ctx: Ctx, env: Env): Draft[] | null {
  const SIZE = String.raw`(?:\s*\(\s*N\s*=\s*[\d,.]+\s*\))?`;
  const THRESHOLD = String.raw`(?:\s*\((?:[^()]{0,40})\))?`;
  const re = new RegExp(
    String.raw`\b(?:the\s+)?most\s+(?:frequently\s+reported|commonly\s+reported|commonly\s+observed|common|frequent)\s+` +
      String.raw`(treatment-emergent\s+adverse\s+events|TEAEs|adverse\s+events|AEs|adverse\s+reactions|adverse\s+drug\s+reactions|ADRs|undesirable\s+effects)` +
      THRESHOLD +
      String.raw`\s+(?:in|with|among)\s+` +
      String.raw`(?:(?:patients|subjects|participants)\s+(?:treated\s+with|receiving|who\s+received)\s+(${ARM})|(${ARM_HEAD})-treated\s+(?:patients|subjects|participants)|(?:the\s+)?(${ARM})\s+(?:group|arm))` +
      SIZE +
      String.raw`\s+(?:were|was|included)\s+`,
    'i',
  );
  const m = re.exec(text);
  if (!m) return null;
  const arm = armOf(m[2] ?? m[3] ?? m[4] ?? '');
  if (!arm) return null;
  // The category words and the threshold in brackets are this form's anchor: the R forms do not read them again.
  const catAt = base + m.index + m[0].indexOf(m[1]);
  const anchorEnd = base + m.index + m[0].length;
  consume(env, { start: catAt, end: anchorEnd });
  const basis = isAdverseReaction(m[1]) ? 'adverse_reaction' : ctx.basis ?? 'adverse_event';
  return subrates(text.slice(m.index + m[0].length), anchorEnd, { category: 'any' }, [arm], basis, ctx, env);
}

/**
 * R6 whose parent category is named in the introducer: "The most common adverse reaction leading to discontinuation
 * of dapralutide was nausea (1.6% vs 0% for placebo)" — preferred-term sub-rates of that category, with the arms of
 * the parent rate the paragraph stated just before (lu-34). Without a parent of that category, the arms stay unbound.
 */
function mostCommonOfCategory(text: string, base: number, ctx: Ctx, env: Env): Draft[] {
  const m = /\b(?:the\s+)?most\s+(?:common|frequent|frequently\s+reported)\s+(.{3,100}?)\s+(?:was|were)\s+(?=[a-z])/i.exec(text);
  if (!m) return [];
  const phrase = m[1];
  let category: EventCategory | undefined;
  for (const row of EVENT_ROWS) {
    row.re.lastIndex = 0;
    const r = row.re.exec(phrase);
    if (r && r.index === 0 && r[0].length === phrase.length) {
      category = row.key;
      break;
    }
  }
  if (!category) return [];
  const parent = env.state.lastIncidence;
  const arms = parent && parent.key.category === category && !parent.key.term ? parent.arms : [];
  const at = base + m.index + m[0].indexOf(phrase);
  consume(env, { start: at, end: at + phrase.length });
  const basis = isAdverseReaction(phrase) ? 'adverse_reaction' : ctx.basis ?? 'adverse_event';
  return subrates(text.slice(m.index + m[0].length), base + m.index + m[0].length, { category }, arms, basis, ctx, env);
}

/** Bind unbound items to arms (C8): own phrase, the clause's list, the sentence's order, the paragraph's order, roles. */
export function bindArms(items: Item[], clause: string, ctx: Ctx, env: Env, opts: { vsPair?: boolean } = {}): Array<ArmRef | undefined> {
  const arms: Array<ArmRef | undefined> = items.map((i) => i.arm);
  for (let k = 0; k < items.length; k++) if (items[k].armFromPrevious && k > 0) arms[k] = arms[k - 1];
  const unbound = arms.map((a, k) => (a ? -1 : k)).filter((k) => k >= 0);
  if (unbound.length === 0) return arms;
  // The clause's subject arm ("Among A-treated subjects …, nausea was reported in 24 (24.0%)") binds every value.
  if (ctx.subjectArm && unbound.length === items.length) return items.map(() => ctx.subjectArm);
  // A single-arm study: one value alone in its clause is the study total (never a "V vs V" pair).
  if (env.doc.singleArm && items.length === 1 && unbound.length === 1) return [{ kind: 'total' }];
  const order = env.sentenceArms && env.sentenceArms.length >= 2 ? env.sentenceArms : undefined;
  // One bound, one unbound, two arms known: the unbound one is the other arm ("1.6% vs 0% for placebo").
  const twoArms = order ?? ctx.armOrder ?? env.state.armOrder;
  if (unbound.length === 1 && items.length === 2 && twoArms && twoArms.length === 2) {
    const bound = arms[1 - unbound[0]];
    const other = twoArms.find((a) => a && bound && armLabel(a) !== armLabel(bound));
    if (bound && other && twoArms.some((a) => armLabel(a) === armLabel(bound))) {
      arms[unbound[0]] = other;
      return arms;
    }
  }
  if (unbound.length !== items.length) return arms;
  if (order && order.length === items.length && (env.respectively || /\bvs\.?\b|\bversus\b|\(\s*\S+\s+vs/.test(clause) || opts.vsPair)) {
    return order.map((a) => a);
  }
  const para = ctx.armOrder ?? env.state.armOrder;
  const vs = items.length === 2 && /\d\s*%?\s*\)?\]?\s*(?:vs\.?|versus)\s+[\d(<]/.test(clause.replace(/\s+/g, ' '));
  if (para && para.length === items.length && (vs || env.respectively)) return [...para];
  if (vs && items.length === 2) return [{ kind: 'role', role: 'test' }, { kind: 'role', role: 'control' }];
  return arms;
}

/** One item that is a share: "90% of them", "52% were mild", "mild (45%)", "Of all TEAEs, 52% …". */
function isShareItem(text: string, it: Span, from: number): boolean {
  const after = text.slice(it.end, it.end + 40);
  const before = text.slice(Math.max(from, it.start - 30), it.start);
  return (
    // "of those receiving placebo" names an arm; "of them", "of those events" a share.
    /^\s*(?:of\s+(?:them|these|those|all\b|events|the\s+\d+)(?!\s+(?:receiving|given|treated\s+with|on|who\s+received|assigned|randomi[sz]ed|allocated|younger|older|aged)\b|\s+\d)|were\s+(?:mild|moderate|severe)\b|(?:mild|moderate|severe)\b)/i.test(after) ||
    /\b(?:mild|moderate|severe|resolved|recovered)\s*\(?\s*$/i.test(before) ||
    /\bOf\s+all\b[^.;]*$/i.test(text.slice(Math.max(from, it.start - 60), it.start))
  );
}

/** Whether the items of a stretch are shares of events or of a subset (C21), not subject incidence. */
function shareReason(text: string, afterAnchor: string): boolean {
  return (
    /\b(?:mild|moderate|severe|intensity|severity|resolved|recovered)\b/i.test(afterAnchor) ||
    /\bof\s+(?:them|these|those|all|the\s+\d+)\b(?!\s+(?:receiving|given|treated\s+with|on|who\s+received|assigned|randomi[sz]ed|allocated|younger|older|aged)\b|\s+\d)|\bof\s+events\b|\bOf\s+all\b|\bmostly\b|\bmajority\s+of\s+events\b/i.test(text)
  );
}

export function incidenceForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  // Exposure-adjusted rates (C21) are a different measure, read by `nonIncidenceForms`, which runs first and
  // consumes them. A clause that states both ("in 4.6% of patients (6.4 per 100 patient-years)") still states the
  // crude incidence, and the parenthetical rate does not change what 4.6% is (r2 num-13).
  // Frequency bands (C20).
  if (/\b(?:very\s+common|common|uncommon|rare)\s*\((?:≥|>=|<)/i.test(text) || /\bmay\s+affect\b/i.test(text)) return out;

  out.push(...mostFrequentList(text, base, ctx, env));
  const events = eventAnchors(text, base, env);
  const terms = termAnchors(text, base, ctx, env, events);
  const labs = labAnchors(text, base);
  let anchors = [...events, ...terms, ...labs].sort((a, b) => a.start - b.start);
  // "Gastrointestinal disorders (SOC) were the most frequently reported TEAEs: 115 (37.7%) …": the category after
  // "were the most … reported" describes the anchor before it; the values are that anchor's (lu-03).
  anchors = anchors.filter((a, k) => {
    if (k === 0 || a.term || a.lab) return true;
    const between = env.doc.text.slice(anchors[k - 1].end, a.start);
    if (/^\s*(?:were|was)\s+the\s+most\s+(?:frequently\s+reported|commonly\s+reported|common|frequent)\s*$/i.test(between)) {
      consume(env, { start: anchors[k - 1].end, end: a.end });
      return false;
    }
    return true;
  });
  // A lab anchor replaces any term anchor over it.
  anchors = anchors.filter((a) => a.lab || !labs.some((l) => l.start < a.end && a.start < l.end));
  restrictAnchors(anchors, clause, env);
  // Sub-rate introducers split the parent's stretch.
  const intros: Span[] = [];
  SUBRATE_INTRO.lastIndex = 0;
  let im: RegExpExecArray | null;
  while ((im = SUBRATE_INTRO.exec(text)) !== null) intros.push({ start: base + im.index, end: base + im.index + im[0].length });
  if (anchors.length === 0 && intros.length === 0) {
    // Elliptic continuation: "…, nausea was reported in 24 (24.0%); among those aged <65 years (n=205), in 31 (15.1%)" —
    // the same measure and arm as the clause before, for the subgroup this clause names (lu-21).
    const ell = /^\s*(?:among|in)\s+those\s+[^,;]{1,80},\s*in\s+/i.exec(text);
    const prev = env.state.lastIncidence;
    const prevArms = prev ? [...new Set(prev.arms.map((x) => (x ? armLabel(x) : '')))] : [];
    if (ell && prev && prevArms.length === 1 && prevArms[0] && (ctx.subgroups?.length ?? 0) > 0) {
      const its = freeItems(text.slice(ell[0].length), base + ell[0].length, env).filter((i) => i.percent || i.count);
      if (its.length === 1 && !its[0].arm) {
        consume(env, its[0]);
        const d = makeDraft('R-ellipsis', 'incidence', prev.key, valueOf(its[0]), its[0], ctx, env, { arm: prev.arms[0] });
        d.own.basis = prev.basis ?? ctx.basis ?? (env.doc.role === 'uspi' || env.doc.role === 'smpc' ? 'adverse_reaction' : 'adverse_event');
        out.push(d);
        return out;
      }
    }
    // "…; the corresponding figure for Drug X was 6.4%": the measure and population of the clause before, for the arm
    // this clause names. A very common CSR and 2.7.4 construction (r2 pv-corresponding-figure-for).
    const corr = new RegExp(String.raw`\bthe\s+corresponding\s+(?:figures?|values?|rates?|incidences?|proportions?|percentages?)\s+(?:for|in)\s+(?:the\s+)?(${ARM})(?:\s+(?:group|arm))?\s+(?:was|were)\s+`, 'i').exec(text);
    if (corr && prev) {
      const corrArm = armOf(corr[1]);
      const at = corr.index + corr[0].length;
      const its = freeItems(text.slice(at), base + at, env).filter((i) => i.percent || i.count);
      if (corrArm && its.length === 1) {
        consume(env, its[0]);
        const d = makeDraft('R-corresponding', 'incidence', prev.key, valueOf(its[0]), its[0], ctx, env, { arm: corrArm });
        d.own.basis = prev.basis ?? ctx.basis ?? 'adverse_event';
        out.push(d);
        return out;
      }
    }
    // A labelled list continued after ";": "Serious infections: ruxadolin 26/1,012 (2.6%); placebo 8/499 (1.6%)" —
    // the clause is only an arm and its value, under the measure the sentence's previous clause labelled (pvs-19).
    const cont = new RegExp(String.raw`^\s*(${ARM})\s*[:,]?\s+(?=\d)`, 'i').exec(text);
    const contArm = cont ? armOf(cont[1]) : null;
    const prevDraft = [...env.sentenceDrafts].reverse().find((d) => d.family === 'incidence' && d.arm?.kind === 'arm');
    if (contArm && prev && prevDraft && armLabel(prevDraft.arm) !== armLabel(contArm)) {
      const its = freeItems(text, base, env).filter((i) => i.percent || i.count);
      if (its.length === 1) {
        consume(env, its[0]);
        const d = makeDraft('R4-cont', 'incidence', prev.key, valueOf(its[0]), its[0], ctx, env, { arm: its[0].arm ?? contArm });
        d.own.basis = prev.basis ?? prevDraft.own.basis ?? 'adverse_event';
        out.push(d);
        return out;
      }
    }
    // "…, and 90% of them resolved": shares of the previous clause's events (C21).
    const parent = env.state.lastIncidence;
    for (const it of freeItems(text, base, env).filter((i) => i.percent && isShareItem(env.doc.text, i, base))) {
      consume(env, it);
      out.push(
        makeDraft('R-share', 'incidence', parent?.key ?? { category: 'any' }, valueOf(it), it, ctx, env, {
          issues: [{ reason: 'event_share_not_incidence', detail: 'A share of events (an outcome or a subset of them), not a subject incidence.' }],
        }),
      );
    }
    return out;
  }

  const ends = (k: number) => {
    const next = anchors[k + 1]?.start ?? clause.end;
    const intro = intros.find((s) => s.start >= anchors[k].end && s.start < next);
    return intro ? intro.start : next;
  };
  // Measure-wise "respectively": "serious adverse events and adverse events leading to discontinuation occurred in
  // 4,6 % and 3,3 % of patients receiving corvaprazan, respectively" — the values follow the measures, one arm (euc-23).
  // The values come in groups of two, one group per arm when the arm is written after each group ("in 58.4% and 4.6% of
  // Drug X patients and in 52.1% and 3.3% of placebo patients, respectively"), or as one group under the clause's
  // subject arm ("In the Drug X group, SAEs and deaths were reported in 4.6% and 0.7% of patients, respectively").
  // The second measure may be deaths (r1 pv-respectively-across-measures, pv-respectively-measures-and-arms).
  const measureWise = new Set<number>();
  if (env.respectively) {
    for (let k = 0; k < anchors.length; k++) {
      const a1 = anchors[k];
      if (a1.lab) continue;
      const nextAnchor = anchors[k + 1];
      const joined = nextAnchor && !nextAnchor.lab && /^\s+and\s+$/.test(env.doc.text.slice(a1.end, nextAnchor.start));
      const deathsM = joined ? null : /^\s+and\s+deaths\b/i.exec(env.doc.text.slice(a1.end, clause.end));
      if (!joined && !deathsM) continue;
      const a2: Anchor | 'deaths' = joined ? nextAnchor : 'deaths';
      const a2End = joined ? nextAnchor.end : a1.end + deathsM![0].length;
      const stretch = env.doc.text.slice(a2End, joined ? ends(k + 1) : ends(k));
      if (!/\brespectively\b/i.test(stretch)) continue;
      const its = freeItems(stretch, a2End, env).filter((i) => i.percent || i.count);
      if (its.length < 2 || its.length % 2 !== 0) continue;
      const groups: Array<{ pair: [Item, Item]; arm: ArmRef | undefined }> = [];
      for (let g = 0; g < its.length; g += 2) {
        const [x, y] = [its[g], its[g + 1]];
        if (x.arm && y.arm && armLabel(x.arm) !== armLabel(y.arm)) break;
        groups.push({ pair: [x, y], arm: y.arm ?? x.arm ?? (its.length === 2 ? ctx.subjectArm : undefined) });
      }
      if (groups.length !== its.length / 2) continue;
      if (groups.length > 1 && (groups.some((g) => !g.arm) || new Set(groups.map((g) => armLabel(g.arm))).size !== groups.length)) continue;
      if (deathsM) consume(env, { start: a1.end, end: a2End });
      for (const { pair, arm } of groups) {
        [a1, a2].forEach((anc, j) => {
          const it = pair[j];
          consume(env, it);
          if (anc === 'deaths') {
            const d = makeDraft('X-measurewise', 'deaths', {}, valueOf(it), it, ctx, env, { arm });
            if (!arm) d.issues.push({ reason: 'arm_unidentified', slot: 'arm', detail: 'The measure-wise values name no arm.' });
            out.push(d);
            return;
          }
          const key: Record<string, string> = { category: anc.category, ...(anc.qual ? { qual: anc.qual } : {}), ...(anc.term ? { term: anc.term.name, termKind: anc.term.kind } : {}) };
          const d = makeDraft('R1-measurewise', 'incidence', key, valueOf(it), it, ctx, env, { arm });
          d.own.basis = anc.basis;
          if (!arm) d.issues.push({ reason: 'arm_unidentified', slot: 'arm', detail: 'The measure-wise values name no arm.' });
          if (anc.category === 'disc_unstated') d.issues.push({ reason: 'measure_unidentified', slot: 'measure', detail: 'The discontinuation does not say whether treatment or the study was discontinued (C6).' });
          out.push(d);
        });
      }
      measureWise.add(k);
      if (joined) measureWise.add(k + 1);
    }
  }
  for (let k = 0; k < anchors.length; k++) {
    const a = anchors[k];
    if (measureWise.has(k)) continue;
    const segStart = a.end;
    const segEnd = ends(k);
    let segText = env.doc.text.slice(segStart, segEnd);
    let items = freeItems(segText, segStart, env).filter((i) => i.percent || i.count);
    let itemsStart = segStart;
    // A predicate anchor with a value before it and its comparator after it: "Of the patients receiving Drug X, 4.6%
    // experienced an SAE, compared with 3.3% of those receiving placebo" — both values are the anchor's (r1).
    if (items.length > 0 && a.predicate && /^\s*,?\s*(?:compared\s+with|versus|vs\.?|and)\b/i.test(segText)) {
      const prevEnd = k > 0 ? anchors[k - 1].end : base;
      const pre = env.doc.text.slice(prevEnd, a.start);
      const preItems = freeItems(pre, prevEnd, env).filter((i) => i.percent);
      if (preItems.length === 1 && preItems[0].arm) items = [...preItems, ...items];
    }
    // Values before a predicate anchor ("39 (6.4%) A-treated patients … experienced at least one SAE").
    if (items.length === 0) {
      const prevEnd = k > 0 ? anchors[k - 1].end : base;
      const pre = env.doc.text.slice(prevEnd, a.start);
      const preItems = freeItems(pre, prevEnd, env).filter((i) => i.percent);
      if (preItems.length > 0) {
        items = preItems;
        segText = pre;
        itemsStart = prevEnd;
      }
    }
    items.push(...explicitZeros(segText, itemsStart).filter((z) => !items.some((i) => i.start <= z.start && z.end <= i.end)));
    items.sort((x, y) => x.start - y.start);
    if (items.length === 0) {
      // "Serious adverse reactions in >2% of patients included pneumonia (5%), pneumonitis (3.2%), …": a parent named
      // without a rate of its own; its sub-rates take the arms of the parent rate stated before, or the single arm.
      const intro = intros.find((s) => s.start >= a.end && s.start <= (anchors[k + 1]?.start ?? clause.end));
      const prev = env.state.lastIncidence;
      const parentArms = prev && prev.key.category === a.category && !prev.key.term ? prev.arms : env.doc.singleArm ? [{ kind: 'total' } as ArmRef] : [];
      if (intro && !a.term && !a.lab) {
        consume(env, a);
        out.push(...subrates(env.doc.text.slice(intro.end, anchors[k + 1]?.start ?? clause.end), intro.end, { category: a.category }, parentArms, a.basis, ctx, env));
      }
      continue;
    }
    // A trailing outcome clause after the values: "TEAEs occurred in 3.9% vs 2.4% (Drug X vs placebo) that led to dose
    // interruption" are TEAEs leading to interruption, never any TEAE (r1 pv-teae-trailing-led-to).
    let category = a.category;
    let qual = a.qual;
    if (!a.term && !a.lab) {
      const last = items[items.length - 1];
      const tail = env.doc.text.slice(last.end, Math.max(last.end, segEnd));
      const oc = OUTCOME_TAIL.exec(tail);
      if (oc) {
        const o = outcomeOf(oc[1]);
        if (o.category && category === 'any') category = o.category;
        else qual = qual ? `${qual}|${o.qual ?? oc[1].toLowerCase()}` : o.qual ?? oc[1].toLowerCase();
        consume(env, { start: last.end + oc.index, end: last.end + oc.index + oc[0].length });
      }
    }
    // A sub-list inside the anchor's own stretch belongs to the sub-rates below.
    const key: Record<string, string> = a.lab
      ? { lab: a.lab }
      : {
          category,
          ...(qual ? { qual } : {}),
          ...(a.term ? { term: a.term.name, termKind: a.term.kind, ...(a.term.grouping ? { grouping: a.term.grouping } : {}) } : {}),
        };
    // Shares of events or of a subset ("90% of them resolved", "mild (45%)", "52% were mild") are not incidence (C21).
    const shareItems = items.filter((it) => isShareItem(env.doc.text, it, itemsStart));
    if (shareItems.length > 0) {
      for (const it of shareItems) {
        consume(env, it);
        out.push(
          makeDraft('R-share', 'incidence', key, valueOf(it), it, ctx, env, {
            issues: [{ reason: 'event_share_not_incidence', detail: 'A share of events (severity, outcome or a subset), not a subject incidence.' }],
          }),
        );
      }
      items = items.filter((it) => !shareItems.includes(it));
      if (items.length === 0) continue;
    }
    const shares = shareReason(segText.slice(0, Math.max(0, items[items.length - 1].end - itemsStart)), '');
    if (shares) {
      for (const it of items) {
        consume(env, it);
        out.push(
          makeDraft('R-share', 'incidence', key, valueOf(it), it, ctx, env, {
            issues: [{ reason: 'event_share_not_incidence', detail: 'A share of events (severity, outcome or a subset), not a subject incidence.' }],
          }),
        );
      }
      continue;
    }
    // An elided term list: "Nausea was reported in 55 subjects (18.0%) on dapralutide 1.5 mg,
    // diarrhoea in 27 subjects (8.9%) and vomiting in 23 subjects (7.5%)" — the verb is elided after
    // the first item, so every later figure falls inside the first anchor's stretch and took the
    // first anchor's preferred term (r2 lbl-07). The report then names the wrong term, and the
    // figures are only kept from pairing by also losing their arm.
    if (a.term && !a.lab) {
      const groups = elidedTermGroups(segText, itemsStart, items, a.term.name, env);
      if (groups.length > 1) {
        const firstArms = bindArms(groups[0].items, segText, ctx, env);
        for (const g of groups) {
          let garms = g.items === groups[0].items ? firstArms : bindArms(g.items, segText, ctx, env);
          // A continuation names no arm: it is the elided list's own, by position, as "diarrhoea in 27
          // subjects (8.9%)" after "… on dapralutide 1.5 mg" is that arm's figure.
          if (g.items !== groups[0].items && garms.every((x) => !x) && firstArms.length === garms.length) garms = [...firstArms];
          g.items.forEach((it, j) => {
            consume(env, it);
            const d = makeDraft('R7', 'incidence', { ...key, term: g.term, termKind: 'pt' }, valueOf(it), it, ctx, env, { arm: garms[j] });
            d.own.basis = a.basis;
            out.push(d);
          });
        }
        env.state.lastIncidence = { key: { ...key, term: groups[groups.length - 1].term, termKind: 'pt' }, arms: firstArms, ctx, basis: a.basis };
        continue;
      }
    }
    const arms = bindArms(items, segText, ctx, env);
    const family = a.lab ? 'lab' : 'incidence';
    items.forEach((it, j) => {
      consume(env, it);
      const d = makeDraft(a.lab ? 'R-lab' : a.term ? 'R7' : 'R1-5', family, key, valueOf(it), it, ctx, env, { arm: arms[j] });
      d.own.basis = a.basis;
      if (it.range) d.issues.push({ reason: 'range_not_value', slot: 'value', detail: 'A range over the pooled studies, not a value: neither end of it is this incidence (C9).' });
      if (a.ascertainment) d.own.ascertainment = a.ascertainment;
      if (it.subgroups) d.own.subgroups = it.subgroups;
      if (it.armUnidentified) d.issues.push({ reason: 'arm_unidentified', slot: 'arm', detail: `"${it.armUnidentified}" names no identifiable arm.` });
      if (category === 'disc_unstated') d.issues.push({ reason: 'measure_unidentified', slot: 'measure', detail: 'The discontinuation does not say whether treatment or the study was discontinued (C6).' });
      out.push(d);
    });
    env.state.lastIncidence = { key, arms, ctx, basis: a.basis };
    // The anchor's own words are the measure ("Severe hypoglycemia (Level 3)", "Grade >=3 TEAEs"), not a qualifier.
    consume(env, a);
    // Sub-rates after an introducer in this anchor's stretch.
    const intro = intros.find((s) => s.start >= a.end && s.start <= (anchors[k + 1]?.start ?? clause.end));
    if (intro) out.push(...subrates(env.doc.text.slice(intro.end, anchors[k + 1]?.start ?? clause.end), intro.end, key, arms, a.basis, ctx, env));
  }
  // A sub-rate sentence with no anchor of its own: "The most common was nausea (5 [1.6%] vs 0)."
  if (anchors.length === 0 && intros.length > 0 && env.state.lastIncidence) {
    const parent = env.state.lastIncidence;
    const intro = intros[0];
    out.push(...subrates(env.doc.text.slice(intro.end, clause.end), intro.end, parent.key, parent.arms, parent.basis ?? ctx.basis ?? 'adverse_event', ctx, env));
  }
  return out;
}

const valueOf = (it: Item): ClaimValue => {
  const v: ClaimValue = {};
  if (it.count) v.count = it.count;
  if (it.percent) v.percent = it.percent;
  if (it.denominator) v.denominator = it.denominator;
  if (it.count?.exactZero || (it.count && /^0$/.test(it.count.digits) && !it.percent)) {
    v.percent = { raw: it.count.raw, digits: '0', sign: 1, dp: 0, kind: 'exact', exactZero: true };
  }
  return v;
};
export { valueOf as itemValue };

/**
 * A continuation of an elided term list: a comma or "and", then a term phrase of up to four plain
 * words, then "in" before a figure. The phrase is letters only, so "65 years of age" cannot be one.
 */
const ELIDED_TERM = /(?:,\s*(?:and\s+)?|\s+and\s+)([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,3})\s+in\s+(?=(?:a\s+total\s+of\s+)?\d)/gi;
/**
 * Function words and words about who or how many: a phrase holding one is a connective or a subgroup
 * description, not a preferred term. "… 65 years of age and older and in 15% of those younger than
 * 65 years" offers "older and" to the pattern above, and read as a term it would split that subgroup
 * sentence into two terms and lose both figures (lu-21). A term phrase names an event; it does not
 * say who, when or how many. `NOT_A_TERM` above rejects the measure words; this rejects these.
 */
const CONNECTIVE_PHRASE = /\b(?:a|an|the|and|or|of|in|on|at|to|from|with|for|than|those|that|whom|who|were|was|been|being|year|years|age|aged|older|younger|overall|total|respectively|compared|versus|vs|group|arm|each|both|either|neither|all|any|some|none|most|more|less|fewer|same|other|others|above|below|between)\b/i;

/**
 * The groups of an elided term list inside one anchor's stretch: ", diarrhoea in 27 subjects (8.9%)"
 * and " and vomiting in 23 subjects (7.5%)" after "Nausea was reported in 55 subjects (18.0%) on
 * dapralutide 1.5 mg". A continuation is a conjunction or comma, a phrase that reads as a preferred
 * term, and "in" before a figure — the elided "was reported". Each group holds the items from its
 * own position to the next continuation's; the first holds the anchor's own term.
 *
 * One group back means the stretch is not an elided list and the caller reads it as before. A phrase
 * `termKey` does not recognise ends the split rather than guessing: a figure under the wrong term is
 * the defect this exists to stop, and a figure under no term is reported unframed.
 */
function elidedTermGroups(
  segText: string,
  itemsStart: number,
  items: Item[],
  firstTerm: string,
  env: Env,
): Array<{ term: string; items: Item[] }> {
  const cuts: Array<{ at: number; term: string }> = [];
  for (const m of segText.matchAll(ELIDED_TERM)) {
    if (NOT_A_TERM.test(m[1]) || CONNECTIVE_PHRASE.test(m[1])) continue;
    const term = termKey(m[1].trim());
    if (!term || /\d/.test(term) || term === firstTerm) continue;
    const at = itemsStart + m.index! + m[0].length;
    if (!items.some((it) => it.start >= at)) continue;
    // The phrase reads as a preferred term: its own words are the measure, so no form reads them again.
    const tAt = itemsStart + m.index! + m[0].indexOf(m[1]);
    cuts.push({ at, term, ...({} as object) });
    consume(env, { start: tAt, end: tAt + m[1].length });
  }
  if (cuts.length === 0) return [{ term: firstTerm, items }];
  const bounds = [{ at: itemsStart, term: firstTerm }, ...cuts];
  return bounds
    .map((b, i) => ({
      term: b.term,
      items: items.filter((it) => it.start >= b.at && (i + 1 === bounds.length || it.start < bounds[i + 1].at)),
    }))
    .filter((g) => g.items.length > 0);
}

/** "headache (8.2% vs 4.0%), diarrhoea (…) and vomiting (…)": preferred-term claims of the parent (R6). */
function subrates(text: string, base: number, parent: Record<string, string>, parentArms: Array<ArmRef | undefined>, basis: 'adverse_event' | 'adverse_reaction', ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const re = /(?:^|,\s*(?:and\s+)?|\s+and\s+)\s*(?:the\s+)?([a-zA-Z][\w' -]{1,60}?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let rawTerm = m[1].trim().replace(/^(?:was|were|being)\s+/i, '');
    rawTerm = rawTerm.replace(/^(?:nausea|vomiting|diarrh\w+)\b.*$/i, (x) => x);
    const inner = m[2];
    const innerStart = base + m.index + m[0].lastIndexOf('(') + 1;
    const items = itemsIn(inner, innerStart, env.doc, { counts: true, inParens: true }).filter((i) => !isConsumed(env, i));
    if (items.length === 0) continue;
    // "(7.5% vs 1.3%)": the parent's arms in order; one value under a one-arm parent takes that arm.
    const unbound = items.filter((i) => !i.arm);
    let arms: Array<ArmRef | undefined> = items.map((i) => i.arm);
    if (unbound.length === items.length && parentArms.length === items.length) arms = [...parentArms];
    else if (unbound.length === 1 && items.length === 2 && parentArms.length === 2) {
      const bound = items.find((i) => i.arm)?.arm;
      const other = parentArms.find((p) => p && bound && armLabel(p) !== armLabel(bound));
      arms = items.map((i) => i.arm ?? other);
    }
    const term = termKey(rawTerm);
    if (!term || /\d/.test(term)) continue;
    items.forEach((it, j) => {
      consume(env, it);
      const d = makeDraft('R6', 'incidence', { ...parent, term, termKind: 'pt' }, valueOf(it), it, ctx, env, { arm: arms[j] });
      d.own.basis = basis;
      if (arms[j] === undefined) d.issues.push({ reason: 'arm_count_mismatch', slot: 'arm', detail: 'The sub-rate values cannot be bound to the arms of their parent.' });
      out.push(d);
    });
  }
  return out;
}

// ── Event shares, exposure-adjusted rates, frequency bands (C20, C21) ──────

export function nonIncidenceForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  const eair = /exposure-adjusted\s+(?:incidence|event)\s+rates?|\bEAIR\b|\bEAER\b|exposure-adjusted\s+\w+\s+rates?|per\s+\d[\d,. ]*\s*(?:(?:patient|subject|person)[\s-]?years?|PY)\b|per\s+(?:patient|subject|person)[\s-]?year\b/i;
  if (eair.test(text)) {
    const eventRate = /exposure-adjusted\s+event\s+rate|\bEAER\b|events\s+per\s+100/i.test(text);
    const items = itemsIn(text, base, env.doc, { counts: false, percentColumn: true }).filter((i) => !isConsumed(env, i) && (i.percent || i.count));
    const rateItems = items.filter((i) => {
      const after = env.doc.text.slice(i.end, i.end + 40);
      return (
        /^\s*(?:%\s*)?(?:per\s+\d|per\s+(?:patient|subject|person)|\/\s?\d+\s*(?:PY|(?:patient|subject|person)[\s-]?years?)\b|vs|and|\s*\(|patients\s+with\s+an\s+event\s+per|events\s+per)/i.test(after) ||
        /per\s+(?:patient|subject|person)[\s-]?year\b/i.test(text)
      );
    });
    // The event the clause names; else the one event its paragraph names ("Herpes zoster, All-Exposure Pool …: …. The
    // exposure-adjusted event rate was 3.0 events per 100 patient-years", pvs-16).
    const named = (t: string) => EAIR_NAMED_EVENTS.filter((r) => r.test(t)).length;
    const paragraph = env.paragraph ? env.doc.text.slice(env.paragraph.start, clause.end) : text;
    const evText = named(text) === 0 && named(paragraph) === 1 ? paragraph : text;
    const ev = eairEventOf(evText, text);
    // The rate's own words ("exposure-adjusted incidence rate (EAIR)", "per 100 patient-years") are its measure.
    for (const m of text.matchAll(new RegExp(eair.source, 'gi'))) consume(env, { start: base + m.index!, end: base + m.index! + m[0].length });
    // "2.1 per 100 patient-years with ruxadolin": the arm follows the rate's unit.
    for (const it of rateItems) {
      if (it.arm) continue;
      const after = new RegExp(String.raw`^\s*(?:%\s*)?(?:per\s+\d[\d,. ]*\s*(?:(?:patient|subject|person)[\s-]?years?|PY)|\/\s?\d+\s*PY)\s+(?:with|for|in|on)\s+(${ARM})`, 'i').exec(env.doc.text.slice(it.end));
      const arm = after ? armOf(after[1]) : null;
      if (arm) it.arm = arm;
    }
    const arms = bindArms(rateItems, text, ctx, env);
    rateItems.forEach((it, j) => {
      consume(env, it);
      // The rate's own denominator, normalised: "per 100 patient-years", "per 100 patient years" and "/100 PY" are
      // one unit; "per 1000 patient-years" is another, and C8 never converts between them (r2 num-01, num-17).
      const per = perUnitOf(env.doc.text.slice(it.end, it.end + 60)) ?? perUnitOf(text);
      const d = makeDraft('EAIR', 'eair', { ...ev, rate: eventRate ? 'eaer' : 'eair' }, { estimate: it.percent ?? it.count }, it, ctx, env, { arm: arms[j] ?? (rateItems.length === 1 ? { kind: 'total' } : undefined) });
      if (!per) d.issues.push({ reason: 'exposure_adjusted_rate', detail: 'An exposure-adjusted rate without a stated denominator (per how many patient-years).' });
      else d.own.unit = per;
      out.push(d);
    });
    return out;
  }
  return out;
}

/**
 * The denominator of an exposure-adjusted rate as written, normalised: "per 100 patient-years", "per 100 patient
 * years" and "/100 PY" are one unit ("100py"); "per 1000 patient-years" is another ("1000py"), and C8 never converts
 * between them (r2 num-01, num-17). Undefined when the rate states no count of patient-years at all — "5.1% per
 * patient-year" is not a rate this engine can identify, and is reported as not compared (fs-33, C21).
 */
function perUnitOf(s: string): string | undefined {
  const m =
    /per\s+(\d[\d,. ]*?)\s*(?:(?:patient|subject|person)[\s-]?years?|PY)\b/i.exec(s) ??
    /\/\s?(\d[\d,. ]*?)\s*(?:PY|(?:patient|subject|person)[\s-]?years?)\b/i.exec(s);
  return m ? `${m[1].replace(/[^\d]/g, '')}py` : undefined;
}

// ── Deaths (X forms) ────────────────────────────────────────────────────────

const CNT = String.raw`(?:\d{1,3}(?:[ ,.]\d{3})+|\d+|${NUMBER_WORDS})`;

export function deathForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  if (!/\bdeaths?\b|\bdied\b|\bMortality\b/i.test(text)) return out;
  if (/\bfatal\b/i.test(text)) return out;
  const rd = (s: string) => readNumber(s, { convention: env.doc.convention, countSlot: true }) ?? undefined;
  const draftOf = (form: string, value: ClaimValue, span: Span, arm: ArmRef | undefined, extra: Partial<Draft> = {}) => {
    consume(env, span);
    out.push(makeDraft(form, 'deaths', {}, value, span, ctx, env, { arm, ...extra }));
  };
  // Per-arm lists after a total: "(orbaglutide: 2; placebo: 1)", "(orbaglutide 3, placebo 1)", ": three in the A group … and two in the B group", "(2 tirnavotide, 1 placebo)".
  const perArm = (s: string, at: number): boolean => {
    const items = itemsIn(s, at, env.doc, { counts: true }).filter((i) => i.count && !isConsumed(env, i));
    if (items.length < 2 || items.some((i) => !i.arm)) return false;
    for (const it of items) draftOf('X2', { count: it.count!, ...(it.percent ? { percent: it.percent } : {}) }, it, it.arm);
    return true;
  };
  // "all-cause mortality was 6.4% among patients receiving Drug X", "the mortality rate in the Drug X group was
  // 6.4%": mortality is the death rate, the normal wording in CV and oncology CSRs and in Module 2.7.4 (r2
  // pv-all-cause-mortality).
  const mort = /\b(?:all-cause\s+|overall\s+)?mortality(?:\s+rate)?\b((?:\s+in\s+the\s+[^,;.]{1,40}?(?:group|arm))?)\s+(?:was|were)\s+(?=[<>≤≥]?\s?\d)/i.exec(text);
  if (mort) {
    const at = mort.index + mort[0].length;
    const its = itemsIn(text.slice(at), base + at, env.doc, { counts: true }).filter((i) => !isConsumed(env, i) && (i.percent || i.count));
    if (its.length >= 1) {
      consume(env, { start: base + mort.index, end: base + at });
      const arms = bindArms(its, text, ctx, env);
      its.forEach((it, j) => {
        const inGroup = new RegExp(String.raw`\s+in\s+the\s+(${ARM})\s+(?:group|arm)`, 'i').exec(mort[1]);
        const arm = it.arm ?? arms[j] ?? (inGroup ? armOf(inGroup[1]) ?? undefined : undefined);
        draftOf('X-mortality', valueOf(it), it, arm);
      });
      return out;
    }
  }
  // X1 total: "N deaths (occurred|were reported)", "There were N deaths", "N patients died", "Deaths: N", "In total, N subjects died".
  const total = new RegExp(
    String.raw`(?:^|[\s:,(])(?:A\s+total\s+of\s+|There\s+were\s+|there\s+were\s+|In\s+total,\s+)?(${CNT})\s+(?:(deaths?)\b(?:\s+(?:had\s+)?(?:occurred|were\s+reported|had\s+been\s+reported|have\s+been\s+reported))?|(?:${NOUN})\s+died)`,
    'gi',
  );
  let m: RegExpExecArray | null;
  const handled: Span[] = [];
  while ((m = total.exec(text)) !== null) {
    const numAt = m.index + m[0].indexOf(m[1]);
    const span = { start: base + numAt, end: base + m.index + m[0].length };
    if (isConsumed(env, { start: span.start, end: span.start + m[1].length })) continue;
    const count = rd(m[1]);
    if (!count) continue;
    const after = text.slice(m.index + m[0].length);
    const before = text.slice(0, numAt);
    // "168 deaths (58.5%) had occurred with cendrolimab and 191 (66.6%) with docetaxel": per arm, read below; never a total.
    if (new RegExp(String.raw`^\s*\(\s*[\d.,]+\s*%\s*\)\s+had\s+occurred\s+with\s+(?:${ARM})`, 'i').test(after)) continue;
    // Per arm by its own words: "2 deaths occurred in the Drug X group and 1 in the placebo group", "2 deaths on Drug X", "Drug X: 2 deaths".
    const inArm = new RegExp(String.raw`^\s*(?:occurred\s+|were\s+reported\s+)?(?:in\s+the\s+(${ARM})\s+(?:group|arm)|on\s+(${ARM})|with\s+(${ARM}))`, 'i').exec(after);
    const labelArm = new RegExp(String.raw`(?:^|[;:(]\s*)(${ARM})\s*:\s*$`, 'i').exec(before);
    const subjectArm = new RegExp(String.raw`^\s*(?:in\s+the\s+(${ARM})\s+(?:group|arm))`, 'i').exec(after);
    if (inArm || labelArm) {
      const phrase = inArm ? inArm[1] ?? inArm[2] ?? inArm[3] : labelArm![1];
      const arm = armOf(phrase);
      if (arm) {
        draftOf('X2', { count }, span, arm);
        // "… and 1 in the placebo group" / "… and 1 in the placebo arm".
        const rest = after.slice(inArm ? inArm[0].length : 0);
        const and = new RegExp(String.raw`^\s*(?:,\s*)?and\s+(${CNT})\s+(?:deaths?\s+)?(?:in\s+the\s+(${ARM})\s+(?:group|arm)|on\s+(${ARM}))`, 'i').exec(rest);
        if (and) {
          const c2 = rd(and[1]);
          const a2 = armOf(and[2] ?? and[3]);
          const at2 = base + m.index + m[0].length + (inArm ? inArm[0].length : 0) + and[0].indexOf(and[1]);
          if (c2 && a2) draftOf('X2', { count: c2 }, { start: at2, end: at2 + and[1].length }, a2);
        }
        handled.push(span);
        continue;
      }
    }
    void subjectArm;
    // "Two patients in the ondelimab group and one patient in the placebo group died": per arm.
    // A total with its per-arm list.
    draftOf('X1', { count }, span, { kind: 'total' });
    handled.push(span);
    const list = /^\s*(?:during[^:(]*?|in\s+(?:the\s+)?(?:study|Study\s+[\w-]+|Pool\s+\w+)[^:(]*?)?\s*[:(]([^)]*)\)?/.exec(after);
    if (list) {
      const listAt = base + m.index + m[0].length + list[0].indexOf(list[1]);
      perArm(list[1], listAt);
    } else {
      // "Four patients died during the study, three in the Drug X group": a comma-set per-arm part of the total. Each
      // count is bound by its own arm phrase; the total is never derived from it or compared with it (r1 sp-50).
      const tail = new RegExp(String.raw`^\s*(?:during[^,;:(]*?)?,\s*((?:${CNT})\s+in\s+the\s+(?:${ARM})\s+(?:group|arm)(?:\s*(?:,|and)\s*(?:${CNT})\s+in\s+the\s+(?:${ARM})\s+(?:group|arm))*)\s*(?=[.;]|$)`, 'i').exec(after);
      if (tail) {
        const tailAt = base + m.index + m[0].length + tail[0].indexOf(tail[1]);
        const items = itemsIn(tail[1], tailAt, env.doc, { counts: true }).filter((i) => i.count && i.arm && !isConsumed(env, i));
        for (const it of items) draftOf('X2', { count: it.count! }, it, it.arm);
      }
    }
  }
  // "N patients in the A group and N patient in the B group died" (subject-first per arm).
  const subjFirst = new RegExp(String.raw`(${CNT})\s+${NOUN}\s+in\s+the\s+(${ARM})\s+group\s+and\s+(${CNT})\s+${NOUN}\s+in\s+the\s+(${ARM})\s+group\s+died`, 'gi');
  while ((m = subjFirst.exec(text)) !== null) {
    const c1 = rd(m[1]);
    const c2 = rd(m[3]);
    const a1 = armOf(m[2]);
    const a2 = armOf(m[4]);
    const at1 = base + m.index;
    const at2 = base + m.index + m[0].indexOf(m[3], m[1].length + m[2].length);
    if (c1 && a1) draftOf('X2', { count: c1 }, { start: at1, end: at1 + m[1].length }, a1);
    if (c2 && a2) draftOf('X2', { count: c2 }, { start: at2, end: at2 + m[3].length }, a2);
  }
  // "Drug X: 2 deaths; placebo: 1 death" — label-first per arm.
  const labelled = new RegExp(String.raw`(${ARM})\s*:\s*(${CNT})\s+deaths?`, 'gi');
  while ((m = labelled.exec(text)) !== null) {
    const at = base + m.index + m[0].indexOf(m[2], m[1].length);
    const span = { start: at, end: at + m[2].length };
    if (isConsumed(env, span)) continue;
    const c = rd(m[2]);
    const arm = armOf(m[1]);
    if (c && arm) draftOf('X2', { count: c }, span, arm);
  }
  // "deaths in 0.3% vs 0.3%", "deaths occurred in 0.7% and 0.3%, respectively", "deaths occurred in 3 (0.5%) patients treated with A and 2 (0.3%) …".
  const rate = /\bdeaths\s+(?:occurred\s+)?in\s+/gi;
  while ((m = rate.exec(text)) !== null) {
    const from = m.index + m[0].length;
    const stop = text.slice(from).search(/;|\.\s|$/);
    const seg = text.slice(from, stop >= 0 ? from + stop : text.length);
    const items = itemsIn(seg, base + from, env.doc, { counts: true }).filter((i) => !isConsumed(env, i) && (i.percent || i.count));
    if (items.length === 0) continue;
    const arms = bindArms(items, seg, ctx, env);
    items.forEach((it, j) => {
      const v: ClaimValue = {};
      if (it.count) v.count = it.count;
      if (it.percent) v.percent = it.percent;
      draftOf('X3', v, it, arms[j]);
    });
  }
  // "168 deaths (58.5%) had occurred with A and 191 (66.6%) with B".
  const withArm = new RegExp(String.raw`(${CNT})\s+deaths\s*\(\s*([\d.,]+\s*%)\s*\)\s+had\s+occurred\s+with\s+(${ARM})\s+and\s+(${CNT})\s*\(\s*([\d.,]+\s*%)\s*\)\s+with\s+(${ARM})`, 'gi');
  while ((m = withArm.exec(text)) !== null) {
    const parts: Array<[string, string, string]> = [
      [m[1], m[2], m[3]],
      [m[4], m[5], m[6]],
    ];
    let at = base + m.index;
    for (const [c, p, a] of parts) {
      const cAt = env.doc.text.indexOf(c, at);
      const span = { start: cAt, end: cAt + c.length };
      at = span.end;
      const count = rd(c);
      const percent = readNumber(p, { convention: env.doc.convention }) ?? undefined;
      const arm = armOf(a);
      if (count && arm) draftOf('X2', { count, ...(percent ? { percent } : {}) }, span, arm);
    }
    consume(env, { start: base + m.index, end: base + m.index + m[0].length });
  }
  // "three in the orbaglutide group (…) and two in the placebo group (…)" after a total's colon, and "3 of them in Study X (2 A, 1 B)".
  const colonList = new RegExp(String.raw`(?:^|[:,]\s*)(${CNT})\s+in\s+the\s+(${ARM})\s+group(?:\s*\([^)]*\))?\s+and\s+(${CNT})\s+in\s+the\s+(${ARM})\s+group`, 'gi');
  while ((m = colonList.exec(text)) !== null) {
    const at1 = base + m.index + m[0].indexOf(m[1]);
    const s1 = { start: at1, end: at1 + m[1].length };
    if (isConsumed(env, s1)) continue;
    const at2 = base + m.index + m[0].lastIndexOf(m[3]);
    const c1 = rd(m[1]);
    const c2 = rd(m[3]);
    const a1 = armOf(m[2]);
    const a2 = armOf(m[4]);
    if (c1 && a1) draftOf('X2', { count: c1 }, s1, a1);
    if (c2 && a2) draftOf('X2', { count: c2 }, { start: at2, end: at2 + m[3].length }, a2);
  }
  const ofThem = new RegExp(String.raw`\b(${CNT})\s+of\s+them\s+in\s+(Study\s+[A-Z]{1,5}-\d+)\s*\(([^)]*)\)`, 'gi');
  while ((m = ofThem.exec(text)) !== null) {
    const at = base + m.index;
    const c = rd(m[1]);
    if (!c) continue;
    const study = env.doc.aliasOf.get(m[2].replace(/^Study\s+/, '')) ?? [m[2].replace(/^Study\s+/, '')];
    draftOf('X1', { count: c }, { start: at, end: at + m[1].length }, { kind: 'total' }, { own: { study: { kind: 'study', aliases: study } } });
    const listAt = base + m.index + m[0].lastIndexOf(m[3]);
    const items = itemsIn(m[3], listAt, env.doc, { counts: true }).filter((i) => i.count && i.arm);
    for (const it of items) {
      consume(env, it);
      out.push(makeDraft('X2', 'deaths', {}, { count: it.count! }, it, ctx, env, { arm: it.arm, own: { study: { kind: 'study', aliases: study } } }));
    }
    // The form owns its whole phrase: "of them" is its anaphor for the deaths just counted, not an event share.
    consume(env, { start: at, end: at + m[0].length });
  }
  return out;
}

export const ARM_RE = ARM;
