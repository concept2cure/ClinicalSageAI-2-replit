/**
 * Risk-management / safety-governance advisor for AnA.
 *
 * Encodes the two principal post-authorization risk-minimization frameworks —
 * the US REMS (Risk Evaluation and Mitigation Strategy, FDAAA) and the EU RMP
 * (Risk Management Plan, GVP Module V) — their components, when each tool is
 * warranted, and common pitfalls. Lets AnA scaffold and QC a risk-management
 * strategy grounded in the actual regulatory frameworks rather than guesswork.
 *
 * Deterministic, dependency-free, data-driven. Advisory only — formal risk
 * strategy must be agreed with the agency (FDA REMS / EMA PRAC).
 *
 * @module server/services/ana/risk-management
 */

export type RmJurisdiction = 'us' | 'eu';

export interface RiskProgram {
  id: string;
  label: string;
  jurisdiction: RmJurisdiction;
  authority: string;
  basis: string;
  purpose: string;
  components: string[];
  whenRequired: string[];
  commonPitfalls: string[];
  aliases?: string[];
}

/** A discrete risk-minimization tool, mapped to the program(s) it belongs to. */
export interface RiskMinimizationTool {
  id: string;
  label: string;
  tier: 'routine' | 'additional';
  jurisdiction: RmJurisdiction[];
  useWhen: string;
  aliases?: string[];
}

const PROGRAMS: RiskProgram[] = [
  {
    id: 'rems',
    label: 'REMS — Risk Evaluation and Mitigation Strategy (US)',
    jurisdiction: 'us',
    authority: 'FDA',
    basis: 'FD&C Act §505-1 (FDAAA 2007)',
    purpose: 'Ensure the benefits of a drug/biologic outweigh its risks when routine labeling is insufficient to manage a serious risk.',
    components: [
      'Medication Guide / Patient Package Insert (if needed to manage the risk)',
      'Communication Plan (to healthcare providers)',
      'Elements To Assure Safe Use (ETASU) — e.g., prescriber/pharmacy/patient certification, controlled dispensing, monitoring, registry',
      'Implementation System (to monitor/evaluate ETASU)',
      'Timetable for Submission of Assessments (e.g., 18 months, 3 years, 7 years)',
    ],
    whenRequired: [
      'A serious risk requires more than labeling to assure safe use.',
      'ETASU only when necessary to mitigate a specific serious risk and the benefit-risk supports the burden.',
    ],
    commonPitfalls: [
      'ETASU more burdensome than necessary (must be commensurate with the risk and minimize access burden)',
      'No assessment timetable / inadequate metrics to show the REMS is working',
      'Confusing a Medication Guide alone with a full ETASU REMS',
    ],
    aliases: ['us rems', 'etasu', 'risk evaluation and mitigation strategy'],
  },
  {
    id: 'eu_rmp',
    label: 'EU RMP — Risk Management Plan (GVP Module V)',
    jurisdiction: 'eu',
    authority: 'EMA / PRAC',
    basis: 'GVP Module V; Regulation (EC) 726/2004 & Directive 2001/83/EC',
    purpose: 'Characterise the safety profile, plan how to further characterise/monitor risks, and plan/measure risk-minimization across the lifecycle.',
    components: [
      'Part I: Product overview',
      'Part II: Safety specification (modules SI–SVIII; epidemiology, non-clinical, clinical, populations not studied)',
      'Part III: Pharmacovigilance plan (routine + additional PV activities, e.g., PASS)',
      'Part IV: Plans for post-authorization efficacy studies (PAES)',
      'Part V: Risk-minimization measures (routine + additional aRMM) and their effectiveness',
      'Part VI: Summary of the RMP',
      'Part VII: Annexes',
    ],
    whenRequired: [
      'Required for all new marketing-authorization applications in the EU.',
      'Updated when new safety information emerges or risk-minimization changes.',
    ],
    commonPitfalls: [
      'Safety concerns list not aligned with the data (over-/under-listing identified vs potential risks)',
      'Additional risk-minimization measures (aRMM) with no plan to measure effectiveness',
      'PV plan not proportionate to the missing information',
    ],
    aliases: ['rmp', 'eu risk management plan', 'gvp module v'],
  },
];

