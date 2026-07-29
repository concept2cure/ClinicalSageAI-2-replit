/**
 * HEOR / market-access value-dossier knowledge + composer for AnA.
 *
 * The payer/HTA counterpart to medical-writing.ts: encodes the structure and
 * conventions of value communication — AMCP formulary dossiers (US), NICE/HTA
 * submissions, budget-impact models, global value dossiers, and value-message
 * frameworks — by deliverable × HTA body. Lets AnA build market-access
 * deliverables grounded in real frameworks (AMCP Format, NICE reference case,
 * ISPOR good-practice) and the right comparator/economic conventions per market.
 *
 * Deterministic, dependency-free, data-driven.
 *
 * @module server/services/ana/value-dossier
 */

export interface ValueDeliverable {
  id: string;
  label: string;
  framework: string[];
  purpose: string;
  structure: string[];
  keyRequirements: string[];
  commonPitfalls: string[];
  aliases?: string[];
}

export interface HtaBody {
  id: string;
  label: string;
  country: string;
  decisionBasis: string;
  notes: string[];
  aliases?: string[];
}

const DELIVERABLES: ValueDeliverable[] = [
  {
    id: 'amcp_dossier',
    label: 'AMCP Formulary Submission Dossier (US)',
    framework: ['AMCP Format for Formulary Submissions v4.x', 'ISPOR good-practice'],
    purpose: 'Give a US payer/P&T committee the clinical and economic evidence to make a formulary decision.',
    structure: [
      'Product information & supporting clinical/economic data overview',
      'Disease/condition & place of the product in therapy',
      'Clinical evidence (pivotal + comparative effectiveness)',
      'Economic value: cost-effectiveness analysis',
      'Economic value: budget-impact model + report',
      'Supporting evidence & references',
    ],
    keyRequirements: [
      'Lead with place in therapy vs the relevant comparators (standard of care), not vs placebo only.',
      'Include a transparent, payer-relevant budget-impact model (PMPM) and a cost-effectiveness analysis.',
      'Pre-specify the analytic perspective (US payer), time horizon, and key assumptions; provide the model.',
    ],
    commonPitfalls: ['Comparator is placebo rather than real-world SoC', 'Surrogate endpoints without linkage to outcomes payers value', 'Opaque model assumptions'],
    aliases: ['amcp', 'formulary dossier', 'us payer dossier'],
  },
  {
    id: 'nice_submission',
    label: 'NICE Technology Appraisal Submission (UK)',
    framework: ['NICE methods guide / reference case', 'NICE STA/HST process'],
    purpose: 'Demonstrate clinical and cost-effectiveness of a technology for NHS reimbursement.',
    structure: [
      'Decision problem (PICO scope)',
      'Clinical effectiveness (systematic review + indirect comparisons if needed)',
      'Cost-effectiveness (de novo economic model)',
      'Cost-effectiveness results (ICER vs threshold, QALYs)',
      'Budget impact / affordability',
      'Innovation & wider considerations',
    ],
    keyRequirements: [
      'Follow the NICE reference case (NHS/PSS perspective, QALYs, discounting 3.5%, lifetime horizon where appropriate).',
      'ICER assessed against the ~£20,000–£30,000/QALY threshold (higher for end-of-life/HST criteria).',
      'Justify the comparator(s) per the final scope; address uncertainty (PSA, scenario analyses).',
    ],
    commonPitfalls: ['Comparator not matching the NICE scope', 'Optimistic extrapolation of survival curves', 'Inadequate handling of uncertainty'],
    aliases: ['nice', 'sta', 'uk hta'],
  },
  {
    id: 'hta_submission',
    label: 'HTA Submission (general / EU)',
    framework: ['EUnetHTA / EU HTA Regulation (Joint Clinical Assessment)', 'Country HTA methods guides'],
    purpose: 'Support reimbursement/value assessment by an HTA body using the PICO and relevant comparator.',
    structure: ['Scope & PICO(s)', 'Clinical effectiveness & relative effectiveness', 'Safety', 'Economic evaluation (where required)', 'Budget impact', 'Uncertainty & evidence gaps'],
    keyRequirements: [
      'Address relative effectiveness vs the country/JCA-defined comparator, not just vs placebo.',
      'Map evidence to each PICO; pre-specify analyses; be explicit about transferability of data.',
      'EU JCA: prepare one robust clinical dossier mapped to multiple national PICOs.',
    ],
    commonPitfalls: ['Single-PICO thinking under EU JCA (multiple PICOs expected)', 'Comparator mismatch across countries', 'Indirect comparison not rigorously conducted'],
    aliases: ['hta', 'jca', 'eunethta', 'reimbursement dossier'],
  },
  {
    id: 'budget_impact_model',
    label: 'Budget-Impact Model/Report',
    framework: ['ISPOR Budget Impact Analysis good-practice (Sullivan et al.)'],
    purpose: 'Estimate the financial consequences to a specific payer of adopting the new technology.',
    structure: ['Target population & eligible size', 'Current vs projected treatment mix (with/without)', 'Costs (drug, administration, monitoring, events avoided)', 'Time horizon (payer-relevant, typically 1–5 years)', 'Results (total + per-member-per-month)', 'Scenario/sensitivity analyses'],
    keyRequirements: [
      'Payer perspective and a short, payer-relevant time horizon (NOT lifetime — that is cost-effectiveness).',
      'Report total budget impact and per-member-per-month (PMPM); show with-vs-without scenarios.',
      'Use the actual eligible population and realistic uptake, not the full prevalent population.',
    ],
    commonPitfalls: ['Confusing BIA with cost-effectiveness (wrong perspective/horizon)', 'Overstated uptake', 'Ignoring offsets (events/costs avoided)'],
    aliases: ['bia', 'budget impact', 'budget-impact analysis'],
  },
  {
    id: 'global_value_dossier',
    label: 'Global Value Dossier (GVD)',
    framework: ['ISPOR value-dossier good-practice'],
    purpose: 'Centralize the global value story and evidence so affiliates adapt locally (HTA/payer).',
    structure: ['Disease burden & epidemiology', 'Unmet need & current treatment landscape', 'Product profile & mechanism', 'Clinical value (efficacy/safety vs comparators)', 'Economic value (CEA/BIA frameworks)', 'Humanistic value (PRO/QoL)', 'Evidence gaps & generation plan'],
    keyRequirements: [
      'Build the evidence-backed value story once; flag what each market must localize (comparator, prices, HTA needs).',
      'Distinguish proven claims from evidence gaps; pair each gap with an evidence-generation plan.',
    ],
    commonPitfalls: ['US-centric framing not transferable to HTA markets', 'Value claims without source evidence'],
    aliases: ['gvd', 'value dossier', 'global value'],
  },
  {
    id: 'value_message_framework',
    label: 'Value Message Framework',
    framework: ['Evidence-based value communication; ISPOR'],
    purpose: 'Translate the evidence into concise, defensible value messages with supporting data and objection handling.',
    structure: ['Audience & decision context', 'Core value messages (clinical, economic, humanistic)', 'Supporting evidence per message (with citations)', 'Anticipated objections & responses', 'Evidence gaps & caveats'],
    keyRequirements: [
      'Every value message is backed by a specific, cited piece of evidence — no unsupported claims.',
      'Tailor messages to the decision-maker (P&T, HTA, clinician) and avoid promotional overreach.',
    ],
    commonPitfalls: ['Messages outrunning the evidence', 'One-size-fits-all messaging across very different audiences'],
    aliases: ['value messages', 'value story', 'messaging framework'],
  },
];

