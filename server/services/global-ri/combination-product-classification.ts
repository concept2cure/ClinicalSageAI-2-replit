/**
 * Combination-product / drug-device classification expert — FDA & EU.
 *
 * A drug-device (or biologic-device) combination must be slotted into the right
 * regulatory framework before anything else: in the US that means identifying
 * the lead FDA Center by Primary Mode of Action (PMOA); in the EU it means
 * deciding whether the combination is a single integral medicinal product
 * (regulated as a medicine, with the device part evidenced by a Notified Body
 * Opinion under MDR Article 117) or a non-integral combination (the device
 * CE-marked separately). This is the judgement an RA lead makes at program
 * inception and defends with the agency.
 *
 * This service classifies a combination product into that framework per region,
 * returning the lead authority / regulatory route, the deciding factor, and the
 * governing citation — deterministically.
 *
 * Regions: FDA (US), EU.
 *
 * Pure / deterministic — no DB, no IO. The classification is an indicative
 * reference aid; the binding classification rests with the agency (FDA Office of
 * Combination Products via a Request for Designation, or the EU competent
 * authority together with a Notified Body).
 *
 * References:
 *  - FDA: 21 CFR Part 3 — combination-product definition 21 CFR 3.2(e); lead
 *    center assignment by PMOA 21 CFR 3.4 (drug→CDER, biologic→CBER,
 *    device→CDRH); Request for Designation to the Office of Combination Products
 *    (OCP) when the PMOA is unclear (21 CFR Part 3); statutory basis 21 USC
 *    353(g).
 *  - EU: MDR (EU) 2017/745 Article 117 (Notified Body Opinion on the device part
 *    of a single integral drug-device combination), which amended Annex I of
 *    Directive 2001/83/EC; device General Safety and Performance Requirements
 *    (GSPR) under the MDR.
 *
 * @module server/services/global-ri/combination-product-classification
 */

export type CombinationRegion = 'FDA' | 'EU';

/** Primary Mode of Action of the combination product (drives FDA lead center). */
export type PrimaryModeOfAction = 'drug' | 'biologic' | 'device';

/** FDA lead center, or OCP (RFD) when the PMOA is unclear. */
export type FdaLeadCenter = 'CDER' | 'CBER' | 'CDRH' | 'OCP (RFD)';

/** EU regulatory route for a drug-device combination. */
export type EuRegulatoryRoute =
  | 'Medicinal product (integral, MDR Art 117 NBOp)'
  | 'Medicinal product + separately CE-marked device (non-integral)';

export interface CombinationFramework {
  region: CombinationRegion;
  /** The legal basis of the regional framework. */
  basis: string;
  /** Whether the region uses a single "lead authority/center" concept, and how. */
  leadAuthorityConcept: string;
  /** The factor that decides the classification in this region. */
  decisionFactor: string;
  /** How the other authority/center (or Notified Body) is engaged. */
  consultationMechanism: string;
  citation: string;
  notes: string[];
}

const FRAMEWORKS: Record<CombinationRegion, CombinationFramework> = {
  FDA: {
    region: 'FDA',
    basis: 'A combination product (21 CFR 3.2(e)) is assigned to a lead FDA Center by its Primary Mode of Action (PMOA) per 21 CFR 3.4.',
    leadAuthorityConcept: 'Single lead Center (CDER, CBER, or CDRH) determined by PMOA; a single marketing application is generally submitted to the lead center.',
    decisionFactor: 'Primary Mode of Action (PMOA): drug → CDER, biological product → CBER, device → CDRH.',
    consultationMechanism: 'The lead center has primary jurisdiction; the other center consults on the secondary mode of action. If the PMOA is unclear, the sponsor may file a Request for Designation (RFD) to the Office of Combination Products (OCP), which assigns the lead center.',
    citation: '21 CFR Part 3 (3.2(e), 3.4); 21 USC 353(g)',
    notes: [
      'When the PMOA is not reasonably certain, file a Request for Designation (RFD) with the Office of Combination Products (OCP) per 21 CFR Part 3.',
      'Final classification and lead-center assignment rest with FDA (the Office of Combination Products).',
    ],
  },
  EU: {
    region: 'EU',
    basis: 'The EU has no "combination product lead center" concept. A single integral drug-device combination is regulated as a MEDICINAL product; the device part must meet the relevant MDR General Safety and Performance Requirements (GSPR).',
    leadAuthorityConcept: 'No single lead-center concept. Classification turns on whether the device is integral to (a single product with) the medicinal product or supplied separately.',
    decisionFactor: 'Whether the device is integral / forms a single integral product (e.g. prefilled syringe, pen injector) versus non-integral (co-packaged or separately supplied).',
    consultationMechanism: 'For an integral combination, a Notified Body issues an Opinion (NBOp) on the device part\'s conformity with the relevant GSPR under MDR Article 117 (which amended Annex I of Directive 2001/83/EC); the medicinal product is authorised under the medicines framework. For a non-integral combination, the device is CE-marked separately under the MDR.',
    citation: 'MDR (EU) 2017/745 Art 117; Directive 2001/83/EC Annex I',
    notes: [
      'Integral (single integral product) → regulated as a medicine; device part evidenced by a Notified Body Opinion under MDR Article 117.',
      'Non-integral (co-packaged / separately supplied) → device CE-marked separately under the MDR; medicinal product authorised under the medicines framework.',
      'Final classification rests with the EU competent authority together with the Notified Body.',
    ],
  },
};

