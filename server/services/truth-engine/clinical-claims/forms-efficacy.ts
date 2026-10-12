/**
 * Prose forms for efficacy figures (design §6.2, E, P, RR forms; C7, C8, C12,
 * C14, C15). An effect is named by its type (hazard ratio, odds ratio, LS mean
 * difference …) within its clause, read with its interval and p-value as
 * written, and keyed by endpoint — never "the primary effect" (F4). A p-value
 * is a component of the effect it is written with. Responder proportions,
 * medians and per-arm means are per-arm claims of their endpoint.
 */
import { armOf, ARM, itemsIn, type Item } from './items';
import { bindArms } from './forms-safety';
import { estimateAt, P_ALONE, pAt, type EstimateGroup } from './ci';
import { consume, isConsumed, makeDraft, type Env } from './env';
import type { Ctx, Draft, EndpointCtx } from './context';
import { qualsOf } from './quals';
import { readNumber } from './number';
import { inMask, type Sentence, type Span } from './segment';
import type { ArmRef, CI, ClaimValue, Contrast } from './types';
import { EFFECT_ROWS, ENDPOINT_ROWS, EVENT_ROWS, type EffectType } from './vocabulary';

interface EffectAnchor extends Span {
  type: EffectType;
  ls: boolean;
  phrase: string;
}

