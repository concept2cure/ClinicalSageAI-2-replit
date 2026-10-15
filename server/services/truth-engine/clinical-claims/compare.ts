/**
 * The comparator (design §7). Two claims are compared only when their frames
 * are identical slot by slot; a small set of slots may be unstated on one side
 * under the single-candidate rule (C13): the claim has exactly one compatible
 * counterpart and the counterpart has exactly it. Components are compared as
 * written (agreeAsWritten). Anything else is reported as not compared with the
 * first differing slot's reason and both quotes, and a measure is never
 * summarised as consistent unless a pair was actually compared.
 */
import { agreeAsWritten, canonical, readNumber, shown, type WrittenNumber } from './number';
import { armLabel, sameArm } from './items';
import { frameSummary } from './frame';
import { isControlArm, type DocInfo } from './doc';
import type {
  ArmRef,
  Claim,
  ClaimReport,
  Comparison,
  Component,
  ComponentResult,
  MeasureSummary,
  NotCompared,
  NotComparedSide,
  PBasis,
  ReasonCode,
  SlotName,
  StudyRef,
  Unframed,
} from './types';

export interface SourceClaims {
  doc: DocInfo;
  claims: Claim[];
  unframed: Unframed[];
}

type Diff = { slot: SlotName; reason: ReasonCode; rank: number; detail: string };
type Compat = { ok: true; defaulted: SlotName[] } | { ok: false; diffs: Diff[] };

/** Reason precedence (§7): study, population, part, subgroup, period, timepoint, arm, measure, endpoint, effect type, scale, unit, contrast, analysis, CI. */
const RANK: Record<string, number> = {
  study: 1,
  population: 2,
  part: 3,
  subgroup: 4,
  period: 5,
  timepoint: 6,
  arm: 7,
  measure: 8,
  endpoint: 9,
  effect: 10,
  scale: 11,
  unit: 12,
  contrast: 13,
  analysis: 14,
  ci: 15,
};

const NON_PRIMARY = new Set(['sensitivity', 'supplementary', 'supportive', 'exploratory']);

function studyDiff(a: StudyRef | undefined, b: StudyRef | undefined): Diff | null {
  if (!a || !b) return { slot: 'study', reason: 'study_unidentified', rank: RANK.study, detail: 'study not identified' };
  const meets = (x: string[], y: string[]) => x.some((id) => y.includes(id));
  if (a.kind === 'study' && b.kind === 'study') {
    return meets(a.aliases, b.aliases) ? null : { slot: 'study', reason: 'study_differs', rank: RANK.study, detail: `study ${a.aliases[0]} vs ${b.aliases[0]}` };
  }
  if (a.kind !== b.kind) return { slot: 'study', reason: 'pool_vs_study', rank: RANK.study, detail: 'a pooled figure against a single-study figure (C16)' };
  if (a.kind === 'pool' && b.kind === 'pool') {
    if (!a.members || !b.members) return { slot: 'study', reason: 'pool_membership_unidentified', rank: RANK.study, detail: 'pool membership not listed' };
    const same = a.members.length === b.members.length && a.members.every((m) => b.members!.some((n) => meets(m, n)));
    if (!same) return { slot: 'study', reason: 'pool_membership_differs', rank: RANK.study, detail: 'the pools list different member studies' };
    if (a.cutoff && b.cutoff && a.cutoff !== b.cutoff) return { slot: 'study', reason: 'cutoff_differs', rank: RANK.study, detail: `cut-off ${a.cutoff} vs ${b.cutoff}` };
    // The pool's named scope is part of its identity: the placebo-controlled pool and the all-exposure pool of the
    // same studies are different analysis sets (C16, r2 scope-01..03). A pool that names no scope is not narrowed.
    if (a.scope && b.scope && a.scope !== b.scope) {
      return { slot: 'study', reason: 'pool_scope_differs', rank: RANK.study, detail: `pool scope ${a.scope} vs ${b.scope}` };
    }
  }
  return null;
}

const ITT_LIKE = new Set(['itt', 'fas', 'randomized']);

/**
 * The two registers that tabulate adverse reactions as the trial incidence: a USPI section 6 table
 * and an SmPC section 4.8 table or sentence. A figure in either is the crude incidence observed in
 * the trial, presented under an "adverse reaction" heading, so it is the CSR's or the clinical
 * summary's figure under another name (C5) — EMA's SmPC guideline derives a 4.8 frequency from that
 * same crude incidence, exactly as 21 CFR 201.57(c)(7) does for section 6. Comparing them is not
 * waved through: the branch below still refuses, or calls the basis ambiguous, when the other source
 * states a causality-restricted figure beside its unqualified one (lu-12).
 *
 * Any other source carrying an adverse-reaction basis (a 2.7.4 passage that says "adverse
 * reactions", an unknown role) keeps the C5 refusal: nothing establishes that its register is the
 * trial incidence. Exempting the USPI alone excluded every SmPC 4.8 figure in an EU dossier from
 * comparison with the CSR, by role, while blessing the identical USPI sentence (r2 lbl-04, lbl-05,
 * lbl-07).
 */
/**
 * Whether an adverse-reaction figure is one a product label presents as the trial incidence, so that
 * the CSR's or the clinical summary's figure for the same thing is the same measure under another
 * name (C5).
 *
 * A USPI figure always is. FDA's labeling guidance for section 6 (Adverse Reactions, Jan 2006)
 * directs the sponsor to present the clinical-trial tables regardless of causality, including the
 * discontinuation summary, so every shape of USPI figure is the trial figure — which is why the
 * corpus compares a USPI "adverse reactions leading to discontinuation" rate with "all TEAEs
 * regardless of causality" (lu-34).
 *
 * An SmPC figure is where it is a per-preferred-term frequency: EMA's SmPC guideline requires the
 * adverse reactions tabulated in 4.8 to carry the crude incidence rate observed in the trials, so a
 * 4.8 term frequency is that term's trial incidence (r2 lbl-04, lbl-05, lbl-07). An aggregate 4.8
 * statement is not: "adverse reactions led to permanent discontinuation in 4.4% of patients" counts
 * only causally related events, and the CSR's "TEAE leading to discontinuation" counts all of them,
 * so they are different measures however alike the figures look (euc-11).
 *
 * Any other role keeps the refusal: nothing establishes that its ADR register is the trial
 * incidence. Before this, the exemption named the USPI alone, which excluded every SmPC 4.8 figure
 * in an EU dossier from comparison with the CSR by role, while blessing the identical USPI sentence.
 */
