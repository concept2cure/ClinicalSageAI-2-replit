/**
 * Study-design & sample-size rationale advisor for AnA.
 *
 * Encodes common comparative trial designs (superiority, non-inferiority,
 * equivalence) and the sample-size drivers per endpoint family (continuous,
 * binary, time-to-event), with deterministic textbook approximations for a
 * two-arm sample size so AnA can sketch a powering rationale and flag the
 * assumptions to confirm with a statistician. Pairs with the estimand advisor
 * and statistical-results narrator.
 *
 * Deterministic and data-driven; Φ⁻¹ is the canonical stats/normal.ts. The
 * sample-size math uses standard normal approximations and is a PLANNING
 * ESTIMATE — confirm with a statistician and a validated tool before finalizing
 * the protocol/SAP.
 *
 * @module server/services/ana/study-design
 */

import { normalQuantile } from '../stats/normal';

export type DesignGoal = 'superiority' | 'non_inferiority' | 'equivalence';
export type EndpointFamily = 'continuous' | 'binary' | 'time_to_event';

export interface DesignRecord {
  id: DesignGoal;
  label: string;
  question: string;
  hypothesis: string;
  keyConsiderations: string[];
  commonPitfalls: string[];
  aliases?: string[];
}

const DESIGNS: DesignRecord[] = [
  {
    id: 'superiority',
    label: 'Superiority',
    question: 'Is the new treatment better than the comparator?',
    hypothesis: 'H0: no difference; H1: a difference exists (typically two-sided).',
    keyConsiderations: [
      'Pre-specify the clinically meaningful effect size used to power the study.',
      'Two-sided alpha (commonly 0.05); state power (commonly 80–90%).',
      'A non-significant result does NOT prove equivalence.',
    ],
    commonPitfalls: ['Powering on an implausibly large effect', 'Interpreting p>0.05 as "no difference"'],
    aliases: ['superior'],
  },
  {
    id: 'non_inferiority',
    label: 'Non-inferiority',
    question: 'Is the new treatment not unacceptably worse than an active comparator (by margin M)?',
    hypothesis: 'H0: new is worse than comparator by ≥ M; H1: new is worse by < M (one-sided).',
    keyConsiderations: [
      'The non-inferiority margin M must be pre-specified and clinically/statistically justified (preserves a fraction of the comparator’s effect vs placebo).',
      'Assay sensitivity & constancy assumption matter; per-protocol AND ITT analyses both examined.',
      'Use a one-sided alpha (commonly 0.025).',
    ],
    commonPitfalls: ['Margin chosen for feasibility rather than justified', 'Sloppy conduct biases toward non-inferiority (less conservative)', 'Relying on ITT alone'],
    aliases: ['non-inferiority', 'noninferiority', 'ni'],
  },
  {
    id: 'equivalence',
    label: 'Equivalence',
    question: 'Is the new treatment neither worse nor better than the comparator (within ±M)?',
    hypothesis: 'H0: difference ≥ M in either direction; H1: difference within (−M, +M) — two one-sided tests (TOST).',
    keyConsiderations: ['Symmetric margin ±M pre-specified', 'Common for bioequivalence (e.g., 80–125% on log scale)', 'Both bounds of the CI must lie within the margin'],
    commonPitfalls: ['Confusing equivalence with non-inferiority', 'Margin not justified'],
    aliases: ['equivalent', 'bioequivalence', 'tost'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findDesign(key?: string): DesignRecord | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    DESIGNS.find(d => d.id === k) ||
    DESIGNS.find(d => d.aliases?.some(a => a.toLowerCase() === k)) ||
    DESIGNS.find(d => d.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(d.id))
  );
}

// Φ⁻¹: the canonical full-precision quantile (stats/normal.ts). Before
// 2026-10-05 this module carried its own copy of Acklam's algorithm.
function probit(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  return normalQuantile(p);
}

/**
 * z for the type II error of an equivalence (TOST) design whose true difference
 * is 0: the error is split between the two bounds, z_{1−β/2}. Otherwise z_{1−β}.
 */
function tostZBeta(goal: DesignGoal, trueDifferenceZero: boolean, power: number, assumptions: string[], section: string): number {
  if (goal !== 'equivalence' || !trueDifferenceZero) return probit(power);
  assumptions.push(`equivalence with true difference 0: z_{1−β/2} (TOST, Chow-Shao-Wang ${section})`);
  return probit(1 - (1 - power) / 2);
}

export interface SampleSizeInput {
  endpointFamily: EndpointFamily;
  goal?: DesignGoal;
  alpha?: number; // default 0.05
  power?: number; // default 0.8
  twoSided?: boolean; // default true for superiority
  // continuous:
  meanDifference?: number;
  sd?: number;
  // binary:
  p1?: number;
  p2?: number;
  // time-to-event:
  hazardRatio?: number;
  probEvent?: number; // overall probability of the event (to convert events→patients)
  allocationRatio?: number; // n2/n1, default 1
  margin?: number; // NI/equivalence margin (continuous units or risk diff)
}

export interface SampleSizeResult {
  perArm: number | null;
  total: number | null;
  events?: number | null; // for TTE
  assumptions: string[];
  caveats: string[];
}

function ceil(n: number): number {
  return Number.isFinite(n) ? Math.ceil(n) : NaN;
}

/** Two-arm sample size via standard normal approximations (planning estimate). */
export function estimateSampleSize(input: SampleSizeInput): SampleSizeResult {
  const alpha = input.alpha ?? 0.05;
  const power = input.power ?? 0.8;
  const goal = input.goal ?? 'superiority';
  const twoSided = input.twoSided ?? goal === 'superiority';
  const k = input.allocationRatio ?? 1;
  const zAlpha = probit(1 - (twoSided ? alpha / 2 : alpha));
  let zBeta = probit(power);
  const assumptions: string[] = [
    `${goal} design, ${twoSided ? 'two-sided' : 'one-sided'} α=${alpha}, power=${Math.round(power * 100)}%`,
    `allocation ratio (n2/n1)=${k}`,
  ];
  const caveats: string[] = [
    'Normal-approximation planning estimate — confirm with a statistician and a validated tool.',
    'Does not include dropout inflation — inflate by 1/(1−dropout).',
  ];

  let perArm: number | null = null;
  let events: number | null | undefined = undefined;

  if (input.endpointFamily === 'continuous') {
    const sd = input.sd;
    const delta = goal === 'superiority' ? input.meanDifference : (input.meanDifference !== undefined && input.margin !== undefined ? input.margin - Math.abs(input.meanDifference ?? 0) : input.margin);
    if (sd && delta && delta !== 0) {
      // Equivalence (TOST) with a true difference of 0 splits the type II error
      // between the two bounds: z_{1−β/2}, not z_{1−β} — Chow, Shao & Wang (2008)
      // §3.2.3. Before 2026-10-05 this returned 50 per arm where 69 is right
      // (Δ = 0.5σ, α = 0.05, 80% power).
      zBeta = tostZBeta(goal, !input.meanDifference, power, assumptions, '§3.2.3');
      const n1 = ((1 + 1 / k) * Math.pow((zAlpha + zBeta) * sd / delta, 2));
      perArm = ceil(n1);
      assumptions.push(`SD=${sd}, effective difference=${Math.abs(delta)}`);
    } else {
      caveats.push('Provide sd and meanDifference (and margin for NI/equivalence).');
    }
  } else if (input.endpointFamily === 'binary') {
    const p1 = input.p1, p2 = input.p2;
    if (p1 !== undefined && p2 !== undefined) {
      let d = Math.abs(p1 - p2);
      if (goal !== 'superiority' && input.margin !== undefined) d = Math.max(input.margin - Math.abs(p1 - p2), 1e-9);
      if (d > 0) {
        // TOST with equal true rates: z_{1−β/2} (Chow, Shao & Wang §4.2.3).
        zBeta = tostZBeta(goal, p1 === p2, power, assumptions, '§4.2.3');
        const pbar = (p1 + k * p2) / (1 + k);
        const n1 = (Math.pow(zAlpha * Math.sqrt((1 + 1 / k) * pbar * (1 - pbar)) + zBeta * Math.sqrt(p1 * (1 - p1) + (p2 * (1 - p2)) / k), 2)) / (d * d);
        perArm = ceil(n1);
        assumptions.push(`p1=${p1}, p2=${p2}, effective difference=${Math.round(d * 1000) / 1000}`);
      }
    } else {
      caveats.push('Provide p1 and p2 (and margin for NI/equivalence).');
    }
  } else {
    // time-to-event: Schoenfeld events, then convert to patients via event probability.
    const hr = input.hazardRatio;
    if (hr && hr > 0 && hr !== 1) {
      const totalEvents = Math.pow(zAlpha + zBeta, 2) * Math.pow(1 + k, 2) / (k * Math.pow(Math.log(hr), 2));
      events = ceil(totalEvents);
      assumptions.push(`hazard ratio=${hr} (Schoenfeld)`);
      if (input.probEvent && input.probEvent > 0) {
        const total = totalEvents / input.probEvent;
        perArm = ceil(total / (1 + k)); // n1 share of the total patients

        assumptions.push(`overall event probability=${input.probEvent}`);
      } else {
        caveats.push('Provide probEvent to convert required events into patient numbers.');
      }
    } else {
      caveats.push('Provide a hazard ratio (≠1) for a time-to-event calculation.');
    }
  }

  const total = perArm !== null ? ceil(perArm * (1 + k)) : null;
  return { perArm, total, events, assumptions, caveats };
}

export interface StudyDesignQuery {
  goal?: string;
  sampleSize?: SampleSizeInput;
}

export interface StudyDesignResult {
  resolved: { goal: DesignGoal | null };
  design: DesignRecord | null;
  sampleSize: SampleSizeResult | null;
  brief: string;
}

export function listStudyDesigns() {
  return DESIGNS.map(d => ({ id: d.id, label: d.label, question: d.question }));
}

export function adviseStudyDesign(q: StudyDesignQuery): StudyDesignResult {
  const design = findDesign(q.goal) ?? (q.sampleSize?.goal ? findDesign(q.sampleSize.goal) ?? null : null);
  const ss = q.sampleSize ? estimateSampleSize(q.sampleSize) : null;
  const parts: string[] = [];

  if (design) {
    parts.push(`# Study design: ${design.label}`);
    parts.push(`\n**Question.** ${design.question}`);
    parts.push(`**Hypothesis.** ${design.hypothesis}`);
    parts.push(bullets('Key considerations', design.keyConsiderations));
    parts.push(bullets('Common pitfalls', design.commonPitfalls));
  } else if (!ss) {
    parts.push('# Comparative trial designs');
    for (const d of DESIGNS) parts.push(`\n## ${d.label}\n${d.question}`);
  }

  if (ss) {
    parts.push('\n## Sample-size estimate (planning)');
    if (ss.perArm !== null) parts.push(`- **Per arm:** ${ss.perArm}; **total:** ${ss.total}` + (ss.events != null ? `; **required events:** ${ss.events}` : ''));
    else if (ss.events != null) parts.push(`- **Required events:** ${ss.events}`);
    else parts.push('- _Insufficient inputs for a numeric estimate._');
    parts.push(bullets('Assumptions', ss.assumptions));
    parts.push(bullets('Caveats', ss.caveats));
  }

  parts.push(
    '\n## Note\nPlanning estimates only — confirm with a statistician and a validated tool, and define the ' +
      'estimand (advise_estimand) before finalizing. Inflate for anticipated dropout.'
  );

  return { resolved: { goal: design?.id ?? null }, design, sampleSize: ss, brief: parts.filter(Boolean).join('\n') };
}