function effectAnchors(text: string, base: number): EffectAnchor[] {
  const out: EffectAnchor[] = [];
  for (const row of EFFECT_ROWS) {
    row.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = row.re.exec(text)) !== null) {
      const s = { start: base + m.index, end: base + m.index + m[0].length };
      if (out.some((o) => o.start < s.end && s.start < o.end)) continue;
      // "creatinine ratio", "rate ratio" inside an endpoint name are not effect names.
      if (/ratio/i.test(m[0]) && /albumin-to-creatinine\s+$/i.test(text.slice(0, m.index))) continue;
      out.push({ ...s, type: row.key, ls: row.key === 'ls_mean_difference', phrase: m[0] });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The endpoint of an estimate: in its own region, else the sentence (one), else the context (one). */
function endpointFor(region: string, regionBase: number, sentence: string, ctx: Ctx, env: Env): (EndpointCtx & { role?: string }) | undefined {
  const qr = qualsOf(region, regionBase, env.doc);
  const pick = (q: ReturnType<typeof qualsOf>) => {
    const ids = [...new Set(q.endpoints.map((e) => e.id))];
    if (ids.length === 0) return undefined;
    const e = q.endpoints[q.endpoints.length - 1];
    return { id: e.id, kind: e.kind, unit: e.unit, pct: q.endpoints.some((x) => x.pct && x.id === e.id), role: q.endpointRole };
  };
  const r = pick(qr);
  if (r) return r;
  // An effect on an adverse-event incidence ("SAEs …: 4.6% vs 3.3% (difference 1.3%, …)"): the endpoint is the event category.
  const ae = (s: string) => {
    for (const row of EVENT_ROWS) {
      row.re.lastIndex = 0;
      if (row.re.test(s)) return { id: `ae:${row.key}`, kind: 'binary' as const, pct: false };
    }
    return undefined;
  };
  const aeR = ae(region);
  if (aeR) return aeR;
  const qs = qualsOf(sentence, 0, env.doc);
  const ids = [...new Set(qs.endpoints.map((e) => e.id))];
  if (ids.length === 1) {
    const e = qs.endpoints[0];
    return { id: e.id, kind: e.kind, unit: e.unit, pct: qs.endpoints.some((x) => x.pct), role: qr.endpointRole ?? qs.endpointRole };
  }
  const aeS = ids.length === 0 ? ae(sentence) : undefined;
  if (aeS) return aeS;
  const aeT = ids.length === 0 && !ctx.endpoint && ctx.title ? ae(ctx.title) : undefined;
  if (aeT) return aeT;
  if (ctx.endpoint) return { ...ctx.endpoint, role: qr.endpointRole ?? ctx.endpointRole };
  return qr.endpointRole || ctx.endpointRole ? ({ role: qr.endpointRole ?? ctx.endpointRole } as EndpointCtx & { role?: string }) : undefined;
}

const CONTRAST_PATTERNS: Array<{ re: RegExp; stated: boolean; both: boolean }> = [
  { re: new RegExp(String.raw`\(\s*(${ARM})\s+(?:minus|-|−|–|vs\.?|versus|\/)\s+(${ARM})\s*\)`, 'gi'), stated: true, both: true },
  { re: new RegExp(String.raw`\b(${ARM}|Test)\s*\/\s*(${ARM}|Reference)\b`, 'g'), stated: true, both: true },
  { re: new RegExp(String.raw`(?:^|[\s,:(])(${ARM})\s+(?:minus|-|−)\s+(${ARM})\b`, 'gi'), stated: true, both: true },
  { re: new RegExp(String.raw`\bfor\s+(${ARM})\s+(?:versus|vs\.?)\s+(${ARM})\b`, 'gi'), stated: true, both: true },
  { re: new RegExp(String.raw`\bwith\s+(${ARM})\s+than\s+(?:with\s+)?(${ARM})\b`, 'gi'), stated: true, both: true },
  { re: new RegExp(String.raw`(?:^|[\s,:(])(${ARM})\s+(?:vs\.?|versus)\s+(${ARM})(?=\s*[,:)]|\s+\d)`, 'gi'), stated: true, both: true },
  { re: new RegExp(String.raw`\b(${ARM})\s+(?:reduced|significantly\s+prolonged|was\s+superior\s+to|demonstrated)\b[^.;]*?\b(?:compared\s+with|relative\s+to|versus|vs\.?)\s+(${ARM})\b`, 'gi'), stated: false, both: true },
  { re: new RegExp(String.raw`\btreatment\s+with\s+(${ARM})\b[^.;]*?\bcompared\s+with\s+(${ARM})\b`, 'gi'), stated: false, both: true },
  { re: new RegExp(String.raw`\b(?:vs\.?|versus|from|compared\s+with|relative\s+to)\s+(${ARM})\b`, 'gi'), stated: false, both: false },
];

/** The contrast an effect's region states (C12): "(A minus B)", "A vs B", "vs placebo", "with A than B". */
export function contrastIn(region: string, ctx: Ctx, env: Env): Contrast | undefined {
  for (const p of CONTRAST_PATTERNS) {
    p.re.lastIndex = 0;
    const m = p.re.exec(region);
    if (!m) continue;
    if (p.both) {
      const test = /^Test$/i.test(m[1]) ? ({ kind: 'arm', drug: 'test', label: 'Test' } as ArmRef) : armOf(m[1]);
      const control = /^Reference$/i.test(m[2]) ? ({ kind: 'arm', drug: 'reference', label: 'Reference' } as ArmRef) : armOf(m[2]);
      if (test && control) return { test, control, stated: p.stated };
    } else {
      const control = armOf(m[1]);
      if (control) return { control, stated: false };
    }
  }
  void ctx;
  void env;
  return undefined;
}

const firstValueAfter = (text: string, from: number, base: number, env: Env): number => {
  for (let k = from; k < text.length; k++) {
    const ch = text[k];
    if (!/[-−–\d]/.test(ch)) continue;
    if (/[-−–]/.test(ch) && !/\d/.test(text[k + 1] ?? '') && !(text[k + 1] === ' ' && /\d/.test(text[k + 2] ?? ''))) continue;
    if (k > 0 && /[\w.,·]/.test(text[k - 1])) continue;
    if (inMask(env.doc.masks, base + k, base + k + 1)) continue;
    if (isConsumed(env, { start: base + k, end: base + k + 1 })) continue;
    return k;
  }
  return -1;
};

/** The effect type of a 'difference' by its endpoint (C7). */
export function resolveType(type: EffectType, ls: boolean, endpoint: EndpointCtx | undefined, env: Env, region: string): EffectType | undefined {
  if (ls || (type === 'difference' && env.doc.lsMeans)) return 'ls_mean_difference';
  if (type !== 'difference') return type;
  if (/\b(?:in|of)\s+(?:the\s+)?(?:LS|least[\s-]squares?)\s+mean\b/i.test(region)) return 'ls_mean_difference';
  // "The LS mean percent change from baseline in LDL-C at Week 24, treatment difference vs placebo": the difference of LS means (C7, em-22).
  if (/\b(?:LS|least[\s-]squares?)\s+mean\s+(?:percent\s+)?change\b[^.;]{0,120}?,\s*(?:the\s+)?treatment\s+difference\b/i.test(region)) return 'ls_mean_difference';
  if (!endpoint?.id) return /\bresponse\s+rates?\b|\bproportion\b|\brate\b/i.test(region) ? 'risk_difference' : undefined;
  if (endpoint.kind === 'binary') return 'risk_difference';
  if (endpoint.kind === 'continuous') return 'mean_difference';
  return undefined;
}

export function scaleOf(type: EffectType, g: { pctMarked: boolean; lower?: { pct?: string }; percentagePoints?: boolean }, endpoint: EndpointCtx | undefined): string {
  // A ratio written as a percentage ("GMR 104.12% (90% CI 97.35%, 111.36%)", the BE convention) is on the percent scale,
  // never converted to 1.0412 (C7, r1 nsf-08, nsf-10).
  if (/ratio|hazard|odds|relative_risk/.test(type)) return g.pctMarked ? 'percent' : 'ratio';
  if (type === 'rrr') return 'percent';
  if (type === 'risk_difference' || type === 'adjusted_risk_difference' || type === 'km_risk_difference') {
    return g.pctMarked || g.percentagePoints || g.lower?.pct ? 'percentage_points' : 'proportion';
  }
  void endpoint;
  return 'units';
}

export function unitOf(g: EstimateGroup | undefined, region: string, endpoint: EndpointCtx | undefined): string | undefined {
  const stated = g?.unit?.replace(/^%$/, '%');
  if (stated && /percentage\s+points/.test(stated)) return '%';
  if (stated) return stated;
  const paren = /\((%|L|kg|mmHg|mmol\/mol|g\/day)\)/.exec(region);
  if (paren) return paren[1];
  if (endpoint?.pct) return '%';
  return endpoint?.unit;
}

function effectValue(g: EstimateGroup): ClaimValue {
  const v: ClaimValue = { estimate: g.estimate };
  if (g.lower) v.lower = g.lower;
  if (g.upper) v.upper = g.upper;
  if (g.intervalUnread) v.intervalUnread = g.intervalUnread;
  if (g.p) v.p = g.p;
  if (g.p && g.pBasis) v.pBasis = g.pBasis;
  return v;
}

interface TrailingScope extends Span {
  subgroups?: string[];
  issue?: Draft['issues'][number];
}

/**
 * The scope written right after one estimate (r1 sp-58, pv-effect-trailing-dose): "for the overall population" (the
 * whole population), "for patients with baseline HbA1c of 8.5% or higher" (that subgroup, as written), "for the 0.5 mg
 * dose" (a dose arm whose drug is not named: the contrast is not identified). The phrase is consumed, so its words never
 * qualify the clause's other figures.
 */
function trailingScope(text: string, from: number, base: number, env: Env): TrailingScope | undefined {
  const rest = text.slice(from);
  const whole = /^\s+for\s+(?:the\s+)?(?:overall|whole|entire|total)\s+(?:study\s+|safety\s+|analysis\s+)?population\b|^\s+for\s+all\s+(?:randomi[sz]ed\s+)?(?:patients|subjects|participants)\b/i.exec(rest);
  if (whole) {
    const span = { start: base + from, end: base + from + whole[0].length };
    consume(env, span);
    return { ...span, subgroups: [] };
  }
  const dose = /^\s+for\s+the\s+(\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|g|mL|mg\/kg)(?:\/day)?)\s+(?:dose|arm|group|dose\s+group)\b/i.exec(rest);
  if (dose) {
    const span = { start: base + from, end: base + from + dose[0].length };
    consume(env, span);
    return { ...span, issue: { reason: 'contrast_unidentified', slot: 'contrast', detail: `"${dose[0].trim()}": the dose arm of the contrast names no drug, so the contrast is not identified (C12).` } };
  }
  const sub = /^\s+(?:for|in|among)\s+((?:the\s+)?(?:patients|subjects|participants|those)\s+(?:with|aged|who|from|enrolled|weighing|on)\b[^;()]*?)(?=\s+and\s+[-−–]?\d|[;.]\s|[;.]?$)/i.exec(rest);
  if (sub) {
    const span = { start: base + from, end: base + from + sub[0].length };
    consume(env, span);
    return { ...span, subgroups: [`raw:${sub[1].toLowerCase().replace(/\s+/g, ' ').replace(/^the\s+/, '')}`] };
  }
  return undefined;
}