function isTrialIncidenceRegister(ar: { src: { doc: DocInfo }; claim: Claim }): boolean {
  if (ar.src.doc.role === 'uspi') return true;
  if (ar.src.doc.role !== 'smpc') return false;
  return ar.claim.frame.measure.family === 'incidence' && !!ar.claim.frame.measure.key.term;
}

function populationDiff(a: Claim, b: Claim): Diff | null {
  const pa = a.frame.population;
  const pb = b.frame.population;
  if (!pa || !pb) return pa === pb ? null : { slot: 'population', reason: 'population_differs', rank: RANK.population, detail: 'population stated on one side only' };
  if (pa.set === pb.set) return null;
  /**
   * C3: ITT ≡ FAS only where the texts establish that the set is all randomised. One text's own
   * definition settles it for both labels, because "intention-to-treat population", unqualified, is
   * the set of all randomised subjects and ICH E9 §5.2.1 names that set the full analysis set — so a
   * USPI section 14 table headed "Intent-to-Treat Population" and a 2.7.3 reading "the full analysis
   * set (all randomised patients, N=612)" are one set (r2 lbl-12). A set either text qualifies is a
   * different PopulationSet already ('mitt', 'treated', 'pp', 'efficacy_evaluable'), none of which is
   * ITT-like, so this never equates a modified ITT with a full analysis set. Where NEITHER text
   * defines its set (euc-31: a bare SmPC "ITT" against a bare CSR "FAS"), nothing settles it and the
   * frames stay different — the SAP cross-reference that would settle it is not in evidence.
   */
  if (ITT_LIKE.has(pa.set) && ITT_LIKE.has(pb.set) && (pa.allRandomized || pb.allRandomized)) return null;
  return { slot: 'population', reason: 'population_differs', rank: RANK.population, detail: `population ${pa.set} vs ${pb.set}` };
}

/** Per-source arm inventory: drug → doses written (C11). */
export type ArmInventory = Map<string, Set<string>>;
export function armInventory(claims: readonly Claim[]): ArmInventory {
  const inv: ArmInventory = new Map();
  const add = (x: ArmRef | undefined) => {
    if (!x || x.kind !== 'arm') return;
    const s = inv.get(x.drug) ?? new Set<string>();
    s.add(x.dose ?? '');
    inv.set(x.drug, s);
  };
  for (const c of claims) {
    add(c.frame.arm);
    add(c.frame.contrast?.test);
    add(c.frame.contrast?.control);
  }
  return inv;
}

interface Side {
  claim: Claim;
  src: SourceClaims;
  inv: ArmInventory;
  armCount: number;
}

/** Arm equality (C11): same drug and dose; an undosed arm equals a dosed one only when each source has exactly one dose of that drug. */
function armsMatch(a: ArmRef | undefined, b: ArmRef | undefined, A: Side, B: Side): boolean {
  if (!a || !b) return a === b;
  if (sameArm(a, b)) return true;
  // Single-arm studies: the one arm is the total. Both sources must describe a single-arm study (no control anywhere in
  // them); a placebo-controlled source that happens to state one arm's figure is not one (r1 sp-49..52).
  if ((a.kind === 'total' && b.kind === 'arm') || (a.kind === 'arm' && b.kind === 'total')) {
    return A.armCount <= 1 && B.armCount <= 1 && A.src.doc.singleArm && B.src.doc.singleArm;
  }
  if (a.kind === 'role' || b.kind === 'role') {
    const role = a.kind === 'role' ? a : (b as Extract<ArmRef, { kind: 'role' }>);
    const other = a.kind === 'role' ? b : a;
    const otherSide = a.kind === 'role' ? B : A;
    if (other.kind === 'role') return other.role === role.role;
    if (other.kind !== 'arm' || otherSide.armCount !== 2) return false;
    const control = isControlArm(other, otherSide.src.doc);
    return role.role === 'control' ? control : !control;
  }
  if (a.kind !== 'arm' || b.kind !== 'arm' || a.drug !== b.drug) return false;
  const da = a.dose ?? '';
  const db = b.dose ?? '';
  if (da && db) return da === db;
  // The doses a source names count whether or not their figures were read ("with Drug X 100 mg it was 51.0%"): an
  // undosed arm meets a dosed one only when each source names exactly one dose of the drug (C11, r1 sp-56).
  const withRoster = (inv: ArmInventory, src: SourceClaims, drug: string) =>
    new Set<string>([...(inv.get(drug) ?? []), ...(src.doc.roster.get(drug)?.doses ?? [])]);
  const dosesA = withRoster(A.inv, A.src, a.drug);
  const dosesB = withRoster(B.inv, B.src, b.drug);
  const one = (s: Set<string>) => [...s].filter(Boolean).length <= 1;
  return one(dosesA) && one(dosesB);
}

function armDiff(A: Side, B: Side): Diff | null {
  const a = A.claim.frame.arm;
  const b = B.claim.frame.arm;
  if (armsMatch(a, b, A, B)) return null;
  if ((a?.kind === 'total') !== (b?.kind === 'total')) return { slot: 'arm', reason: 'per_arm_vs_total', rank: RANK.arm, detail: `${armLabel(a) || 'unbound'} vs ${armLabel(b) || 'unbound'}` };
  return { slot: 'arm', reason: 'arm_differs', rank: RANK.arm, detail: `arm ${armLabel(a)} vs ${armLabel(b)}` };
}

const keyWithout = (k: Record<string, string>, drop: string[]) =>
  Object.keys(k)
    .filter((x) => !drop.includes(x))
    .sort()
    .map((x) => `${x}=${k[x]}`)
    .join(';');

/** The family-level measure identity a candidate must share (§7.1); endpoint and type differences are reported as such. */
export const coreKey = (c: Claim): string => `${c.frame.measure.family}|${keyWithout(c.frame.measure.key, ['kind'])}`;

/** Event categories that are different measurements of one subject: their difference is a measure difference (C6, lu-11). */
const CATEGORY_GROUP: Record<string, string> = { disc_treatment: 'disc', disc_study: 'disc', disc_unstated: 'disc', 'grade3-4': 'grade', 'grade>=3': 'grade', severe: 'grade' };

/** Arms of different drugs: the other source states no figure for this arm (`no_counterpart`), not a different arm definition. */
const otherDrug = (a: ArmRef | undefined, b: ArmRef | undefined): boolean =>
  !!a && !!b && (a.kind === 'arm' || a.kind === 'combined') && (b.kind === 'arm' || b.kind === 'combined') && a.drug !== b.drug;

