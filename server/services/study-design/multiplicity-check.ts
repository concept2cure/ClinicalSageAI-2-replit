/**
 * Multiplicity check — does the design's named procedure, with the alpha
 * allocation the design records, hold the family-wise error rate at alpha over
 * its confirmatory family?
 *
 * ## The industry need
 * ICH E9 §5.6 and FDA's guidance "Multiple Endpoints in Clinical Trials" (2022)
 * require that a trial testing more than one confirmatory hypothesis control
 * the family-wise type I error and pre-specify how. The design gate MUL-001
 * (`design-gates.ts`) already refuses a hierarchy with NO strategy; nothing
 * checked that the strategy named is one that controls the error for this
 * family, or that the recorded alpha allocation is a split of alpha over it.
 * This repository has the procedures and a seeded FWER estimator
 * (`stats/multiplicity.ts`) reachable only as a calculator; this is the
 * spine's view of them.
 *
 * ## What the allocation means here
 * `alphaAllocation` is read as each confirmatory hypothesis's INITIAL
 * significance level — the weights of Bretz et al. (2009), of which Holm,
 * fixed-sequence, fallback and gatekeeping are special cases. So each level
 * lies in the closed interval [0, alpha] (0 is legitimate: a fixed sequence or
 * a gatekeeper passes alpha on), each confirmatory endpoint is named exactly
 * once, and the levels total at most alpha. A valid recorded allocation is
 * simulated AS RECORDED:
 *  - holm — the engine's graphical procedure with the recorded weights and the
 *    weighted-Holm transitions g_ij = w_j / Σ_{k≠i} w_k; with an equal split it
 *    is exactly the engine's `holmReject`;
 *  - fixed_sequence — the engine's graphical procedure with the recorded
 *    weights and a chain in the order the allocation lists the endpoints; with
 *    alpha on the first it is exactly `fixedSequenceReject`;
 *  - hochberg — the engine's `hochbergReject` at the allocated total, only for
 *    an equal split; a weighted Hochberg has no engine here and is a gap.
 * With no allocation recorded, the named procedure is simulated with its
 * textbook split and a note says the rate describes that textbook procedure.
 * An allocation that is recorded but invalid is not simulated at all.
 *
 * ## The honesty contract
 *  - The family is the design's confirmatory endpoints — the roles
 *    `ESTIMAND_REQUIRED_ROLES` names (primary, key secondary).
 *  - Every rate is the engine's `estimateFWER` under the global null with
 *    independent p-values, from one fixed seed, and names the rule it is for:
 *    `rule` is the design's method, and `simulatedRule` the exact rule
 *    simulated (weights, transitions or level), which the engine hashes into
 *    the rate's provenance — two rules' rates never share an inputsSha256.
 *    The Monte Carlo SE is reported beside each rate, and "controlled" is
 *    decided by `fwerVerdict` against a stated tolerance, not eyeballed.
 *  - Independence is the simulation's assumption, and it is said: Hochberg's
 *    guarantee needs independence or positive dependence, which a simulation
 *    under independence cannot establish for the trial's actual endpoints.
 *  - A procedure the engine does not implement from what the spine records
 *    (graphical without a transition matrix, gatekeeping) is a gap, never
 *    approximated by a different procedure. Alpha spending is an interim
 *    device, not an endpoint-family procedure, and is said to be. A method name
 *    is looked up as data: one the spine does not record is a gap.
 *  - An unrecorded input is not assessable, never an absent need: no primary
 *    or key-secondary endpoint, or primary endpoints with no procedure (whether
 *    they are co-primary — no adjustment needed — is not recorded).
 *  - Pure and total over what a `.passthrough()` persist can store; provenance
 *    carries no clock reading.
 *
 * @module server/services/study-design/multiplicity-check
 */

import { estimateFWER, fixedSequenceReject, graphicalReject, hochbergReject, holmReject } from '../stats/multiplicity';
import { reproducibleProvenance, type ReproducibleProvenance } from '../stats/computation-provenance';
import { confirmatoryEndpoints, type MultiplicityStrategy, type StudyDesign } from './study-design-types';