export function effectForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  const sentenceText = env.sentence.text;
  const anchors = effectAnchors(text, base);
  // "it was 0.76 (…)": the clause's effect is the previous clause's (pvs-04).
  const itWas = /\bit\s+was\s+(?=[-−–]?\d)/.exec(text);
  if (anchors.length === 0 && itWas && env.state.lastEffect) {
    anchors.push({ start: base + itWas.index, end: base + itWas.index + itWas[0].length, type: env.state.lastEffect.key.effect as EffectType, ls: false, phrase: 'it was' });
  }
  // "Drug X minus vancomycin: 3.6% (95% CI …)": a stated difference without the word (em-16).
  const minusLabel = new RegExp(String.raw`(?:^|,\s*)(${ARM})\s+minus\s+(${ARM})\s*:\s*(?=[-−–]?\d)`).exec(text);
  if (anchors.length === 0 && minusLabel) {
    anchors.push({ start: base + minusLabel.index, end: base + minusLabel.index + minusLabel[0].length, type: 'difference', ls: false, phrase: minusLabel[0] });
  }
  // "1.3% higher with Drug X than with placebo", "Drug X reduced the rate of treatment failure … by 3.1%": a difference
  // whose "%" may be percentage points or a relative change. Its type is not identified, so it is not compared, and it is
  // never read as an arm value (r1 nsf-19, nsf-20). "reduced the risk of … by N%" stays a relative risk reduction below.
  const AMBIGUOUS = [
    /([-−–]?\d+(?:[.,]\d+)?)\s?%\s+(?:higher|lower|greater|less|fewer|more)\b/gi,
    /\b(?:reduced|increased|lowered|decreased|improved)\s+(?:the\s+)?(?:rate|incidence|proportion|percentage|number|odds|frequency)\s+of\s+[^.;()]{1,80}?\s+by\s+(\d+(?:[.,]\d+)?)\s?%/gi,
  ];
  for (const re of AMBIGUOUS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const at = base + m.index + m[0].lastIndexOf(m[1]);
      const span = { start: at, end: at + m[1].length + (/^\s?%/.exec(text.slice(at - base + m[1].length))?.[0].length ?? 0) };
      if (isConsumed(env, span)) continue;
      const est = readNumber(`${m[1]}%`, { convention: env.doc.convention });
      if (!est) continue;
      consume(env, span);
      const d = makeDraft('E-diff-ambiguous', 'effect', { effect: 'unidentified' }, { estimate: est }, span, ctx, env);
      d.issues.push({ reason: 'effect_type_unidentified', slot: 'measure', detail: `"${m[0].trim()}": the "%" may be percentage points or a relative change, so the difference is not identified.` });
      out.push(d);
    }
  }
  // "the 95% CI for the stratified hazard ratio was 0.61 to 0.85, with a point estimate of 0.72": the interval written
  // before its estimate (r1 pv-ci-stated-before-estimate). The bounds are never the estimate.
  const ciFirst = new RegExp(
    String.raw`\b(?:the\s+)?(?:(two|one)-sided\s+)?(\d+(?:[.,]\d+)?)\s?%\s?(CI|confidence\s+interval|CrI|credible\s+interval)\s+(?:for|of)\s+(?:the\s+)?([A-Za-z][\w\s-]{2,60}?)\s+(?:was|is|were)\s+([-−–]?\s?\d+(?:[.,·]\d+)?)\s*(?:to|-|–|,)\s*([-−–]?\s?\d+(?:[.,·]\d+)?)\s*,?\s+with\s+(?:a\s+)?point\s+estimate\s+of\s+([-−–]?\s?\d+(?:[.,·]\d+)?)`,
    'gi',
  ).exec(text);
  if (ciFirst) {
    const effRow = EFFECT_ROWS.find((r) => new RegExp(`^(?:${r.re.source})$`, 'i').test(ciFirst[4].trim()) || new RegExp(r.re.source, 'i').test(ciFirst[4]));
    const estAt = base + ciFirst.index + ciFirst[0].lastIndexOf(ciFirst[7]);
    const span = { start: base + ciFirst.index, end: base + ciFirst.index + ciFirst[0].length };
    const rd = (x: string) => readNumber(x.replace(/\s+/g, ''), { convention: env.doc.convention }) ?? undefined;
    if (effRow && !isConsumed(env, span)) {
      const region = env.doc.text.slice(clause.start, span.start) + ' ' + ciFirst[4];
      const endpoint = endpointFor(region, clause.start, sentenceText, ctx, env);
      const type = resolveType(effRow.key, effRow.key === 'ls_mean_difference', endpoint, env, region);
      const g = { pctMarked: false };
      consume(env, span);
      const d = makeDraft('E-ci-first', 'effect', { effect: type ?? 'unidentified', ...(endpoint?.kind ? { kind: endpoint.kind } : {}) }, { estimate: rd(ciFirst[7]), lower: rd(ciFirst[5]), upper: rd(ciFirst[6]) }, { start: estAt, end: estAt + ciFirst[7].length }, ctx, env);
      d.span = span;
      if (!type) d.issues.push({ reason: 'effect_type_unidentified', slot: 'measure', detail: `"${ciFirst[4].trim()}" on an endpoint of unknown kind.` });
      d.own.endpoint = { ...(endpoint?.id ? { id: endpoint.id + (endpoint.pct ? '|pct' : '') } : {}), ...(endpoint?.role ? { role: endpoint.role } : {}) };
      if (type) d.own.scale = scaleOf(type, g, endpoint);
      d.own.ci = { level: ciFirst[2].replace(',', '.'), sided: ciFirst[1]?.toLowerCase() === 'one' ? 'one' : 'two', sidedStated: !!ciFirst[1], kind: /credible|CrI/i.test(ciFirst[3]) ? 'credible' : 'confidence' };
      const model = /\bunstratified\b/i.test(ciFirst[4]) ? 'unstratified' : /\bstratified\b/i.test(ciFirst[4]) ? 'stratified' : undefined;
      d.own.analysis = { ...(model ? { model } : {}) };
      const contrast = contrastIn(sentenceText, ctx, env);
      if (contrast) d.contrast = contrast;
      out.push(d);
      env.state.lastEffect = d;
    }
  }
  // RRR: "reduced the risk of <EP> … by 28%", "a 28% reduction in the risk of <EP>", and the same statement about a
  // rate rather than a risk — "reduced the annualized relapse rate by 54%", the wording of every MS and asthma
  // label (r2 num-14). The object must be a risk, a rate, an incidence or a frequency: "reduced HbA1c by 1.2%" is an
  // arm change, not a relative reduction.
  const RRR_OBJECT = String.raw`(?:(?:risk|rate|incidence|frequency)\s+of\s+(?:a\s+first\s+)?[A-Za-z][\w\s-]{1,60}?|[A-Za-z][\w\s-]{1,50}?\b(?:rate|incidence|frequency))`;
  const rrrForms = [
    new RegExp(String.raw`\breduced\s+the\s+(${RRR_OBJECT})\s+(?:per\s+BICR\s+)?by\s+(\d+(?:[.,]\d+)?)\s?%`, 'gi'),
    new RegExp(String.raw`\b(\d+(?:[.,]\d+)?)\s?(?:%|per\s+cent)\s+reduction\s+in\s+the\s+(${RRR_OBJECT})(?=\s*[(,.;]|$)`, 'gi'),
  ];
  for (const [k, re] of rrrForms.entries()) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const num = k === 0 ? m[2] : m[1];
      const epText = k === 0 ? m[1] : m[2];
      const at = base + m.index + m[0].indexOf(num, k === 0 ? m[0].indexOf(' by ') : 0);
      const span = { start: at, end: at + num.length };
      if (isConsumed(env, span)) continue;
      const est = readNumber(`${num}%`, { convention: env.doc.convention });
      if (!est) continue;
      const ep = ENDPOINT_ROWS.find((r) => new RegExp(r.re.source, 'i').test(epText));
      consume(env, span);
      const d = makeDraft('E-rrr', 'effect', { effect: 'rrr' }, { estimate: est }, span, ctx, env);
      d.own.endpoint = ep ? { id: ep.id } : {};
      d.own.scale = 'percent';
      const c = contrastIn(sentenceText, ctx, env);
      if (c) d.contrast = c;
      // A p-value in the parenthesis right after the reduction is the reduction's (sbx-010).
      const tail = env.doc.text.slice(span.end, env.sentence.end);
      void tail;
      out.push(d);
    }
  }
  let prevEnd = clause.start;
  const groups: Array<{ a: EffectAnchor; g: EstimateGroup; region: string; regionBase: number; scope?: TrailingScope }> = [];
  for (let k = 0; k < anchors.length; k++) {
    const a = anchors[k];
    const local = a.end - base;
    const limit = k + 1 < anchors.length ? anchors[k + 1].start - base : text.length;
    // "(95% CI)" or "(95% confidence interval)" between the name and the value declares the interval.
    const declM = /\(\s*(\d+(?:[.,]\d+)?)\s?%\s?(CI|confidence\s+interval|credible\s+interval)\s*\)/i.exec(text.slice(local, Math.min(limit, local + 80)));
    const decl = declM ? { level: declM[1].replace(',', '.'), kind: /credible/i.test(declM[2]) ? ('credible' as const) : ('confidence' as const) } : undefined;
    const at = firstValueAfter(text, local, base, env);
    if (at < 0 || at >= Math.min(limit === text.length ? text.length : limit + 40, local + 220)) continue;
    const g = estimateAt(text, at, env.doc, decl);
    if (!g) continue;
    // Two estimates "were V (…) and V (…), respectively" (E4).
    const region = env.doc.text.slice(prevEnd, base + at);
    const t1 = trailingScope(text, g.end, base, env);
    groups.push({ a, g: { ...g, start: base + g.start, end: base + g.end }, region, regionBase: prevEnd, scope: t1 });
    const after1 = t1 ? t1.end - base : g.end;
    const second = /^\s+and\s+(?=[-−–]?\d)/.exec(text.slice(after1));
    if (second && (/respectively/i.test(text.slice(g.end)) || t1)) {
      // "… -0.75% (95% CI …) for the overall population and -0.92% (95% CI …) for patients with …": each estimate takes
      // the scope written after it, never the other's (r1 sp-58).
      const g2 = estimateAt(text, after1 + second[0].length, env.doc, decl);
      if (g2) {
        const t2 = t1 ? trailingScope(text, g2.end, base, env) : undefined;
        if (!t1 || t2) groups.push({ a, g: { ...g2, start: base + g2.start, end: base + g2.end }, region, regionBase: prevEnd, scope: t2 });
      }
    }
    prevEnd = base + g.end;
  }
  // E4: "the hazard ratios for PFS and OS were …, respectively": endpoints by order.
  const e4 = groups.length >= 2 && groups.every((x) => x.a === groups[0].a) && /respectively/i.test(text);
  const e4Endpoints = e4 ? qualsOf(groups[0].region, groups[0].regionBase, env.doc).endpoints : [];
  groups.forEach(({ a, g, region, regionBase, scope }, idx) => {
    let endpoint = e4 && e4Endpoints.length === groups.length ? { ...e4Endpoints[idx], role: undefined } : endpointFor(region, regionBase, sentenceText, ctx, env);
    if (a.phrase === 'it was' && env.state.lastEffect?.own.endpoint?.id) {
      const prev = env.state.lastEffect;
      endpoint = { id: prev.own.endpoint!.id!, kind: (prev.key.kind as EndpointCtx['kind']) ?? 'tte', unit: prev.own.unit, pct: false };
    }
    const type = a.phrase === 'it was' ? (env.state.lastEffect!.key.effect as EffectType) : resolveType(a.type, a.ls, endpoint, env, region);
    const span = { start: g.start, end: g.end };
    if (isConsumed(env, span)) return;
    consume(env, span);
    const d = makeDraft('E1', 'effect', { effect: type ?? 'unidentified', ...(endpoint?.kind ? { kind: endpoint.kind } : {}) }, effectValue(g), span, ctx, env);
    if (!type) d.issues.push({ reason: 'effect_type_unidentified', slot: 'measure', detail: `"${a.phrase.trim()}" on an endpoint of unknown kind: mean or risk difference cannot be told.` });
    d.own.endpoint = { ...(endpoint?.id ? { id: endpoint.id + (endpoint.pct ? '|pct' : '') } : {}), ...(endpoint?.role ? { role: endpoint.role } : {}) };
    if (type) d.own.scale = scaleOf(type, g, endpoint);
    if (type && /difference/.test(type) && d.own.scale === 'units') d.own.unit = unitOf(g, region, endpoint);
    if (g.ci) d.own.ci = g.ci;
    const rq = qualsOf(region, regionBase, env.doc);
    const model = /\bunstratified\b/i.test(a.phrase) ? 'unstratified' : /\bstratified\b/i.test(a.phrase) ? 'stratified' : rq.analysis.model;
    d.own.analysis = { ...(model ? { model } : {}), ...(rq.analysis.estimand ? { estimand: rq.analysis.estimand } : {}) };
    if (/posterior/i.test(a.phrase) && d.own.ci) d.own.ci = { ...d.own.ci, kind: 'credible' };
    if (/\bCochran|CMH|stratified\s+by\b/i.test(region) && type === 'adjusted_risk_difference') d.own.analysis.model = 'cmh';
    if (/\bunadjusted\b/i.test(a.phrase)) d.key.adjusted = 'unadjusted';
    const contrast = (g.forArm ? { test: armOf(g.forArm) ?? undefined, stated: false } : undefined) ?? contrastIn(region + ' ' + text.slice(a.end - base, g.start - base), ctx, env) ?? contrastIn(sentenceText, ctx, env);
    const sentenceOrder = env.sentenceArms;
    d.contrast = contrast ?? (sentenceOrder && sentenceOrder.length === 2 ? { test: sentenceOrder[0], control: sentenceOrder[1], stated: false } : undefined);
    if (scope) {
      if (scope.subgroups) d.own.subgroups = scope.subgroups;
      if (scope.issue) d.issues.push(scope.issue);
    }
    out.push(d);
    // A second interval of the same estimate in the same bracket is its own claim, matched on its own level (r2 num-11).
    for (const x of g.extra ?? []) {
      const sib = makeDraft(
        'E1-interval',
        'effect',
        { ...d.key },
        { ...(d.value.estimate ? { estimate: d.value.estimate } : {}), ...(x.lower ? { lower: x.lower } : {}), ...(x.upper ? { upper: x.upper } : {}) },
        span,
        ctx,
        env,
        { arm: d.arm, contrast: d.contrast },
      );
      sib.own = { ...d.own, ci: x.ci };
      sib.issues.push(...d.issues);
      out.push(sib);
    }
    env.state.lastEffect = d;
  });
  // P-values written outside an estimate group: attach to the nearest effect before them in the sentence, else a p-only claim.
  P_ALONE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = P_ALONE.exec(text)) !== null) {
    const span = { start: base + pm.index, end: base + pm.index + pm[0].length };
    if (isConsumed(env, span)) continue;
    const pv = pAt(pm, env.doc);
    if (!pv) continue;
    const before = [...out, ...env.sentenceDrafts].filter((d) => d.family === 'effect' && d.span.end <= span.start && !d.value.p);
    const host = before.sort((x, y) => y.span.end - x.span.end)[0];
    consume(env, span);
    if (host) {
      host.value.p = pv.p;
      if (pv.basis) host.value.pBasis = pv.basis;
      continue;
    }
    const region = env.doc.text.slice(env.sentence.start, span.start);
    const endpoint = endpointFor(region, env.sentence.start, sentenceText, ctx, env);
    const d = makeDraft('P1', 'effect', { effect: 'unstated' }, { p: pv.p, ...(pv.basis ? { pBasis: pv.basis } : {}) }, span, ctx, env);
    d.own.endpoint = { ...(endpoint?.id ? { id: endpoint.id + (endpoint.pct ? '|pct' : '') } : {}), ...(endpoint?.role ? { role: endpoint.role } : {}) };
    out.push(d);
  }
  return out;
}