/**
 * What a figure's nearest counterpart must measure (§7.6): the same measure label, except that discontinuation
 * objects and severity grades of one event or term are one subject (their difference is `measure_differs`), and an
 * effect's type is reported as differing — unless one side is a relative reduction, a re-expression (em-37).
 * Nothing sharing this key in the other source → `no_counterpart`.
 */
export function nearKey(c: Pick<Claim, 'frame' | 'measureLabel'>): string {
  const m = c.frame.measure;
  switch (m.family) {
    case 'incidence':
      return `incidence|${CATEGORY_GROUP[m.key.category] ?? m.key.category}|${m.key.term ?? ''}|${m.key.termKind ?? ''}`;
    case 'eair':
      // An exposure-adjusted rate's nearest counterpart is the crude incidence of the same event (C21, pvs-14).
      return `incidence|${CATEGORY_GROUP[m.key.category] ?? m.key.category}|${m.key.term ?? ''}|${m.key.term ? 'pt' : ''}`;
    case 'effect':
      return `effect|${m.key.effect === 'rrr' ? 'rrr' : 'estimate'}`;
    case 'discontinued_study':
      // A disposition row "discontinued the study: adverse event" is the discontinuation-due-to-AE subject (C6, sbx-004).
      return m.key.reason === 'adverse_event' ? 'incidence|disc||' : c.measureLabel;
    default:
      return c.measureLabel;
  }
}

/** An effect stated only by its p-value ("was also statistically significant (p=0.003)"): it names no effect type to differ. */
const pOnly = (c: Claim): boolean => c.frame.measure.family === 'effect' && c.frame.measure.key.effect === 'unstated' && !c.value.estimate && !!c.value.p;

function measureDiffs(a: Claim, b: Claim): Diff[] {
  const out: Diff[] = [];
  const ka = a.frame.measure.key;
  const kb = b.frame.measure.key;
  if (a.frame.measure.family !== b.frame.measure.family) {
    out.push({ slot: 'measure', reason: 'measure_differs', rank: RANK.measure, detail: `${a.measureLabel} vs ${b.measureLabel}` });
    return out;
  }
  if (a.frame.measure.family === 'effect' && (pOnly(a) || pOnly(b))) return out;
  if (a.frame.measure.family === 'effect') {
    if (ka.effect !== kb.effect) out.push({ slot: 'measure', reason: 'effect_type_differs', rank: RANK.effect, detail: `${ka.effect} vs ${kb.effect} (C7)` });
    if ((ka.adjusted ?? '') !== (kb.adjusted ?? '')) out.push({ slot: 'measure', reason: 'effect_type_differs', rank: RANK.effect, detail: 'adjustment stated on one side only (C7)' });
    return out;
  }
  if (keyWithout(ka, ['ascertainment']) !== keyWithout(kb, ['ascertainment'])) {
    out.push({ slot: 'measure', reason: 'measure_differs', rank: RANK.measure, detail: `${a.measureLabel} vs ${b.measureLabel}` });
  }
  if ((ka.ascertainment ?? '') !== (kb.ascertainment ?? '') && ka.ascertainment && kb.ascertainment) {
    out.push({ slot: 'measure', reason: 'ascertainment_differs', rank: RANK.measure, detail: `${ka.ascertainment} vs ${kb.ascertainment}` });
  } else if ((ka.ascertainment ?? '') !== (kb.ascertainment ?? '')) {
    out.push({ slot: 'measure', reason: 'ascertainment_differs', rank: RANK.measure, detail: `${ka.ascertainment ?? 'unstated'} vs ${kb.ascertainment ?? 'unstated'}` });
  }
  return out;
}

/** Period equality: a trial-duration adjective matches an unstated period or the same window. */
/** A period key as head plus the window length it states: "placebo-controlled:52w" → ["placebo-controlled", "52w"]. */
const periodParts = (p: string | undefined): [string, string | undefined] => {
  if (!p) return ['', undefined];
  const m = /^(.*?):(\d+w)$/.exec(p);
  return m ? [m[1], m[2]] : [p, undefined];
};

function periodDiff(a: Claim, b: Claim): Diff | null {
  const pa = a.frame.scope.period;
  const pb = b.frame.scope.period;
  if (pa === pb) return null;
  // The same period with its length stated on one side only is the same window ("the 52-week placebo-controlled
  // period" and "the placebo-controlled period"); two stated lengths that differ are two windows (r2 scope-04, 06).
  if (pa && pb) {
    const [ha, wa] = periodParts(pa);
    const [hb, wb] = periodParts(pb);
    if (ha === hb && (!wa || !wb)) return null;
  }
  const soft = (p: string | undefined, s: string | undefined, q: string | undefined) => !p && (!q || q === s);
  if (soft(pa, a.frame.scope.softPeriod, pb) || soft(pb, b.frame.scope.softPeriod, pa)) {
    if (!pa && !pb) return null;
    if (!pa && a.frame.scope.softPeriod && a.frame.scope.softPeriod === pb) return null;
    if (!pb && b.frame.scope.softPeriod && b.frame.scope.softPeriod === pa) return null;
  }
  return { slot: 'period', reason: 'period_differs', rank: RANK.period, detail: `period ${pa ?? 'unstated'} vs ${pb ?? 'unstated'}` };
}