export const MULTIPLICITY_CHECK_BASIS =
  'ICH E9 §5.6 (multiplicity); FDA guidance: Multiple Endpoints in Clinical Trials (2022); ' +
  'Bretz et al. 2009 (graphical procedures: the allocation as initial weights); ' +
  'family-wise error estimated under the global null by seeded simulation (stats/multiplicity.ts)';

/** Simulations per rate, and the fixed seed every rate is drawn from. */
export const FWER_SIMULATIONS = 20000;
export const FWER_SEED = 20260928;
/** A procedure "controls" the FWER when the estimate is within this many Monte Carlo SEs above alpha. */
export const FWER_TOLERANCE_SE = 3;
/** Relative slack on an allocation total and on equal shares — the engine's own tolerance on a weight sum. */
const SLACK = 1e-9;

export type MultiplicityCheckStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable' | 'not_assessable';

type Method = MultiplicityStrategy['method'];

export interface FwerRate {
  /** The rule simulated: the named procedure, or each hypothesis at the full alpha. */
  rule: Method | 'unadjusted';
  /**
   * The engine's identifier of the exact rejection rule simulated — procedure
   * and the weights, transitions or level that fix it — hashed into
   * `provenance.inputsSha256`, so two rules' rates never share a provenance.
   */
  simulatedRule: string;
  fwer: number;
  monteCarloSe: number;
  /** Simulations the rate is from. */
  simulations: number;
  provenance: ReproducibleProvenance;
}

export interface ProcedureRate extends FwerRate {
  controlled: boolean;
  /** The recorded allocation, or — none being recorded — the procedure's textbook split. */
  simulated: 'recorded_allocation' | 'textbook_split';
  /** Total initial alpha the simulated procedure spends. */
  level: number;
}

export interface AllocationCheck {
  unallocated: string[];
  outsideFamily: string[];
  duplicated: string[];
  /** Entries whose level is not in the closed interval [0, alpha]. */
  outOfRange: string[];
  /** Entries that do not name an endpoint and a numeric level. */
  malformed: number;
  /** Sum of the well-formed levels. */
  total: number;
}

export interface MultiplicityCheck {
  status: MultiplicityCheckStatus;
  gaps: string[];
  notes: string[];
  family: string[];
  method: Method | null;
  alpha: number | null;
  /** The named procedure's FWER under the global null; null when it could not be simulated. */
  procedure: ProcedureRate | null;
  /** Each hypothesis tested at the full alpha — the inflation the procedure exists to prevent. */
  unadjusted: FwerRate | null;
  allocation: AllocationCheck | null;
  basis: string;
}

type Rec = Record<string, unknown>;
type RejectFn = (p: number[]) => boolean[];
interface Entry { endpointName: string; alpha: number }
interface Simulation { reject: RejectFn; rule: string; simulated: ProcedureRate['simulated']; level: number; gaps: string[]; notes: string[] }

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isEntry = (v: unknown): v is Entry => isRecord(v) && typeof v.endpointName === 'string' && finite(v.alpha);
const show = (x: number): string => String(Number(x.toPrecision(12)));

/** The spine's methods, looked up as data — never as an object literal's inherited property. */
const SIMULATED: ReadonlySet<unknown> = new Set<Method>(['holm', 'hochberg', 'fixed_sequence']);
const UNSUPPORTED: ReadonlyMap<unknown, string> = new Map<Method, string>([
  ['graphical', 'a graphical procedure needs its initial weights and transition matrix, which the design does not record: its error control cannot be checked'],
  ['gatekeeping', 'gatekeeping families and their truncation are not recorded in a form the engine can test: its error control cannot be checked'],
  ['alpha_spending', 'alpha spending allocates error across interim looks, not across endpoints: it is not a multiplicity procedure for this family'],
]);
const HOCHBERG_NOTE = 'Hochberg controls the FWER under independence or positive dependence; the simulation assumes independence and cannot establish it for these endpoints';

function empty(status: MultiplicityCheckStatus, gaps: string[], family: string[] = []): MultiplicityCheck {
  return { status, gaps, notes: [], family, method: null, alpha: null, procedure: null, unadjusted: null, allocation: null, basis: MULTIPLICITY_CHECK_BASIS };
}