const TOOLS: RiskMinimizationTool[] = [
  { id: 'labeling', label: 'Product labeling / SmPC warnings', tier: 'routine', jurisdiction: ['us', 'eu'], useWhen: 'Baseline routine measure for all products — warnings, contraindications, dosing.', aliases: ['smpc', 'package insert', 'labelling'] },
  { id: 'med_guide', label: 'Medication Guide / patient package leaflet', tier: 'routine', jurisdiction: ['us', 'eu'], useWhen: 'Patient-directed information needed to prevent serious adverse effects.', aliases: ['medication guide', 'package leaflet', 'pil'] },
  { id: 'hcp_materials', label: 'Educational materials for HCPs/patients (aRMM)', tier: 'additional', jurisdiction: ['us', 'eu'], useWhen: 'A specific serious risk needs targeted education beyond labeling.', aliases: ['educational materials', 'communication plan', 'dear doctor', 'dhpc'] },
  { id: 'controlled_access', label: 'Controlled access / certification (ETASU / controlled distribution)', tier: 'additional', jurisdiction: ['us', 'eu'], useWhen: 'Safe use depends on prescriber/pharmacy certification or dispensing conditions.', aliases: ['etasu', 'controlled distribution', 'certification', 'restricted distribution'] },
  { id: 'pregnancy_prevention', label: 'Pregnancy-prevention programme', tier: 'additional', jurisdiction: ['us', 'eu'], useWhen: 'Teratogenic risk requires pregnancy testing, contraception, and acknowledgement.', aliases: ['pregnancy prevention', 'ppp', 'teratogen'] },
  { id: 'registry', label: 'Patient registry / monitoring programme', tier: 'additional', jurisdiction: ['us', 'eu'], useWhen: 'Active monitoring/follow-up needed to manage or further characterise a risk.', aliases: ['registry', 'monitoring program', 'pass'] },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findProgram(key?: string): RiskProgram | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    PROGRAMS.find(p => p.id === k) ||
    PROGRAMS.find(p => p.aliases?.some(a => a.toLowerCase() === k)) ||
    PROGRAMS.find(p => p.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(p.id))
  );
}

function asJurisdiction(v?: string): RmJurisdiction | undefined {
  const k = v?.trim().toLowerCase();
  if (k === 'us' || k === 'usa' || k === 'fda') return 'us';
  if (k === 'eu' || k === 'europe' || k === 'ema') return 'eu';
  return undefined;
}

export interface RiskManagementQuery {
  program?: string; // rems | eu_rmp (or alias)
  jurisdiction?: string; // us | eu
}

export interface RiskManagementResult {
  resolved: { program: string | null; jurisdiction: RmJurisdiction | null };
  program: RiskProgram | null;
  tools: { id: string; label: string; tier: 'routine' | 'additional' }[];
  brief: string;
}

export function listRiskManagementPrograms() {
  return {
    programs: PROGRAMS.map(p => ({ id: p.id, label: p.label, jurisdiction: p.jurisdiction })),
    tools: TOOLS.map(t => ({ id: t.id, label: t.label, tier: t.tier, jurisdiction: t.jurisdiction })),
  };
}

export function adviseRiskManagement(q: RiskManagementQuery): RiskManagementResult {
  const jurisdiction = asJurisdiction(q.jurisdiction);
  // Resolve a program: explicit, else implied by jurisdiction.
  let program = findProgram(q.program) ?? null;
  if (!program && jurisdiction) {
    program = PROGRAMS.find(p => p.jurisdiction === jurisdiction) ?? null;
  }
  const juris = jurisdiction ?? program?.jurisdiction ?? null;

  const tools = TOOLS.filter(t => (juris ? t.jurisdiction.includes(juris) : true));

  const parts: string[] = [];
  if (program) {
    parts.push(`# Risk-management framework: ${program.label}`);
    parts.push(`\n**Authority.** ${program.authority}`);
    parts.push(`**Basis.** ${program.basis}`);
    parts.push(`**Purpose.** ${program.purpose}`);
    parts.push(bullets('Components', program.components));
    parts.push(bullets('When required', program.whenRequired));
    parts.push(bullets('Common pitfalls', program.commonPitfalls));
  } else {
    parts.push('# Risk-management frameworks');
    parts.push('\n_Specify a program (rems | eu_rmp) or jurisdiction (us | eu)._');
    for (const p of PROGRAMS) parts.push(`\n## ${p.label}\n**Basis.** ${p.basis}\n**Purpose.** ${p.purpose}`);
  }

  const routine = tools.filter(t => t.tier === 'routine');
  const additional = tools.filter(t => t.tier === 'additional');
  parts.push('\n## Risk-minimization toolbox');
  parts.push(bullets('Routine measures', routine.map(t => `${t.label} — ${t.useWhen}`)));
  parts.push(bullets('Additional measures (use only when a specific serious risk warrants the burden)', additional.map(t => `${t.label} — ${t.useWhen}`)));

  parts.push(
    '\n## Note\nAdvisory only — agree the strategy with the agency (FDA REMS negotiation / EMA PRAC). ' +
      'Additional measures must be proportionate to the risk and paired with a plan to measure their ' +
      'effectiveness. Ground identified/potential risks with draft_safety_narrative and the evidence tools.'
  );

  return {
    resolved: { program: program?.id ?? null, jurisdiction: juris },
    program,
    tools: tools.map(t => ({ id: t.id, label: t.label, tier: t.tier })),
    brief: parts.filter(Boolean).join('\n'),
  };
}