/** Compatibility of two claims' frames: identical non-defaultable slots, defaultable slots equal where both are stated. */
function compat(A: Side, B: Side): Compat {
  const a = A.claim;
  const b = B.claim;
  const diffs: Diff[] = [];
  const defaulted: SlotName[] = [];
  const s = studyDiff(a.frame.study, b.frame.study);
  if (s) diffs.push(s);
  const p = populationDiff(a, b);
  if (p) diffs.push(p);
  if ((a.frame.scope.part ?? '') !== (b.frame.scope.part ?? '')) diffs.push({ slot: 'part', reason: 'part_differs', rank: RANK.part, detail: `part ${a.frame.scope.part ?? 'unstated'} vs ${b.frame.scope.part ?? 'unstated'}` });
  if (a.frame.scope.subgroups.join('|') !== b.frame.scope.subgroups.join('|')) {
    diffs.push({ slot: 'subgroup', reason: 'subgroup_differs', rank: RANK.subgroup, detail: `subgroup ${a.frame.scope.subgroups.join(', ') || 'overall'} vs ${b.frame.scope.subgroups.join(', ') || 'overall'}` });
  }
  const pd = periodDiff(a, b);
  if (pd) diffs.push(pd);
  const ta = a.frame.scope.timepoint;
  const tb = b.frame.scope.timepoint;
  if (ta && tb && ta !== tb) diffs.push({ slot: 'timepoint', reason: 'timepoint_differs', rank: RANK.timepoint, detail: `timepoint ${ta} vs ${tb}` });
  else if (!ta !== !tb) defaulted.push('timepoint');
  const ad = armDiff(A, B);
  if (ad) diffs.push(ad);
  diffs.push(...measureDiffs(a, b));
  // Event basis (C5).
  if (a.frame.basis && b.frame.basis && a.frame.basis !== b.frame.basis) {
    const ar = a.frame.basis === 'adverse_reaction' ? A : B;
    const ae = ar === A ? B : A;
    if (!isTrialIncidenceRegister(ar)) diffs.push({ slot: 'measure', reason: 'event_basis_differs', rank: RANK.measure, detail: 'adverse reactions (SmPC/other) are not adverse events (C5)' });
    else {
      const related = ae.src.claims.some((c) => c.frame.causality === 'related' && coreKey(c) === coreKey(ae.claim));
      // An unqualified figure is the all-causality one: with a related figure beside it, the label's basis is ambiguous (lu-12).
      const all = ae.src.claims.some((c) => (c.frame.causality === 'all' || c.frame.causality === 'unstated') && coreKey(c) === coreKey(ae.claim));
      if (related && all) diffs.push({ slot: 'measure', reason: 'causality_ambiguous', rank: RANK.measure, detail: 'the other source states both an all-causality and a related figure (C5)' });
      else if (related) diffs.push({ slot: 'measure', reason: 'event_basis_differs', rank: RANK.measure, detail: 'the other source states a causality-restricted figure (C5)' });
    }
  }
  // A causality-restricted figure ("related to study drug", "drug-related") is never the unqualified one: an unstated
  // causality is the all-causality figure (C4), so related against all or unstated is a different measure (r1).
  const related = (x: Claim) => x.frame.causality === 'related';
  if (a.frame.causality && b.frame.causality && a.frame.causality !== b.frame.causality && (related(a) || related(b))) {
    diffs.push({ slot: 'measure', reason: 'measure_differs', rank: RANK.measure, detail: `causality ${a.frame.causality} vs ${b.frame.causality}` });
  }
  // Endpoint (defaultable id and role).
  const ea = a.frame.endpoint;
  const eb = b.frame.endpoint;
  if (ea?.id && eb?.id && ea.id !== eb.id) diffs.push({ slot: 'endpoint', reason: 'endpoint_differs', rank: RANK.endpoint, detail: `endpoint ${ea.id} vs ${eb.id}` });
  else if (!ea?.id !== !eb?.id) defaulted.push('endpoint');
  if (ea?.role && eb?.role && ea.role !== eb.role && !(ea.id && eb.id)) diffs.push({ slot: 'endpoint', reason: 'endpoint_differs', rank: RANK.endpoint, detail: `endpoint role ${ea.role} vs ${eb.role}` });
  // Contrast (C12).
  const ca = a.frame.contrast;
  const cb = b.frame.contrast;
  if (ca && cb) {
    const tEq = !ca.test || !cb.test || armsMatch(ca.test, cb.test, A, B);
    const cEq = !ca.control || !cb.control || armsMatch(ca.control, cb.control, A, B);
    if (!tEq || !cEq) {
      const flipped = ca.test && cb.control && ca.control && cb.test && armsMatch(ca.test, cb.control, A, B) && armsMatch(ca.control, cb.test, A, B);
      diffs.push({ slot: 'contrast', reason: flipped ? 'contrast_direction_differs' : 'arm_differs', rank: RANK.contrast, detail: `contrast ${armLabel(ca.test)} vs ${armLabel(ca.control)} against ${armLabel(cb.test)} vs ${armLabel(cb.control)}` });
    }
  }
  // Analysis (§7 precedence 14: assessor, model, estimand, imputation, then role): role unstated ≡ primary/final (C14);
  // "non_primary" (a figure the text sets against the primary analysis) is compatible only with a stated non-primary role.
  // A figure that names no occasion is the primary/final one ('primary_or_final'), which meets both the primary and
  // the final analysis; the primary and the final analysis are themselves two occasions (C14, r2 scope-11).
  const ra = a.frame.analysis.role ?? 'primary_or_final';
  const rb = b.frame.analysis.role ?? 'primary_or_final';
  const PF = new Set(['primary', 'final', 'primary_or_final']);
  const rolesMeet =
    ra === rb ||
    (ra === 'primary_or_final' && PF.has(rb)) ||
    (rb === 'primary_or_final' && PF.has(ra)) ||
    (ra === 'non_primary' && NON_PRIMARY.has(rb)) ||
    (rb === 'non_primary' && NON_PRIMARY.has(ra));
  if (!rolesMeet) diffs.push({ slot: 'analysis', reason: 'analysis_differs', rank: RANK.analysis + 0.4, detail: `analysis ${a.frame.analysis.role ?? 'unstated'} vs ${b.frame.analysis.role ?? 'unstated'}` });
  // "the first interim analysis" against "the second interim analysis": two occasions of one group-sequential design.
  const oa = a.frame.analysis.occasion;
  const ob = b.frame.analysis.occasion;
  if (oa && ob && oa !== ob) diffs.push({ slot: 'analysis', reason: 'analysis_differs', rank: RANK.analysis + 0.4, detail: `analysis occasion ${oa} vs ${ob}` });
  else if (a.frame.analysis.role !== b.frame.analysis.role) defaulted.push('analysis');
  const xa = a.frame.analysis;
  const xb = b.frame.analysis;
  if (xa.cutoff && xb.cutoff && xa.cutoff !== xb.cutoff) diffs.push({ slot: 'analysis', reason: 'cutoff_differs', rank: RANK.study, detail: `cut-off ${xa.cutoff} vs ${xb.cutoff}` });
  for (const [k, reason, slot, sub] of [
    ['assessor', 'assessor_differs', 'assessor', 0],
    ['model', 'model_differs', 'model', 0.1],
    ['estimand', 'estimand_differs', 'estimand', 0.2],
    ['imputation', 'imputation_differs', 'imputation', 0.3],
  ] as const) {
    if (xa[k] && xb[k] && xa[k] !== xb[k]) diffs.push({ slot, reason, rank: RANK.analysis + sub, detail: `${k} ${xa[k]} vs ${xb[k]}` });
    // Missing-data handling is never defaulted: an imputation stated on one side only is a different analysis from the
    // text that states none (r1 sp-22, sp-42, pv-effect-trailing-sensitivity-method).
    else if (k === 'imputation' && !xa[k] !== !xb[k]) diffs.push({ slot, reason, rank: RANK.analysis + sub, detail: `imputation ${xa[k] ?? 'unstated'} vs ${xb[k] ?? 'unstated'}` });
    else if (!xa[k] !== !xb[k]) defaulted.push(slot);
  }
  if ((xa.method ?? '') !== (xb.method ?? '')) {
    diffs.push({ slot: 'analysis', reason: 'analysis_differs', rank: RANK.analysis + 0.35, detail: `analysis method ${xa.method ?? 'unstated'} vs ${xb.method ?? 'unstated'}` });
  }
  if (diffs.length > 0) return { ok: false, diffs: diffs.sort((x, y) => x.rank - y.rank) };
  return { ok: true, defaulted };
}

