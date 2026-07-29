/**
 * Protocol projection — the design object rendered as an ICH M11-structured protocol.
 *
 * This is the payoff of design-as-data: the protocol is not authored, it is *projected*
 * from the structured design, section by section, in the ICH M11 (harmonised protocol)
 * order. Because it is a projection, it is honest by construction — each section renders
 * only what the object actually contains, and where the object is silent the section is
 * marked `partial` or `missing` with an explicit gap list, never filled with invented
 * prose. Editing the design re-renders the protocol; the two cannot drift.
 *
 * The estimands and objectives reuse the same renderer the SAP uses
 * (`renderEstimandSection`), so the protocol's objectives/estimands section and the SAP
 * agree word for word. Pure and deterministic; no AI, no DB.
 *
 * @module server/services/study-design/protocol-projection
 */

import type { Arm, Endpoint, StudyDesign } from './study-design-types';
import { renderEstimandSection } from '../estimand-sap-section';
import { summarizeSoaForProtocol } from './schedule-of-activities';

export type SectionStatus = 'rendered' | 'partial' | 'missing';

export interface ProtocolSection {
  /** ICH M11 section number. */
  number: string;
  title: string;
  /** Rendered, sentence-case content grounded entirely in the design object. */
  content: string;
  status: SectionStatus;
  /** What the object lacks for this section to be reviewer-ready. */
  gaps: string[];
}

export interface ProtocolDocument {
  title: string;
  synopsis: string;
  sections: ProtocolSection[];
  completeness: {
    rendered: number;
    partial: number;
    missing: number;
    total: number;
    /** Rendered counts 1, partial 0.5, missing 0. */
    percent: number;
  };
  standard: 'ICH M11';
  /** Honesty marker: this document is a deterministic projection, not generated prose. */
  projectedFromObject: true;
}

const NOT_SPECIFIED = 'Not specified in the design.';

function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/** Decide a section's status from how many gaps it has against how much it rendered. */
function statusFrom(rendered: boolean, gaps: string[]): SectionStatus {
  if (!rendered) return 'missing';
  return gaps.length === 0 ? 'rendered' : 'partial';
}

function describeArm(arm: Arm): string {
  const interventions = (arm.interventions ?? [])
    .map(i => {
      const bits = [i.name, i.dose, i.regimen, i.route, i.duration].filter(present);
      return `${bits.join(', ')} (${i.role.replace(/_/g, ' ')})`;
    })
    .join('; ');
  const dm = present(arm.doseModificationRules) ? ` Dose modification: ${arm.doseModificationRules}.` : '';
  return `${arm.name}: ${interventions || NOT_SPECIFIED}.${dm}`;
}

function describeEndpoint(ep: Endpoint): string {
  const bits = [
    `${ep.name} (${ep.role.replace(/_/g, ' ')}, ${ep.type.replace(/_/g, ' ')})`,
    present(ep.definition) ? `defined as ${ep.definition}` : null,
    present(ep.timepoint) ? `at ${ep.timepoint}` : null,
    present(ep.measurementMethod) ? `measured by ${ep.measurementMethod}` : null,
    present(ep.validatedInstrument) ? `instrument: ${ep.validatedInstrument}` : null,
    present(ep.eventDefinition) ? `event: ${ep.eventDefinition}` : null,
  ].filter(present);
  return bits.join('; ') + '.';
}

// ─── Section builders ─────────────────────────────────────────────────────────

