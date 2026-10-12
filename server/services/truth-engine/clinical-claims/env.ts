/**
 * What the prose forms share while reading one sentence: the document, the
 * spans other forms have already consumed, the sentence's arm order, and the
 * paragraph state (the previous sentence's incidence and effect drafts, for
 * "The most common was …" and "Per-protocol analysis: …" sentences).
 */
import type { Ctx, Draft } from './context';
import type { DocInfo } from './doc';
import type { Sentence, Span } from './segment';
import type { ArmRef, ClaimValue, Measure } from './types';

export interface ParaState {
  /** The last incidence parent: its measure key, arms in order, context. */
  lastIncidence?: { key: Record<string, string>; arms: Array<ArmRef | undefined>; ctx: Ctx; basis?: 'adverse_event' | 'adverse_reaction' };
  /** The last effect draft, for an elliptic "label: V (CI)" sentence. */
  lastEffect?: Draft;
  /** The last deaths/disposition total, for a following arm list. */
  lastArms?: ArmRef[];
  /** Arms established in order by an earlier sentence of the paragraph. */
  armOrder?: ArmRef[];
  /** The arm an exposure paragraph is about ("Of the A-treated patients, …"). */
  exposureArm?: ArmRef;
}

export interface Env {
  doc: import('./doc').DocInfo;
  sentence: Sentence;
  consumed: Span[];
  state: ParaState;
  /** The sentence's ordered arms (its own lists and bound items, in order). */
  sentenceArms?: ArmRef[];
  /** The sentence holds "respectively". */
  respectively: boolean;
  /** Drafts already made from earlier clauses of the sentence (a p-value attaches to the nearest effect before it). */
  sentenceDrafts: Draft[];
  /** Arms an earlier clause of the sentence bound in order, for a later clause's "…, respectively". */
  clauseArms?: ArmRef[];
  /** The prose paragraph the sentence belongs to. */
  paragraph?: Span;
}

export const isConsumed = (env: Env, s: Span): boolean => env.consumed.some((c) => c.start < s.end && s.start < c.end);
export const consume = (env: Env, s: Span) => env.consumed.push({ start: s.start, end: s.end });

export function makeDraft(
  form: string,
  family: Measure['family'],
  key: Record<string, string>,
  value: ClaimValue,
  span: Span,
  ctx: Ctx,
  env: { sentence: Sentence } | { quote: Span },
  extra: Partial<Draft> = {},
): Draft {
  const quote = 'sentence' in env ? { start: env.sentence.start, end: env.sentence.end } : env.quote;
  return {
    form,
    family,
    key,
    value,
    span: { start: span.start, end: span.end },
    quote,
    ctx,
    own: {},
    issues: [],
    slotFrom: {},
    ...extra,
  };
}

export type { DocInfo };
