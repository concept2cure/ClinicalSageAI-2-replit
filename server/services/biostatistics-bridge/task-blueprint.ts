/**
 * Biostatistics bridge — task blueprint.
 *
 * A statistical judgment is only useful if it becomes work someone owns. The
 * judgment engine says "inadequate", "fragile", "escalate"; the design adapter
 * says "no margin", "no event rate". Neither reached the canonical task board:
 * the only task the biostatistics workflow ever raised went to
 * `concept2cure_review_tasks`, which the board does not read.
 *
 * This module turns an assessment into the tasks the board should carry —
 * as data, so the caller (the bridge service) persists them through the ONE
 * task creator (`unifiedTaskService.createUnifiedTask`) with the design as
 * the source entity, and so the surface can show a person exactly what will be
 * raised before they confirm it.
 *
 * Pure. No DB, no AI. Deterministic for a given assessment, and de-duplicated
 * by `key` so re-running an assessment proposes the same set rather than a
 * growing one.
 *
 * @module server/services/biostatistics-bridge/task-blueprint
 */

import type { JudgmentResult, StatisticalInput, StatisticalDocumentType } from '../ana-biostats/types';
import type { DesignGap } from './design-adapter';
import {
  APPLICATION_TYPE_LABELS,
  DELIVERABLE_LABELS,
  placementsForApplication,
  type ApplicationType,
} from './filing-placement';

export type BlueprintPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskBlueprint {
  /** Stable, human-readable key — the de-duplication identity across runs. */
  key: string;
  title: string;
  description: string;
  priority: BlueprintPriority;
  /** unified_tasks.category */
  category: 'analysis' | 'review' | 'document-prep' | 'compliance';
  /** unified_tasks.task_type */
  taskType: 'action' | 'deliverable' | 'review';
  regulatoryImpact: boolean;
  criticalPath: boolean;
  /** Which finding raised it, in the words the surface shows. */
  trigger: string;
  /** The statistical deliverable this task produces, when it is a document task. */
  deliverable?: StatisticalDocumentType;
}

export interface BlueprintContext {
  designTitle: string;
  /** Null when the design could not be computed (blocking gaps). */
  judgment: JudgmentResult | null;
  input: StatisticalInput | null;
  gaps: DesignGap[];
  /** The program's filing, when known; drives the deliverable checklist. */
  applicationType: ApplicationType | null;
  /** Statistical document types already persisted for the program — skipped from the checklist. */
  existingDeliverables?: StatisticalDocumentType[];
}

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Propose the tasks an assessment implies. Order: blocking gaps, then verdict
 * and escalation, then robustness findings, then the filing checklist.
 */
