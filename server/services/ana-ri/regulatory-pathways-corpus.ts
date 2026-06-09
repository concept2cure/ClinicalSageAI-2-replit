/**
 * Regulatory Pathways Corpus — citable index of expedited development, early-
 * access and accelerated-review programs across the major global regulators.
 *
 * This is the "which lane can this program use, where" knowledge: a strategist
 * choosing a global development and filing plan needs the real designation names,
 * eligibility and benefits per agency. Each entry is a real, published program;
 * eligibility/benefit summaries are paraphrased and should be confirmed against
 * the agency's current guidance before relying on them (designations and criteria
 * change). Nothing here is fabricated.
 *
 * @module server/services/ana-ri/regulatory-pathways-corpus
 */

import type { ClientSegment } from './industry-wisdom-pack.js';

export type PathwayAgency =
  | 'FDA'
  | 'EMA'
  | 'PMDA'
  | 'MHRA'
  | 'Health Canada'
  | 'TGA'
  | 'NMPA'
  | 'ANVISA'
  | 'Swissmedic';

export type PathwayKind =
  | 'expedited_development' // intensive guidance / designation during development
  | 'expedited_review' // faster review clock
  | 'early_access' // conditional / provisional / exceptional-circumstances approval
  | 'orphan'; // rare-disease designation

export interface RegulatoryPathway {
  id: string;
  agency: PathwayAgency;
  name: string;
  kind: PathwayKind;
  /** Who qualifies, in brief. */
  eligibility: string;
  /** What the program gives you. */
  benefits: string[];
  /** Segments for which the program is most relevant. */
  appliesTo: ClientSegment[];
  /** Authoritative program reference (statute / guidance / procedure). */
  citation: string;
  keywords: string[];
}

