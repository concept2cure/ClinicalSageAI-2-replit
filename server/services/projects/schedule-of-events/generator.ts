/**
 * Schedule-of-Events generator — pure projection of a milestone schedule.
 *
 * Given a project type, a baseline (anchor) date, the program goals, and an
 * optional overall target date, this builds the concrete dated milestones for
 * the project's schedule of events. It is deterministic and explainable:
 *
 *   1. Resolve the regulatory blueprint for the project type (templates.ts).
 *   2. Compute a compression factor so the blueprint's nominal duration lands
 *      on the requested target date (goals can pull the target earlier).
 *   3. Place each milestone at baseline + round(offset * factor).
 *   4. Emit a human-readable "basis summary" describing what AnA grounded the
 *      schedule on (type, framework, goals, target, compression).
 *
 * No DB, no LLM, no RNG. AnA calls this, persists the result, and layers
 * narrative + later amendments on top.
 *
 * @module server/services/projects/schedule-of-events/generator
 */

import { getScheduleTemplate, type MilestoneCategory } from './templates';

export interface GeneratorGoal {
  title: string;
  description?: string | null;
  targetDate?: string | Date | null;
  priority?: string | null;
  metric?: string | null;
}

export interface GenerateScheduleInput {
  projectType: string | null | undefined;
  /** Anchor for offset-0 milestones. Defaults to now. */
  baselineDate?: Date | null;
  /** Desired overall completion/submission date. When earlier/later than the
   *  blueprint's nominal end, the schedule compresses/stretches to fit. */
  targetDate?: Date | null;
  goals?: GeneratorGoal[];
}

export interface GeneratedMilestone {
  key: string;
  title: string;
  description?: string;
  category: MilestoneCategory;
  baselineDate: Date;
  targetDate: Date;
  isCritical: boolean;
  regulatoryBasis?: string;
  ownerRole?: string;
  dependsOn: string[];
  sortOrder: number;
  anaRationale: string;
}

export interface GeneratedSchedule {
  projectType: string;
  framework: string;
  baselineDate: Date;
  targetDate: Date;
  confidence: 'low' | 'moderate' | 'high';
  basisSummary: string;
  milestones: GeneratedMilestone[];
}

const DAY_MS = 86_400_000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function clampFactor(f: number): number {
  if (!Number.isFinite(f) || f <= 0) return 1;
  // Don't let goals compress a regulatory program to an unrealistic degree, or
  // stretch it absurdly. Surfaced via confidence when near the bounds.
  return Math.min(2.5, Math.max(0.5, f));
}

/**
 * Build a dated schedule. Pure — same inputs always yield the same output
 * (modulo `baselineDate` defaulting to now when omitted).
 */
export function generateSchedule(input: GenerateScheduleInput): GeneratedSchedule {
  const template = getScheduleTemplate(input.projectType);
  const baseline = input.baselineDate ?? new Date();

  // Earliest goal target date acts as a pull-forward constraint on the program.
  const goalTargets = (input.goals ?? [])
    .map((g) => (g.targetDate ? new Date(g.targetDate) : null))
    .filter((d): d is Date => !!d && Number.isFinite(d.getTime()));
  const earliestGoalTarget = goalTargets.length
    ? new Date(Math.min(...goalTargets.map((d) => d.getTime())))
    : null;

  const requestedTarget =
    input.targetDate && Number.isFinite(input.targetDate.getTime())
      ? input.targetDate
      : earliestGoalTarget;

  const nominalEnd = addDays(baseline, template.nominalDurationDays);
  let factor = 1;
  if (requestedTarget) {
    const requestedSpan = (requestedTarget.getTime() - baseline.getTime()) / DAY_MS;
    if (requestedSpan > 0) {
      factor = clampFactor(requestedSpan / template.nominalDurationDays);
    }
  }

  const milestones: GeneratedMilestone[] = template.milestones.map((m, i) => {
    const scaledOffset = Math.round(m.offsetDays * factor);
    const date = addDays(baseline, scaledOffset);
    const rationaleParts: string[] = [];
    if (m.regulatoryBasis) rationaleParts.push(`Required by ${m.regulatoryBasis}.`);
    rationaleParts.push(
      `Placed at day ${scaledOffset} of the ${template.label} pathway` +
        (factor !== 1 ? ` (compressed ${Math.round(factor * 100)}% to meet the program target).` : '.')
    );
    if (m.isCritical) rationaleParts.push('On the critical path.');
    return {
      key: m.key,
      title: m.title,
      description: m.description,
      category: m.category,
      baselineDate: date,
      targetDate: date,
      isCritical: m.isCritical,
      regulatoryBasis: m.regulatoryBasis,
      ownerRole: m.ownerRole,
      dependsOn: m.dependsOn ?? [],
      sortOrder: i,
      anaRationale: rationaleParts.join(' '),
    };
  });

  const finalDate = milestones.length ? milestones[milestones.length - 1].targetDate : nominalEnd;

  // Confidence: lower when goals forced an aggressive compression.
  let confidence: GeneratedSchedule['confidence'] = 'high';
  if (factor <= 0.6) confidence = 'low';
  else if (factor < 0.85 || factor > 1.6) confidence = 'moderate';

  const goalCount = input.goals?.length ?? 0;
  const basisSummary =
    `Schedule grounded in the ${template.label} regulatory pathway (${template.framework}). ` +
    `${milestones.length} milestones anchored from ${baseline.toISOString().slice(0, 10)}` +
    (requestedTarget
      ? ` toward a target of ${requestedTarget.toISOString().slice(0, 10)}`
      : ` over a nominal ${template.nominalDurationDays}-day program`) +
    `. ` +
    (goalCount
      ? `Aligned to ${goalCount} program goal${goalCount === 1 ? '' : 's'}. `
      : '') +
    (factor < 0.85
      ? `Timeline compressed to ${Math.round(factor * 100)}% of nominal to hit the target — confidence is ${confidence}; consider parallelizing critical-path work.`
      : factor > 1.6
        ? `Timeline stretched to ${Math.round(factor * 100)}% of nominal, leaving schedule margin.`
        : `Pacing is within the normal range for this pathway.`);

  return {
    projectType: template.type,
    framework: template.framework,
    baselineDate: baseline,
    targetDate: finalDate,
    confidence,
    basisSummary,
    milestones,
  };
}
