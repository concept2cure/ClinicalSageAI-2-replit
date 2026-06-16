/**
 * Global-RI tool adapter — exposes the deterministic global regulatory-intelligence
 * experts to the platform's AI assistant (AnA) as callable tools.
 *
 * AnA must NOT hallucinate regulatory rules. Instead of asking the model to recall
 * pathways, exclusivity periods, fees, change vehicles, etc., this barrel lets AnA
 * call the underlying global-RI services directly and return their structured,
 * registry-derived results verbatim.
 *
 * HONEST BY CONSTRUCTION:
 *   - No LLM is involved here. Every result is produced by a pure, deterministic
 *     lookup/computation over encoded regulatory frameworks (statutes, ICH/WHO
 *     guidance, agency fee schedules, climatic zones, etc.).
 *   - Identical input always yields identical output; nothing is fabricated. Where a
 *     service has no encoded answer it says so (or throws), and the caller surfaces
 *     that honestly rather than guessing.
 *
 * Each tool's `input_schema` mirrors the matching service's input interface, the
 * dispatcher routes a tool name to its service function, and the service's own
 * structured result object is returned unchanged (NOT stringified). The parent
 * handler is responsible for catching any error a service throws on bad input.
 *
 * @module server/services/global-ri/ana-tools
 */

import type { AnaAdvisoryToolSpec } from '../ana-advisory/types';

import { recommendPathway, type PathwayAdvisorInput } from './regulatory-pathway-advisor';
import { buildStrategyBrief, type StrategyBriefInput } from './regulatory-strategy-brief';
import { computeExclusivity, type ExclusivityInput } from './exclusivity-periods';
import { classifyDossier, type DossierClassifierInput } from './dossier-classifier';
import { matchExpeditedPrograms, type MatchInput } from './expedited-programs';
import { assessDesignationEligibility, type DesignationInput } from './special-designations';
import { estimateFees, type FeeEstimateInput } from './regulatory-fee-estimator';
import { classifyChange, type ChangeClassificationInput } from './post-approval-changes';
import { classifyDevicePathway, type DeviceClassificationInput } from './device-classification';
import { classifySafetyReport, type SafetyReportInput } from './clinical-safety-reporting';
import { getStabilityConditions, type StorageCondition } from './stability-requirements';
import { computeObligationSchedule, type ObligationScheduleInput } from './lifecycle-obligations-calendar';
import { assessPediatricPlan, type PediatricPlanInput } from './pediatric-requirements';
import { recommendReliancePathways, type ReliancePathwayInput } from './reliance-pathways';
import { getSpecificationTests, type SpecificationTestsInput } from './cmc-specifications';
import { getBioequivalenceCriteria, getBcsBiowaiverEligibility, type BeRegion, type BcsClass } from './bioequivalence-requirements';

// ─────────────────────────────────────────────────────────────────────────────
// Tool specs — one per curated global-RI capability. Each input_schema mirrors the
// matching service's input interface (field names/types). Descriptions state the
// service is deterministic / registry-grounded (no fabrication) and what it returns.
// ─────────────────────────────────────────────────────────────────────────────

const REGULATORY_PATHWAY_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_regulatory_pathway',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of the regulatory pathway for a product ' +
    'across target markets. Returns, per market, the clinical-trial authorisation pathway (IND/CTA/CTN/CTX), the ' +
    'marketing-application pathway (NDA/BLA/MAA, etc.), the responsible agency, and strategic framework notes.',
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: ['small_molecule_nce', 'biologic', 'biosimilar', 'generic', 'vaccine', 'cell_gene_therapy'],
        description: 'Product archetype whose pathway differs materially.',
      },
      targetMarkets: {
        type: 'array',
        items: { type: 'string', enum: ['US', 'EU', 'JP', 'CA', 'UK', 'AU'] },
        description: 'Target markets/jurisdictions; recommendations preserve this order.',
      },
      developmentPhase: {
        type: 'string',
        enum: ['preclinical', 'phase1', 'phase2', 'phase3', 'filed'],
        description: 'Optional development phase context (refines the general notes only).',
      },
    },
    required: ['productType', 'targetMarkets'],
  },
};