/** Whether a simulated rate is within the stated tolerance of alpha, and the gap when it is not. */
export function fwerVerdict(fwer: number, monteCarloSe: number, alpha: number): { controlled: boolean; gap: string | null } {
  const controlled = fwer <= alpha + FWER_TOLERANCE_SE * monteCarloSe;
  return {
    controlled,
    gap: controlled ? null : `the procedure's simulated family-wise error (${fwer}) exceeds alpha (${alpha}) by more than ${FWER_TOLERANCE_SE} Monte Carlo SEs`,
  };
}

/** Weighted Holm as a graph (Bretz et al. 2009): a rejected hypothesis's weight passes to the others in proportion to theirs. */
export function weightedHolmGraph(w: number[]): number[][] {
  return w.map((_, i) => {
    const rest = w.reduce((s, x, k) => (k === i ? s : s + x), 0);
    return w.map((wj, j) => (j === i || rest <= 0 ? 0 : wj / rest));
  });
}

/** A fixed sequence as a graph: each hypothesis in `order` passes all its weight to the next. */
function chainGraph(order: number[], m: number): number[][] {
  const g = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (let k = 0; k + 1 < order.length; k++) g[order[k]][order[k + 1]] = 1;
  return g;
}

/** Hypotheses that start at 0 and no positive-weight hypothesis can pass weight to: never rejectable. */
function unreachable(w: number[], g: number[][]): number[] {
  const reached = w.map((x) => x > 0);
  const queue = w.flatMap((x, i) => (x > 0 ? [i] : []));
  while (queue.length > 0) {
    const i = queue.shift() as number;
    g[i].forEach((gij, j) => {
      if (gij > 0 && !reached[j]) {
        reached[j] = true;
        queue.push(j);
      }
    });
  }
  return reached.flatMap((r, i) => (r ? [] : [i]));
}

/** The engine's rule identifier for a graphical procedure: the exact weights and transitions it is simulated with. */
const graphicalRule = (w: number[], g: number[][]): string => `graphical(weights=${JSON.stringify(w)},transitions=${JSON.stringify(g)})`;
const UNADJUSTED_RULE = 'unadjusted(each hypothesis at the full alpha)';

function rate(rule: FwerRate['rule'], simulatedRule: string, reject: RejectFn, m: number, alpha: number): FwerRate {
  const e = estimateFWER(reject, m, alpha, FWER_SIMULATIONS, FWER_SEED, simulatedRule);
  return {
    rule, simulatedRule, fwer: e.fwer, monteCarloSe: Math.sqrt((e.fwer * (1 - e.fwer)) / e.nSim),
    simulations: e.nSim, provenance: reproducibleProvenance(e.provenance),
  };
}

// ─── The family ─────────────────────────────────────────────────────────────

interface Member { name: string; role: unknown }

function confirmatoryMembers(design: StudyDesign): Member[] {
  return confirmatoryEndpoints(design).map((e) => ({ name: String(e.name), role: e.role }));
}

function familySize(family: string[]): MultiplicityCheck | null {
  if (family.length === 0) return empty('not_assessable', ['no primary or key-secondary endpoint is recorded, so there is no confirmatory family to assess'], family);
  if (family.length === 1) return empty('not_applicable', ['1 confirmatory hypothesis: there is no family to control'], family);
  return null;
}

function noProcedure(members: Member[]): MultiplicityCheck {
  const family = members.map((m) => m.name);
  if (members.every((m) => m.role === 'primary')) {
    return empty('not_assessable', [
      `${family.length} primary endpoints and no multiplicity procedure: whether they are co-primary (every one must succeed, which needs no ` +
      'adjustment — FDA Multiple Endpoints guidance, 2022) or multiple primary (any one may succeed, which needs the family-wise error controlled) is not recorded',
    ], family);
  }
  return empty('missing', [`${family.length} confirmatory hypotheses and no multiplicity procedure (design gate MUL-001)`], family);
}

function familyGaps(family: string[]): string[] {
  return [...new Set(family.filter((f, i) => family.indexOf(f) !== i))]
    .map((f) => `confirmatory endpoint "${f}" is named more than once in the design, so its allocation is ambiguous`);
}

// ─── The allocation ─────────────────────────────────────────────────────────

