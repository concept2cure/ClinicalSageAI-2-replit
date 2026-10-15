/**
 * Immunogenicity Intelligence — comparability after a change, or for a biosimilar
 * ================================================================================
 *
 * Deterministic: no LLM, no network, no database. Split out of
 * immunogenicity-knowledge.ts on 2026-10-15 when that file crossed the
 * repository size ceiling; it re-exports this tool, so importers of the
 * knowledge module are unchanged.
 *
 * @module server/services/immunogenicity/immunogenicity-comparability
 */

import { ComputationRefusal } from '../ana-biostats/computation-engine';
import {
  CITATIONS,
  RISK_TIERS,
  dedupeCitations,
  statedBoolean,
  statedOneOf,
  type Citation,
  type RiskTier,
} from './immunogenicity-reference';

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 6 — assessImmunogenicityComparability
 * ════════════════════════════════════════════════════════════════════════ */

/** Context that triggers a comparability assessment. */
export type ComparabilityContext = 'biosimilar' | 'manufacturing_change' | 'formulation_change' | 'site_transfer' | 'scale_up';

const CONTEXTS: ComparabilityContext[] = ['biosimilar', 'manufacturing_change', 'formulation_change', 'site_transfer', 'scale_up'];

/** Categorization of the change's potential impact on immunogenicity. */
export type ChangeImpact = 'minor' | 'moderate' | 'major';

export interface ComparabilityParams {
  /** What triggered the comparability evaluation. */
  context: ComparabilityContext;
  /** Whether analytical/structural comparability (primary structure, PTMs,
   *  charge variants, aggregates) was demonstrated. */
  analyticalComparable?: boolean;
  /** Whether the change could alter aggregate/particle levels. */
  affectsAggregation?: boolean;
  /** Whether the change could alter glycosylation/PTMs. */
  affectsGlycosylation?: boolean;
  /** Whether the change affects the formulation / container-closure
   *  (leachables, particles). */
  affectsFormulation?: boolean;
  /** Whether new or different process-related impurities are introduced. */
  affectsImpurities?: boolean;
  /** The product's intrinsic immunogenicity risk tier. */
  productRiskTier?: RiskTier;
  /** For biosimilars: whether a comparative clinical immunogenicity study is
   *  planned (typically required unless justified). */
  comparativeClinicalStudyPlanned?: boolean;
  /** Free-text drug name (echoed). */
  drugName?: string;
}

/** An input this context uses that was not stated. It is neither assumed nor counted as a trigger. */
export interface ComparabilityNotAssessed {
  factor: string;
  input: keyof ComparabilityParams;
}

export interface ComparabilityResult {
  drugName: string;
  context: ComparabilityContext;
  /** 'undetermined' while an input in notAssessed could change it. */
  changeImpact: ChangeImpact | 'undetermined';
  /** null while an input in notAssessed could change it. */
  clinicalImmunogenicityStudyRequired: boolean | null;
  studyRecommendation: string;
  analyticalExpectations: string[];
  bridgingDataNeeds: string[];
  /** The stated triggers only. */
  riskFactorsTriggered: string[];
  notAssessed: ComparabilityNotAssessed[];
  decisionRationale: string;
  citations: Citation[];
  summary: string;
}

type TriggerInput = 'affectsAggregation' | 'affectsGlycosylation' | 'affectsFormulation' | 'affectsImpurities';

const TRIGGERS: Array<{ input: TriggerInput; factor: string; text: string }> = [
  {
    input: 'affectsAggregation',
    factor: 'Aggregation',
    text: 'Change may alter aggregate/subvisible-particle levels (a primary immunogenicity driver).',
  },
  {
    input: 'affectsGlycosylation',
    factor: 'Glycosylation / PTMs',
    text: 'Change may alter glycosylation/PTMs (potential new glycan epitopes / effector-function shifts).',
  },
  {
    input: 'affectsFormulation',
    factor: 'Formulation / container-closure',
    text: 'Change affects formulation or container-closure (leachables, silicone oil, particle formation).',
  },
  {
    input: 'affectsImpurities',
    factor: 'Process-related impurities',
    text: 'Change may introduce new or different process-related impurities (potential adjuvant effect).',
  },
];

/**
 * The ICH Q5E change impact for one reading of the inputs: analytical
 * comparability not shown, or two triggers, is major; one trigger is moderate;
 * a high risk tier raises the impact one level. It only rises with each.
 */
function changeImpactFor(triggers: number, analyticalComparable: boolean, highRisk: boolean): ChangeImpact {
  const impact: ChangeImpact = !analyticalComparable || triggers >= 2 ? 'major' : triggers === 1 ? 'moderate' : 'minor';
  if (!highRisk) return impact;
  return impact === 'minor' ? 'moderate' : 'major';
}