const FDA: RegulatoryPathway[] = [
  {
    id: 'fda-fast-track',
    agency: 'FDA',
    name: 'Fast Track',
    kind: 'expedited_development',
    eligibility: 'Drugs/biologics for a serious condition that address an unmet medical need.',
    benefits: ['More frequent FDA interaction', 'Rolling review of the application', 'Eligibility for Accelerated Approval and Priority Review'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'FDCA 506(b); FDA Expedited Programs for Serious Conditions guidance',
    keywords: ['fast track', 'unmet need', 'serious condition', 'rolling review'],
  },
  {
    id: 'fda-breakthrough',
    agency: 'FDA',
    name: 'Breakthrough Therapy',
    kind: 'expedited_development',
    eligibility: 'Serious condition where preliminary clinical evidence shows substantial improvement over available therapy on a clinically significant endpoint.',
    benefits: ['All Fast Track features', 'Intensive guidance on efficient drug development', 'Organizational commitment / senior FDA involvement'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'FDCA 506(a); FDA Expedited Programs guidance',
    keywords: ['breakthrough', 'substantial improvement', 'preliminary clinical evidence'],
  },
  {
    id: 'fda-accelerated-approval',
    agency: 'FDA',
    name: 'Accelerated Approval',
    kind: 'early_access',
    eligibility: 'Serious condition with meaningful advantage over available therapy, based on a surrogate or intermediate endpoint reasonably likely to predict clinical benefit.',
    benefits: ['Approval on a surrogate/intermediate endpoint', 'Earlier patient access'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'FDCA 506(c); 21 CFR 314 Subpart H / 601 Subpart E',
    keywords: ['accelerated approval', 'surrogate endpoint', 'confirmatory trial'],
  },
  {
    id: 'fda-priority-review',
    agency: 'FDA',
    name: 'Priority Review',
    kind: 'expedited_review',
    eligibility: 'Application for a drug that would be a significant improvement in safety or effectiveness.',
    benefits: ['6-month review goal (vs 10-month standard)'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'PDUFA; FDA Priority Review guidance',
    keywords: ['priority review', 'six month', 'review clock'],
  },
  {
    id: 'fda-rmat',
    agency: 'FDA',
    name: 'Regenerative Medicine Advanced Therapy (RMAT)',
    kind: 'expedited_development',
    eligibility: 'Regenerative medicine therapy (incl. cell/gene therapy) for a serious condition with preliminary clinical evidence of potential to address unmet need.',
    benefits: ['All Breakthrough features', 'Early discussion of surrogate/intermediate endpoints and post-approval evidence'],
    appliesTo: ['biotech'],
    citation: '21st Century Cures Act §3033; FDCA 506(g)',
    keywords: ['RMAT', 'regenerative', 'cell therapy', 'gene therapy', 'advanced therapy'],
  },
  {
    id: 'fda-orphan',
    agency: 'FDA',
    name: 'Orphan Drug Designation',
    kind: 'orphan',
    eligibility: 'Drug/biologic for a rare disease or condition (generally fewer than 200,000 persons in the US).',
    benefits: ['7-year marketing exclusivity', 'Tax credits for qualified clinical trials', 'PDUFA fee waiver'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'Orphan Drug Act; 21 CFR 316',
    keywords: ['orphan', 'rare disease', 'exclusivity'],
  },
];

const EMA: RegulatoryPathway[] = [
  {
    id: 'ema-prime',
    agency: 'EMA',
    name: 'PRIME (PRIority MEdicines)',
    kind: 'expedited_development',
    eligibility: 'Medicines targeting an unmet medical need with potential to benefit patients, supported by early clinical (or compelling nonclinical + tolerability) data.',
    benefits: ['Early appointed rapporteur and dedicated EMA support', 'Enhanced scientific advice', 'Potential for accelerated assessment'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'EMA PRIME scheme',
    keywords: ['PRIME', 'priority medicines', 'unmet need', 'rapporteur'],
  },
  {
    id: 'ema-accelerated-assessment',
    agency: 'EMA',
    name: 'Accelerated Assessment',
    kind: 'expedited_review',
    eligibility: 'Products of major public-health interest, particularly therapeutic innovation.',
    benefits: ['CHMP review timeframe reduced (target 150 days vs 210)'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'Regulation (EC) 726/2004 Art 14(9)',
    keywords: ['accelerated assessment', 'CHMP', '150 days', 'public health interest'],
  },
  {
    id: 'ema-conditional-ma',
    agency: 'EMA',
    name: 'Conditional Marketing Authorisation',
    kind: 'early_access',
    eligibility: 'Seriously debilitating/life-threatening diseases, unmet needs or emergencies, where comprehensive data are not yet available but benefit-risk is positive.',
    benefits: ['Approval on less complete data with specific obligations', 'Annual renewal until data complete'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'Regulation (EC) 507/2006',
    keywords: ['conditional marketing authorisation', 'CMA', 'specific obligations'],
  },
  {
    id: 'ema-exceptional-circumstances',
    agency: 'EMA',
    name: 'Authorisation under Exceptional Circumstances',
    kind: 'early_access',
    eligibility: 'Where comprehensive data cannot be provided (e.g. very rare disease, ethical limits on data collection).',
    benefits: ['Authorisation with specific obligations and annual reassessment'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'Regulation (EC) 726/2004 Art 14(8)',
    keywords: ['exceptional circumstances', 'very rare', 'specific obligations'],
  },
  {
    id: 'ema-orphan',
    agency: 'EMA',
    name: 'Orphan Designation (EU)',
    kind: 'orphan',
    eligibility: 'Life-threatening/chronically debilitating condition affecting not more than 5 in 10,000 in the EU, with no satisfactory method or significant benefit.',
    benefits: ['10-year market exclusivity', 'Protocol assistance (scientific advice)', 'Fee reductions'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'Regulation (EC) 141/2000',
    keywords: ['orphan', 'rare disease', 'market exclusivity', 'COMP'],
  },
];

const ASIA_PACIFIC: RegulatoryPathway[] = [
  {
    id: 'pmda-sakigake',
    agency: 'PMDA',
    name: 'SAKIGAKE Designation',
    kind: 'expedited_development',
    eligibility: 'Innovative products (incl. regenerative medicine) intended for early development and first/early launch in Japan, addressing serious diseases.',
    benefits: ['Prioritized consultation and review', 'Reduced review timeline target', 'Substantial pre-application support'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'MHLW/PMDA SAKIGAKE designation system',
    keywords: ['sakigake', 'japan', 'innovative', 'priority review'],
  },
  {
    id: 'pmda-conditional-regenerative',
    agency: 'PMDA',
    name: 'Conditional / Time-Limited Approval (Regenerative Medicine)',
    kind: 'early_access',
    eligibility: 'Regenerative medical products where efficacy is probable and safety is acceptable, pending confirmation.',
    benefits: ['Conditional, time-limited approval with post-market confirmation of efficacy'],
    appliesTo: ['biotech'],
    citation: 'Japan Act on Regenerative Medicine / PMD Act',
    keywords: ['regenerative', 'conditional approval', 'japan', 'time-limited'],
  },
  {
    id: 'nmpa-breakthrough',
    agency: 'NMPA',
    name: 'Breakthrough Therapy Designation (China)',
    kind: 'expedited_development',
    eligibility: 'Innovative or improved drugs for serious conditions with no effective therapy or clear clinical advantage, supported by clinical evidence.',
    benefits: ['Enhanced communication with CDE', 'Priority resources during development'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'NMPA Drug Registration Regulation; CDE procedures',
    keywords: ['breakthrough', 'china', 'NMPA', 'CDE'],
  },
  {
    id: 'nmpa-priority-review',
    agency: 'NMPA',
    name: 'Priority Review and Approval (China)',
    kind: 'expedited_review',
    eligibility: 'Drugs with clinical value for serious/rare diseases, urgently needed products, or pediatric needs.',
    benefits: ['Priority review queue and faster approval'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'NMPA Drug Registration Regulation',
    keywords: ['priority review', 'china', 'urgent need', 'rare disease'],
  },
  {
    id: 'nmpa-conditional',
    agency: 'NMPA',
    name: 'Conditional Approval (China)',
    kind: 'early_access',
    eligibility: 'Serious life-threatening diseases lacking effective therapy where surrogate/early data predict clinical benefit.',
    benefits: ['Approval on surrogate/early endpoints with post-market obligations'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'NMPA Drug Registration Regulation',
    keywords: ['conditional approval', 'china', 'surrogate'],
  },
  {
    id: 'tga-provisional',
    agency: 'TGA',
    name: 'Provisional Approval (Australia)',
    kind: 'early_access',
    eligibility: 'Promising new medicines for serious conditions based on early clinical data, where benefit of earlier access outweighs the risk of less complete data.',
    benefits: ['Time-limited registration (up to 6 years) pending full data'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'TGA provisional approval pathway',
    keywords: ['provisional approval', 'australia', 'early access'],
  },
  {
    id: 'tga-priority',
    agency: 'TGA',
    name: 'Priority Review (Australia)',
    kind: 'expedited_review',
    eligibility: 'Medicines for serious conditions with major therapeutic advance and unmet clinical need.',
    benefits: ['Shortened evaluation timeframe'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'TGA priority review pathway',
    keywords: ['priority review', 'australia', 'therapeutic advance'],
  },
];

const OTHER: RegulatoryPathway[] = [
  {
    id: 'mhra-ilap',
    agency: 'MHRA',
    name: 'Innovative Licensing and Access Pathway (ILAP)',
    kind: 'expedited_development',
    eligibility: 'Innovative medicines (incl. ATMPs) for life-threatening or seriously debilitating conditions, or significant patient/public-health benefit.',
    benefits: ['Innovation Passport + Target Development Profile', 'Toolkit of accelerated tools and cross-agency support'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'MHRA ILAP',
    keywords: ['ILAP', 'innovation passport', 'UK', 'access'],
  },
  {
    id: 'mhra-irp',
    agency: 'MHRA',
    name: 'International Recognition Procedure (IRP)',
    kind: 'expedited_review',
    eligibility: 'Applications with an approval from a specified trusted reference regulator.',
    benefits: ['Faster UK assessment leveraging a reference-regulator decision'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'MHRA International Recognition Procedure',
    keywords: ['IRP', 'international recognition', 'UK', 'reliance'],
  },
  {
    id: 'hc-priority-review',
    agency: 'Health Canada',
    name: 'Priority Review (Canada)',
    kind: 'expedited_review',
    eligibility: 'Serious, life-threatening or severely debilitating conditions with substantial evidence of clinical effectiveness and unmet need.',
    benefits: ['Shortened review target (e.g. 180 days vs 300)'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'Health Canada Priority Review policy',
    keywords: ['priority review', 'canada', 'unmet need'],
  },
  {
    id: 'hc-noc-c',
    agency: 'Health Canada',
    name: 'Notice of Compliance with Conditions (NOC/c)',
    kind: 'early_access',
    eligibility: 'Promising evidence of clinical effectiveness for serious conditions, with confirmatory studies as conditions.',
    benefits: ['Earlier market access with post-market confirmatory commitments'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'Health Canada NOC/c policy',
    keywords: ['NOC/c', 'canada', 'conditions', 'confirmatory'],
  },
  {
    id: 'anvisa-priority',
    agency: 'ANVISA',
    name: 'Priority Review (Brazil)',
    kind: 'expedited_review',
    eligibility: 'Products for serious/neglected diseases, public-health emergencies, or with no therapeutic alternative in Brazil.',
    benefits: ['Reduced analysis timeline'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'ANVISA RDC (priority analysis)',
    keywords: ['priority', 'brazil', 'neglected disease'],
  },
  {
    id: 'swissmedic-fast-track',
    agency: 'Swissmedic',
    name: 'Fast-Track Authorisation (Switzerland)',
    kind: 'expedited_review',
    eligibility: 'Promising therapies against serious, disabling or life-threatening diseases where no/insufficient alternative exists.',
    benefits: ['Accelerated authorisation procedure'],
    appliesTo: ['pharma', 'biotech'],
    citation: 'Swissmedic fast-track authorisation procedure',
    keywords: ['fast track', 'switzerland', 'swissmedic'],
  },
];

export const REGULATORY_PATHWAYS: RegulatoryPathway[] = [
  ...FDA,
  ...EMA,
  ...ASIA_PACIFIC,
  ...OTHER,
];

const BY_ID = new Map(REGULATORY_PATHWAYS.map(p => [p.id, p]));

export function getPathway(id: string): RegulatoryPathway | undefined {
  return BY_ID.get(id);
}

export function pathwaysByAgency(agency: PathwayAgency): RegulatoryPathway[] {
  return REGULATORY_PATHWAYS.filter(p => p.agency === agency);
}

export function pathwaysByKind(kind: PathwayKind): RegulatoryPathway[] {
  return REGULATORY_PATHWAYS.filter(p => p.kind === kind);
}

/** Keyword/agency search over name, agency, eligibility and keywords. */
export function searchPathways(query: string, limit = 8): RegulatoryPathway[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/[\s,]+/).filter(Boolean);
  const scored = REGULATORY_PATHWAYS.map(p => {
    const hay = `${p.agency} ${p.name} ${p.eligibility} ${p.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (p.agency.toLowerCase().includes(t)) score += 3;
      if (p.keywords.some(k => k.toLowerCase() === t)) score += 3;
      if (hay.includes(t)) score += 1;
    }
    return { p, score };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.p);
}

const KIND_LABEL: Record<PathwayKind, string> = {
  expedited_development: 'expedited development',
  expedited_review: 'expedited review',
  early_access: 'early/conditional access',
  orphan: 'orphan',
};

const VERIFY_NOTE =
  '_Designation names and criteria change. Confirm eligibility and current benefits against the agency’s live guidance before relying on a pathway._';

/** Render a Markdown block of relevant pathways for the chat system prompt. */
export function buildPathwaysBlock(opts: {
  message?: string;
  agency?: PathwayAgency;
  segment?: ClientSegment;
  limit?: number;
}): string {
  const { message, agency, segment, limit = 8 } = opts;
  let hits: RegulatoryPathway[] = [];
  if (message && message.trim()) hits = searchPathways(message, limit);
  if (hits.length === 0 && agency) hits = pathwaysByAgency(agency);
  if (hits.length === 0 && segment) hits = REGULATORY_PATHWAYS.filter(p => p.appliesTo.includes(segment)).slice(0, limit);

  const lines: string[] = ['## Regulatory Pathways (expedited / access)'];
  if (hits.length > 0) {
    for (const p of hits) {
      lines.push(`- **${p.agency} — ${p.name}** _(${KIND_LABEL[p.kind]})_`);
      lines.push(`  Eligibility: ${p.eligibility}`);
      lines.push(`  Benefits: ${p.benefits.join('; ')}. Ref: ${p.citation}.`);
    }
  } else {
    const agencies = [...new Set(REGULATORY_PATHWAYS.map(p => p.agency))];
    lines.push(
      `Expedited and early-access programs are indexed for ${agencies.length} regulators: ${agencies.join(', ')}.`,
      'Name an agency (e.g. "FDA", "EMA", "PMDA") or a goal (e.g. "breakthrough", "conditional approval", "orphan", "priority review") to see the options.'
    );
  }
  lines.push('', VERIFY_NOTE);
  return lines.join('\n');
}

export interface PathwaysSummary {
  total: number;
  agencies: number;
  byKind: Record<PathwayKind, number>;
}

export function pathwaysSummary(): PathwaysSummary {
  return {
    total: REGULATORY_PATHWAYS.length,
    agencies: new Set(REGULATORY_PATHWAYS.map(p => p.agency)).size,
    byKind: {
      expedited_development: pathwaysByKind('expedited_development').length,
      expedited_review: pathwaysByKind('expedited_review').length,
      early_access: pathwaysByKind('early_access').length,
      orphan: pathwaysByKind('orphan').length,
    },
  };
}