const STRATEGY_BRIEF_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_strategy_brief',
  description:
    'Deterministic, registry-grounded cross-market regulatory strategy brief (no LLM, no fabrication) composing the ' +
    'global-RI experts. Returns, per target market, the recommended pathway, orphan/pediatric designations, matching ' +
    'expedited programs, recommended HA meetings, Module 1 / CTA / labeling checklists, indicative fees, exclusivity, ' +
    'pediatric-plan and pharmacovigilance obligations, plus a cross-market summary.',
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: ['small_molecule_nce', 'biologic', 'biosimilar', 'generic', 'vaccine', 'cell_gene_therapy'],
        description: 'Product archetype.',
      },
      targetMarkets: {
        type: 'array',
        items: { type: 'string', enum: ['US', 'EU', 'JP', 'CA', 'UK', 'AU'] },
        description: 'Target markets; market sections follow this order.',
      },
      developmentPhase: {
        type: 'string',
        enum: ['preclinical', 'phase1', 'phase2', 'phase3', 'filed'],
        description: 'Optional development phase context.',
      },
      nextMilestone: {
        type: 'string',
        description: 'The next development milestone to plan a health-authority meeting for.',
      },
      disease: {
        type: 'object',
        description: 'Optional disease profile used for orphan/expedited eligibility.',
        properties: {
          usPrevalence: { type: 'number', description: 'Estimated US prevalence (persons).' },
          euPrevalencePer10k: { type: 'number', description: 'Estimated EU prevalence per 10,000.' },
          jpPrevalence: { type: 'number', description: 'Estimated Japan prevalence (patients).' },
          seriousOrLifeThreatening: { type: 'boolean', description: 'Serious / life-threatening condition.' },
          noSatisfactoryTreatment: { type: 'boolean', description: 'No satisfactory authorised treatment exists.' },
          significantBenefit: { type: 'boolean', description: 'Significant benefit over existing methods.' },
          unmetMedicalNeed: { type: 'boolean', description: 'Addresses an unmet medical need.' },
        },
      },
      pediatricDevelopment: {
        type: 'boolean',
        description: 'Whether the program includes pediatric development.',
      },
    },
    required: ['productType', 'targetMarkets'],
  },
};

const EXCLUSIVITY_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_exclusivity',
  description:
    'Deterministic, statute-grounded computation (no LLM, no fabrication) of regulatory exclusivity and the projected ' +
    'loss-of-exclusivity (LOE) date for a product in a market. Returns the exclusivity components, the binding ' +
    '(longest) duration in months (bindingMonths), the binding type, the LOE date when an approval date is supplied, ' +
    'and caveats.',
  input_schema: {
    type: 'object',
    properties: {
      market: { type: 'string', enum: ['FDA', 'EMA', 'PMDA'], description: 'Exclusivity market.' },
      productClass: {
        type: 'string',
        enum: ['new_chemical_entity', 'biologic', 'new_indication', 'generic_or_biosimilar'],
        description: 'Product class driving the exclusivity regime.',
      },
      orphan: { type: 'boolean', description: 'Whether the product holds orphan designation in this market.' },
      pediatricExtension: { type: 'boolean', description: 'Whether a qualifying pediatric study/PIP earns the extension.' },
      approvalDate: { type: 'string', description: 'Approval date (ISO yyyy-mm-dd) to project the LOE date from.' },
    },
    required: ['market', 'productClass'],
  },
};

const DOSSIER_CLASSIFIER_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_dossier_classifier',
  description:
    'Deterministic, regulation-grounded classifier (no LLM, no fabrication) of a marketing-application legal basis / ' +
    'dossier type for FDA or EU. Returns the legal basis (e.g. 505(b)(2), Article 10(3)), the dossier type, what it ' +
    'permits the applicant to rely on, the data still required, the governing citation, and notes.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['FDA', 'EU'], description: 'Region whose legal-basis framework to apply.' },
      isBiologic: { type: 'boolean', description: 'True for a biological product (drives BLA / biosimilar routes).' },
      referencesApprovedProduct: { type: 'boolean', description: 'True if the product is a copy of an approved reference product.' },
      reliesOnOthersData: { type: 'boolean', description: 'True if relying (in part) on data the applicant does not own.' },
      differsFromReference: { type: 'boolean', description: 'True if the copy differs from the reference (drives hybrid vs generic).' },
      wellEstablishedUse: { type: 'boolean', description: 'True if relying solely on bibliographic well-established use.' },
      fixedCombination: { type: 'boolean', description: 'True for a fixed-dose combination of known actives.' },
      informedConsent: { type: 'boolean', description: 'True if filing with the existing MAH\'s consent to their dossier.' },
    },
    required: ['region'],
  },
};