/** The recorded allocation checked against the family; null when none is recorded as a list. */
function allocationOf(raw: unknown, family: string[], alpha: number): { check: AllocationCheck; entries: Entry[] } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const entries = raw.filter(isEntry);
  const names = entries.map((e) => e.endpointName);
  return {
    entries,
    check: {
      unallocated: family.filter((f) => !names.includes(f)),
      outsideFamily: names.filter((n) => !family.includes(n)),
      duplicated: [...new Set(names.filter((n, i) => names.indexOf(n) !== i))],
      outOfRange: entries.filter((e) => !(e.alpha >= 0 && e.alpha <= alpha)).map((e) => e.endpointName),
      malformed: raw.length - entries.length,
      total: entries.reduce((s, e) => s + e.alpha, 0),
    },
  };
}

const absent = (raw: unknown): boolean => raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0);

function allocationGaps(a: AllocationCheck, alpha: number): string[] {
  const malformed = a.malformed === 0 ? [] : [`${a.malformed} allocation ${a.malformed === 1 ? 'entry does' : 'entries do'} not name an endpoint and a numeric level`];
  const total = a.total > alpha * (1 + SLACK)
    ? [`the allocation totals ${show(a.total)}, more than the overall alpha (${alpha}): read as initial significance levels, which must total at most alpha, it spends more error than the design has`]
    : [];
  return [
    ...malformed,
    ...a.unallocated.map((e) => `confirmatory endpoint "${e}" has no alpha allocation`),
    ...a.outsideFamily.map((e) => `the allocation names "${e}", which is not a confirmatory endpoint of this design`),
    ...a.duplicated.map((e) => `the allocation names "${e}" more than once`),
    ...a.outOfRange.map((e) => `the allocation for "${e}" is not a level in the closed interval [0, ${alpha}]`),
    ...total,
  ];
}

// ─── The simulation ─────────────────────────────────────────────────────────

const neverGap = (method: Method, name: string) =>
  `under ${method}, "${name}" starts with no alpha and receives none when others are rejected, so it can never be rejected`;

/** The named procedure with its textbook split, labelled as such: no allocation is recorded. */
function textbook(method: Method, alpha: number): Simulation {
  const reject: RejectFn = method === 'holm' ? (p) => holmReject(p, alpha)
    : method === 'hochberg' ? (p) => hochbergReject(p, alpha) : (p) => fixedSequenceReject(p, alpha);
  const split = method === 'fixed_sequence' ? 'all of alpha on the first confirmatory endpoint, in design order' : 'alpha / m on each hypothesis';
  return {
    reject, rule: `${method === 'fixed_sequence' ? 'fixed-sequence' : method}(textbook)`, simulated: 'textbook_split', level: alpha, gaps: [],
    notes: [`no allocation is recorded, so ${method} is simulated with its textbook split (${split}); the rate describes that procedure, not a recorded one`],
  };
}

/** The named procedure with the recorded allocation as its initial weights; a gap when the engine has no such procedure. */
function recorded(method: Method, entries: Entry[], family: string[], alpha: number): Simulation | string {
  const levels = family.map((f) => (entries.find((e) => e.endpointName === f) as Entry).alpha);
  const level = levels.reduce((s, x) => s + x, 0);
  if (method === 'hochberg') {
    if (!levels.every((x) => Math.abs(x - levels[0]) <= SLACK * alpha)) {
      return 'a Hochberg procedure with an unequal allocation (weighted Hochberg) has no engine here: its error control cannot be checked';
    }
    return {
      reject: (p) => hochbergReject(p, level), rule: `hochberg(level=${level})`, simulated: 'recorded_allocation', level,
      gaps: level > 0 ? [] : family.map((f) => neverGap(method, f)), notes: [],
    };
  }
  const w = levels.map((x) => x / alpha);
  const g = method === 'holm' ? weightedHolmGraph(w) : chainGraph(entries.map((e) => family.indexOf(e.endpointName)), family.length);
  return {
    reject: (p) => graphicalReject(p, alpha, w, g),
    rule: graphicalRule(w, g),
    simulated: 'recorded_allocation',
    level,
    gaps: unreachable(w, g).map((i) => neverGap(method, family[i])),
    notes: method === 'fixed_sequence' ? ['the fixed sequence is taken in the order the allocation lists the endpoints'] : [],
  };
}