const COMPONENTS: Component[] = ['count', 'percent', 'denominator', 'estimate', 'lower', 'upper', 'p'];

function pBasisDiffers(a: PBasis | undefined, b: PBasis | undefined): boolean {
  if ((a?.sided ?? 'two') !== (b?.sided ?? 'two')) return true;
  if (a?.test && b?.test && a.test !== b.test) return true;
  return (a?.adjusted === 'adjusted') !== (b?.adjusted === 'adjusted');
}

/** Components of a compatible pair; scale or unit differences leave only the p-value comparable (P-comp). */
/** The written number divided by 100, exactly (digits shifted two places, never a float): 104.12 → 1.0412. */
function shift2(w: WrittenNumber): WrittenNumber {
  const [i, f = ''] = w.digits.split('.');
  const p = i.padStart(3, '0');
  const frac = p.slice(-2) + f;
  return { ...w, digits: `${p.slice(0, -2).replace(/^0+(?=\d)/, '')}.${frac}`, dp: frac.length };
}

const GMR = new Set(['ratio_geometric_means', 'ratio_geometric_ls_means', 'ratio_of_means']);

/**
 * A geometric-mean ratio is written either as a ratio (1.04) or as a percentage (104.12, the bioequivalence-table
 * convention, often without a "%"). Two bare values that agree once one is shifted two places may be one figure on two
 * scales: their scale is not identified, so they are not compared (r1 nsf-09). Used only to refuse a comparison, never
 * to declare agreement (C7: scales are never converted).
 */
function gmrScaleAmbiguous(a: Claim, b: Claim): boolean {
  if (!GMR.has(a.frame.measure.key.effect ?? '') || a.frame.measure.key.effect !== b.frame.measure.key.effect) return false;
  if (a.frame.scale !== 'ratio' || b.frame.scale !== 'ratio') return false;
  const x = a.value.estimate;
  const y = b.value.estimate;
  if (!x || !y || x.kind !== 'exact' || y.kind !== 'exact' || agreeAsWritten(x, y) !== 'differ') return false;
  return agreeAsWritten(shift2(x), y) === 'agree' || agreeAsWritten(x, shift2(y)) === 'agree';
}

/** Two interval levels as written: read with `readNumber` and compared with `agreeAsWritten`, never as text (r2 num-10). */
function sameLevel(x: string, y: string): boolean {
  if (x === y) return true;
  const a = readNumber(x);
  const b = readNumber(y);
  return !!a && !!b && agreeAsWritten(a, b) === 'agree';
}

function components(a: Claim, b: Claim): ComponentResult[] {
  const out: ComponentResult[] = [];
  const va = a.value;
  const vb = b.value;
  const scaleDiff = (a.frame.scale && b.frame.scale && a.frame.scale !== b.frame.scale) || gmrScaleAmbiguous(a, b);
  const unitDiff = !scaleDiff && a.frame.unit && b.frame.unit && a.frame.unit !== b.frame.unit;
  const ciA = a.frame.ci;
  const ciB = b.frame.ci;
  let ciReason: ReasonCode | undefined;
  if (ciA && ciB) {
    if (ciA.kind !== ciB.kind) ciReason = 'interval_kind_differs';
    // The level is a written number like any other: "95.0% CI" and "95% CI" are the same interval (r2 num-10).
    else if (!sameLevel(ciA.level, ciB.level)) ciReason = 'ci_level_differs';
    else if (ciA.sided !== ciB.sided) ciReason = 'ci_sidedness_differs';
  }
  for (const k of COMPONENTS) {
    const x = va[k] as WrittenNumber | undefined;
    const y = vb[k] as WrittenNumber | undefined;
    const interval = k === 'lower' || k === 'upper';
    const unread = (interval && (va.intervalUnread || vb.intervalUnread)) || va.unreadComponents?.[k] || vb.unreadComponents?.[k];
    if (!x && !y) continue;
    if (!x || !y) {
      // A component one side states and the other does not ("3 (0.5%)" vs "3"): reported, never derived (C22).
      out.push({ component: k, a: canonical(x), b: canonical(y), aWritten: shown(x), bWritten: shown(y), result: 'not_compared', reason: unread ? (unread as ReasonCode) : 'no_counterpart' });
      continue;
    }
    const base = { component: k, a: canonical(x), b: canonical(y), aWritten: shown(x), bWritten: shown(y) };
    if (unread) {
      out.push({ ...base, result: 'not_compared', reason: unread as ReasonCode });
      continue;
    }
    if (k !== 'p' && scaleDiff) {
      out.push({ ...base, result: 'not_compared', reason: 'scale_differs' });
      continue;
    }
    if (k !== 'p' && unitDiff) {
      out.push({ ...base, result: 'not_compared', reason: 'unit_differs' });
      continue;
    }
    // Two p-values are the same quantity only with the same sidedness (unstated = two-sided, C3), the same named test and
    // the same multiplicity adjustment: a one-sided p is half the two-sided one, a Wald p is not a log-rank p (r1 nsf-01..04).
    if (k === 'p' && pBasisDiffers(va.pBasis, vb.pBasis)) {
      out.push({ ...base, result: 'not_compared', reason: 'p_value_basis_differs' });
      continue;
    }
    if (interval && ciReason) {
      out.push({ ...base, result: 'not_compared', reason: ciReason });
      continue;
    }
    if (interval && (!ciA || !ciB)) {
      out.push({ ...base, result: 'not_compared', reason: 'ci_level_unstated' });
      continue;
    }
    // A bound written 0 among decimal siblings (C10).
    if (interval && ((x.digits === '0' && x.dp === 0 && y.dp > 0) || (y.digits === '0' && y.dp === 0 && x.dp > 0))) {
      out.push({ ...base, result: 'not_compared', reason: 'zero_precision_ambiguous' });
      continue;
    }
    const r = agreeAsWritten(x, y);
    if (typeof r === 'string') out.push({ ...base, result: r, comparedAtDp: Math.min(x.dp, y.dp) });
    else out.push({ ...base, result: 'not_compared', reason: r.notCompared });
  }
  return out;
}