/** "label: V (CI)" sentences that state an estimate of the previous effect under another qualifier (em-16, em-35, em-36). */
export function ellipticEffect(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const prev = env.state.lastEffect;
  if (!prev) return [];
  const m = /^\s*([^:]{2,80}?)\s*:\s*(?=[-−–]?\d)/.exec(clause.text);
  if (!m || effectAnchors(clause.text, clause.start).length > 0) return [];
  const at = m[0].length;
  const g = estimateAt(clause.text, at, env.doc);
  if (!g || !g.ci) return [];
  const span = { start: clause.start + g.start, end: clause.start + g.end };
  if (isConsumed(env, span)) return [];
  consume(env, span);
  const d = makeDraft('E-elliptic', 'effect', { ...prev.key }, effectValue(g), span, ctx, env);
  d.own = { ...prev.own, ci: g.ci, analysis: { ...(prev.own.analysis ?? {}) } };
  const lq = qualsOf(m[1], clause.start, env.doc);
  if (lq.analysis.estimand) d.own.analysis!.estimand = lq.analysis.estimand;
  if (lq.analysis.role) d.own.analysis!.role = lq.analysis.role;
  const c = contrastIn(m[1], ctx, env);
  d.contrast = c ?? prev.contrast;
  if (lq.population) d.own.population = { set: lq.population.set, stated: true, ...(lq.population.allRandomized ? { allRandomized: true as const } : {}) };
  if (d.own.scale === 'percentage_points' && !g.pctMarked) d.own.scale = 'proportion';
  return [d];
}