function simulationOf(method: Method, raw: unknown, valid: Entry[] | null, family: string[], alpha: number): Simulation | string {
  if (absent(raw) && familyGaps(family).length === 0) return textbook(method, alpha);
  if (!valid) return `the ${method} procedure is not simulated: the recorded allocation is not a valid initial split of alpha over the family`;
  return recorded(method, valid, family, alpha);
}

// ─── The check ─────────────────────────────────────────────────────────────

type Base = Omit<MultiplicityCheck, 'status' | 'gaps' | 'procedure'>;

/** The recorded procedure, or null when none is (absent, not a record, or 'none'). */
function strategyOf(sp: Rec): Rec | null {
  const s = sp.multiplicity;
  if (!isRecord(s)) return null;
  return s.method === undefined || s.method === null || s.method === 'none' ? null : s;
}

const spineMethod = (m: unknown): Method | null => (SIMULATED.has(m) || UNSUPPORTED.has(m) ? (m as Method) : null);

function recordedGaps(raw: unknown, alloc: ReturnType<typeof allocationOf>, family: string[], alpha: number): string[] {
  const allocGaps = alloc ? allocationGaps(alloc.check, alpha)
    : [absent(raw) ? 'no alpha allocation is recorded for the family' : 'the alpha allocation is not a list of endpoint levels'];
  return [...familyGaps(family), ...allocGaps];
}

/** Simulate the procedure and decide "controlled" by `fwerVerdict`. */
function withRate(method: Method, sim: Simulation, gaps: string[], base: Base, alpha: number): MultiplicityCheck {
  const r = rate(method, sim.rule, sim.reject, base.family.length, alpha);
  const verdict = fwerVerdict(r.fwer, r.monteCarloSe, alpha);
  const all = [...(verdict.gap ? [verdict.gap] : []), ...gaps, ...sim.gaps];
  return {
    ...base, notes: [...base.notes, ...sim.notes], status: all.length ? 'partial' : 'rendered', gaps: all,
    procedure: { ...r, controlled: verdict.controlled, simulated: sim.simulated, level: sim.level },
  };
}

function checkProcedure(strategy: Rec, method: Method | null, family: string[], alpha: number): MultiplicityCheck {
  const raw = strategy.alphaAllocation;
  const alloc = allocationOf(raw, family, alpha);
  const gaps = recordedGaps(raw, alloc, family, alpha);
  const base: Base = {
    notes: method === 'hochberg' ? [HOCHBERG_NOTE] : [], family, method, alpha,
    unadjusted: rate('unadjusted', UNADJUSTED_RULE, (p) => p.map((x) => x <= alpha), family.length, alpha),
    allocation: alloc?.check ?? null, basis: MULTIPLICITY_CHECK_BASIS,
  };
  if (!method || !SIMULATED.has(method)) {
    const why = UNSUPPORTED.get(method) ?? `procedure "${String(strategy.method)}" is not a multiplicity method the design spine records: its error control cannot be checked`;
    return { ...base, status: 'partial', gaps: [why, ...gaps], procedure: null };
  }
  const sim = simulationOf(method, raw, alloc && gaps.length === 0 ? alloc.entries : null, family, alpha);
  if (typeof sim === 'string') return { ...base, status: 'partial', gaps: [...gaps, sim], procedure: null };
  return withRate(method, sim, gaps, base, alpha);
}

/** Check the design's multiplicity procedure over its confirmatory family. */
export function checkMultiplicity(design: StudyDesign): MultiplicityCheck {
  const members = confirmatoryMembers(design);
  const family = members.map((m) => m.name);
  const sized = familySize(family);
  if (sized) return sized;
  const sp: Rec = isRecord(design.statisticalPlan) ? design.statisticalPlan : {};
  const strategy = strategyOf(sp);
  if (!strategy) return noProcedure(members);
  const method = spineMethod(strategy.method);
  const a = sp.alpha;
  if (!(finite(a) && a > 0 && a < 1)) return { ...empty('partial', ['the significance level (alpha) is not recorded'], family), method };
  return checkProcedure(strategy, method, family, a);
}