const HTA_BODIES: HtaBody[] = [
  { id: 'nice', label: 'NICE', country: 'United Kingdom', decisionBasis: 'Cost-effectiveness (ICER vs ~£20–30k/QALY; higher for HST/end-of-life)', notes: ['NHS/PSS perspective', 'QALYs; reference case'], aliases: ['uk'] },
  { id: 'icer', label: 'ICER', country: 'United States', decisionBasis: 'Cost-effectiveness (commonly $100k–$150k/QALY benchmarks) + budget impact', notes: ['Independent US value assessments', 'Influences payer negotiations'], aliases: ['us value'] },
  { id: 'gba', label: 'G-BA / IQWiG', country: 'Germany', decisionBasis: 'Added benefit (Zusatznutzen) assessment vs an appropriate comparator (AMNOG)', notes: ['Added-benefit rating drives price negotiation', 'Comparator (zVT) is pivotal'], aliases: ['germany', 'amnog', 'iqwig'] },
  { id: 'has', label: 'HAS (CT)', country: 'France', decisionBasis: 'SMR (actual benefit) and ASMR (added clinical benefit) ratings', notes: ['ASMR I–V drives pricing', 'Comparator-relative'], aliases: ['france'] },
  { id: 'cadth', label: "CADTH (Canada's Drug Agency)", country: 'Canada', decisionBasis: 'Cost-effectiveness + clinical review; reimbursement recommendation', notes: ['pCPA price negotiation follows', 'QALY-based'], aliases: ['canada'] },
  { id: 'pbac', label: 'PBAC', country: 'Australia', decisionBasis: 'Cost-effectiveness vs the main comparator for PBS listing', notes: ['Comparator and ICER central', 'QALY-based'], aliases: ['australia'] },
];

