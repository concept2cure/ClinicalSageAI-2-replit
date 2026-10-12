/**
 * Extraction: a source → drafts with their context (design §4, §6). Headings
 * nest by section number; a figure-free sentence is context for the rest of its
 * paragraph; a paragraph's lead sentence lends its study, population, period,
 * analysis and subgroup to the sentences after it (never its arms or endpoint);
 * each clause adds its own qualifiers. Every trigger word a clause leaves
 * unclassified is carried into its drafts' context, so the frame stays
 * incomplete (§5.2). Every figure no form read is swept as `figure_not_read`.
 */
import { analyseDocument, type DocInfo } from './doc';
import { emptyCtx, withQuals, type Ctx, type Draft } from './context';
import type { Env, ParaState } from './env';
import { readClause } from './clause';
import { MEASURE_PHRASES } from './forms-misc';
import { ARM, ARM_HEAD, armListIn, armOf, itemsIn, subgroupsIn } from './items';
import { canonical, readNumber, WORD_FIGURE } from './number';
import { qualsOf, type Quals } from './quals';
import { blocksOf, clausesOf, inMask, openerChainOf, openerOf, sentencesOf, type HeadingBlock, type Sentence, type Span } from './segment';
import { tableDrafts } from './tables';
import type { ArmRef, ClaimSource, ExtractOptions } from './types';
import { SUBGROUP_CONTEXT_HEADING } from './vocabulary';

export interface UnreadFigure {
  span: Span;
  value: string;
  ctx: Ctx;
}

export interface Extraction {
  doc: DocInfo;
  drafts: Draft[];
  unread: UnreadFigure[];
}

/** The text with measure-defining phrases blanked (same length), so they are not read as scope. */
export function blankPhrases(text: string): string {
  let t = blankSubRateParens(text);
  for (const re of MEASURE_PHRASES) {
    re.lastIndex = 0;
    t = t.replace(re, (x) => ' '.repeat(x.length));
  }
  return t;
}

/**
 * A parenthetical sub-rate — "(5.9% in Japanese patients)", "(8.2% in patients aged 65 years and older)",
 * "(204 in Japan)" — states its own figure under its own restriction. Its words are blanked (same length) before the
 * clause's qualifiers are read, so the restriction belongs to that figure and never leaks onto the overall figure it
 * follows (r2 scope-07..10). The figure itself is read from the raw text by the forms, with that scope.
 */
export function blankSubRateParens(text: string): string {
  return text.replace(/\(\s*[<>≤≥]?\s*\d[\d.,]*\s*%?\s+(?:in|among|for)\s+([^()]{2,70})\)/gi, (whole, inner: string) =>
    /\b(?:[A-Z]{1,5}-\d{2,4}|NCT\d{8})\b/.test(inner) || subgroupsIn(inner).length === 0 ? whole : ' '.repeat(whole.length),
  );
}

const hasFigure = (doc: DocInfo, s: Span) => {
  for (let k = s.start; k < s.end; k++) if (/\d/.test(doc.text[k]) && !inMask(doc.masks, k, k + 1)) return true;
  return WORD_FIGURE.test(doc.text.slice(s.start, s.end));
};

/** The arms a sentence names in order: its "(A vs B)" / "respectively" list, else the arms its items bind, in order. */
function sentenceArmsOf(s: Sentence, doc: DocInfo): ArmRef[] | undefined {
  const list = armListIn(s.text);
  if (list) return list.arms;
  const seen: ArmRef[] = [];
  for (const it of itemsIn(s.text, s.start, doc, { counts: true })) {
    if (it.arm?.kind === 'arm' && !seen.some((a) => a.kind === 'arm' && it.arm!.kind === 'arm' && a.drug === it.arm!.drug && a.dose === it.arm!.dose)) seen.push(it.arm);
  }
  return seen.length >= 2 ? seen : undefined;
}