const EXPEDITED_PROGRAMS_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_expedited_programs',
  description:
    'Deterministic, guidance-grounded eligibility screen (no LLM, no fabrication) matching a development context to the ' +
    'expedited / accelerated programs of one region (FDA / EMA / PMDA). Returns the eligible programs with rationale and ' +
    'the not-suitable programs with reasons, both ordered by program id.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['FDA', 'EMA', 'PMDA'], description: 'Agency whose expedited programs to screen.' },
      seriousOrLifeThreatening: { type: 'boolean', description: 'Serious or life-threatening condition.' },
      unmetMedicalNeed: { type: 'boolean', description: 'Addresses an unmet medical need.' },
      substantialImprovementOverExisting: { type: 'boolean', description: 'Substantial improvement over existing therapy.' },
      preliminaryClinicalEvidence: { type: 'boolean', description: 'Preliminary clinical evidence is available.' },
      surrogateEndpointReasonablyLikely: { type: 'boolean', description: 'Surrogate endpoint reasonably likely to predict benefit.' },
      regenerativeMedicine: { type: 'boolean', description: 'Product is a regenerative medicine therapy.' },
      orphan: { type: 'boolean', description: 'Product would qualify as an orphan drug.' },
      majorPublicHealthInterest: { type: 'boolean', description: 'Of major public-health interest (EMA Accelerated Assessment).' },
      comprehensiveDataUnobtainable: { type: 'boolean', description: 'Comprehensive data cannot be obtained (EMA Exceptional Circ.).' },
      intendedForEarlyJapanDevelopment: { type: 'boolean', description: 'Intended for early/world-first Japan development (Sakigake).' },
    },
    required: ['region'],
  },
};

const SPECIAL_DESIGNATIONS_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_special_designations',
  description:
    'Deterministic, statute-grounded assessment (no LLM, no fabrication) of orphan + pediatric designation eligibility ' +
    'for a market (FDA / EMA / PMDA). Returns the orphan assessment (eligible + rationale), pediatric assessment when ' +
    'pediatric development is declared, the eligible designations, and notes. Declines to guess when prevalence is missing.',
  input_schema: {
    type: 'object',
    properties: {
      market: { type: 'string', enum: ['FDA', 'EMA', 'PMDA'], description: 'Market whose designation criteria to apply.' },
      usPrevalence: { type: 'number', description: 'Estimated US prevalence (persons).' },
      euPrevalencePer10k: { type: 'number', description: 'Estimated EU prevalence per 10,000.' },
      jpPrevalence: { type: 'number', description: 'Estimated Japan prevalence (patients).' },
      seriousOrLifeThreatening: { type: 'boolean', description: 'Life-threatening / seriously debilitating condition.' },
      noSatisfactoryTreatment: { type: 'boolean', description: 'No satisfactory authorised treatment exists.' },
      significantBenefit: { type: 'boolean', description: 'Significant benefit over existing methods.' },
      pediatricDevelopment: { type: 'boolean', description: 'Whether the program includes pediatric development.' },
    },
    required: ['market'],
  },
};

const FEE_ESTIMATE_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_fee_estimate',
  description:
    'Deterministic, schedule-grounded estimate (no LLM, no fabrication) of indicative agency fees for a marketing ' +
    'application in a market (FDA / EMA / PMDA / Health Canada), applying orphan / small-business waivers. Returns the ' +
    'currency, the fee line items (with waived flags), the total of non-waived items, and caveats (figures are indicative).',
  input_schema: {
    type: 'object',
    properties: {
      market: { type: 'string', enum: ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA'], description: 'Market whose fee schedule to apply.' },
      requiresClinicalData: { type: 'boolean', description: 'Whether the application requires clinical data (drives the application fee).' },
      orphan: { type: 'boolean', description: 'Orphan designation — exempts the marketing-application fee.' },
      smallBusiness: { type: 'boolean', description: 'Small-business / SME status — FDA waiver / EMA reductions.' },
      programYears: { type: 'number', description: 'Years of the annual program/maintenance fee to include (default 1).' },
      feeScheduleOverride: {
        type: 'object',
        description: 'Optional override of the indicative schedule for this market.',
        properties: {
          currency: { type: 'string' },
          applicationWithClinicalData: { type: 'number' },
          applicationNoClinicalData: { type: 'number' },
          annualProgramFee: { type: 'number' },
        },
      },
    },
    required: ['market'],
  },
};