const sideOf = (c: Claim) => ({ claimId: c.id, sourceId: c.loc.sourceId, quote: c.loc.quote, loc: c.loc });
const ncSide = (c: Claim): NotComparedSide => ({ sourceId: c.loc.sourceId, quote: c.loc.quote, loc: c.loc, claimId: c.id, values: valuesOfClaim(c) });

export function valuesOfClaim(c: Claim): string[] {
  return COMPONENTS.filter((k) => c.value[k]).map((k) => canonical(c.value[k] as WrittenNumber));
}

const armShown = (a: ArmRef | undefined): string => armLabel(a).replace(/(\d)(mg|mcg|g|ml)\b/gi, '$1 $2');

function comparisonOf(a: Claim, b: Claim, comps: ComponentResult[]): Comparison | null {
  const differ = comps.some((c) => c.result === 'differ');
  const agree = comps.some((c) => c.result === 'agree');
  if (!differ && !agree) return null;
  const label = a.measureLabel.length >= b.measureLabel.length ? a.measureLabel : b.measureLabel;
  const arm = a.frame.arm ? armShown(a.frame.arm) : a.frame.contrast ? `${armShown(a.frame.contrast.test) || 'test'} vs ${armShown(a.frame.contrast.control) || 'control'}` : undefined;
  const vals = comps
    .filter((c) => c.result !== 'not_compared')
    .map((c) => `${c.component} ${c.aWritten} vs ${c.bWritten} (${c.result === 'agree' ? 'agree' : 'differ'}${c.comparedAtDp !== undefined ? ` at ${c.comparedAtDp} dp` : ''})`)
    .join('; ');
  return {
    outcome: differ ? 'conflict' : 'consistent',
    measureLabel: label,
    ...(arm ? { arm } : {}),
    frameSummary: frameSummary(a),
    a: sideOf(a),
    b: sideOf(b),
    components: comps,
    detail: `${label}${arm ? ` · ${arm}` : ''} — "${a.loc.quote.slice(0, 120)}" (${a.loc.sourceId}, chars ${a.loc.start}–${a.loc.end}) vs "${b.loc.quote.slice(0, 120)}" (${b.loc.sourceId}, chars ${b.loc.start}–${b.loc.end}): ${vals}.`,
  };
}

/** Identity of a claim's frame and values, for collapsing a figure stated twice identically in one source. */
const frameKey = (c: Claim) => JSON.stringify({ ...c.frame, arm: c.frame.arm ? armLabel(c.frame.arm) : undefined, contrast: undefined, ct: c.frame.contrast ? [armLabel(c.frame.contrast.test), armLabel(c.frame.contrast.control)] : undefined });
const valueKey = (c: Claim) => valuesOfClaim(c).join('|') + `|${COMPONENTS.filter((k) => c.value[k]).join(',')}`;

interface Cluster {
  rep: Claim;
  members: Claim[];
  multi: boolean;
}

function clustersOf(claims: readonly Claim[]): Cluster[] {
  const byFrame = new Map<string, Claim[]>();
  for (const c of claims) {
    const k = frameKey(c);
    byFrame.set(k, [...(byFrame.get(k) ?? []), c]);
  }
  const out: Cluster[] = [];
  for (const list of byFrame.values()) {
    const vals = new Set(list.map(valueKey));
    out.push({ rep: list[0], members: list, multi: vals.size > 1 });
  }
  return out.sort((x, y) => x.rep.loc.start - y.rep.loc.start);
}

function oneSided(u: Unframed): NotCompared {
  return {
    outcome: 'not_compared',
    reason: u.reason,
    detail: `${u.measureLabel ?? 'figure'} — "${u.loc.quote.slice(0, 140)}" (${u.loc.sourceId}, chars ${u.loc.start}–${u.loc.end}): ${u.detail}`,
    ...(u.measureLabel ? { measureLabel: u.measureLabel } : {}),
    a: { sourceId: u.loc.sourceId, quote: u.loc.quote, loc: u.loc, values: u.values },
    ...(u.missing.length ? { missingSlots: u.missing } : {}),
  };
}