/** Slots a paragraph lead lends to later sentences: study/pool, population, period, analysis role/cut-off, subgroup. */
function lead(outer: Ctx, q: Quals, doc: DocInfo, s: Sentence): Ctx {
  const full = withQuals(outer, q, 'paragraph-lead', doc);
  // A period the lead states inside its own claim ("Through Week 52 there were 3 deaths") is that claim's window;
  // only a comma-set opener ("During the double-blind period, …") is a window for the paragraph (fs-36).
  const opener = openerOf(s);
  const openerPeriod = opener ? qualsOf(blankPhrases(opener.text), opener.start, doc).period : undefined;
  // The analysis the lead's comma-set openers name ("…, under the treatment-policy estimand (multiple imputation from
  // retrieved dropouts), …") frames the paragraph's results, as its population does (lu-18). A method written inside the
  // lead's own claim ("… was -0.58 (…) using multiple imputation under …") stays that claim's.
  const chain = openerChainOf(s);
  const ca = chain ? qualsOf(blankPhrases(chain.text), chain.start, doc).analysis : {};
  const analysis = { ...outer.analysis };
  for (const k of ['model', 'estimand', 'imputation', 'method'] as const) if (ca[k] !== undefined) analysis[k] = ca[k];
  return {
    ...outer,
    study: full.study,
    studyFrom: full.studyFrom,
    population: full.population,
    populationFrom: full.populationFrom,
    period: openerPeriod ?? (q.period ? outer.period : full.period),
    subgroups: full.subgroups,
    whole: full.whole,
    analysis,
  };
}

/** Unclassified triggers of a span not inside a phrase a form consumed. */
function unrecognisedIn(q: Quals, consumed: readonly Span[]): string[] {
  return q.unrecognisedSpans.filter((u) => !consumed.some((c) => c.start <= u.start && u.end <= c.end)).map((u) => u.word);
}

/** When a clause names two studies, each figure takes the nearest one (pvs-31 "612 in Study A and 615 in Study B"). */
function nearestStudies(drafts: Draft[], q: Quals) {
  const sets = new Map<string, Quals['studies'][number]>();
  for (const s of q.studies) if (!sets.has(s.aliases.join('|'))) sets.set(s.aliases.join('|'), s);
  if (sets.size < 2) return;
  for (const d of drafts) {
    if (d.own.study) continue;
    let best: Quals['studies'][number] | undefined;
    let dist = Infinity;
    for (const s of q.studies) {
      const gap = s.end <= d.span.start ? d.span.start - s.end : s.start >= d.span.end ? (s.start - d.span.end) * 1.5 : 0;
      if (gap < dist) {
        dist = gap;
        best = s;
      }
    }
    if (best) {
      d.own.study = { kind: 'study', aliases: best.aliases };
      d.slotFrom.study = 'clause';
    }
  }
}

function headingCtx(parent: Ctx, h: HeadingBlock, doc: DocInfo): Ctx {
  const q = qualsOf(blankPhrases(h.title), h.titleStart, doc);
  const ctx = withQuals(parent, q, 'heading', doc, { inheritPool: true });
  ctx.title = `${h.code} ${h.title}`.trim();
  ctx.section = h.code || h.title.trim();
  const special = SUBGROUP_CONTEXT_HEADING.test(h.title);
  SUBGROUP_CONTEXT_HEADING.lastIndex = 0;
  if (special) {
    ctx.subgroupContext = true;
    ctx.subgroups = parent.subgroups;
    ctx.whole = parent.whole;
  } else {
    ctx.unrecognised.push(...q.unrecognised);
  }
  const arms = armListIn(h.title);
  if (arms) ctx.armOrder = arms.arms;
  // "Hypoglycaemia (Study DPL-301, Safety Analysis Set; …)": the term is the title before its parenthetical.
  const t = h.title.replace(/[.:]$/, '').replace(/\s*\([^()]*\)\s*$/, '').trim();
  if (/^[A-Z][a-z]+(?:\s+[a-z]+)?$/.test(t) && !/^(?:Safety|Efficacy|Deaths?|Results?|Exposure|Disposition)$/i.test(t)) ctx.headingTerm = t;
  if (/\bdeaths?\b/i.test(t)) ctx.headingMeasure = 'deaths';
  return ctx;
}