const POST_APPROVAL_CHANGE_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_post_approval_change',
  description:
    'Deterministic, regulation-grounded classifier (no LLM, no fabrication) of a post-approval change into the correct ' +
    'filing vehicle for a market (FDA / EMA / PMDA / Health Canada). Returns the vehicle, reporting category, whether ' +
    'prior approval is required, the implementation timing, the citation, and notes.',
  input_schema: {
    type: 'object',
    properties: {
      market: { type: 'string', enum: ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA'], description: 'Market whose variation framework to apply.' },
      category: {
        type: 'string',
        enum: [
          'manufacturing_site',
          'manufacturing_process_major',
          'manufacturing_process_minor',
          'specification_tightening',
          'specification_relaxation',
          'analytical_method',
          'shelf_life_extension',
          'labeling_safety',
          'labeling_administrative',
          'new_indication',
          'formulation_change',
          'container_closure',
        ],
        description: 'The post-approval change category to classify.',
      },
    },
    required: ['market', 'category'],
  },
};

const DEVICE_CLASSIFICATION_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_device_classification',
  description:
    'Deterministic, rule-grounded classifier (no LLM, no fabrication) of a medical device / IVD market pathway given its ' +
    'region and declared risk class. Returns the premarket pathway, the conformity-assessment route, whether a Notified ' +
    'Body is required, the citation, and notes.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['FDA', 'EU_MDR', 'EU_IVDR'], description: 'Device region / framework.' },
      deviceClass: {
        type: 'string',
        description: 'Declared risk class. FDA: I|II|III; EU_MDR: I|IIa|IIb|III; EU_IVDR: A|B|C|D.',
      },
    },
    required: ['region', 'deviceClass'],
  },
};

const SAFETY_REPORTING_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_safety_reporting',
  description:
    'Deterministic, ICH-E2A-grounded classifier (no LLM, no fabrication) of a single investigational safety case into its ' +
    'expedited reporting vehicle and timeline for a region (FDA / EU). Returns whether it is reportable (serious AND ' +
    'unexpected AND suspected causality), the report type, the timeline in calendar days (7 or 15), the rationale, and notes.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['FDA', 'EU'], description: 'Investigational safety-reporting region.' },
      serious: { type: 'boolean', description: 'Whether the case is serious.' },
      unexpected: { type: 'boolean', description: 'Whether the reaction is unexpected.' },
      suspectedCausality: { type: 'boolean', description: 'Whether a suspected (reasonably possible) causal relationship exists.' },
      fatalOrLifeThreatening: { type: 'boolean', description: 'Whether the event was fatal or life-threatening (sets the 7-day clock).' },
    },
    required: ['region'],
  },
};

const STABILITY_CONDITIONS_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_stability_conditions',
  description:
    'Deterministic, ICH-Q1A(R2)-grounded lookup (no LLM, no fabrication) of the stability storage conditions for a storage ' +
    'category. Returns the long-term condition (longTerm), the intermediate and accelerated conditions (where applicable), ' +
    'the citation, and notes.',
  input_schema: {
    type: 'object',
    properties: {
      storageCondition: {
        type: 'string',
        enum: ['room', 'refrigerated', 'frozen'],
        description: 'The storage-condition category to look up.',
      },
    },
    required: ['storageCondition'],
  },
};

const LIFECYCLE_SCHEDULE_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_lifecycle_schedule',
  description:
    'Deterministic, regulation-grounded projection (no LLM, no fabrication) of a market\'s recurring post-approval ' +
    'lifecycle obligations into a concrete due-date calendar from an approval date (FDA / EMA / PMDA). Returns the dated ' +
    'schedule entries (sorted by due date), the horizon, and caveats.',
  input_schema: {
    type: 'object',
    properties: {
      market: { type: 'string', enum: ['FDA', 'EMA', 'PMDA'], description: 'Market whose lifecycle obligations to project.' },
      approvalDate: { type: 'string', description: 'Approval/launch date in ISO yyyy-mm-dd; the calendar anchor.' },
      horizonMonths: { type: 'number', description: 'Project obligations due within this many months (default 60).' },
    },
    required: ['market', 'approvalDate'],
  },
};

