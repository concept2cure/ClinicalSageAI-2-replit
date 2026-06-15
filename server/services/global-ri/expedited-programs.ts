/**
 * Global expedited / accelerated regulatory programs — catalog + eligibility matcher.
 *
 * A deterministic reference for the four major expedited pathways offered by the
 * three reference agencies and a rules-based screen that maps a product's
 * development context onto the programs it may qualify for. This is a planning
 * aid, NOT a regulatory determination: a real designation requires agency review
 * of the full data package.
 *
 *   - FDA  — Fast Track, Breakthrough Therapy, Accelerated Approval, Priority
 *            Review, Regenerative Medicine Advanced Therapy (RMAT). Per FDA
 *            "Guidance for Industry: Expedited Programs for Serious Conditions —
 *            Drugs and Biologics" (May 2014); RMAT per the 21st Century Cures Act
 *            (2016), FD&C Act 506(g).
 *   - EMA  — PRIME (PRIority MEdicines), Accelerated Assessment (Art. 14(9) Reg.
 *            (EC) 726/2004), Conditional Marketing Authorisation (Reg. (EC)
 *            507/2006), Marketing Authorisation under Exceptional Circumstances
 *            (Art. 14(8) Reg. (EC) 726/2004).
 *   - PMDA — Sakigake Designation, Conditional Early Approval, Priority Review,
 *            Orphan Drug Designation (Pharmaceuticals and Medical Devices Act).
 *
 * The matcher is pure / deterministic: identical input yields identical output,
 * and both the `eligible` and `notSuitable` lists are ordered by program id.
 * Only programs belonging to the requested region are returned.
 *
 * @module server/services/global-ri/expedited-programs
 */

/** Reference regulatory agencies covered by this catalog. */
export type Region = 'FDA' | 'EMA' | 'PMDA';

/** A single expedited / accelerated regulatory program. */
export interface ExpeditedProgram {
  /** Stable, region-prefixed identifier (e.g. 'fda-fast-track'). */
  id: string;
  region: Region;
  name: string;
  description: string;
  /** Qualifying criteria, paraphrased from the governing guidance. */
  criteria: string[];
  /** The principal benefit the program confers. */
  benefit: string;
}

/**
 * Catalog of expedited programs across FDA, EMA and PMDA.
 * Ordered by `id` so the array itself is deterministic.
 */
