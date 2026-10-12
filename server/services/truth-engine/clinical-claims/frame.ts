/**
 * Frame assembly and completeness (design §6.4). A draft becomes a claim only
 * when every slot its family requires is filled — from the form itself, else
 * from its clause, sentence, paragraph lead, heading, table title or document,
 * through the declared inheritance of the context. A draft with a missing slot,
 * an unclassified qualifier or a known issue becomes an Unframed figure: it is
 * reported as not compared with its reason, never dropped and never compared.
 */
import { canonical } from './number';
import { armLabel } from './items';
import type { Draft } from './context';
import type { DocInfo } from './doc';
import type { Claim, ClaimFrame, Loc, Measure, Population, ReasonCode, SlotName, Unframed } from './types';

const SAFETY = new Set<Measure['family']>(['incidence', 'deaths', 'eair', 'lab', 'exposure', 'demographic']);
const EFFICACY = new Set<Measure['family']>(['effect', 'responder', 'median', 'arm_change', 'baseline_mean']);
const PER_ARM = new Set<Measure['family']>(['n', 'completed_study', 'discontinued_study', 'deaths', 'incidence', 'eair', 'lab', 'responder', 'median', 'arm_change', 'baseline_mean', 'exposure', 'demographic']);

/** The measure label: family and key, the corpus's vocabulary ("incidence:serious", "effect:hazard_ratio:pfs"). */
export function measureLabelOf(family: Measure['family'], key: Record<string, string>, endpointId?: string): string {
  switch (family) {
    case 'n':
      return `n:${key.pop}`;
    case 'completed_study':
      return 'completed_study';
    case 'discontinued_study':
      return `discontinued_study:${key.reason}`;
    case 'deaths':
      return 'deaths';
    case 'incidence':
      return `incidence:${key.category}${key.qual ? `:${key.qual}` : ''}${key.term ? `:${key.termKind ?? 'pt'}:${key.term}` : ''}`;
    case 'eair':
      return `eair:${key.rate}:${key.category}${key.term ? `:${key.term}` : ''}`;
    case 'lab':
      return `lab:${key.lab}`;
    case 'responder':
      return `responder:${key.endpoint}`;
    case 'effect':
      return `effect:${key.effect}${endpointId ? `:${endpointId}` : ''}`;
    case 'median':
      return `median:${key.endpoint}`;
    case 'arm_change':
      return `arm_change:${key.endpoint}`;
    case 'baseline_mean':
      return `baseline_mean:${key.endpoint}`;
    case 'exposure':
      return `exposure:${key.kind}`;
    case 'demographic':
      return `demographic:${key.kind}`;
    default:
      return family;
  }
}

/** The quoted window: the draft's quote span, at most 200 characters, always containing the figure. */
export function quoteOf(text: string, d: { span: { start: number; end: number }; quote: { start: number; end: number } }): { start: number; end: number; quote: string } {
  let qs = Math.min(d.quote.start, d.span.start);
  let qe = Math.max(d.quote.end, d.span.end);
  if (qe - qs > 200) {
    const mid = Math.floor((d.span.start + d.span.end) / 2);
    qs = Math.max(qs, Math.min(d.span.start, mid - 100));
    qe = Math.min(qe, Math.max(d.span.end, qs + 200));
    qs = Math.max(qs, qe - 200);
    // A shortened quote starts and ends on whole words.
    while (qs < d.span.start && qs > 0 && /\S/.test(text[qs - 1]) && /\S/.test(text[qs])) qs++;
    while (qe > d.span.end && qe < text.length && /\S/.test(text[qe]) && /\S/.test(text[qe - 1])) qe--;
  }
  return { start: qs, end: qe, quote: text.slice(qs, qe).replace(/\s+/g, ' ').trim() || text.slice(d.span.start, d.span.end) };
}

const valuesOf = (d: Draft): string[] =>
  (['count', 'percent', 'denominator', 'estimate', 'lower', 'upper', 'p'] as const).filter((k) => d.value[k]).map((k) => canonical(d.value[k]));