/** The study recommendation and rationale for the verdict; `range` is the impact's least-to-most reading. */
function studyGuidance(
  biosimilar: boolean,
  impact: ChangeImpact | 'undetermined',
  clinicalRequired: boolean | null,
  range: string,
): { studyRecommendation: string; rationale: string } {
  if (biosimilar) {
    return {
      studyRecommendation:
        clinicalRequired === null
          ? 'Whether a comparative clinical immunogenicity study is planned was not stated, so this assessment does not choose between the two routes: a comparative clinical immunogenicity study (biosimilar vs reference product) with a pre-specified margin on ADA/NAb incidence, or, without one, a justification resting on a strong analytical similarity package plus comparative PK/PD immunogenicity data (totality-of-evidence).'
          : clinicalRequired
            ? 'Conduct a comparative clinical immunogenicity study (biosimilar vs reference product) with a pre-specified margin on ADA/NAb incidence, unless a robust analytical and clinical-pharmacology data package justifies a waiver. Include a single-switch evaluation where the totality-of-evidence approach requires it.'
            : 'A standalone comparative clinical immunogenicity study is not planned; justification must rest on a strong analytical similarity package plus comparative PK/PD immunogenicity data (totality-of-evidence).',
      rationale:
        'For a biosimilar, immunogenicity comparability is a core element of the totality-of-the-evidence demonstration of biosimilarity; comparative immunogenicity assessment is expected (FDA 2015; EMA 2017), typically as a head-to-head comparison using a single validated assay applied to both products.',
    };
  }
  // Manufacturing/formulation change under ICH Q5E.
  if (impact === 'undetermined') {
    return {
      studyRecommendation:
        `Not determined: on the stated inputs the change impact is ${range}, and the unstated inputs in notAssessed decide where it falls. ` +
        (clinicalRequired === false
          ? 'Either way no dedicated clinical immunogenicity study is called for: comparability rests on analytical characterization of immunogenicity-relevant attributes, supplemented with bridging immunogenicity data if residual risk remains.'
          : 'A clinical immunogenicity comparison is called for only at major, so whether one is needed is open too.'),
      rationale:
        'Under ICH Q5E, the immunogenicity data needed after a change depend on whether it can affect immunogenicity-relevant quality attributes (aggregates, glycosylation, impurities, formulation), whether analytical comparability is demonstrated, and the product\'s risk. The inputs in notAssessed were not stated.',
    };
  }
  if (impact === 'major') {
    return {
      studyRecommendation:
        'Analytical comparability alone is insufficient. Generate comparative immunogenicity data — at minimum bridging non-clinical and PK/immunogenicity data, and a clinical immunogenicity comparison (pre- vs post-change) when residual uncertainty remains, especially for moderate/high-risk products.',
      rationale:
        'Under ICH Q5E, when a manufacturing change has a meaningful potential to affect immunogenicity-relevant quality attributes (aggregates, glycosylation, impurities, formulation) and analytical comparability is uncertain, additional non-clinical and/or clinical immunogenicity data are required to conclude comparability.',
    };
  }
  if (impact === 'moderate') {
    return {
      studyRecommendation:
        'Demonstrate comparability primarily through enhanced analytical characterization focused on immunogenicity-relevant attributes; supplement with bridging immunogenicity data if residual risk remains. A dedicated clinical immunogenicity study may be avoidable if analytical comparability is robust.',
      rationale:
        'Under ICH Q5E, a change with a single immunogenicity-relevant trigger and otherwise comparable analytics can often be supported analytically, with clinical immunogenicity data reserved for residual uncertainty.',
    };
  }
  return {
    studyRecommendation:
      'Comparability can be concluded on the basis of analytical/structural comparability of immunogenicity-relevant quality attributes; no dedicated clinical immunogenicity study is anticipated.',
    rationale:
      'Under ICH Q5E, a low-impact change with demonstrated analytical comparability and no immunogenicity-relevant triggers does not warrant a dedicated clinical immunogenicity study.',
  };
}

/**
 * assessImmunogenicityComparability — Assesses immunogenicity comparability
 * after a manufacturing/formulation change (ICH Q5E) or for a biosimilar
 * (FDA 2015 biosimilarity considerations / EMA 2017). Determines whether a
 * comparative clinical immunogenicity study is warranted and what analytical
 * and bridging data are needed.
 */