export const EXPEDITED_PROGRAMS: readonly ExpeditedProgram[] = [
  // ── EMA ───────────────────────────────────────────────────────────────────
  {
    id: 'ema-accelerated-assessment',
    region: 'EMA',
    name: 'Accelerated Assessment',
    description:
      'Reduces the CHMP review timetable for the marketing-authorisation application from 210 to 150 active days for products of major interest for public health and therapeutic innovation.',
    criteria: [
      'Product is of major interest for public health, particularly therapeutic innovation',
      'Request justified to the CHMP, ideally pre-submission',
    ],
    benefit: 'Shortened CHMP scientific assessment timetable (150 vs 210 active days).',
  },
  {
    id: 'ema-conditional-ma',
    region: 'EMA',
    name: 'Conditional Marketing Authorisation',
    description:
      'Authorisation granted on less comprehensive data than normally required, subject to specific post-authorisation obligations, where the benefit of immediate availability outweighs the risk of incomplete data. Reviewed annually.',
    criteria: [
      'Seriously debilitating or life-threatening disease, emergency, or orphan medicine',
      'Positive benefit-risk balance on available data',
      'Unmet medical need will be addressed',
      'Benefit of immediate availability outweighs risk of less complete data',
      'Applicant likely to provide comprehensive data post-authorisation',
    ],
    benefit: 'Earlier market access on incomplete data, with annual renewal and specific obligations.',
  },
  {
    id: 'ema-exceptional-circumstances',
    region: 'EMA',
    name: 'Marketing Authorisation under Exceptional Circumstances',
    description:
      'Authorisation for products where comprehensive efficacy and safety data cannot be obtained under normal conditions of use (e.g. very rare indication, ethics of data collection, current state of scientific knowledge). Subject to annual reassessment.',
    criteria: [
      'Comprehensive data cannot be provided even after authorisation',
      'Indication is so rare, collection ethically precluded, or science incomplete',
      'Specific obligations and annual reassessment accepted',
    ],
    benefit: 'Authorisation where comprehensive data is genuinely unobtainable, under annual review.',
  },
  {
    id: 'ema-prime',
    region: 'EMA',
    name: 'PRIME (PRIority MEdicines)',
    description:
      'Voluntary scheme providing enhanced EMA support — early appointment of a rapporteur, kick-off meeting, and iterative scientific advice — to accelerate development of medicines targeting an unmet medical need.',
    criteria: [
      'Targets a condition with an unmet medical need',
      'Preliminary clinical evidence of potential to bring major therapeutic advantage',
      '(Early entry possible for academia/SMEs on compelling non-clinical and tolerability data)',
    ],
    benefit: 'Enhanced, structured EMA interaction and a path toward accelerated assessment.',
  },

  // ── FDA ───────────────────────────────────────────────────────────────────
  {
    id: 'fda-accelerated-approval',
    region: 'FDA',
    name: 'Accelerated Approval',
    description:
      'Approval based on a surrogate or intermediate clinical endpoint reasonably likely to predict clinical benefit, with required post-approval confirmatory trials to verify benefit.',
    criteria: [
      'Serious or life-threatening condition',
      'Provides a meaningful advantage over available therapy',
      'Effect on a surrogate / intermediate endpoint reasonably likely to predict clinical benefit',
      'Sponsor commits to confirmatory post-approval trials',
    ],
    benefit: 'Approval on a surrogate endpoint, ahead of confirmation of the ultimate clinical benefit.',
  },
  {
    id: 'fda-breakthrough-therapy',
    region: 'FDA',
    name: 'Breakthrough Therapy',
    description:
      'Designation that expedites development and review of drugs showing, on preliminary clinical evidence, substantial improvement over available therapy on a clinically significant endpoint.',
    criteria: [
      'Serious or life-threatening condition',
      'Preliminary clinical evidence indicates substantial improvement over available therapy on a clinically significant endpoint',
    ],
    benefit: 'Intensive FDA guidance, organizational commitment, and all Fast Track features.',
  },
  {
    id: 'fda-fast-track',
    region: 'FDA',
    name: 'Fast Track',
    description:
      'Designation facilitating development and expediting review of drugs that treat a serious condition and address an unmet medical need, enabling more frequent FDA interaction and rolling review.',
    criteria: [
      'Serious or life-threatening condition',
      'Nonclinical or clinical data demonstrate potential to address an unmet medical need',
    ],
    benefit: 'More frequent FDA meetings/communication, rolling review, and eligibility for accelerated approval/priority review.',
  },
  {
    id: 'fda-priority-review',
    region: 'FDA',
    name: 'Priority Review',
    description:
      'Sets a goal of acting on a marketing application within 6 months (vs 10 months for standard review) for drugs that would, if approved, be a significant improvement in safety or effectiveness.',
    criteria: [
      'Application for a drug that, if approved, would significantly improve the safety or effectiveness of treatment, diagnosis, or prevention of a serious condition',
    ],
    benefit: 'Shortened FDA review goal (6 months vs 10 months from filing).',
  },
  {
    id: 'fda-rmat',
    region: 'FDA',
    name: 'Regenerative Medicine Advanced Therapy (RMAT)',
    description:
      'Designation for regenerative medicine therapies (cell therapies, therapeutic tissue-engineering products, human cell/tissue products, certain combination products) intended to treat a serious condition, with preliminary clinical evidence of potential to address unmet medical need.',
    criteria: [
      'Drug is a regenerative medicine therapy',
      'Intended to treat, modify, reverse, or cure a serious or life-threatening condition',
      'Preliminary clinical evidence indicates potential to address unmet medical needs',
    ],
    benefit: 'All Breakthrough/Fast Track features, plus pathways to support accelerated approval (e.g. surrogate endpoints).',
  },

  // ── PMDA ──────────────────────────────────────────────────────────────────
  {
    id: 'pmda-conditional-early-approval',
    region: 'PMDA',
    name: 'Conditional Early Approval',
    description:
      'System allowing earlier approval, with post-marketing conditions, for drugs treating serious diseases where conducting confirmatory clinical trials is difficult and a certain level of efficacy/safety can be shown from available data.',
    criteria: [
      'Serious disease with high medical need',
      'Confirmatory clinical trials are difficult to conduct or would take long',
      'Certain efficacy and safety demonstrable from available clinical data',
    ],
    benefit: 'Earlier approval with mandatory post-marketing surveillance and conditions.',
  },
  {
    id: 'pmda-orphan-drug',
    region: 'PMDA',
    name: 'Orphan Drug Designation',
    description:
      'Designation for drugs targeting serious diseases affecting fewer than 50,000 patients in Japan with high medical need, providing development support, priority review, and re-examination/tax incentives.',
    criteria: [
      'Target patient population under 50,000 in Japan',
      'Indication is a serious disease with high medical need',
      'Sound rationale and feasible development plan',
    ],
    benefit: 'Development subsidies, consultation support, priority review, and extended re-examination period.',
  },
  {
    id: 'pmda-priority-review',
    region: 'PMDA',
    name: 'Priority Review',
    description:
      'Shortened MHLW/PMDA review period for drugs treating serious diseases with high medical usefulness relative to existing therapies.',
    criteria: [
      'Indication is a serious disease',
      'High medical usefulness (no existing therapy, or superior efficacy/safety/usefulness over existing therapies)',
    ],
    benefit: 'Prioritized, shortened regulatory review timetable.',
  },
  {
    id: 'pmda-sakigake',
    region: 'PMDA',
    name: 'Sakigake Designation',
    description:
      'Designation promoting early practical application in Japan of innovative drugs developed there ahead of (or simultaneously with) other countries, offering prioritized consultation, review, and a substantive review-period target.',
    criteria: [
      'Innovative product with a novel mechanism',
      'Serious or life-threatening target disease',
      'Prominent effectiveness expected (substantial improvement over existing therapies)',
      'Intended for early/world-first development and filing in Japan',
    ],
    benefit: 'Prioritized consultation and review (target ~6 months), with a dedicated PMDA concierge.',
  },
];