const AGENCY_CAVEAT =
  'Indicative classification only — the final classification rests with the agency (FDA Office of Combination Products via an RFD / EU competent authority together with a Notified Body).';

/**
 * Return the modeled combination-product framework for a region.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getCombinationFramework(region: CombinationRegion): CombinationFramework {
  const framework = FRAMEWORKS[region];
  if (!framework) throw new Error(`No combination-product framework modeled for region "${region}".`);
  return framework;
}

export interface CombinationClassificationInput {
  region: CombinationRegion;
  /** FDA: the Primary Mode of Action. Omitted/unclear → OCP (RFD). */
  primaryModeOfAction?: PrimaryModeOfAction;
  /** EU: whether the device is integral to the medicinal product. Defaults to true. */
  integral?: boolean;
}

export interface FdaCombinationClassification {
  region: 'FDA';
  /** The assigned lead FDA center, or OCP (RFD) when the PMOA is unclear. */
  leadCenter: FdaLeadCenter;
  /** The marketing-application route. */
  route: string;
  /** Why this center / route applies. */
  rationale: string;
  citation: string;
  notes: string[];
}

export interface EuCombinationClassification {
  region: 'EU';
  /** The EU regulatory route for the combination. */
  regulatoryRoute: EuRegulatoryRoute;
  /** The obligation on the device part. */
  deviceObligation: string;
  citation: string;
  notes: string[];
}

export type CombinationClassification =
  | FdaCombinationClassification
  | EuCombinationClassification;

const FDA_PMOA_CENTER: Record<PrimaryModeOfAction, FdaLeadCenter> = {
  drug: 'CDER',
  biologic: 'CBER',
  device: 'CDRH',
};

function classifyFda(input: CombinationClassificationInput): FdaCombinationClassification {
  const pmoa = input.primaryModeOfAction;
  const citation = '21 CFR Part 3 (3.2(e), 3.4); 21 USC 353(g)';

  if (!pmoa) {
    return {
      region: 'FDA',
      leadCenter: 'OCP (RFD)',
      route: 'Request for Designation (RFD) to the Office of Combination Products to determine the lead center.',
      rationale: 'The Primary Mode of Action is unclear; under 21 CFR Part 3 the sponsor may submit an RFD to OCP, which assigns the lead center.',
      citation,
      notes: [
        'File a Request for Designation (RFD) with the Office of Combination Products (OCP) to obtain the lead-center assignment (21 CFR Part 3).',
        AGENCY_CAVEAT,
      ],
    };
  }

  const leadCenter = FDA_PMOA_CENTER[pmoa];
  const pmoaLabel = pmoa === 'biologic' ? 'biological product' : pmoa;
  return {
    region: 'FDA',
    leadCenter,
    route: `Single marketing application to the lead center (${leadCenter}); the other center consults on the secondary mode of action.`,
    rationale: `The Primary Mode of Action is ${pmoaLabel}, so the lead center is ${leadCenter} per 21 CFR 3.4.`,
    citation,
    notes: [
      'Lead-center assignment follows the Primary Mode of Action (21 CFR 3.4); the secondary center consults.',
      'If the PMOA were not reasonably certain, a Request for Designation (RFD) to OCP would resolve the assignment.',
      AGENCY_CAVEAT,
    ],
  };
}

function classifyEu(input: CombinationClassificationInput): EuCombinationClassification {
  const integral = input.integral ?? true;
  const citation = 'MDR (EU) 2017/745 Art 117; Directive 2001/83/EC Annex I';

  if (integral) {
    return {
      region: 'EU',
      regulatoryRoute: 'Medicinal product (integral, MDR Art 117 NBOp)',
      deviceObligation:
        'The device part must meet the relevant MDR General Safety and Performance Requirements (GSPR), evidenced by a Notified Body Opinion (NBOp) under MDR Article 117; the product is authorised under the medicines framework.',
      citation,
      notes: [
        'A single integral drug-device combination (e.g. prefilled syringe, pen injector) is regulated as a medicinal product.',
        'MDR Article 117 amended Annex I of Directive 2001/83/EC to require a Notified Body Opinion on the device part for an integral combination.',
        AGENCY_CAVEAT,
      ],
    };
  }

  return {
    region: 'EU',
    regulatoryRoute: 'Medicinal product + separately CE-marked device (non-integral)',
    deviceObligation:
      'The device is CE-marked separately under the MDR (full device conformity assessment); the medicinal product is authorised under the medicines framework.',
    citation,
    notes: [
      'A non-integral combination (co-packaged or separately supplied device) keeps the device and the medicine on separate regulatory tracks.',
      'The device follows the full MDR conformity-assessment / CE-marking route in its own right.',
      AGENCY_CAVEAT,
    ],
  };
}

/**
 * Classify a combination product into its regional regulatory framework.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function classifyCombinationProduct(
  input: CombinationClassificationInput,
): CombinationClassification {
  if (input.region === 'FDA') return classifyFda(input);
  if (input.region === 'EU') return classifyEu(input);
  throw new Error(`No combination-product classification modeled for region "${input.region}".`);
}

/** The set of modeled regions. */
export const COMBINATION_REGIONS: CombinationRegion[] = ['FDA', 'EU'];