// ── Responders, medians, per-arm means ──────────────────────────────────────

const RESPONDER_IDS = new Set(['acr20', 'acr50', 'acr70', 'easi75', 'easi90', 'pasi75', 'pasi90', 'pasi100', 'spga01', 'iga01', 'hba1c<7', 'weight_loss>=5pct', 'clinical_remission', 'sustained_remission', 'orr', 'cr', 'pr', 'svr12', 'clinical_cure', 'micro_eradication', 'treatment_failure', 'healing']);

export function responderForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  const q = qualsOf(text, base, env.doc);
  const eps = q.endpoints.filter((e) => RESPONDER_IDS.has(e.id));
  if (eps.length === 0) return out;
  if (!/\b(?:achiev\w*|reach\w*|meet\w*|response|rates?|proportion|was|were|ORR|remission|:)\b|:/i.test(text)) return out;
  const ep = eps[0];
  // ORR with its interval: "the ORR … was 40.6% (52/128; 95% CI: …)", "was 38.6% (95% CI 31.5, 46.1)".
  // Bracketed text is skipped whole: "the ORR per BICR (RECIST v1.1) was 40.6%" (lu-13).
  const orr = /\b(?:ORR|objective\s+response\s+rate|overall\s+response\s+rate)\b(?:[^.;()]|\([^()]*\)){0,80}?\bwas\s+(?=\d)/i.exec(text);
  if (orr) {
    const at = orr.index + orr[0].length;
    const g = estimateAt(text, at, env.doc);
    if (g && !isConsumed(env, { start: base + g.start, end: base + g.end })) {
      const span = { start: base + g.start, end: base + g.end };
      consume(env, span);
      const v: ClaimValue = { percent: g.estimate };
      if (g.lower) v.lower = g.lower;
      if (g.upper) v.upper = g.upper;
      const d = makeDraft('RR1-orr', 'responder', { endpoint: 'orr' }, v, span, ctx, env, { arm: { kind: 'total' } });
      if (g.ci) d.own.ci = g.ci;
      out.push(d);
      // "comprising 7 complete responses (5.47%) and 45 partial responses (35.16%)".
      const comp = /comprising\s+(\d+)\s+complete\s+responses?\s*\(\s*([\d.]+%)\s*\)\s+and\s+(\d+)\s+partial\s+responses?\s*\(\s*([\d.]+%)\s*\)/i.exec(text);
      if (comp) {
        for (const [n, p, id] of [
          [comp[1], comp[2], 'cr'],
          [comp[3], comp[4], 'pr'],
        ] as const) {
          const pAt2 = base + comp.index + comp[0].indexOf(p);
          const s2 = { start: pAt2, end: pAt2 + p.length };
          if (isConsumed(env, s2)) continue;
          consume(env, s2);
          out.push(makeDraft('RR1-comp', 'responder', { endpoint: id }, { count: readNumber(n, { countSlot: true })!, percent: readNumber(p)! }, s2, ctx, env, { arm: { kind: 'total' } }));
        }
        consume(env, { start: base + comp.index, end: base + comp.index + comp[0].length });
      }
      return out;
    }
  }
  const items = itemsIn(text, base, env.doc, { counts: false }).filter((i) => i.percent && !isConsumed(env, i) && !(i.start >= base + ep.start - base && i.end <= ep.end));
  const real = items.filter((i) => !(i.start < ep.end && ep.start < i.end));
  if (real.length === 0) return out;
  const arms = bindArms(real, text, ctx, env);
  real.forEach((it, j) => {
    consume(env, it);
    out.push(makeDraft('RR1', 'responder', { endpoint: ep.id }, { percent: it.percent!, ...(it.count ? { count: it.count } : {}) }, it, ctx, env, { arm: arms[j] ?? (real.length === 1 ? undefined : undefined) }));
  });
  return out;
}