/** Draft → claim, or an Unframed with the first missing or failing slot. */
export function finalize(d: Draft, doc: DocInfo, index: number): Claim | Unframed {
  const ctx = d.ctx;
  const slotFrom: Loc['slotFrom'] = { ...d.slotFrom };
  const missing: SlotName[] = [];
  const reasons: Array<{ reason: ReasonCode; slot?: SlotName; detail: string }> = [...d.issues];

  const study = d.own.study ?? ctx.study;
  if (d.own.study) slotFrom.study = 'form';
  else if (ctx.study) slotFrom.study = ctx.studyFrom ?? 'document';
  if (!study) {
    missing.push('study');
    reasons.push({ reason: 'study_unidentified', slot: 'study', detail: 'No study or pool is named for this figure (C1).' });
  } else if (study.kind === 'pool' && !study.members) {
    missing.push('study');
    reasons.push({ reason: 'pool_membership_unidentified', slot: 'study', detail: 'A pooled figure whose member studies are not listed (C16).' });
  }

  let population: Population | undefined = d.own.population ?? ctx.population;
  if (d.own.population) slotFrom.population = 'form';
  else if (ctx.population) slotFrom.population = ctx.populationFrom ?? 'sentence';
  if (!population && SAFETY.has(d.family)) {
    population = { set: 'treated', stated: false };
    slotFrom.population = 'default';
  }
  if (!population && (d.family === 'completed_study' || d.family === 'discontinued_study')) {
    population = { set: 'randomized', stated: false, allRandomized: true };
    slotFrom.population = 'default';
  }
  // C3: an efficacy figure names its analysis population. A safety set inherited from a heading, title or lead
  // ("Safety in Special Groups … (Safety Population)") is the section's, not the efficacy analysis's (fs-37).
  const safetyEndpoint = d.own.endpoint?.id?.startsWith('ae:') ?? false; // a risk difference of SAE incidence is a safety effect
  if (population && EFFICACY.has(d.family) && !safetyEndpoint && !d.own.population && population.set === 'treated' && ctx.populationFrom && ctx.populationFrom !== 'clause' && ctx.populationFrom !== 'sentence') {
    population = undefined;
    delete slotFrom.population;
  }
  if (!population && EFFICACY.has(d.family)) {
    missing.push('population');
    reasons.push({ reason: 'population_unidentified', slot: 'population', detail: 'An efficacy figure must name its analysis population (C3).' });
  }

  if (PER_ARM.has(d.family) && !d.arm) {
    missing.push('arm');
    reasons.push({ reason: 'arm_unidentified', slot: 'arm', detail: 'The figure is not bound to an arm or to the total in its own clause (C11).' });
  }

  const subgroups = d.own.subgroups ?? ctx.subgroups ?? [];
  if (ctx.subgroupContext && subgroups.length === 0 && !ctx.whole && !d.own.subgroups) {
    missing.push('subgroup');
    reasons.push({ reason: 'subgroup_context_unresolved', slot: 'subgroup', detail: 'Under a special-groups heading, the sentence names neither its subgroup nor the whole population (C17).' });
  }
  // Randomization and screening happen once per study: their counts take a period only from their own form,
  // never from a lead sentence about deaths or adverse events (euc-08).
  const once = d.family === 'n' && (d.key.pop === 'randomized' || d.key.pop === 'screened');
  const period = d.own.period ?? (once ? undefined : ctx.period);
  if (period?.startsWith('conflict:')) {
    reasons.push({ reason: 'unrecognised_qualifier', slot: 'period', detail: `Two periods are stated for this figure: ${period.slice(9).replace(/\|/g, ', ')}.` });
  }
  if (ctx.unrecognised.length > 0) {
    reasons.push({ reason: 'unrecognised_qualifier', detail: `Unclassified qualifier: "${[...new Set(ctx.unrecognised)].join('", "')}" (§5.2).` });
  }

  const endpoint = d.own.endpoint;
  const frame: ClaimFrame = {
    ...(study ? { study } : {}),
    ...(population ? { population } : {}),
    ...(d.arm ? { arm: d.arm } : {}),
    ...(d.contrast ? { contrast: d.contrast } : {}),
    measure: { family: d.family, key: { ...d.key } },
    scope: {
      subgroups: [...subgroups].sort(),
      ...(period ? { period } : {}),
      ...(!period && !once && ctx.softPeriod ? { softPeriod: ctx.softPeriod } : {}),
      ...(d.own.timepoint ?? ctx.timepoint ? { timepoint: d.own.timepoint ?? ctx.timepoint } : {}),
      ...(d.own.part ?? ctx.part ? { part: d.own.part ?? ctx.part } : {}),
    },
    analysis: { ...ctx.analysis, ...(d.own.analysis ?? {}) },
    ...(endpoint && (endpoint.id || endpoint.role) ? { endpoint } : {}),
    ...(d.own.scale ? { scale: d.own.scale } : {}),
    ...(d.own.unit ? { unit: d.own.unit } : {}),
    ...(d.own.ci ? { ci: d.own.ci } : {}),
  };
  if (d.family === 'incidence' || d.family === 'eair') {
    frame.basis = d.own.basis ?? ctx.basis ?? 'adverse_event';
    frame.causality = d.own.causality ?? ctx.causality ?? 'unstated';
    const asc = d.own.ascertainment ?? ctx.ascertainment;
    if (asc) frame.measure.key.ascertainment = asc;
  }
  // "The major efficacy outcome measures were ORR and DOR as assessed by BICR": the source declares the assessor of
  // its endpoints; a figure whose own context names none takes that declaration.
  const endpointId = (endpoint?.id ?? d.key.endpoint ?? '').replace(/\|pct$/, '');
  if (!frame.analysis.assessor && endpointId && doc.endpointAssessor.has(endpointId)) {
    frame.analysis.assessor = doc.endpointAssessor.get(endpointId);
    slotFrom.assessor = 'document';
  }
  for (const k of Object.keys(frame.analysis) as Array<keyof typeof frame.analysis>) if (frame.analysis[k] === undefined) delete frame.analysis[k];

  const q = quoteOf(doc.text, d);
  const loc: Loc = { sourceId: doc.id, start: q.start, end: q.end, quote: q.quote, ...(ctx.title ? { heading: ctx.title } : {}), slotFrom };
  const measureLabel = measureLabelOf(d.family, frame.measure.key, endpoint?.id);
  // C9: an approximation or a bound is not a value, whatever it measures. Where a slot is missing
  // too, the figure is reported for what it is rather than for the slot — "more than 500 … were
  // exposed for at least 24 weeks" is a lower bound first and a figure of an unnamed pool second
  // (lu-06). A bound whose frame is complete still reaches comparison, where `agreeAsWritten`
  // declines it with both quotes cited; only this one-sided report is re-ordered.
  if (reasons.length > 0) {
    const written = valuesOf(d);
    const c9: ReasonCode | null = written.some((v) => v.startsWith('~'))
      ? 'approximate_value'
      : written.some((v) => /^[<>≤≥]/.test(v))
        ? 'bound_not_value'
        : null;
    if (c9) reasons.unshift({ reason: c9, detail: `"${written.join('", "')}" is an approximation or a bound, not a value (C9).` });
  }
  if (reasons.length > 0) {
    const first = reasons[0];
    const u: Unframed = {
      form: d.form,
      loc,
      missing: [...new Set([...missing, ...(first.slot && !missing.includes(first.slot) ? [first.slot] : [])])],
      reason: first.reason,
      detail: first.detail,
      partial: frame,
      measureLabel,
      values: valuesOf(d),
    };
    return u;
  }
  return { id: `${doc.id}:${index}`, frame, value: d.value, form: d.form, loc, measureLabel, section: ctx.section };
}