export function assessImmunogenicityComparability(params: ComparabilityParams): ComparabilityResult {
  const drugName = params.drugName ?? '(unnamed product)';
  // 2026-10-15: analyticalComparable used to default to false, productRiskTier
  // to 'moderate' and comparativeClinicalStudyPlanned to true, and an unstated
  // trigger counted as "does not affect", so context alone came back MAJOR with
  // a clinical study required. An unstated input is now listed in notAssessed,
  // and a verdict it could change is left undetermined.
  const context = statedOneOf('context', params.context, CONTEXTS);
  if (context === undefined) {
    throw new ComputationRefusal('missing_input', `context is required (one of ${CONTEXTS.join(', ')}).`, 'context');
  }
  const biosimilar = context === 'biosimilar';
  const notAssessed: ComparabilityNotAssessed[] = [];
  const triggered: string[] = [];

  const analyticalComparable = statedBoolean('analyticalComparable', params.analyticalComparable);
  if (analyticalComparable === undefined) {
    notAssessed.push({ factor: 'Analytical comparability', input: 'analyticalComparable' });
  }
  let affecting = 0;
  let unstated = 0;
  for (const t of TRIGGERS) {
    const affects = statedBoolean(t.input, params[t.input]);
    if (affects === undefined) {
      unstated += 1;
      notAssessed.push({ factor: t.factor, input: t.input });
    } else if (affects) {
      affecting += 1;
      triggered.push(t.text);
    }
  }
  if (analyticalComparable === false) triggered.push('Analytical/structural comparability not yet demonstrated.');
  const productRisk = statedOneOf('productRiskTier', params.productRiskTier, RISK_TIERS);
  const planned = statedBoolean('comparativeClinicalStudyPlanned', params.comparativeClinicalStudyPlanned);
  if (!biosimilar && productRisk === undefined) notAssessed.push({ factor: 'Product risk tier', input: 'productRiskTier' });
  if (biosimilar && planned === undefined) {
    notAssessed.push({ factor: 'Comparative clinical study plan', input: 'comparativeClinicalStudyPlanned' });
  }

  // ── Determine change impact ─────────────────────────────────────────────
  // A biosimilar carries an inherent immunogenicity comparison expectation.
  // Otherwise the impact is decided only when the least and the most
  // favourable readings of the unstated inputs give the same one.
  const least = changeImpactFor(affecting, analyticalComparable !== false, productRisk === 'high');
  const most = changeImpactFor(affecting + unstated, analyticalComparable === true, productRisk === undefined || productRisk === 'high');
  const impact: ChangeImpact | 'undetermined' = biosimilar ? 'major' : least === most ? least : 'undetermined';

  // ── Clinical study determination ────────────────────────────────────────
  // For a change, a clinical comparison is called for at major only.
  const clinicalRequired: boolean | null = biosimilar
    ? planned ?? null
    : least === 'major' ? true : most !== 'major' ? false : null;
  const { studyRecommendation, rationale } = studyGuidance(biosimilar, impact, clinicalRequired, `${least} to ${most}`);

  const analyticalExpectations: string[] = [
    'Primary structure and post-translational modification comparison (sequence, disulfides, glycosylation, deamidation/oxidation).',
    'Higher-order structure (HOS) comparison (e.g., circular dichroism, DSC, HDX-MS, NMR fingerprinting).',
    'Aggregate and subvisible/submicron particle comparison (SEC-MALS, AUC, MFI, HIAC, nanoparticle tracking).',
    'Charge-variant and size-variant profiles (cIEF/icIEF, CE-SDS).',
    'Process-related impurity comparison (HCP, residual DNA, leachables).',
    'Binding and potency comparison reflecting the mechanism of action.',
  ];

  const bridgingDataNeeds: string[] = [
    'A single, validated ADA assay applied to pre- and post-change (or biosimilar and reference) samples to avoid assay-driven differences.',
    'Comparable cut points, sensitivity, drug tolerance, and specificity across the compared products.',
    'NAb comparison where neutralization is clinically relevant.',
    'PK/PD bridging data interpreted alongside immunogenicity to detect exposure-mediated effects.',
  ];

  if (biosimilar) {
    bridgingDataNeeds.push('Demonstrate the assay equally detects ADA against both the biosimilar and the reference product (assay capable of detecting antibodies to both).');
  }

  const citations: Citation[] = dedupeCitations(
    biosimilar
      ? [CITATIONS.FDA_BIOSIM, CITATIONS.EMA_2017, CITATIONS.ICH_Q5E, CITATIONS.FDA_2019_TIERS]
      : [CITATIONS.ICH_Q5E, CITATIONS.FDA_2014_RISKBASED, CITATIONS.EMA_2017, CITATIONS.FDA_2019_TIERS],
  );

  const decided = impact !== 'undetermined' && clinicalRequired !== null;
  const summary =
    `${drugName}: ${context.replace(/_/g, ' ')} immunogenicity comparability — change impact ${impact.toUpperCase()}. ` +
    `Comparative clinical immunogenicity study ${clinicalRequired === null ? 'recommendation UNDETERMINED' : clinicalRequired ? 'IS recommended' : 'is NOT recommended'}. ` +
    `${triggered.length} immunogenicity-relevant trigger(s) stated. ` +
    (notAssessed.length > 0
      ? `Not stated: ${notAssessed.map((n: ComparabilityNotAssessed) => n.input).join(', ')}${decided ? ' (none of them can change this verdict)' : ''}. `
      : '') +
    (analyticalComparable === undefined
      ? 'Whether analytical comparability is demonstrated was not stated.'
      : `Demonstration rests on ${analyticalComparable ? 'demonstrated' : 'pending'} analytical comparability${biosimilar ? ' within a totality-of-evidence approach' : ' under ICH Q5E'}.`);

  return {
    drugName,
    context,
    changeImpact: impact,
    clinicalImmunogenicityStudyRequired: clinicalRequired,
    studyRecommendation,
    analyticalExpectations,
    bridgingDataNeeds,
    riskFactorsTriggered: triggered,
    notAssessed,
    decisionRationale: rationale,
    citations,
    summary,
  };
}