const PEDIATRIC_PLAN_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_pediatric_plan',
  description:
    'Deterministic, regulation-grounded assessment (no LLM, no fabrication) of a program\'s pediatric study-plan posture for ' +
    'a market (FDA iPSP / EMA PIP / PMDA). Returns whether a plan is required, the plan name, the due timing, the status, ' +
    'ordered next-step actions, and notes.',
  input_schema: {
    type: 'object',
    properties: {
      market: { type: 'string', enum: ['FDA', 'EMA', 'PMDA'], description: 'Market whose pediatric-plan obligation to assess.' },
      triggersRequirement: { type: 'boolean', description: 'Whether the application triggers the pediatric-plan requirement (default true for FDA/EMA).' },
      planSubmitted: { type: 'boolean', description: 'Whether the pediatric plan (iPSP/PIP) has been submitted/agreed.' },
      waiverRequested: { type: 'boolean', description: 'Whether a waiver of pediatric studies has been requested.' },
      deferralRequested: { type: 'boolean', description: 'Whether a deferral of pediatric studies has been requested.' },
    },
    required: ['market'],
  },
};

const RELIANCE_PATHWAYS_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_reliance_pathways',
  description:
    'Deterministic, catalog-grounded recommender (no LLM, no fabrication) of international reliance / work-sharing / ' +
    'collaborative-registration pathways (Project Orbis, Access Consortium, EU-M4all, WHO CRP, ASEAN Joint Assessment, ' +
    'Swissmedic MAGHP) for a development context. Returns the eligible pathways (sorted by id), the count, and a 1:1 rationale list.',
  input_schema: {
    type: 'object',
    properties: {
      isOncology: { type: 'boolean', description: 'Product is an oncology product (Project Orbis).' },
      targetMarkets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Target markets/markers (e.g. AU, CA, SG, CH, UK, BR, global-health, ASEAN, LMIC).',
      },
      globalHealth: { type: 'boolean', description: 'Product is a global-health product (priority disease / LMIC focus).' },
    },
    required: [],
  },
};

const CMC_SPECIFICATIONS_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_cmc_specifications',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of the ICH Q6A/Q6B specification TEST set ' +
    'for a drug substance/product. Returns the universal tests plus the dosage-form-specific tests (e.g. solid-oral ' +
    'dissolution + uniformity of dosage units; parenteral sterility + endotoxins). Lists the expected tests, not numeric limits.',
  input_schema: {
    type: 'object',
    properties: {
      productType: { type: 'string', enum: ['small_molecule', 'biologic'], description: 'Chemical (Q6A) or biological (Q6B) product.' },
      dosageForm: { type: 'string', enum: ['solid_oral', 'oral_liquid', 'parenteral'], description: 'Optional dosage form for form-specific tests.' },
    },
    required: ['productType'],
  },
};

const BIOEQUIVALENCE_CRITERIA_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_bioequivalence_criteria',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of the bioequivalence acceptance criteria for ' +
    'a region (FDA/EMA): the PK parameters, the 90% confidence interval acceptance range (80.00–125.00%), the typical ' +
    'crossover design, and the highly-variable-drug approach (RSABE/ABEL).',
  input_schema: {
    type: 'object',
    properties: { region: { type: 'string', enum: ['FDA', 'EMA'], description: 'Regulatory region.' } },
    required: ['region'],
  },
};

const BCS_BIOWAIVER_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_bcs_biowaiver',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of ICH M9 BCS biowaiver eligibility for a BCS ' +
    'class (I/II/III/IV): whether an in-vivo BE study can be waived, with the solubility/permeability profile and conditions.',
  input_schema: {
    type: 'object',
    properties: { bcsClass: { type: 'string', enum: ['I', 'II', 'III', 'IV'], description: 'Biopharmaceutics Classification System class.' } },
    required: ['bcsClass'],
  },
};