/** Input context used to screen a product against the catalog. */
export interface MatchInput {
  region: Region;
  /** Serious or life-threatening condition. */
  seriousOrLifeThreatening?: boolean;
  /** Addresses an unmet medical need. */
  unmetMedicalNeed?: boolean;
  /** Substantial / significant improvement over existing available therapy. */
  substantialImprovementOverExisting?: boolean;
  /** Preliminary clinical evidence is available. */
  preliminaryClinicalEvidence?: boolean;
  /** Effect on a surrogate endpoint reasonably likely to predict clinical benefit. */
  surrogateEndpointReasonablyLikely?: boolean;
  /** Product is a regenerative medicine therapy (cell/tissue/gene-modified, etc.). */
  regenerativeMedicine?: boolean;
  /** Product would qualify as an orphan drug. */
  orphan?: boolean;
  /** Of major public-health interest / therapeutic innovation (EMA Accelerated Assessment). */
  majorPublicHealthInterest?: boolean;
  /** Comprehensive efficacy/safety data cannot be obtained under normal use (EMA Exceptional Circ.). */
  comprehensiveDataUnobtainable?: boolean;
  /** Intended for early / world-first development and filing in Japan (PMDA Sakigake). */
  intendedForEarlyJapanDevelopment?: boolean;
}