export const isClaim = (x: Claim | Unframed): x is Claim => 'id' in x;

/**
 * An endpoint has one primary analysis. When a source names an effect's analysis as primary ("Primary analysis
 * (ITT): …") and states the same effect on the same endpoint again for another population or method with no role
 * of its own ("Per-protocol analysis: 3.6%"), that second figure is not the primary analysis: its role is
 * 'non_primary', which meets only a stated non-primary role (em-16). Structural, never a guess at which role it is.
 */
/** The primary/final occasion, however the text names it: "the primary analysis", "the final analysis", or neither. */
const PRIMARY_OR_FINAL = new Set(['primary', 'final', 'primary_or_final']);

export function markNonPrimary(claims: Claim[]): void {
  const sameStudy = (a: Claim, b: Claim) =>
    a.frame.study?.kind === 'study' && b.frame.study?.kind === 'study' && a.frame.study.aliases.some((x) => (b.frame.study as { aliases: string[] }).aliases.includes(x));
  for (const c of claims) {
    if (c.frame.measure.family !== 'effect' || c.frame.analysis.role) continue;
    const primary = claims.find(
      (d) =>
        d !== c &&
        d.measureLabel === c.measureLabel &&
        PRIMARY_OR_FINAL.has(d.frame.analysis.role ?? '') &&
        sameStudy(c, d) &&
        (d.frame.population?.set !== c.frame.population?.set ||
          (['model', 'estimand', 'imputation', 'assessor', 'method'] as const).some((k) => d.frame.analysis[k] !== c.frame.analysis[k])),
    );
    if (primary) {
      c.frame.analysis = { ...c.frame.analysis, role: 'non_primary' };
      c.loc.slotFrom.analysis = 'document';
    }
  }
}

/** One-line description of a frame for reviewers: "Study DX-301 · treated · drug x · incidence:serious". */
export function frameSummary(c: Claim): string {
  const f = c.frame;
  const parts: string[] = [];
  if (f.study?.kind === 'study') parts.push(`Study ${f.study.aliases.find((a) => !a.startsWith('NCT')) ?? f.study.aliases[0]}`);
  else if (f.study?.kind === 'pool') parts.push(`pool of ${(f.study.members ?? []).map((m) => m[0]).join(', ')}${f.study.cutoff ? ` (cut-off ${f.study.cutoff})` : ''}`);
  if (f.population) parts.push(f.population.set);
  if (f.arm) parts.push(armLabel(f.arm));
  if (f.contrast && (f.contrast.test || f.contrast.control)) parts.push(`${armLabel(f.contrast.test) || 'test'} vs ${armLabel(f.contrast.control) || 'control'}`);
  if (f.scope.subgroups.length) parts.push(f.scope.subgroups.join(', '));
  if (f.scope.period) parts.push(f.scope.period);
  if (f.scope.timepoint) parts.push(f.scope.timepoint);
  if (f.scope.part) parts.push(f.scope.part);
  parts.push(c.measureLabel);
  if (f.ci) parts.push(`${f.ci.sided === 'one' ? 'one-sided ' : ''}${f.ci.level}% ${f.ci.kind === 'credible' ? 'CrI' : 'CI'}`);
  return parts.join(' · ');
}