function introduction(design: StudyDesign): Omit<ProtocolSection, 'number' | 'title'> {
  const gaps: string[] = [];
  const lines: string[] = [];
  lines.push(`This is a phase ${design.phase} study in ${design.indication}.`);
  const lit = (design.evidence ?? []).filter(e => e.kind === 'literature' || e.kind === 'prior_data');
  if (lit.length) {
    lines.push(`Supporting evidence: ${lit.map(e => e.source).join('; ')}.`);
  } else {
    gaps.push('No background or rationale evidence is attached to the design.');
  }
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function objectivesAndEstimands(design: StudyDesign): Omit<ProtocolSection, 'number' | 'title'> {
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
  // Reuse the SAP estimand renderer so the protocol and SAP agree verbatim.
  const est = renderEstimandSection(design.estimands);
  lines.push('', est.text);
  const incomplete = est.attributeCompleteness.filter(a => !a.complete);
  if (incomplete.length) {
    gaps.push(`Estimands not yet complete to ICH E9(R1): ${incomplete.map(a => a.endpointName).join(', ')}.`);
  }
  return { content: lines.join('\n'), status: statusFrom(objectives.length > 0 || est.estimandCount > 0, gaps), gaps };
}

function trialDesign(design: StudyDesign): Omit<ProtocolSection, 'number' | 'title'> {
  const gaps: string[] = [];
  const f = design.framework;
  if (!f) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No design framework is defined.'] };
  const lines = [
    `Inferential framework: ${f.inferentialFrame.replace(/_/g, '-')}.`,
    `Structural design: ${f.structuralDesign.replace(/_/g, ' ')}.`,
    `Control: ${f.controlType.replace(/_/g, ' ')}.`,
  ];
  if (f.inferentialFrame !== 'superiority') {
    if (typeof f.margin === 'number') lines.push(`Margin: ${f.margin}${present(f.marginJustification) ? ` (${f.marginJustification})` : ''}.`);
    else gaps.push('A non-inferiority/equivalence frame is set but no margin is given.');
  }
  if ((f.controlType === 'external' || f.controlType === 'historical') && !present(f.controlJustification)) {
    gaps.push('External/historical control is used without an ICH E10 justification.');
  }
  if (f.adaptiveFeatures?.length) lines.push(`Adaptive features: ${f.adaptiveFeatures.map(a => a.replace(/_/g, ' ')).join(', ')}.`);
  if (f.mrct?.regions?.length) lines.push(`Multi-regional (ICH E17): ${f.mrct.regions.join(', ')}.`);
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function population(design: StudyDesign): Omit<ProtocolSection, 'number' | 'title'> {
  const gaps: string[] = [];
  const p = design.population;
  if (!p) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No population is defined.'] };
  const lines = [`Target population: ${present(p.targetDescription) ? p.targetDescription : NOT_SPECIFIED}`];
  const incl = (p.eligibility ?? []).filter(e => e.type === 'inclusion');
  const excl = (p.eligibility ?? []).filter(e => e.type === 'exclusion');
  if (incl.length) lines.push(`Inclusion (${incl.length}): ${incl.map(c => c.text).join('; ')}.`);
  else gaps.push('No inclusion criteria.');
  if (excl.length) lines.push(`Exclusion (${excl.length}): ${excl.map(c => c.text).join('; ')}.`);
  else gaps.push('No exclusion criteria.');
  const sets = p.analysisPopulations ?? [];
  if (sets.length) lines.push(`Analysis populations: ${sets.map(s => `${s.kind} (${s.definition})`).join('; ')}.`);
  else gaps.push('No analysis populations are defined.');
  if (p.pediatric?.applicable) lines.push(`Pediatric (ICH E11): ${p.pediatric.ageRange ?? 'applicable'}.`);
  return { content: lines.join('\n'), status: statusFrom(present(p.targetDescription), gaps), gaps };
}

function interventions(design: StudyDesign): Omit<ProtocolSection, 'number' | 'title'> {
  const gaps: string[] = [];
  const arms = design.arms ?? [];
  if (arms.length === 0) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No arms are defined.'] };
  const lines = arms.map(describeArm);
  const r = design.randomization;
  if (r) {
    lines.push(`Randomization: ratio ${r.ratio.join(':')}, ${r.allocationMethod.replace(/_/g, ' ')}, ${r.blinding} blind.`);
    if (r.stratificationFactors?.length) lines.push(`Stratified by: ${r.stratificationFactors.join(', ')}.`);
  } else {
    gaps.push('No randomization scheme is defined.');
  }
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function assessments(design: StudyDesign): Omit<ProtocolSection, 'number' | 'title'> {
  const gaps: string[] = [];
  const endpoints = design.endpoints ?? [];
  if (endpoints.length === 0) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No endpoints are defined.'] };
  const lines = endpoints.map(describeEndpoint);
  // The Schedule of Activities is its own design node; the protocol projects a compact
  // summary of it here (and inherits its gaps) so §7 and the SoA grid cannot drift.
  const soa = summarizeSoaForProtocol(design);
  if (soa.content) lines.push('', soa.content);
  gaps.push(...soa.gaps);
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function statistical(design: StudyDesign): Omit<ProtocolSection, 'number' | 'title'> {
  const gaps: string[] = [];
  const sp = design.statisticalPlan;
  if (!sp) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No statistical plan is defined.'] };
  const lines: string[] = [];
  lines.push(`Significance level: alpha ${sp.alpha ?? 'not specified'}${sp.oneSided ? ' (one-sided)' : ' (two-sided)'}.`);
  lines.push(`Target power: ${sp.power ?? 'not specified'}.`);
  if (sp.plannedSampleSize) lines.push(`Planned sample size: ${sp.plannedSampleSize}.`);
  else gaps.push('No planned sample size.');
  if (typeof sp.dropoutRate === 'number') lines.push(`Assumed dropout: ${sp.dropoutRate}.`);
  const analyses = sp.plannedAnalyses ?? [];
  if (analyses.length) lines.push(`Primary analyses: ${analyses.map(a => `${a.endpointName} via ${a.method}`).join('; ')}.`);
  else gaps.push('No analysis methods are specified.');
  if (sp.multiplicity && sp.multiplicity.method !== 'none') lines.push(`Multiplicity control: ${sp.multiplicity.method.replace(/_/g, ' ')}.`);
  if (sp.interim?.informationFractions?.length) {
    lines.push(`Interim analyses at information fractions ${sp.interim.informationFractions.join(', ')}${sp.interim.spendingFunction ? ` (${sp.interim.spendingFunction.replace(/_/g, '-')})` : ''}.`);
  }
  if (present(sp.missingDataStrategy)) lines.push(`Missing data: ${sp.missingDataStrategy}.`);
  else gaps.push('No missing-data strategy is stated.');
  if (!sp.sensitivityAnalysesSpecified) gaps.push('No sensitivity analyses are specified.');
  return { content: lines.join('\n'), status: statusFrom(true, gaps), gaps };
}

function safety(design: StudyDesign): Omit<ProtocolSection, 'number' | 'title'> {
  const gaps: string[] = [];
  const s = design.safety;
  if (!s) return { content: NOT_SPECIFIED, status: 'missing', gaps: ['No safety design is defined.'] };
  const lines: string[] = [];
  if (present(s.aeDefinitions)) lines.push(`Adverse-event definitions: ${s.aeDefinitions}.`);
  if (present(s.stoppingRules)) lines.push(`Stopping rules: ${s.stoppingRules}.`);
  if (present(s.dltDefinition)) lines.push(`Dose-limiting toxicity: ${s.dltDefinition}.`);
  if (s.dmcCharter?.present) {
    lines.push(`Data monitoring committee: ${s.dmcCharter.composition ?? 'present'}${s.dmcCharter.meetingCadence ? `, ${s.dmcCharter.meetingCadence}` : ''}.`);
  } else {
    gaps.push('No data monitoring committee is described.');
  }
  if (lines.length === 0) lines.push(NOT_SPECIFIED);
  return { content: lines.join('\n'), status: statusFrom(lines[0] !== NOT_SPECIFIED, gaps), gaps };
}

/** A compact synopsis paragraph from the design's headline fields. */
function buildSynopsis(design: StudyDesign): string {
  const primary = (design.endpoints ?? []).find(e => e.role === 'primary');
  const f = design.framework;
  const parts = [
    `A phase ${design.phase}, ${f ? f.structuralDesign.replace(/_/g, ' ') : 'unspecified-design'},`,
    f ? `${f.controlType.replace(/_/g, ' ')}-controlled ${f.inferentialFrame.replace(/_/g, '-')}` : '',
    `study in ${design.indication}.`,
    primary ? `Primary endpoint: ${primary.name}${present(primary.timepoint) ? ` at ${primary.timepoint}` : ''}.` : 'Primary endpoint not specified.',
    design.statisticalPlan?.plannedSampleSize ? `Planned enrollment: ${design.statisticalPlan.plannedSampleSize}.` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * Project a structured design into an ICH M11-ordered protocol document. Deterministic.
 */
export function projectProtocol(design: StudyDesign): ProtocolDocument {
  const built: ProtocolSection[] = [
    { number: '2', title: 'Introduction', ...introduction(design) },
    { number: '3', title: 'Trial objectives and estimands', ...objectivesAndEstimands(design) },
    { number: '4', title: 'Trial design', ...trialDesign(design) },
    { number: '5', title: 'Trial population', ...population(design) },
    { number: '6', title: 'Trial interventions', ...interventions(design) },
    { number: '7', title: 'Trial assessments and endpoints', ...assessments(design) },
    { number: '8', title: 'Statistical considerations', ...statistical(design) },
    { number: '9', title: 'Safety', ...safety(design) },
  ];

  const rendered = built.filter(s => s.status === 'rendered').length;
  const partial = built.filter(s => s.status === 'partial').length;
  const missing = built.filter(s => s.status === 'missing').length;
  const total = built.length;
  const percent = Math.round(((rendered + partial * 0.5) / total) * 100);

  return {
    title: design.title,
    synopsis: buildSynopsis(design),
    sections: built,
    completeness: { rendered, partial, missing, total, percent },
    standard: 'ICH M11',
    projectedFromObject: true,
  };
}
