/**
 * Expedited-program & special-designation advisor for AnA.
 *
 * Encodes the FDA expedited programs (Fast Track, Breakthrough Therapy,
 * Accelerated Approval, Priority Review), Orphan Drug designation, and the EMA
 * counterparts (PRIME, conditional marketing authorisation, accelerated
 * assessment, orphan designation) — their eligibility criteria, the benefit they
 * confer, evidence expectations and common pitfalls. Lets AnA recommend and QC a
 * designation strategy grounded in the actual programs.
 *
 * Deterministic, dependency-free, data-driven. Advisory — eligibility is
 * determined by the agency.
 *
 * @module server/services/ana/special-designations
 */

export type DesignationJurisdiction = 'us' | 'eu';

export interface Designation {
  id: string;
  label: string;
  jurisdiction: DesignationJurisdiction;
  authority: string;
  basis: string;
  eligibility: string;
  benefit: string[];
  evidence: string[];
  commonPitfalls: string[];
  aliases?: string[];
}

const DESIGNATIONS: Designation[] = [
  // ── FDA ────────────────────────────────────────────────────────────────
  {
    id: 'fast_track',
    label: 'Fast Track (FDA)',
    jurisdiction: 'us',
    authority: 'FDA',
    basis: 'FD&C Act §506(b); FDA Expedited Programs guidance',
    eligibility: 'Serious condition AND nonclinical/clinical data demonstrate potential to address an unmet medical need (or qualifying infectious-disease product).',
    benefit: ['More frequent FDA interactions', 'Rolling review of the application', 'Eligibility for Accelerated Approval / Priority Review if criteria met'],
    evidence: ['Demonstrate the condition is serious', 'Provide a plausible basis (nonclinical or clinical) for addressing unmet need'],
    commonPitfalls: ['Treating "serious + unmet need" as automatic', 'Requesting too late to gain the rolling-review benefit'],
    aliases: ['fast-track', 'ftd'],
  },
  {
    id: 'breakthrough',
    label: 'Breakthrough Therapy (FDA)',
    jurisdiction: 'us',
    authority: 'FDA',
    basis: 'FD&C Act §506(a) (FDASIA 2012)',
    eligibility: 'Serious condition AND preliminary CLINICAL evidence of substantial improvement over available therapy on a clinically significant endpoint.',
    benefit: ['All Fast Track features', 'Intensive FDA guidance on efficient drug development from Phase 1', 'Organizational commitment / senior managers involved'],
    evidence: ['Preliminary clinical evidence (not just nonclinical) of substantial improvement', 'A clinically significant endpoint comparison vs available therapy'],
    commonPitfalls: ['Relying on nonclinical data (clinical evidence is required)', 'Weak/unsuitable comparator for "substantial improvement"'],
    aliases: ['btd', 'breakthrough therapy'],
  },
  {
    id: 'accelerated_approval',
    label: 'Accelerated Approval (FDA)',
    jurisdiction: 'us',
    authority: 'FDA',
    basis: 'FD&C Act §506(c); 21 CFR 314 subpart H / 601 subpart E',
    eligibility: 'Serious condition with meaningful advantage over available therapy AND effect on a surrogate/intermediate clinical endpoint reasonably likely to predict clinical benefit.',
    benefit: ['Approval on a surrogate/intermediate endpoint — earlier access'],
    evidence: ['Validate the surrogate/intermediate endpoint as reasonably likely to predict benefit', 'Confirmatory (Phase 4) trial required to verify clinical benefit'],
    commonPitfalls: ['No (or delayed) confirmatory trial — risk of withdrawal', 'Surrogate not accepted by FDA', 'Promotion beyond the surrogate-based claim'],
    aliases: ['accelerated approval', 'aa', 'subpart h'],
  },
  {
    id: 'priority_review',
    label: 'Priority Review (FDA)',
    jurisdiction: 'us',
    authority: 'FDA',
    basis: 'PDUFA; FDA Expedited Programs guidance',
    eligibility: 'Application for a drug that, if approved, would significantly improve safety or effectiveness of treatment/diagnosis/prevention of a serious condition.',
    benefit: ['6-month review goal (vs 10 months standard)'],
    evidence: ['Demonstrate the significant improvement at the time of the marketing application'],
    commonPitfalls: ['Confusing with Fast Track (Priority Review is a review-clock designation at filing)', 'Assuming it speeds development (it speeds review only)'],
    aliases: ['priority review'],
  },
  {
    id: 'orphan_us',
    label: 'Orphan Drug Designation (FDA)',
    jurisdiction: 'us',
    authority: 'FDA (OOPD)',
    basis: 'Orphan Drug Act; 21 CFR 316',
    eligibility: 'Drug/biologic for a rare disease/condition affecting <200,000 persons in the US (or no expectation of recovering costs).',
    benefit: ['7 years of orphan exclusivity upon approval', 'Tax credits for qualified clinical trials', 'PDUFA fee waiver'],
    evidence: ['Document the prevalence (<200,000) or cost-recovery basis', 'Scientific rationale for use in the orphan condition'],
    commonPitfalls: ['Prevalence estimate not well-supported', 'Salami-slicing a common disease into an "orphan subset" without scientific basis'],
    aliases: ['orphan', 'orphan drug', 'odd'],
  },
  // ── EMA ────────────────────────────────────────────────────────────────
  {
    id: 'prime',
    label: 'PRIME — PRIority MEdicines (EMA)',
    jurisdiction: 'eu',
    authority: 'EMA',
    basis: 'EMA PRIME scheme',
    eligibility: 'Medicine targeting an unmet medical need with preliminary clinical evidence of potential to offer major therapeutic advantage.',
    benefit: ['Early/enhanced EMA dialogue and scientific advice', 'Appointment of a CHMP rapporteur early', 'Potential for accelerated assessment'],
    evidence: ['Preliminary clinical evidence of major therapeutic advantage', 'Strong unmet-need justification'],
    commonPitfalls: ['Applying without preliminary clinical evidence', 'Confusing PRIME (development support) with conditional MA (an approval type)'],
    aliases: ['prime scheme', 'priority medicines'],
  },
  {
    id: 'conditional_ma',
    label: 'Conditional Marketing Authorisation (EMA)',
    jurisdiction: 'eu',
    authority: 'EMA / European Commission',
    basis: 'Regulation (EC) 507/2006',
    eligibility: 'Seriously debilitating/life-threatening disease, unmet need, where benefit of immediate availability outweighs less-comprehensive data; benefit-risk positive.',
    benefit: ['Earlier authorisation on less-complete data, with specific obligations to provide comprehensive data'],
    evidence: ['Positive benefit-risk on available data', 'Likelihood the applicant will provide comprehensive data (specific obligations)'],
    commonPitfalls: ['Not meeting specific obligations (annual renewal/conversion)', 'Confusing with "exceptional circumstances" authorisation'],
    aliases: ['conditional marketing authorisation', 'cma'],
  },
  {
    id: 'accelerated_assessment',
    label: 'Accelerated Assessment (EMA)',
    jurisdiction: 'eu',
    authority: 'EMA',
    basis: 'Regulation (EC) 726/2004 Art. 14(9)',
    eligibility: 'Product of major interest for public health and therapeutic innovation.',
    benefit: ['Reduced CHMP review timetable (150 vs 210 active days)'],
    evidence: ['Justify major public-health interest / therapeutic innovation at request'],
    commonPitfalls: ['Dossier not mature enough to sustain the faster clock (may revert to standard timetable)'],
    aliases: ['accelerated assessment'],
  },
  {
    id: 'orphan_eu',
    label: 'Orphan Designation (EMA)',
    jurisdiction: 'eu',
    authority: 'EMA (COMP)',
    basis: 'Regulation (EC) 141/2000',
    eligibility: 'Life-threatening/chronically debilitating condition affecting ≤5 in 10,000 in the EU (or insufficient return), and no satisfactory method or significant benefit over existing.',
    benefit: ['10 years of market exclusivity', 'Protocol assistance (scientific advice)', 'Fee reductions'],
    evidence: ['Prevalence ≤5/10,000 (or return-on-investment basis)', 'Significant benefit where an authorised therapy exists'],
    commonPitfalls: ['Failing to show "significant benefit" vs existing therapy at the time of MA', 'Prevalence estimate poorly justified'],
    aliases: ['orphan eu', 'eu orphan', 'comp orphan'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findDesignation(key?: string): Designation | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    DESIGNATIONS.find(d => d.id === k) ||
    DESIGNATIONS.find(d => d.aliases?.some(a => a.toLowerCase() === k)) ||
    DESIGNATIONS.find(d => d.label.toLowerCase() === k) ||
    DESIGNATIONS.find(d => d.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(d.id))
  );
}

function asJurisdiction(v?: string): DesignationJurisdiction | undefined {
  const k = v?.trim().toLowerCase();
  if (k === 'us' || k === 'usa' || k === 'fda') return 'us';
  if (k === 'eu' || k === 'europe' || k === 'ema') return 'eu';
  return undefined;
}

export interface DesignationQuery {
  designation?: string;
  jurisdiction?: string;
}

export interface DesignationResult {
  resolved: { designation: string | null; jurisdiction: DesignationJurisdiction | null };
  designation: Designation | null;
  candidates: { id: string; label: string; jurisdiction: DesignationJurisdiction }[];
  brief: string;
}

export function listDesignations() {
  return DESIGNATIONS.map(d => ({ id: d.id, label: d.label, jurisdiction: d.jurisdiction }));
}

export function adviseSpecialDesignation(q: DesignationQuery): DesignationResult {
  const jurisdiction = asJurisdiction(q.jurisdiction);
  const direct = findDesignation(q.designation) ?? null;
  const candidates = DESIGNATIONS.filter(d => (jurisdiction ? d.jurisdiction === jurisdiction : true));

  const parts: string[] = [];
  if (direct) {
    parts.push(`# Special designation: ${direct.label}`);
    parts.push(`\n**Authority.** ${direct.authority}`);
    parts.push(`**Basis.** ${direct.basis}`);
    parts.push(`**Eligibility.** ${direct.eligibility}`);
    parts.push(bullets('Benefit conferred', direct.benefit));
    parts.push(bullets('Evidence to support the request', direct.evidence));
    parts.push(bullets('Common pitfalls', direct.commonPitfalls));
  } else {
    const scope = jurisdiction ? ` (${jurisdiction.toUpperCase()})` : '';
    parts.push(`# Expedited programs & special designations${scope}`);
    for (const d of candidates) {
      parts.push(`\n## ${d.label}\n**Eligibility.** ${d.eligibility}\n**Benefit.** ${d.benefit.join('; ')}`);
    }
  }

  parts.push(
    '\n## Note\nAdvisory only — eligibility is determined by the agency. Designations can be combined ' +
      '(e.g., Fast Track + Breakthrough + Accelerated Approval + Priority Review). Ground the unmet-need / ' +
      'comparative-advantage case with search_clinical_evidence and assess_regulatory_landscape.'
  );

  return {
    resolved: { designation: direct?.id ?? null, jurisdiction: jurisdiction ?? null },
    designation: direct,
    candidates: candidates.map(d => ({ id: d.id, label: d.label, jurisdiction: d.jurisdiction })),
    brief: parts.filter(Boolean).join('\n'),
  };
}