/** Compare the claims of two sources. */
export function comparePair(A: SourceClaims, B: SourceClaims): { comparisons: Comparison[]; notCompared: NotCompared[] } {
  const comparisons: Comparison[] = [];
  const notCompared: NotCompared[] = [];
  const invA = armInventory(A.claims);
  const invB = armInventory(B.claims);
  const armCount = (inv: ArmInventory) => [...inv.values()].reduce((n, s) => n + Math.max(1, s.size), 0);
  const ca = clustersOf(A.claims);
  const cb = clustersOf(B.claims);
  const sideA = (c: Claim): Side => ({ claim: c, src: A, inv: invA, armCount: armCount(invA) });
  const sideB = (c: Claim): Side => ({ claim: c, src: B, inv: invB, armCount: armCount(invB) });
  const compatAB = new Map<Cluster, Cluster[]>();
  const compatBA = new Map<Cluster, Cluster[]>();
  const nearest = new Map<Cluster, { other: Cluster; diffs: Diff[] }>();
  const nearestB = new Map<Cluster, { other: Cluster; diffs: Diff[] }>();
  for (const x of ca) {
    for (const y of cb) {
      if (x.rep.frame.measure.family !== y.rep.frame.measure.family && nearKey(x.rep) !== nearKey(y.rep)) continue;
      const r = compat(sideA(x.rep), sideB(y.rep));
      // A p-value-only effect meets an effect of its frame on the p component alone (still under C13's single candidate).
      const sameMeasure = coreKey(x.rep) === coreKey(y.rep) || (x.rep.frame.measure.family === 'effect' && y.rep.frame.measure.family === 'effect' && (pOnly(x.rep) || pOnly(y.rep)));
      if (r.ok && sameMeasure) {
        compatAB.set(x, [...(compatAB.get(x) ?? []), y]);
        compatBA.set(y, [...(compatBA.get(y) ?? []), x]);
      } else if (nearKey(x.rep) === nearKey(y.rep) && !otherDrug(x.rep.frame.arm, y.rep.frame.arm)) {
        const diffs = r.ok ? measureDiffs(x.rep, y.rep) : r.diffs;
        if (diffs.length === 0) continue;
        const better = (cur: { diffs: Diff[] } | undefined) => !cur || diffs.length < cur.diffs.length || (diffs.length === cur.diffs.length && diffs[0].rank > cur.diffs[0].rank);
        if (better(nearest.get(x))) nearest.set(x, { other: y, diffs });
        if (better(nearestB.get(y))) nearestB.set(y, { other: x, diffs });
      }
    }
  }
  const compared = new Set<Cluster>();
  const reported = new Set<string>();
  const report = (x: Cluster, y: Cluster | undefined, reason: ReasonCode, detail: string, slots?: SlotName[], aFirst = true) => {
    const key = `${x.rep.id}|${y?.rep.id ?? ''}|${reason}`;
    if (reported.has(key)) return;
    reported.add(key);
    const [p, q] = aFirst || !y ? [x, y] : [y, x];
    notCompared.push({
      outcome: 'not_compared',
      reason,
      detail,
      measureLabel: p.rep.measureLabel,
      a: ncSide(p.rep),
      ...(q ? { b: ncSide(q.rep) } : {}),
      ...(slots?.length ? { differingSlots: slots } : {}),
    });
  };
  /**
   * When several figures of one measure fit, a stated interval level settles which is which: the 90% interval's
   * counterpart is the other document's 90% interval, not its 95% one (C15, r2 num-11). Only an exact single match
   * narrows the candidates; anything else stays ambiguous.
   */
  const byLevel = (x: Cluster, list: Cluster[]): Cluster[] => {
    if (list.length < 2) return list;
    const lvl = x.rep.frame.ci?.level;
    if (!lvl) return list;
    const same = list.filter((y) => y.rep.frame.ci && sameLevel(y.rep.frame.ci.level, lvl));
    return same.length === 1 ? same : list;
  };
  for (const x of ca) {
    const cands = byLevel(x, compatAB.get(x) ?? []);
    if (cands.length === 0) continue;
    if (cands.length > 1) {
      report(x, cands[0], 'ambiguous_candidates', `${x.rep.measureLabel}: ${cands.length} compatible figures in ${B.doc.id}; an unstated slot does not settle which one this is (C13).`);
      continue;
    }
    const y = cands[0];
    const back = byLevel(y, compatBA.get(y) ?? []);
    if (back.length !== 1 || back[0] !== x) {
      const levels = back.length === 1 && x.rep.frame.ci && y.rep.frame.ci && !sameLevel(x.rep.frame.ci.level, y.rep.frame.ci.level);
      if (levels) report(x, y, 'ci_level_differs', `${x.rep.measureLabel}: ${B.doc.id} states a ${y.rep.frame.ci!.level}% interval of this estimate, not a ${x.rep.frame.ci!.level}% one (C15).`);
      else report(x, y, 'ambiguous_candidates', `${y.rep.measureLabel}: ${back.length} compatible figures in ${A.doc.id} for one in ${B.doc.id} (C13).`);
      continue;
    }
    if (x.multi || y.multi) {
      report(x, y, 'multiple_values_same_frame', `${x.rep.measureLabel}: one source states the same frame with different values.`);
      continue;
    }
    const comps = components(x.rep, y.rep);
    const cmp = comparisonOf(x.rep, y.rep, comps);
    if (cmp) {
      comparisons.push(cmp);
      compared.add(x);
      compared.add(y);
    } else {
      // The reason of a component both sides state ("<1%" vs "0.7%": bound_not_value) before a one-sided one.
      const first = comps.find((c) => c.reason && c.a && c.b)?.reason ?? comps.find((c) => c.reason)?.reason ?? 'no_counterpart';
      report(x, y, first, `${x.rep.measureLabel}: no component could be compared (${first}).`);
      compared.add(x);
      compared.add(y);
    }
  }
  for (const [list, near, compatMap, aFirst, other] of [
    [ca, nearest, compatAB, true, B],
    [cb, nearestB, compatBA, false, A],
  ] as const) {
    for (const x of list) {
      if (compared.has(x) || (compatMap.get(x)?.length ?? 0) > 0) continue;
      const n = near.get(x);
      if (n) {
        const d = n.diffs[0];
        report(x, n.other, d.reason, `${x.rep.measureLabel}: ${d.detail} — "${x.rep.loc.quote.slice(0, 100)}" vs "${n.other.rep.loc.quote.slice(0, 100)}".`, [...new Set(n.diffs.map((z) => z.slot))], aFirst);
      } else {
        report(x, undefined, 'no_counterpart', `${x.rep.measureLabel}: ${other.doc.id} states no figure of this measure.`);
      }
    }
  }
  for (const u of [...A.unframed, ...B.unframed]) notCompared.push(oneSided(u));
  notCompared.push(...unframedDifferences(A, B, sideA, sideB));
  return { comparisons, notCompared };
}

/** An unframed figure as a claim-shaped record, for setting its identified slots against a counterpart. */
function asClaim(u: Unframed, sourceId: string, i: number): Claim | null {
  const f = u.partial;
  if (!f.measure || !f.scope || !u.measureLabel) return null;
  return { id: `${sourceId}:u${i}`, frame: { ...f, measure: f.measure, scope: f.scope, analysis: f.analysis ?? {} }, value: {}, form: u.form, loc: u.loc, measureLabel: u.measureLabel, section: '' };
}

