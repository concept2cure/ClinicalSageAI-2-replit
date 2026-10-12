/**
 * Frame context and drafts. A context holds the slots a document, a heading, a
 * table title, a paragraph lead, a sentence or a clause states; each level
 * overrides the one outside it for the slots it states (§4, §6.4). A draft is a
 * figure a form matched, with the slots its own form fills; frame.ts turns it
 * into a claim when every required slot is filled, else into an Unframed.
 */
import type { DocInfo } from './doc';
import type { Quals } from './quals';
import { onePool, oneStudy } from './quals';
import { canonical as canonicalOf } from './number';
import type { Span } from './segment';
import type {
  Analysis,
  ArmRef,
  CI,
  ClaimValue,
  Contrast,
  Measure,
  Population,
  PopulationSet,
  ReasonCode,
  SlotFrom,
  SlotName,
  StudyRef,
} from './types';
import type { EndpointKind } from './vocabulary';

export interface EndpointCtx {
  id: string;
  kind: EndpointKind;
  unit?: string;
  pct: boolean;
}

export interface Ctx {
  study?: StudyRef;
  studyFrom?: SlotFrom;
  /** The sentence mixes a pool and a study: each figure takes its own nearest scope. */
  population?: Population;
  populationFrom?: SlotFrom;
  period?: string;
  softPeriod?: string;
  timepoint?: string;
  subgroups?: string[];
  whole?: boolean;
  part?: string;
  analysis: Analysis;
  endpoint?: EndpointCtx;
  endpointRole?: string;
  ascertainment?: 'adjudicated' | 'investigator';
  causality?: 'all' | 'related';
  basis?: 'adverse_event' | 'adverse_reaction';
  /** Under a special-groups heading (C17). */
  subgroupContext?: boolean;
  /** Ordered arms established by the sentence, paragraph or heading, for unbound "V vs V" pairs. */
  armOrder?: ArmRef[];
  /** Trigger words no vocabulary classified. */
  unrecognised: string[];
  /** Nearest heading or table title, for citations. */
  title?: string;
  /** Heading path: within-source pairs come from different sections. */
  section: string;
  /** A term the heading names (a "Hypoglycaemia" heading over "Level 2: …" lines). */
  headingTerm?: string;
  /** A measure the heading names ("Deaths", "Serious adverse events"). */
  headingMeasure?: string;
  /** The arm a clause's opener makes its subject ("Among dapralutide-treated subjects aged >=65 years (n=100), …"). */
  subjectArm?: ArmRef;
}

export const emptyCtx = (section = ''): Ctx => ({ analysis: {}, unrecognised: [], section });

/** Apply the qualifiers of a span on top of a context. */
export function withQuals(outer: Ctx, q: Quals, from: SlotFrom, doc: DocInfo, opts: { inheritPool?: boolean } = {}): Ctx {
  const ctx: Ctx = { ...outer, analysis: { ...outer.analysis }, unrecognised: [...outer.unrecognised] };
  const study = oneStudy(q);
  const pool = onePool(q);
  if (pool && !study) {
    // "In this pool", "In the ISS": an anaphoric pool takes the listed pool of the context.
    if (!pool.members && outer.study?.kind === 'pool' && outer.study.members) ctx.study = { ...outer.study, ...(pool.cutoff ? { cutoff: pool.cutoff } : {}) };
    else ctx.study = pool;
    ctx.studyFrom = from;
  } else if (study && !pool) {
    ctx.study = study;
    ctx.studyFrom = from;
  } else if (study && pool) {
    ctx.study = q.pools[0].start < q.studies[0].start ? pool : study;
    ctx.studyFrom = from;
  }
  if (opts.inheritPool && !ctx.study && outer.study) ctx.study = outer.study;
  if (q.population) {
    const allRandomized = q.population.allRandomized || doc.allRandomized.has(q.population.set);
    ctx.population = { set: q.population.set, stated: true, ...(allRandomized ? { allRandomized: true as const } : {}) };
    ctx.populationFrom = from;
  }
  if (q.period) ctx.period = q.period;
  if (q.timepoints.length === 1) ctx.timepoint = q.timepoints[0];
  if (q.subgroups.length > 0) {
    ctx.subgroups = [...q.subgroups].sort();
    ctx.whole = false;
  } else if (q.whole) {
    ctx.subgroups = [];
    ctx.whole = true;
  }
  if (q.part) ctx.part = q.part;
  for (const k of ['role', 'occasion', 'cutoff', 'model', 'estimand', 'imputation', 'assessor', 'method'] as const) {
    if (q.analysis[k] !== undefined) (ctx.analysis as Record<string, unknown>)[k] = q.analysis[k];
  }
  if (q.endpoints.length > 0) {
    const ids = new Set(q.endpoints.map((e) => e.id));
    if (ids.size === 1) {
      const e = q.endpoints[0];
      ctx.endpoint = { id: e.id, kind: e.kind, unit: e.unit, pct: q.endpoints.some((x) => x.pct) };
    }
  }
  if (q.endpointRole) ctx.endpointRole = q.endpointRole;
  if (q.ascertainment) ctx.ascertainment = q.ascertainment;
  if (q.causality) ctx.causality = q.causality;
  return ctx;
}

export interface Draft {
  form: string;
  family: Measure['family'];
  /** Measure attributes that must be equal (category, term, endpoint, effect type, …). */
  key: Record<string, string>;
  value: ClaimValue;
  /** The figure's own span, and the span quoted (its sentence or row). */
  span: Span;
  quote: Span;
  arm?: ArmRef;
  contrast?: Contrast;
  /** Slots the form itself fills; they override the context. */
  own: {
    study?: StudyRef;
    population?: Population;
    subgroups?: string[];
    period?: string;
    timepoint?: string;
    part?: string;
    analysis?: Analysis;
    endpoint?: { id?: string; role?: string };
    scale?: string;
    unit?: string;
    ci?: CI;
    basis?: 'adverse_event' | 'adverse_reaction';
    causality?: 'all' | 'related' | 'unstated';
    ascertainment?: 'adjudicated' | 'investigator';
  };
  ctx: Ctx;
  /** Reasons the form already knows the figure cannot be a claim. */
  issues: Array<{ reason: ReasonCode; slot?: SlotName; detail: string }>;
  slotFrom: Partial<Record<SlotName, SlotFrom>>;
}

export const populationOf = (set: PopulationSet, doc: DocInfo, stated = true): Population => ({
  set,
  stated,
  ...(doc.allRandomized.has(set) || set === 'randomized' ? { allRandomized: true as const } : {}),
});

export const valuesOf = (v: ClaimValue): string[] => {
  const out: string[] = [];
  for (const k of ['count', 'percent', 'denominator', 'estimate', 'lower', 'upper', 'p'] as const) {
    const w = v[k];
    if (w) out.push(canonicalOf(w));
  }
  return out;
};