/**
 * All global-RI tool specs AnA can register. The order is stable and the names
 * are unique.
 */
export const GLOBAL_RI_TOOL_SPECS: AnaAdvisoryToolSpec[] = [
  REGULATORY_PATHWAY_TOOL,
  STRATEGY_BRIEF_TOOL,
  EXCLUSIVITY_TOOL,
  DOSSIER_CLASSIFIER_TOOL,
  EXPEDITED_PROGRAMS_TOOL,
  SPECIAL_DESIGNATIONS_TOOL,
  FEE_ESTIMATE_TOOL,
  POST_APPROVAL_CHANGE_TOOL,
  DEVICE_CLASSIFICATION_TOOL,
  SAFETY_REPORTING_TOOL,
  STABILITY_CONDITIONS_TOOL,
  LIFECYCLE_SCHEDULE_TOOL,
  PEDIATRIC_PLAN_TOOL,
  RELIANCE_PATHWAYS_TOOL,
  CMC_SPECIFICATIONS_TOOL,
  BIOEQUIVALENCE_CRITERIA_TOOL,
  BCS_BIOWAIVER_TOOL,
];

/** The 14 global-RI tool names, derived from {@link GLOBAL_RI_TOOL_SPECS}. */
export const GLOBAL_RI_TOOL_NAMES: string[] = GLOBAL_RI_TOOL_SPECS.map((s) => s.name);

const TOOL_NAME_SET: ReadonlySet<string> = new Set(GLOBAL_RI_TOOL_NAMES);

/** Whether `name` is one of the registered global-RI tools. */
export function isGlobalRiTool(name: string): boolean {
  return TOOL_NAME_SET.has(name);
}

/**
 * Route a global-RI tool call to its deterministic service and return the service's
 * structured result object (NOT stringified). Input is passed through to the service
 * cast as its input type; the service throws on bad input and the parent handler is
 * expected to catch. Throws for an unknown tool name.
 */
export function dispatchGlobalRiTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case 'global_ri_regulatory_pathway':
      return recommendPathway(input as unknown as PathwayAdvisorInput);
    case 'global_ri_strategy_brief':
      return buildStrategyBrief(input as unknown as StrategyBriefInput);
    case 'global_ri_exclusivity':
      return computeExclusivity(input as unknown as ExclusivityInput);
    case 'global_ri_dossier_classifier':
      return classifyDossier(input as unknown as DossierClassifierInput);
    case 'global_ri_expedited_programs':
      return matchExpeditedPrograms(input as unknown as MatchInput);
    case 'global_ri_special_designations':
      return assessDesignationEligibility(input as unknown as DesignationInput);
    case 'global_ri_fee_estimate':
      return estimateFees(input as unknown as FeeEstimateInput);
    case 'global_ri_post_approval_change':
      return classifyChange(input as unknown as ChangeClassificationInput);
    case 'global_ri_device_classification':
      return classifyDevicePathway(input as unknown as DeviceClassificationInput);
    case 'global_ri_safety_reporting':
      return classifySafetyReport(input as unknown as SafetyReportInput);
    case 'global_ri_stability_conditions':
      return getStabilityConditions((input as unknown as { storageCondition: StorageCondition }).storageCondition);
    case 'global_ri_lifecycle_schedule':
      return computeObligationSchedule(input as unknown as ObligationScheduleInput);
    case 'global_ri_pediatric_plan':
      return assessPediatricPlan(input as unknown as PediatricPlanInput);
    case 'global_ri_reliance_pathways':
      return recommendReliancePathways(input as unknown as ReliancePathwayInput);
    case 'global_ri_cmc_specifications':
      return getSpecificationTests(input as unknown as SpecificationTestsInput);
    case 'global_ri_bioequivalence_criteria':
      return getBioequivalenceCriteria((input as unknown as { region: BeRegion }).region);
    case 'global_ri_bcs_biowaiver':
      return getBcsBiowaiverEligibility((input as unknown as { bcsClass: BcsClass }).bcsClass);
    default:
      throw new Error(`Unknown global-RI tool "${name}"`);
  }
}

export default {
  GLOBAL_RI_TOOL_SPECS,
  GLOBAL_RI_TOOL_NAMES,
  isGlobalRiTool,
  dispatchGlobalRiTool,
};