function findBy<T extends { id: string; aliases?: string[]; label?: string }>(list: T[], key?: string): T | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    list.find(x => x.id === k) ||
    list.find(x => x.aliases?.some(a => a.toLowerCase() === k)) ||
    list.find(x => (x.label ?? '').toLowerCase() === k) ||
    list.find(x => x.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(x.id))
  );
}

export interface ValueDossierRequest {
  deliverable?: string;
  htaBody?: string;
}

export interface ValueDossierGuidance {
  resolved: { deliverable: string | null; htaBody: string | null };
  deliverable: ValueDeliverable | null;
  htaBody: HtaBody | null;
  brief: string;
  availableDeliverables?: string[];
}

export function listValueDossierCatalog() {
  return {
    deliverables: DELIVERABLES.map(d => ({ id: d.id, label: d.label })),
    htaBodies: HTA_BODIES.map(h => ({ id: h.id, label: h.label, country: h.country })),
  };
}

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

export function composeValueDossierGuidance(req: ValueDossierRequest): ValueDossierGuidance {
  const d = findBy(DELIVERABLES, req.deliverable) ?? null;
  const hta = findBy(HTA_BODIES, req.htaBody) ?? null;
  const parts: string[] = [];

  parts.push(`# Market-access guidance${d ? `: ${d.label}` : ''}${hta ? ` — ${hta.label} (${hta.country})` : ''}`);

  if (d) {
    parts.push(`\n**Purpose.** ${d.purpose}`);
    parts.push(`\n**Framework.** ${d.framework.join('; ')}`);
    parts.push(bullets('Structure', d.structure));
    parts.push(bullets('Key requirements', d.keyRequirements));
    parts.push(bullets('Common pitfalls', d.commonPitfalls));
  } else {
    parts.push(`\n_Deliverable not recognized — supported: ${DELIVERABLES.map(x => x.id).join(', ')}._`);
  }

  if (hta) {
    parts.push(`\n## HTA body: ${hta.label} (${hta.country})`);
    parts.push(`**Decision basis.** ${hta.decisionBasis}`);
    parts.push(bullets('Notes', hta.notes));
  }

  parts.push(
    '\n## Grounding\nGround clinical claims with the evidence tools (search_literature, ' +
      'search_clinical_evidence, assess_regulatory_landscape) and reimbursement context with ' +
      'search_medicare_coverage; narrate comparative results with narrate_statistical_result; keep ' +
      'value messages within the evidence (run screen_promotional_language).'
  );

  return {
    resolved: { deliverable: d?.id ?? null, htaBody: hta?.id ?? null },
    deliverable: d,
    htaBody: hta,
    brief: parts.filter(Boolean).join('\n'),
    availableDeliverables: d ? undefined : DELIVERABLES.map(x => x.id),
  };
}