/** Differences in slots identified on both sides; the unframed side's missing slots and unread scope never count. */
function identifiedDiffs(a: Claim, b: Claim, ua: Unframed | undefined, ub: Unframed | undefined, sa: Side, sb: Side): Diff[] {
  const r = compat(sa, sb);
  const diffs = r.ok ? measureDiffs(a, b) : r.diffs;
  const missing = new Set([...(ua?.missing ?? []), ...(ub?.missing ?? [])]);
  const scopeUnread = ua?.reason === 'unrecognised_qualifier' || ub?.reason === 'unrecognised_qualifier' || ua?.reason === 'subgroup_context_unresolved' || ub?.reason === 'subgroup_context_unresolved';
  const basisAspect = new Set<ReasonCode>(['event_basis_differs', 'causality_ambiguous', 'ascertainment_differs']);
  return diffs.filter((d) => {
    // A missing measure slot (an unstated discontinuation object) leaves the event basis identified (euc-11).
    if (missing.has(d.slot) && !(d.slot === 'measure' && basisAspect.has(d.reason))) return false;
    if (d.slot === 'study' && (!a.frame.study || !b.frame.study || d.reason === 'pool_membership_unidentified' || d.reason === 'study_unidentified')) return false;
    if (d.slot === 'population' && (!a.frame.population?.stated || !b.frame.population?.stated)) return false;
    if (d.slot === 'arm' && (!a.frame.arm || !b.frame.arm)) return false;
    if (scopeUnread && (d.slot === 'subgroup' || d.slot === 'period' || d.slot === 'part')) return false;
    return true;
  });
}

/**
 * An unframed figure is reported one-sided with its missing slot. When a slot identified on both sides already
 * separates it from its nearest counterpart (another subgroup, effect type, measure or study), that difference is
 * reported as well, with both quotes, so a reviewer sees why the pair could never be compared. Never a comparison.
 */
function unframedDifferences(A: SourceClaims, B: SourceClaims, sideA: (c: Claim) => Side, sideB: (c: Claim) => Side): NotCompared[] {
  const out: NotCompared[] = [];
  const seen = new Set<string>();
  const pool = (S: SourceClaims) => [
    ...S.claims.map((c) => ({ claim: c, u: undefined as Unframed | undefined })),
    ...S.unframed.map((u, i) => ({ claim: asClaim(u, S.doc.id, i), u })).filter((x): x is { claim: Claim; u: Unframed } => !!x.claim),
  ];
  const listA = pool(A);
  const listB = pool(B);
  for (const [mine, theirs, mineIsA] of [
    [listA, listB, true],
    [listB, listA, false],
  ] as const) {
    for (const x of mine) {
      if (!x.u) continue;
      // The nearest counterparts: fewest identified differences, then the highest-precedence one. An unframed figure
      // missing its arm ties with every arm of the other source, and each tie is reported (lu-19).
      let best: Array<{ y: (typeof theirs)[number]; diffs: Diff[] }> = [];
      for (const y of theirs) {
        if (nearKey(y.claim) !== nearKey(x.claim) || otherDrug(x.claim.frame.arm, y.claim.frame.arm)) continue;
        const [ca, cb, ua, ub] = mineIsA ? [x.claim, y.claim, x.u, y.u] : [y.claim, x.claim, y.u, x.u];
        let diffs = identifiedDiffs(ca, cb, ua, ub, sideA(ca), sideB(cb)).sort((p, q) => p.rank - q.rank);
        // A pooled figure with unlisted members against a pool that agrees on every identified slot: the pair is
        // reported together, so the equal-looking counterpart is never left as "no counterpart" (pvs-20, C16).
        if (diffs.length === 0 && x.u.reason === 'pool_membership_unidentified' && y.claim.frame.study?.kind === 'pool') {
          diffs = [{ slot: 'study', reason: 'pool_membership_unidentified', rank: RANK.study, detail: 'pool membership not listed on one side, so pool identity cannot be established' }];
        }
        if (diffs.length === 0) continue;
        const cur = best[0];
        if (!cur || diffs.length < cur.diffs.length || (diffs.length === cur.diffs.length && diffs[0].rank < cur.diffs[0].rank)) best = [{ y, diffs }];
        else if (diffs.length === cur.diffs.length && diffs[0].rank === cur.diffs[0].rank) best.push({ y, diffs });
      }
      for (const b of best) {
        const d = b.diffs[0];
        const [pa, pb] = mineIsA ? [x.claim, b.y.claim] : [b.y.claim, x.claim];
        const key = `${pa.id}|${pb.id}|${d.reason}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const side = (c: Claim, u: Unframed | undefined): NotComparedSide => ({ sourceId: c.loc.sourceId, quote: c.loc.quote, loc: c.loc, ...(u ? {} : { claimId: c.id }), values: u ? u.values : valuesOfClaim(c) });
        out.push({
          outcome: 'not_compared',
          reason: d.reason,
          detail: `${x.claim.measureLabel}: ${d.detail} (and, on its own, ${x.u.reason.replace(/_/g, ' ')}) — "${pa.loc.quote.slice(0, 100)}" vs "${pb.loc.quote.slice(0, 100)}".`,
          measureLabel: pa.measureLabel,
          a: side(pa, mineIsA ? x.u : b.y.u),
          b: side(pb, mineIsA ? b.y.u : x.u),
          differingSlots: [...new Set(b.diffs.map((z) => z.slot))],
        });
      }
    }
  }
  return out;
}

/** The same frame stated twice in one source, in different sections. */
export function compareWithin(S: SourceClaims): Comparison[] {
  const out: Comparison[] = [];
  const byFrame = new Map<string, Claim[]>();
  for (const c of S.claims) {
    const k = frameKey(c);
    byFrame.set(k, [...(byFrame.get(k) ?? []), c]);
  }
  for (const list of byFrame.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.section === b.section) continue;
        const cmp = comparisonOf(a, b, components(a, b));
        if (cmp) out.push(cmp);
      }
    }
  }
  return out;
}

export function summariesOf(comparisons: readonly Comparison[], notCompared: readonly NotCompared[]): MeasureSummary[] {
  const m = new Map<string, MeasureSummary>();
  const get = (label: string) => {
    let s = m.get(label);
    if (!s) {
      s = { measureLabel: label, status: 'not_compared', compared: 0, conflicts: 0, notCompared: 0 };
      m.set(label, s);
    }
    return s;
  };
  for (const c of comparisons) {
    const s = get(c.measureLabel);
    s.compared++;
    if (c.outcome === 'conflict') s.conflicts++;
  }
  for (const n of notCompared) get(n.measureLabel ?? 'figure').notCompared++;
  for (const s of m.values()) s.status = s.conflicts > 0 ? 'conflict_found' : s.compared > 0 ? 'consistent_where_compared' : 'not_compared';
  return [...m.values()].sort((a, b) => a.measureLabel.localeCompare(b.measureLabel));
}

export function verdictOf(all: readonly Comparison[]): ClaimReport['verdict'] {
  if (all.some((c) => c.outcome === 'conflict')) return 'conflicts_found';
  return all.length > 0 ? 'no_conflict_among_compared' : 'nothing_compared';
}