const MEDIAN = /\b[Mm]edian\s+(?:PFS|OS|DOR|overall\s+survival|progression-free\s+survival|duration\s+of\s+response)\b/;

export function medianForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  const m = MEDIAN.exec(text);
  if (!m) return out;
  const epText = m[0];
  const ep = /PFS|progression/i.test(epText) ? 'pfs' : /DOR|duration/i.test(epText) ? 'dor' : 'os';
  const groups: Array<{ g: EstimateGroup; arm?: ArmRef }> = [];
  let k = m.index + m[0].length;
  while (k < text.length) {
    const at = firstValueAfter(text, k, base, env);
    if (at < 0) break;
    const g = estimateAt(text, at, env.doc);
    if (!g) break;
    let end = g.end;
    if (!/months/.test(g.unit ?? '') && /^\s*(?:vs\.?|versus|and)\s+[\d]/.test(text.slice(end)) === false && /^\s*months/.test(text.slice(end))) end += /^\s*months/.exec(text.slice(end))![0].length;
    const after = text.slice(end);
    const armM = new RegExp(String.raw`^\s*(?:months\s+)?(?:with\s+(${ARM})|in\s+the\s+(${ARM})\s+arm)`, 'i').exec(after);
    let arm: ArmRef | undefined;
    if (armM) {
      arm = armOf(armM[1] ?? armM[2]) ?? undefined;
      end += armM[0].length;
    }
    groups.push({ g: { ...g, end }, arm });
    k = end;
    if (!/^\s*(?:months\s+)?(?:vs\.?|versus|and)\s+/i.test(text.slice(end)) && !/^\s*(?:months)?\s*\(/.test(text.slice(end))) break;
  }
  if (groups.length === 0) return out;
  const items = groups.map((x) => ({ start: base + x.g.start, end: base + x.g.end, arm: x.arm }) as Item);
  const arms = bindArms(items, text, ctx, env, { vsPair: true });
  groups.forEach(({ g }, j) => {
    const span = { start: base + g.start, end: base + g.end };
    if (isConsumed(env, span)) return;
    consume(env, span);
    const v: ClaimValue = { estimate: g.estimate };
    if (g.lower) v.lower = g.lower;
    if (g.upper) v.upper = g.upper;
    // "(interquartile range 6.1, 12.3)": the bounds are kept as written, with the kind that keeps them from being
    // set against a confidence interval's (r2 num-12).
    if (g.intervalUnread) v.intervalUnread = g.intervalUnread;
    const d = makeDraft('M1', 'median', { endpoint: ep }, v, span, ctx, env, { arm: arms[j] ?? (groups.length === 1 ? { kind: 'total' } : undefined) });
    if (g.ci) d.own.ci = g.ci;
    out.push(d);
  });
  return out;
}

