/**
 * SAP skeleton projection — the design object rendered as a Statistical Analysis Plan (ICH E9 / E9(R1)).
 *
 * The last of the design object's named projections. Like the protocol, the SAP is not authored —
 * it is *projected* from the structured design, section by section, in the conventional SAP order.
 * Because it is a projection it is honest by construction: each section renders only what the object
 * holds, and where the object is silent the section is marked `partial`/`missing` with an explicit
 * gap, never filled with invented analysis. The objectives-and-estimands section reuses the very same
 * renderer the protocol uses (`renderEstimandSection`), so the SAP and the protocol agree word for word.
 *
 * Pure and deterministic; no AI, no DB. This is the honest floor; the richer, narrative SAP that
 * `sap-generator-service.ts` produces is layered on top — this module needs neither network nor model.
 *
 * @module server/services/study-design/sap-projection
 */

import { primaryEndpoints, type StudyDesign } from './study-design-types';
import type { SectionStatus } from './protocol-projection';
import { renderEstimandSection } from '../estimand-sap-section';

export interface SapSection {
  /** SAP section number. */
  number: string;
  title: string;
  /** Rendered, sentence-case content grounded entirely in the design object. */
  content: string;
  status: SectionStatus;
  /** What the object lacks for this section to be reviewer-ready. */
  gaps: string[];
}

export interface SapDocument {
  title: string;
  sections: SapSection[];
  completeness: {
    rendered: number;
    partial: number;
    missing: number;
    total: number;
    /** Rendered counts 1, partial 0.5, missing 0. */
    percent: number;
  };
  standard: 'ICH E9 / E9(R1)';
  /** Honesty marker: this document is a deterministic projection, not generated prose. */
  projectedFromObject: true;
}

const NOT_SPECIFIED = 'Not specified in the design.';

function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function statusFrom(rendered: boolean, gaps: string[]): SectionStatus {
  if (!rendered) return 'missing';
  return gaps.length === 0 ? 'rendered' : 'partial';
}

type Body = Omit<SapSection, 'number' | 'title'>;

// ─── Section builders ─────────────────────────────────────────────────────────

function introduction(design: StudyDesign): Body {
  const content =
    `This statistical analysis plan describes the planned analyses for this phase ${design.phase} ` +
    `study in ${design.indication}. It is a projection of the structured study design and is read ` +
    'alongside the protocol, with which it shares its objectives and estimands.';
  return { content, status: 'rendered', gaps: [] };
}

function objectivesAndEstimands(design: StudyDesign): Body {
  const gaps: string[] = [];
  const lines: string[] = [];
  const objectives = design.objectives ?? [];
  if (objectives.length === 0) {
    gaps.push('No objectives are defined.');
  } else {
    for (const o of objectives) {
      lines.push(`${o.level[0].toUpperCase()}${o.level.slice(1)} objective: ${o.text} (endpoint: ${o.endpointName}).`);
    }
  }
  // Reuse the protocol's estimand renderer verbatim so the two documents agree.
  const est = renderEstimandSection(design.estimands);
  lines.push('', est.text);
  const incomplete = est.attributeCompleteness.filter(a => !a.complete);
  if (incomplete.length) {
    gaps.push(`Estimands not yet complete to ICH E9(R1): ${incomplete.map(a => a.endpointName).join(', ')}.`);
  }
  return { content: lines.join('\n'), status: statusFrom(objectives.length > 0 || est.estimandCount > 0, gaps), gaps };
}

