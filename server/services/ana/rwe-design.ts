/**
 * Real-world-evidence (RWE) study-design advisor for AnA.
 *
 * Encodes the principal real-world study designs (retrospective/prospective
 * cohort, case-control, self-controlled, target-trial emulation, pragmatic
 * trial), the common real-world data sources, and the FDA RWE-framework /
 * causal-inference guardrails (fit-for-purpose data, confounding control, bias
 * mitigation, pre-specification, transparency). Lets AnA pick and QC an RWE
 * approach grounded in current good practice (FDA RWE program, ISPOR/ISPE,
 * STaRT-RWE, target-trial framework).
 *
 * Deterministic, dependency-free, data-driven. Advisory — agree fit-for-purpose
 * and the analysis plan with the agency where the RWE supports a regulatory use.
 *
 * @module server/services/ana/rwe-design
 */

export interface RweDesign {
  id: string;
  label: string;
  describe: string;
  useWhen: string;
  strengths: string[];
  weaknesses: string[];
  aliases?: string[];
}

const DESIGNS: RweDesign[] = [
  {
    id: 'retrospective_cohort',
    label: 'Retrospective cohort',
    describe: 'Follow exposed vs unexposed groups forward in time using already-collected data.',
    useWhen: 'A defined exposure with downstream outcomes captured in existing data (claims/EHR/registry).',
    strengths: ['Efficient and fast', 'Large samples; long follow-up possible'],
    weaknesses: ['Confounding by indication', 'Exposure/outcome misclassification', 'Immortal-time bias if mis-specified'],
    aliases: ['retrospective cohort', 'cohort study', 'observational cohort'],
  },
  {
    id: 'case_control',
    label: 'Case-control',
    describe: 'Compare exposure history between those with the outcome (cases) and matched controls.',
    useWhen: 'Rare outcomes; efficient when outcomes are uncommon.',
    strengths: ['Efficient for rare outcomes', 'Can examine multiple exposures'],
    weaknesses: ['Recall/selection bias', 'Control selection is critical', 'No direct incidence'],
    aliases: ['case-control', 'case control'],
  },
  {
    id: 'self_controlled',
    label: 'Self-controlled (SCCS / case-crossover)',
    describe: 'Each person serves as their own control, comparing risk windows within the individual.',
    useWhen: 'Transient exposures and acute outcomes; controls time-invariant confounders by design.',
    strengths: ['Removes fixed (time-invariant) confounding', 'No separate control group needed'],
    weaknesses: ['Assumes event does not affect future exposure', 'Sensitive to time-varying confounding'],
    aliases: ['self-controlled', 'sccs', 'case-crossover', 'self controlled case series'],
  },
  {
    id: 'target_trial_emulation',
    label: 'Target-trial emulation',
    describe: 'Specify the hypothetical RCT you would run, then emulate it with real-world data.',
    useWhen: 'Comparative effectiveness questions where a real RCT is infeasible — the current best-practice frame.',
    strengths: ['Forces explicit eligibility/treatment-strategy/assignment/outcome/analysis', 'Reduces design biases (immortal-time, selection) by construction'],
    weaknesses: ['Requires rich data on confounders and time-zero', 'Residual/unmeasured confounding remains'],
    aliases: ['target trial', 'target-trial emulation', 'emulated trial'],
  },
  {
    id: 'pragmatic_trial',
    label: 'Pragmatic / hybrid trial',
    describe: 'A randomized trial run in routine-care settings, often using real-world data for outcomes.',
    useWhen: 'Effectiveness under real-world conditions while preserving randomization.',
    strengths: ['Randomization removes confounding', 'High external validity'],
    weaknesses: ['Operationally complex', 'Less control over adherence/measurement'],
    aliases: ['pragmatic trial', 'hybrid trial', 'point-of-care trial'],
  },
];

const DATA_SOURCES: { id: string; label: string; note: string }[] = [
  { id: 'claims', label: 'Administrative claims', note: 'Broad coverage of utilization; limited clinical detail/outcomes.' },
  { id: 'ehr', label: 'Electronic health records', note: 'Rich clinical detail; fragmented across systems; missing data.' },
  { id: 'registry', label: 'Disease/product registry', note: 'Purpose-built, structured; may be selective.' },
  { id: 'pro_wearable', label: 'PRO / wearable / digital', note: 'Patient-generated; novel endpoints; validation needed.' },
];

const GUARDRAILS: string[] = [
  'Establish fit-for-purpose data: relevance (captures exposure, outcome, confounders) AND reliability (accrual, QC, provenance).',
  'Define time-zero (index) clearly and align eligibility, treatment assignment, and follow-up to it (avoid immortal-time bias).',
  'Pre-specify the protocol and SAP (e.g., register; STaRT-RWE) BEFORE looking at outcomes; report deviations.',
  'Control measured confounding (e.g., propensity scores, disease-risk scores) and quantify residual/unmeasured confounding (negative controls, E-value, sensitivity analyses).',
  'Pre-specify the estimand and handle missing data transparently; report a clear study-design diagram and attrition.',
  'Assess and report potential biases (selection, misclassification, confounding) and the validity of the outcome definition.',
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findDesign(key?: string): RweDesign | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    DESIGNS.find(d => d.id === k) ||
    DESIGNS.find(d => d.aliases?.some(a => a.toLowerCase() === k)) ||
    DESIGNS.find(d => d.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(d.id))
  );
}

export interface RweQuery {
  design?: string;
}

export interface RweResult {
  resolved: { design: string | null };
  design: RweDesign | null;
  brief: string;
}

export function listRweDesigns() {
  return {
    designs: DESIGNS.map(d => ({ id: d.id, label: d.label })),
    dataSources: DATA_SOURCES.map(s => ({ id: s.id, label: s.label })),
  };
}

export function adviseRweDesign(q: RweQuery): RweResult {
  const design = findDesign(q.design) ?? null;
  const parts: string[] = [];

  if (design) {
    parts.push(`# RWE design: ${design.label}`);
    parts.push(`\n${design.describe}`);
    parts.push(`**Use when.** ${design.useWhen}`);
    parts.push(bullets('Strengths', design.strengths));
    parts.push(bullets('Weaknesses / biases to mitigate', design.weaknesses));
  } else {
    parts.push('# Real-world-evidence study designs');
    for (const d of DESIGNS) parts.push(`\n## ${d.label}\n${d.describe}\n**Use when.** ${d.useWhen}`);
    parts.push(bullets('Common real-world data sources', DATA_SOURCES.map(s => `${s.label} — ${s.note}`)));
  }

  parts.push(bullets('RWE good-practice guardrails (FDA RWE framework / ISPOR-ISPE / STaRT-RWE)', GUARDRAILS));
  parts.push(
    '\n## Note\nAdvisory only — where RWE supports a regulatory use, agree fit-for-purpose data and the ' +
      'pre-specified analysis plan with the agency. Define the estimand (advise_estimand), narrate results ' +
      'with narrate_statistical_result, and report per STROBE/RECORD (advise_reporting_guideline).'
  );

  return { resolved: { design: design?.id ?? null }, design, brief: parts.filter(Boolean).join('\n') };
}