export function tasksFromAssessment(ctx: BlueprintContext): TaskBlueprint[] {
  const out: TaskBlueprint[] = [];
  const t = ctx.designTitle;

  // 1. Blocking gaps: the design cannot even be sized.
  for (const g of ctx.gaps.filter((x) => x.severity === 'blocking')) {
    out.push({
      key: `design-gap:${g.field}`,
      title: `Complete the design: ${g.field.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
      description: `${g.message} Set it at ${g.designPath} on "${t}" so the study can be sized.`,
      priority: 'high',
      category: 'analysis',
      taskType: 'action',
      regulatoryImpact: true,
      criticalPath: true,
      trigger: 'Blocking design gap',
    });
  }
  // Defaulted values must be confirmed before anything is filed.
  const defaulted = ctx.gaps.filter((x) => x.severity === 'defaulted');
  if (defaulted.length > 0) {
    out.push({
      key: 'design-gap:confirm-defaults',
      title: `Confirm ${defaulted.length} assumed design value${defaulted.length === 1 ? '' : 's'}`,
      description: `The sizing used engine defaults for: ${defaulted.map((d) => d.field).join(', ')}. Record the real values on "${t}" before the rationale is filed.`,
      priority: 'medium',
      category: 'analysis',
      taskType: 'action',
      regulatoryImpact: true,
      criticalPath: false,
      trigger: 'Defaulted assumptions',
    });
  }

  const j = ctx.judgment;
  const i = ctx.input;
  if (j && i) {
    // 2. Verdict.
    if (j.overallVerdict === 'inadequate') {
      out.push({
        key: 'verdict:inadequate',
        title: `Revise the sample-size assumptions for "${t}"`,
        description: `The design judged inadequate (${j.overallRisk} risk) at ${fmtPct(i.powerTarget)} target power. ${j.roleExplanations.technical}`,
        priority: 'critical',
        category: 'analysis',
        taskType: 'action',
        regulatoryImpact: true,
        criticalPath: true,
        trigger: 'Verdict: inadequate',
      });
    } else if (j.overallVerdict === 'marginal') {
      out.push({
        key: 'verdict:marginal',
        title: `Review power sensitivity for "${t}"`,
        description: `The design judged marginal (${j.overallRisk} risk). ${j.roleExplanations.technical}`,
        priority: 'high',
        category: 'review',
        taskType: 'review',
        regulatoryImpact: true,
        criticalPath: false,
        trigger: 'Verdict: marginal',
      });
    } else if (j.overallVerdict === 'insufficient_information') {
      out.push({
        key: 'verdict:insufficient',
        title: `Supply the missing design information for "${t}"`,
        description: `The judgment engine could not reach a verdict: ${j.confidence.limitations.join('; ') || 'insufficient information'}.`,
        priority: 'high',
        category: 'analysis',
        taskType: 'action',
        regulatoryImpact: false,
        criticalPath: false,
        trigger: 'Verdict: insufficient information',
      });
    }

    // 3. Escalation.
    if (j.actionRecommendation === 'escalate') {
      out.push({
        key: 'action:escalate',
        title: `Escalate the statistical design of "${t}" to the lead biostatistician`,
        description: `Escalation reasons: ${j.escalationReasons.join('; ') || j.roleExplanations.regulatory}`,
        priority: 'critical',
        category: 'review',
        taskType: 'review',
        regulatoryImpact: true,
        criticalPath: true,
        trigger: 'Action: escalate',
      });
    }

    // 4. Robustness.
    if (j.fragility.category === 'fragile' || j.fragility.category === 'very_fragile') {
      const params = j.fragility.sensitiveParameters.map((p) => p.parameter).join(', ') || 'the sensitive parameters';
      out.push({
        key: 'fragility:sensitivity',
        title: `Run sensitivity scenarios on ${params}`,
        description: `Fragility index ${j.fragility.fragilityIndex}/100 (${j.fragility.category.replace('_', ' ')}). ${j.fragility.narrative}`,
        priority: 'high',
        category: 'analysis',
        taskType: 'action',
        regulatoryImpact: true,
        criticalPath: false,
        trigger: `Fragility: ${j.fragility.category.replace('_', ' ')}`,
      });
    }
    if (j.endpointMethodFit.fit === 'weak' || j.endpointMethodFit.fit === 'mismatch') {
      out.push({
        key: 'method:fit',
        title: `Confirm the primary analysis method for "${t}"`,
        description: `Endpoint–method fit is ${j.endpointMethodFit.fit}: ${j.endpointMethodFit.rationale} Suggested: ${j.endpointMethodFit.suggestedMethod}.`,
        priority: 'high',
        category: 'review',
        taskType: 'review',
        regulatoryImpact: true,
        criticalPath: false,
        trigger: `Endpoint–method fit: ${j.endpointMethodFit.fit}`,
      });
    }

    // 5. Frame-specific obligations the engine does not judge.
    if (i.studyType === 'non_inferiority' && typeof i.nonInferiorityMargin === 'number') {
      out.push({
        key: 'frame:ni-margin',
        title: `Justify the non-inferiority margin (${i.nonInferiorityMargin}) for "${t}"`,
        description: 'Regulators expect the margin to preserve a stated fraction of the active comparator\'s effect, with the historical evidence cited (ICH E10; FDA NI guidance).',
        priority: 'high',
        category: 'compliance',
        taskType: 'action',
        regulatoryImpact: true,
        criticalPath: false,
        trigger: 'Non-inferiority frame',
      });
    }
    if ((i.interimAnalyses ?? 0) > 0) {
      out.push({
        key: 'interim:dmc',
        title: `Charter the DMC and pre-specify the interim plan for "${t}"`,
        description: `${i.interimAnalyses} interim analysis/analyses planned. The alpha-spending approach, stopping boundaries and the committee's charter must be in place before the first look.`,
        priority: 'medium',
        category: 'document-prep',
        taskType: 'deliverable',
        regulatoryImpact: true,
        criticalPath: false,
        trigger: 'Interim analyses planned',
        deliverable: 'dsmb_charter',
      });
    }
  }

  // 6. Filing checklist: the required/expected deliverables for the filing.
  if (ctx.applicationType) {
    const have = new Set(ctx.existingDeliverables ?? []);
    const label = APPLICATION_TYPE_LABELS[ctx.applicationType];
    for (const p of placementsForApplication(ctx.applicationType)) {
      if (p.required !== 'required' && p.required !== 'expected') continue;
      if (have.has(p.deliverable)) continue;
      out.push({
        key: `deliverable:${p.deliverable}`,
        title: `Draft the ${DELIVERABLE_LABELS[p.deliverable].toLowerCase()} for the ${label}`,
        description: `${p.required === 'required' ? 'Required' : 'Expected'} for a ${label}: ${p.heading}. ${p.note}`,
        priority: p.required === 'required' ? 'high' : 'medium',
        category: 'document-prep',
        taskType: 'deliverable',
        regulatoryImpact: true,
        criticalPath: p.required === 'required',
        trigger: `${label} filing checklist`,
        deliverable: p.deliverable,
      });
    }
  }

  return dedupeBlueprints(out);
}

/** First occurrence of a key wins; keeps proposal order stable. */
export function dedupeBlueprints(list: TaskBlueprint[]): TaskBlueprint[] {
  const seen = new Set<string>();
  const out: TaskBlueprint[] = [];
  for (const b of list) {
    if (seen.has(b.key)) continue;
    seen.add(b.key);
    out.push(b);
  }
  return out;
}