/** Per-arm means: "LS mean change … was -1.10% with A and -0.48% with B", "(baseline means 8.07% and 8.12%)", "Drug X -16.9% vs placebo -2.4%". */
export function armMeanForms(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  const text = clause.text;
  const base = clause.start;
  const kinds: Array<{ re: RegExp; family: 'arm_change' | 'baseline_mean'; stat: string }> = [
    { re: /\bbaseline\s+means?\b/gi, family: 'baseline_mean', stat: 'mean' },
    { re: /\b(?:LS|least[\s-]squares?)\s+mean\s+(?:percent\s+)?change\b(?!\s+from\s+baseline\s+in\s+HbA1c\s+was\s+-?\d+(?:\.\d+)?%\s*\(95)/gi, family: 'arm_change', stat: 'ls' },
    { re: /\b(?:The\s+)?mean\s+(?:percent\s+)?change\b/gi, family: 'arm_change', stat: 'mean' },
    { re: /\bPercent\s+change\s+from\s+baseline\b|\bpercent\s+change\s+from\s+baseline\b/g, family: 'arm_change', stat: 'unstated' },
  ];
  // A clause that is only an arm-labelled list ("; Drug X -16.9%, placebo -2.4%.") takes the per-arm measure its
  // sentence named in an earlier clause ("Body weight, percent change from baseline …: ETD …; Drug X …") (em-39).
  const LIST = new RegExp(String.raw`^\s*(${ARM})\s+[-−–]?\s?\d+(?:[.,]\d+)?\s?%?\s*(?:,|vs\.?|versus|and)\s*(${ARM})\s+[-−–]?\s?\d+(?:[.,]\d+)?\s?%?\s*\.?\s*$`, 'i');
  const before = env.doc.text.slice(env.sentence.start, clause.start);
  const list = LIST.exec(text);
  const listOnly = !!list && !!armOf(list[1]) && !!armOf(list[2]);
  for (const kd of kinds) {
    kd.re.lastIndex = 0;
    const m = kd.re.exec(text);
    kd.re.lastIndex = 0;
    const inherited = !m && listOnly && kd.re.test(before);
    if (!m && !inherited) continue;
    // The measure phrase's span in this clause ([0, 0) when the clause inherits it from the sentence).
    const mStart = m ? m.index : 0;
    const mEnd = m ? m.index + m[0].length : 0;
    if (m && /placebo-adjusted|difference|treatment\s+difference|ETD/i.test(text.slice(Math.max(0, mStart - 25), mEnd + 5)) && kd.family === 'arm_change' && !/,\s*(?:Drug|placebo)/i.test(text)) {
      // an effect, not a per-arm mean
      if (!/with\s+\w+\s+and\s+[-−–]?\d/.test(text)) continue;
    }
    const from = mEnd;
    const seg = text.slice(from);
    const re = new RegExp(String.raw`(?:(${ARM})\s+)?([-−–]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s?(%|kg|L|mmHg)?(?:\s+(?:with|for)\s+(${ARM})|\s*\(\s*(${ARM})\s*\))?`, 'gi');
    const items: Array<Item & { est: ReturnType<typeof readNumber> }> = [];
    let v: RegExpExecArray | null;
    while ((v = re.exec(seg)) !== null) {
      if (v[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const numAt = base + from + v.index + (v[1] ? v[0].indexOf(v[2], v[1].length) : v[0].indexOf(v[2]));
      const span = { start: numAt, end: numAt + v[2].length };
      if (inMask(env.doc.masks, span.start, span.end) || isConsumed(env, span)) continue;
      // Stop at an effect group or a new measure.
      const pre = seg.slice(0, v.index);
      if (/\b(?:ETD|difference|estimated\s+treatment|\(\s*95|CI)\b/i.test(pre.slice(-30))) break;
      const armPhrase = v[1] ?? v[4] ?? v[5];
      const arm = armPhrase ? armOf(armPhrase) ?? undefined : undefined;
      items.push({ ...span, arm, est: readNumber(v[2] + (v[3] === '%' ? '%' : ''), { convention: env.doc.convention }) });
      if (items.length >= 4) break;
      const next = seg.slice(v.index + v[0].length);
      if (!/^\s*(?:,|vs\.?|versus|and)\s*(?:${ARM}\s+)?[-−–]?\s?\d/i.test(next.replace(new RegExp(ARM.replace(/\$\{ARM\}/g, ''), 'i'), '')) && !/^\s*(?:,|vs\.?|versus|and)\s/.test(next)) break;
    }
    const real = items.filter((i) => i.est);
    if (real.length < 2) continue;
    const arms = bindArms(real, seg, ctx, env, { vsPair: true });
    const qs = qualsOf(text, base, env.doc);
    const ep = qs.endpoints[0] ?? (ctx.endpoint ? { ...ctx.endpoint } : undefined);
    const pct = /percent\s+change/i.test(text) || (ep && 'pct' in ep && ep.pct);
    real.forEach((it, j) => {
      consume(env, it);
      // A baseline mean is a mean by its family; a per-arm change keys its statistic (LS mean, mean, unstated).
      const key: Record<string, string> = kd.family === 'baseline_mean' ? { endpoint: ep?.id ?? 'unidentified' } : { endpoint: (ep?.id ?? 'unidentified') + (pct ? '|pct' : ''), stat: kd.stat };
      const d = makeDraft(kd.family === 'baseline_mean' ? 'B1' : 'A1', kd.family, key, { estimate: it.est! }, it, ctx, env, { arm: arms[j] });
      if (!ep) d.issues.push({ reason: 'endpoint_unidentified', slot: 'endpoint', detail: 'The per-arm mean names no endpoint.' });
      out.push(d);
    });
    // Every measure phrase of the clause is read ("LS mean change … -1.10% with A and -0.48% with B (baseline means
    // 8.07% and 8.12%)"); a value another phrase consumed is never read twice.
  }
  return out;
}

export const EFFECT_CI_LEVEL = (ci?: CI) => ci?.level;