export function extract(source: ClaimSource, opts: ExtractOptions = {}): Extraction {
  const doc = analyseDocument(source, opts.studyAliases ?? []);
  const consumed: Span[] = [];
  const drafts: Draft[] = [];
  let docCtx = emptyCtx('');
  if (doc.docStudy) {
    docCtx.study = doc.docStudy;
    docCtx.studyFrom = 'document';
  }
  if (doc.softPeriod) docCtx.softPeriod = doc.softPeriod;
  for (const t of [source.title, ...(source.headings ?? [])]) {
    if (!t) continue;
    const q = qualsOf(blankPhrases(t), 0, { ...doc, text: t });
    docCtx = withQuals(docCtx, q, 'document', doc, { inheritPool: true });
  }

  const stack: Array<{ depth: number; ctx: Ctx }> = [];
  /** The prose paragraph just read, under which context, and the population its lead stated. */
  let lastProse: { ctx: Ctx; population?: Ctx['population'] } | undefined;
  const current = () => stack[stack.length - 1]?.ctx ?? docCtx;
  let numbered = false;
  for (const block of blocksOf(doc.text, doc.masks)) {
    if (block.kind === 'heading') {
      if (block.code) numbered = true;
      const depth = block.code ? block.depth : numbered ? 99 : 0;
      while (stack.length && stack[stack.length - 1].depth >= depth && !(depth === 0 && stack[stack.length - 1].depth === 0 && false)) stack.pop();
      const parent = current();
      const hctx = headingCtx(parent, block, doc);
      stack.push({ depth, ctx: hctx });
      if (depth === 0) docCtx = stack[stack.length - 1].ctx;
      // A heading's own population size ("…; Safety Population N=1,219)") is read under the heading's context.
      const titleSpan = { start: block.titleStart, end: block.titleStart + block.title.length };
      if (block.title && hasFigure(doc, titleSpan)) {
        const s: Sentence = { ...titleSpan, text: block.title };
        const env: Env = { doc, sentence: s, consumed, state: {}, respectively: false, sentenceDrafts: [] };
        drafts.push(...readClause(s, { ...hctx, analysis: { ...hctx.analysis }, unrecognised: [] }, env));
      }
      continue;
    }
    if (block.kind === 'table') {
      // A table whose title names no population takes the one the paragraph just before it states
      // ("… in 128 patients with measurable disease at baseline." then "Table 6: Efficacy Results in CDB-202").
      const outer = current();
      const prior = lastProse && lastProse.ctx === outer && lastProse.population ? { ...outer, population: lastProse.population, populationFrom: 'paragraph-lead' as const } : outer;
      drafts.push(...tableDrafts(block, prior, doc, consumed));
      lastProse = undefined;
      continue;
    }
    // A figure-free prose line is context for the lines after it, like a heading ("Efficacy (FAS):").
    if (!hasFigure(doc, block)) {
      const parent = current();
      const q = qualsOf(blankPhrases(block.text), block.start, doc);
      const ctx = withQuals(parent, q, 'paragraph-lead', doc, { inheritPool: true });
      ctx.unrecognised.push(...q.unrecognised);
      const arms = armListIn(block.text);
      if (arms) ctx.armOrder = arms.arms;
      if (!numbered) {
        while (stack.length && stack[stack.length - 1].depth >= 0 && stack[stack.length - 1].depth < 1) stack.pop();
        stack.push({ depth: 0, ctx });
        docCtx = ctx;
      } else stack.push({ depth: 100, ctx });
      continue;
    }
    // A prose paragraph.
    const state: ParaState = {};
    let paraCtx = current();
    const sentences = sentencesOf(block.text, block.start);
    let ledBy: Sentence | undefined;
    sentences.forEach((s) => {
      const q = qualsOf(blankPhrases(s.text), s.start, doc);
      if (!hasFigure(doc, s)) {
        // A figure-free sentence is context for the rest of the paragraph (a table-like lead, "In this pool, …").
        paraCtx = withQuals(paraCtx, q, 'sentence', doc, { inheritPool: true });
        paraCtx.unrecognised.push(...q.unrecognised);
        const arms = armListIn(s.text);
        if (arms) paraCtx.armOrder = arms.arms;
        return;
      }
      const sentenceArms = sentenceArmsOf(s, doc);
      // A parallel value/arm list binds in order like "respectively" (r1 pv-paired-list-without-respectively).
      const respectively = /\brespectively\b/i.test(s.text) || !!armListIn(s.text)?.respectively;
      const env: Env = { doc, sentence: s, consumed, state, sentenceArms, respectively, sentenceDrafts: [], paragraph: { start: block.start, end: block.end } };
      const clauses = clausesOf(s);
      const opener = clauses.length > 1 ? openerOf(s) : null;
      const openerCtx = opener ? withQuals(paraCtx, qualsOf(blankPhrases(opener.text), opener.start, doc), 'sentence', doc) : paraCtx;
      // A study or pool the sentence names governs every clause of it, even where the opening scope
      // phrase ends before naming it. "In two 26-week, placebo-controlled trials (Trial 1, NCT…;
      // Trial 2, NCT…), 1,219 patients received at least one dose of study drug, and 541 … were
      // exposed for at least 24 weeks" puts the pool after a comma, so `openerOf` stops at that
      // comma and the clause after ", and" framed no study at all (r2 lbl-10). Only the study slot
      // carries, and only when the sentence settles on one study or pool: `oneStudy`/`onePool` yield
      // nothing when it names several, so "612 in Study A and 615 in Study B" still takes the
      // nearest study per figure (pvs-31).
      if (opener && !openerCtx.study) {
        const sentenceStudy = withQuals(paraCtx, q, 'sentence', doc).study;
        if (sentenceStudy) {
          openerCtx.study = sentenceStudy;
          openerCtx.studyFrom = 'sentence';
        }
      }
      let prevCtx = paraCtx;
      clauses.forEach((c, ci) => {
        const cq = qualsOf(blankPhrases(c.text), c.start, doc);
        // After ";" a clause continues the scope of the one before; after ", and" only the sentence opener's.
        const sep = doc.text.slice(s.start, c.start).replace(/\s+$/, '').slice(-1);
        const ctx = withQuals(ci === 0 ? paraCtx : sep === ';' ? prevCtx : openerCtx, cq, 'clause', doc);
        // "Among dapralutide-treated subjects aged >=65 years (n=100), nausea was reported in 24 (24.0%)": the opener's arm.
        // "In the Drug X group, SAEs and deaths were reported in …": the opener's arm group is the subject (r1).
        const subject =
          new RegExp(String.raw`^\s*Among\s+(${ARM_HEAD})-treated\s+(?:subjects|patients|participants)\b`, 'i').exec(c.text) ??
          new RegExp(String.raw`^\s*(?:[^,;:]{2,80}:\s*)?(?:In|Among|For)\s+the\s+(${ARM})\s+(?:group|arm)\b(?:\s+of\s+[^,;]{0,60})?\s*,`, 'i').exec(c.text);
        // "For the Drug X group, the incidence of serious adverse events resulted 4.6%": the arm the sentence's
        // opener makes its subject governs the clauses after it (r2 pv-resulted-verb-read-as-arm).
        const openerSubject = opener
          ? new RegExp(String.raw`(?:^|[:;,]\s*)(?:In|Among|For)\s+(?:the\s+)?(${ARM})\s+(?:group|arm)\b(?:\s+of\s+[^,;]{0,60})?\s*$`, 'i').exec(opener.text)
          : null;
        const subjectArm = subject ? armOf(subject[1]) : openerSubject ? armOf(openerSubject[1]) : null;
        if (subjectArm) ctx.subjectArm = subjectArm;
        else delete ctx.subjectArm;
        prevCtx = ctx;
        if (sentenceArms) ctx.armOrder = sentenceArms;
        else if (!ctx.armOrder && state.armOrder) ctx.armOrder = state.armOrder;
        const before = consumed.length;
        const made = readClause(c, ctx, env);
        nearestStudies(made, cq);
        // Trigger words left unclassified in the clause, outside every phrase a form consumed.
        const formSpans = consumed.slice(before);
        const unrec = unrecognisedIn(cq, [...formSpans, ...made.map((d) => d.span)]);
        if (unrec.length) {
          ctx.unrecognised.push(...unrec);
        }
        drafts.push(...made);
        env.sentenceDrafts.push(...made);
      });
      // The lead is the paragraph's first sentence, or its first figure-bearing one when only context precedes it.
      if (!ledBy) {
        paraCtx = lead(paraCtx, q, doc, s);
        ledBy = s;
      }
      if (sentenceArms) state.armOrder = sentenceArms;
      else {
        // The arms the sentence's figures were bound to, in text order, establish the order for later "V versus V".
        // A figure applied to every arm ("287 per arm") carries no order: only figures each bound to their own arm count.
        const bound: ArmRef[] = [];
        const own = env.sentenceDrafts.filter((d) => env.sentenceDrafts.filter((e) => e.span.start === d.span.start).length === 1);
        for (const d of own.sort((x, y) => x.span.start - y.span.start)) {
          const a = d.arm;
          if (a?.kind === 'arm' && !bound.some((b) => b.kind === 'arm' && b.drug === a.drug && b.dose === a.dose)) bound.push(a);
        }
        if (bound.length >= 2) state.armOrder = bound;
      }
    });
    // The population this paragraph itself states (its lead), for a table that follows it directly.
    const stated = paraCtx.population && paraCtx.populationFrom === 'paragraph-lead' ? paraCtx.population : undefined;
    lastProse = { ctx: current(), ...(stated ? { population: stated } : {}) };
  }

  // Every figure no form read: reported, never silently dropped (F13).
  const unread: UnreadFigure[] = [];
  const covered = [...consumed, ...drafts.map((d) => d.span)];
  // An approximation or a bound is swept with its qualifier, so it is reported as what it is (C9).
  const NUMRE = /(?<![\w.,·^])(?:(?:[Aa]pproximately|[Aa]bout|[Aa]round|[Nn]early|[Aa]lmost|ca\.|~|[Mm]ore\s+than|[Ll]ess\s+than|[Ff]ewer\s+than)\s+)?(?:[<>≤≥]\s?)?[-−–]?\d+(?:[.,·]\d+)*(?:\s?%)?/g;
  let m: RegExpExecArray | null;
  while ((m = NUMRE.exec(doc.text)) !== null) {
    const span = { start: m.index, end: m.index + m[0].length };
    const digitAt = m.index + m[0].search(/\d/);
    if (inMask(doc.masks, digitAt, digitAt + 1)) continue;
    if (covered.some((c) => c.start <= digitAt && digitAt < c.end)) continue;
    if (/[A-Za-z]/.test(doc.text[span.end] ?? '') && !/\s/.test(doc.text[span.end] ?? '')) continue;
    const w = readNumber(m[0].replace(/^[-−–](?=\d)/, (x) => x), { convention: doc.convention });
    if (!w) continue;
    unread.push({ span, value: canonical(w), ctx: current() });
  }
  return { doc, drafts, unread };
}