/** A program the input qualifies for, with the rationale. */
export interface EligibleMatch {
  id: string;
  name: string;
  rationale: string;
}

/** A program the input does not qualify for, with the reason. */
export interface NotSuitableMatch {
  id: string;
  name: string;
  reason: string;
}

/** Result of screening an input against the catalog for one region. */
export interface MatchResult {
  region: Region;
  eligible: EligibleMatch[];
  notSuitable: NotSuitableMatch[];
}

/** A program's eligibility rule: a predicate and the human-readable reasons either way. */
interface ProgramRule {
  id: string;
  /** True when the input qualifies. */
  test: (i: MatchInput) => boolean;
  /** Rationale when eligible. */
  rationale: string;
  /** Reason when not suitable. */
  reason: string;
}

/**
 * Genuine (simplified) eligibility rules per program. Keyed by region for fast
 * lookup; encoded straight from the catalog criteria above.
 */
const RULES: Record<Region, ProgramRule[]> = {
  FDA: [
    {
      id: 'fda-accelerated-approval',
      test: (i) =>
        !!i.seriousOrLifeThreatening && !!i.unmetMedicalNeed && !!i.surrogateEndpointReasonablyLikely,
      rationale:
        'Serious condition addressing an unmet need with a surrogate endpoint reasonably likely to predict clinical benefit — eligible for Accelerated Approval (confirmatory trials required).',
      reason:
        'Accelerated Approval requires a serious condition, an unmet need, and a surrogate/intermediate endpoint reasonably likely to predict clinical benefit.',
    },
    {
      id: 'fda-breakthrough-therapy',
      test: (i) =>
        !!i.seriousOrLifeThreatening &&
        !!i.preliminaryClinicalEvidence &&
        !!i.substantialImprovementOverExisting,
      rationale:
        'Serious condition with preliminary clinical evidence of substantial improvement over available therapy — eligible for Breakthrough Therapy designation.',
      reason:
        'Breakthrough Therapy requires a serious condition plus preliminary clinical evidence of substantial improvement over available therapy.',
    },
    {
      id: 'fda-fast-track',
      test: (i) => !!i.seriousOrLifeThreatening && !!i.unmetMedicalNeed,
      rationale:
        'Serious condition with potential to address an unmet medical need — eligible for Fast Track designation.',
      reason: 'Fast Track requires a serious condition that addresses an unmet medical need.',
    },
    {
      id: 'fda-priority-review',
      test: (i) => !!i.substantialImprovementOverExisting,
      rationale:
        'Would be a significant improvement in safety or effectiveness over existing options — eligible for Priority Review.',
      reason:
        'Priority Review requires that the drug, if approved, would significantly improve treatment, diagnosis, or prevention of a serious condition.',
    },
    {
      id: 'fda-rmat',
      test: (i) =>
        !!i.regenerativeMedicine && !!i.seriousOrLifeThreatening && !!i.preliminaryClinicalEvidence,
      rationale:
        'Regenerative medicine therapy for a serious condition with preliminary clinical evidence of potential to address unmet need — eligible for RMAT designation.',
      reason:
        'RMAT requires a regenerative medicine therapy, a serious condition, and preliminary clinical evidence of potential to address unmet needs.',
    },
  ],
  EMA: [
    {
      id: 'ema-accelerated-assessment',
      test: (i) => !!i.majorPublicHealthInterest,
      rationale:
        'Of major interest for public health and therapeutic innovation — eligible to request Accelerated Assessment.',
      reason:
        'Accelerated Assessment requires the product to be of major public-health interest, particularly therapeutic innovation.',
    },
    {
      id: 'ema-conditional-ma',
      test: (i) => !!i.seriousOrLifeThreatening && !!i.unmetMedicalNeed,
      rationale:
        'Seriously debilitating / life-threatening disease addressing an unmet medical need — candidate for Conditional Marketing Authorisation.',
      reason:
        'Conditional Marketing Authorisation requires a serious/life-threatening condition with an unmet medical need.',
    },
    {
      id: 'ema-exceptional-circumstances',
      test: (i) => !!i.comprehensiveDataUnobtainable,
      rationale:
        'Comprehensive efficacy/safety data cannot be obtained under normal conditions of use — candidate for Authorisation under Exceptional Circumstances.',
      reason:
        'Authorisation under Exceptional Circumstances applies only where comprehensive data genuinely cannot be obtained.',
    },
    {
      id: 'ema-prime',
      test: (i) => !!i.unmetMedicalNeed && !!i.preliminaryClinicalEvidence,
      rationale:
        'Targets an unmet medical need with preliminary clinical evidence of potential major therapeutic advantage — eligible for PRIME.',
      reason: 'PRIME requires an unmet medical need plus preliminary clinical evidence of major therapeutic advantage.',
    },
  ],
  PMDA: [
    {
      id: 'pmda-conditional-early-approval',
      test: (i) =>
        !!i.seriousOrLifeThreatening && !!i.unmetMedicalNeed && !!i.preliminaryClinicalEvidence,
      rationale:
        'Serious disease with high medical need where confirmatory trials are difficult but available clinical evidence shows efficacy/safety — candidate for Conditional Early Approval.',
      reason:
        'Conditional Early Approval requires a serious disease with high medical need and available clinical evidence of efficacy/safety where confirmatory trials are difficult.',
    },
    {
      id: 'pmda-orphan-drug',
      test: (i) => !!i.orphan,
      rationale:
        'Targets a serious disease in a small Japanese patient population with high medical need — eligible for Orphan Drug Designation.',
      reason: 'Orphan Drug Designation requires an orphan indication (under 50,000 patients in Japan) with high medical need.',
    },
    {
      id: 'pmda-priority-review',
      test: (i) => !!i.seriousOrLifeThreatening && !!i.substantialImprovementOverExisting,
      rationale:
        'Serious disease with high medical usefulness over existing therapies — eligible for Priority Review.',
      reason:
        'Priority Review requires a serious disease with high medical usefulness relative to existing therapies.',
    },
    {
      id: 'pmda-sakigake',
      test: (i) =>
        !!i.substantialImprovementOverExisting && !!i.intendedForEarlyJapanDevelopment,
      rationale:
        'Innovative product expected to show prominent effectiveness and intended for early/world-first development in Japan — candidate for Sakigake Designation.',
      reason:
        'Sakigake Designation requires prominent expected effectiveness (substantial improvement) and intent for early/world-first development and filing in Japan.',
    },
  ],
};

const PROGRAM_BY_ID: Record<string, ExpeditedProgram> = Object.fromEntries(
  EXPEDITED_PROGRAMS.map((p) => [p.id, p]),
);

/**
 * Screen a development context against the expedited programs of one region.
 * Pure / deterministic: both result lists are ordered by program id, and only
 * programs for `input.region` are considered.
 */
export function matchExpeditedPrograms(input: MatchInput): MatchResult {
  const rules = [...(RULES[input.region] ?? [])].sort((a, b) => a.id.localeCompare(b.id));

  const eligible: EligibleMatch[] = [];
  const notSuitable: NotSuitableMatch[] = [];

  for (const rule of rules) {
    const program = PROGRAM_BY_ID[rule.id];
    if (!program) continue;
    if (rule.test(input)) {
      eligible.push({ id: program.id, name: program.name, rationale: rule.rationale });
    } else {
      notSuitable.push({ id: program.id, name: program.name, reason: rule.reason });
    }
  }

  return { region: input.region, eligible, notSuitable };
}

/** All programs for a given region, ordered by id. */
export function programsForRegion(region: Region): ExpeditedProgram[] {
  return EXPEDITED_PROGRAMS.filter((p) => p.region === region);
}