function studyDesign(design: StudyDesign): Body {
  const f = design.framework;
  if (!f) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No design framework is defined.'] };
  const gaps: string[] = [];
  const lines = [
    `Inferential framework: ${f.inferentialFrame.replace(/_/g, '-')}.`,
    `Structural design: ${f.structuralDesign.replace(/_/g, ' ')}, ${f.controlType.replace(/_/g, ' ')}-controlled.`,
  ];
  const r = design.randomization;
  if (r) lines.push(`Allocation: ratio ${r.ratio.join(':')}, ${r.allocationMethod.replace(/_/g, ' ')}, ${r.blinding} blind.`);
  else gaps.push('No randomization scheme is defined.');
  if (f.inferentialFrame !== 'superiority' && typeof f.margin !== 'number') {
    gaps.push('A non-inferiority/equivalence frame is set but no margin is given.');
  }
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function analysisPopulations(design: StudyDesign): Body {
  const gaps: string[] = [];
  const sets = design.population?.analysisPopulations ?? [];
  if (sets.length === 0) {
    return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No analysis populations are defined.'] };
  }
  const lines = sets.map(s => `${s.kind}${s.isPrimaryAnalysisSet ? ' (primary analysis set)' : ''}: ${s.definition}.`);
  if (!sets.some(s => s.isPrimaryAnalysisSet)) gaps.push('No analysis population is marked primary.');
  if (design.framework?.inferentialFrame === 'non_inferiority' && !sets.some(s => s.kind === 'PP' && s.isPrimaryAnalysisSet)) {
    gaps.push('Non-inferiority normally makes the per-protocol set (co-)primary alongside ITT.');
  }
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function hypotheses(design: StudyDesign): Body {
  const gaps: string[] = [];
  const primaries = primaryEndpoints(design);
  if (primaries.length === 0) {
    return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No primary endpoint is defined, so no hypothesis can be stated.'] };
  }
  const sp = design.statisticalPlan;
  const f = design.framework;
  const sided = sp?.oneSided ? 'one-sided' : 'two-sided';
  const alpha = typeof sp?.alpha === 'number' ? `${sided} alpha ${sp.alpha}` : `${sided} alpha not specified`;
  if (typeof sp?.alpha !== 'number') gaps.push('No significance level (alpha) is specified.');
  const lines = primaries.map(p => {
    const frame = f?.inferentialFrame ?? 'superiority';
    if (frame === 'non_inferiority') {
      const m = typeof f?.margin === 'number' ? ` within the margin ${f.margin}` : '';
      return `Primary endpoint "${p.name}": test non-inferiority of the investigational arm${m}, at ${alpha}.`;
    }
    if (frame === 'equivalence') {
      return `Primary endpoint "${p.name}": test equivalence within the pre-specified bounds, at ${alpha}.`;
    }
    return `Primary endpoint "${p.name}": null hypothesis of no treatment difference, tested for superiority at ${alpha}.`;
  });
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function sampleSize(design: StudyDesign): Body {
  const sp = design.statisticalPlan;
  if (!sp) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No statistical plan is defined.'] };
  const gaps: string[] = [];
  const lines: string[] = [];
  if (sp.plannedSampleSize) lines.push(`Planned sample size: ${sp.plannedSampleSize} total.`);
  else gaps.push('No planned sample size.');
  lines.push(`Target power: ${typeof sp.power === 'number' ? `${(sp.power * 100).toFixed(0)}%` : 'not specified'}.`);
  if (typeof sp.power !== 'number') gaps.push('No target power is specified.');
  if (typeof sp.dropoutRate === 'number') lines.push(`Assumed dropout: ${(sp.dropoutRate * 100).toFixed(0)}%.`);
  const pa = sp.powerAssumptions;
  if (pa && (typeof pa.effectSize === 'number' || typeof pa.eventRate === 'number')) {
    const bits = [
      typeof pa.effectSize === 'number' ? `effect size ${pa.effectSize}` : null,
      typeof pa.variance === 'number' ? `variance ${pa.variance}` : null,
      typeof pa.eventRate === 'number' ? `event rate ${pa.eventRate}` : null,
    ].filter(present);
    lines.push(`Assumptions: ${bits.join(', ')}.`);
    const hasProvenance = Array.isArray(pa.evidence) && pa.evidence.length > 0;
    if (hasProvenance) lines.push(`Provenance: ${pa.evidence!.map(e => e.source).join('; ')}.`);
    else gaps.push('The sample-size assumptions carry no evidence provenance.');
  } else {
    // Do not fabricate the determinants — defer to the statistician, honestly.
    lines.push(
      'The sample-size determinants (effect size and variability) are not specified; the study ' +
        'statistician must state them and the calculation before this section is final.',
    );
    gaps.push('No effect-size / variability assumptions are recorded for the sample-size calculation.');
  }
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function statisticalMethods(design: StudyDesign): Body {
  const gaps: string[] = [];
  const analyses = design.statisticalPlan?.plannedAnalyses ?? [];
  if (analyses.length === 0) {
    return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No analysis methods are specified for any endpoint.'] };
  }
  const lines = analyses.map(a => {
    const tie = present(a.estimandEndpointName) ? ` (targets the estimand for ${a.estimandEndpointName})` : '';
    return `${a.endpointName}: ${a.method}${tie}.`;
  });
  // Every confirmatory endpoint should carry a method.
  const analysed = new Set(analyses.map(a => a.endpointName));
  for (const e of design.endpoints ?? []) {
    if ((e.role === 'primary' || e.role === 'key_secondary') && !analysed.has(e.name)) {
      gaps.push(`No analysis method is specified for the ${e.role.replace('_', ' ')} endpoint "${e.name}".`);
    }
  }
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function multiplicity(design: StudyDesign): Body {
  const confirmatory = (design.endpoints ?? []).filter(e => e.role === 'primary' || e.role === 'key_secondary');
  const m = design.statisticalPlan?.multiplicity;
  const lines: string[] = [];
  const gaps: string[] = [];
  if (confirmatory.length <= 1) {
    lines.push('A single confirmatory endpoint is tested; no multiplicity adjustment is required.');
    return { content: lines.join('\n'), status: 'rendered', gaps };
  }
  if (!m || m.method === 'none') {
    gaps.push(`The design tests ${confirmatory.length} confirmatory hypotheses with no multiplicity strategy; the family-wise type-I error is uncontrolled.`);
    lines.push('Multiplicity control: not specified.');
  } else {
    lines.push(`Multiplicity control: ${m.method.replace(/_/g, ' ')}.`);
    if (m.alphaAllocation?.length) {
      lines.push(`Alpha allocation: ${m.alphaAllocation.map(a => `${a.endpointName} = ${a.alpha}`).join('; ')}.`);
    } else {
      gaps.push('No explicit alpha allocation across the testing hierarchy is given.');
    }
  }
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function interimAnalyses(design: StudyDesign): Body {
  const sp = design.statisticalPlan;
  const interim = sp?.interim;
  const dmc = design.safety?.dmcCharter;
  const lines: string[] = [];
  const gaps: string[] = [];
  if (!interim || !(interim.informationFractions?.length)) {
    lines.push('No interim analysis is planned; the primary analysis is performed once at the end of the study.');
  } else {
    lines.push(
      `Interim analyses at information fractions ${interim.informationFractions.join(', ')}` +
        `${interim.spendingFunction ? ` using an ${interim.spendingFunction.replace(/_/g, '-')} spending function` : ''}.`,
    );
    if (!interim.spendingFunction) gaps.push('No alpha-spending function is specified for the interim analyses.');
    if (interim.efficacyBoundaries?.length) lines.push(`Efficacy boundaries: ${interim.efficacyBoundaries.join(', ')}.`);
  }
  if (dmc?.present) {
    lines.push(`A data monitoring committee oversees the trial${dmc.meetingCadence ? ` (${dmc.meetingCadence})` : ''}.`);
  } else if (interim && interim.informationFractions?.length) {
    gaps.push('Interim analyses are planned but no data monitoring committee is described.');
  }
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function missingData(design: StudyDesign): Body {
  const sp = design.statisticalPlan;
  const strategy = sp?.missingDataStrategy;
  if (!present(strategy)) {
    return {
      content:
        'The missing-data strategy is not specified. It must be defined and aligned with the primary ' +
        'estimand (the intercurrent-event strategy determines the handling) before the SAP is final.',
      status: 'missing',
      gaps: ['No missing-data strategy is stated; it must align with the estimand.'],
    };
  }
  return {
    content: `Missing data: ${strategy}. This must align with the primary estimand's intercurrent-event strategy.`,
    status: 'rendered',
    gaps: [],
  };
}

function sensitivity(design: StudyDesign): Body {
  if (design.statisticalPlan?.sensitivityAnalysesSpecified) {
    return {
      content: 'Sensitivity analyses across the plausible ranges of the key assumptions are specified to assess robustness of the primary result.',
      status: 'rendered',
      gaps: [],
    };
  }
  return {
    content: 'No sensitivity or supplementary analyses are specified.',
    status: 'partial',
    gaps: ['No sensitivity analysis across assumptions is specified; a single-point analysis is a reviewer red-flag.'],
  };
}

function safetyAnalyses(design: StudyDesign): Body {
  const s = design.safety;
  if (!s) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No safety analysis is described.'] };
  const lines: string[] = [];
  if (present(s.aeDefinitions)) lines.push(`Adverse events are summarized per ${s.aeDefinitions}.`);
  else lines.push('Adverse events are summarized descriptively by arm.');
  if (present(s.stoppingRules)) lines.push(`Stopping rules: ${s.stoppingRules}.`);
  if (present(s.dltDefinition)) lines.push(`Dose-limiting toxicity: ${s.dltDefinition}.`);
  const gaps: string[] = [];
  if (!present(s.aeDefinitions)) gaps.push('No adverse-event coding/definition standard is named.');
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

/**
 * Project a structured design into a conventional SAP skeleton (ICH E9 / E9(R1) order). Deterministic.
 */
export function projectSap(design: StudyDesign): SapDocument {
  const built: SapSection[] = [
    { number: '1', title: 'Introduction and scope', ...introduction(design) },
    { number: '2', title: 'Objectives and estimands', ...objectivesAndEstimands(design) },
    { number: '3', title: 'Study design', ...studyDesign(design) },
    { number: '4', title: 'Analysis populations', ...analysisPopulations(design) },
    { number: '5', title: 'Statistical hypotheses', ...hypotheses(design) },
    { number: '6', title: 'Sample size determination', ...sampleSize(design) },
    { number: '7', title: 'Statistical methods for endpoints', ...statisticalMethods(design) },
    { number: '8', title: 'Multiplicity and control of type I error', ...multiplicity(design) },
    { number: '9', title: 'Interim analyses and data monitoring', ...interimAnalyses(design) },
    { number: '10', title: 'Handling of missing data', ...missingData(design) },
    { number: '11', title: 'Sensitivity and supplementary analyses', ...sensitivity(design) },
    { number: '12', title: 'Safety analyses', ...safetyAnalyses(design) },
  ];

  const rendered = built.filter(s => s.status === 'rendered').length;
  const partial = built.filter(s => s.status === 'partial').length;
  const missing = built.filter(s => s.status === 'missing').length;
  const total = built.length;
  const percent = Math.round(((rendered + partial * 0.5) / total) * 100);

  return {
    title: `Statistical analysis plan — ${design.title}`,
    sections: built,
    completeness: { rendered, partial, missing, total, percent },
    standard: 'ICH E9 / E9(R1)',
    projectedFromObject: true,
  };
}
