/**
 * Combination products — determine whether a product is a combination product and,
 * from its Primary Mode of Action (PMOA), the FDA lead review center and the EU
 * pathway considerations.
 *
 * WHY THIS EXISTS (audit gap): drug-device / drug-biologic / device-biologic
 * combination products are a distinct regulatory animal with their own assignment
 * rules, and the platform modelled none of it. This applies the deterministic
 * 21 CFR Part 3 logic: a product combining ≥2 component types is a combination
 * product; the PMOA component sets the FDA lead center (drug→CDER, biologic→CBER,
 * device→CDRH). It also surfaces the EU consideration (MDR Article 117 / medicines
 * framework) and the practical considerations (RFD, 21 CFR Part 4 cGMP).
 *
 * HONESTY: reflects 21 CFR Part 3/4 and the EU MDR Article 117 structure. When the
 * PMOA is not established it recommends a Request for Designation (RFD) rather than
 * guessing — the agency's designation is the authority, not this module.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/combination-products
 */

export type ComponentType = 'drug' | 'biologic' | 'device';
export type CombinationType = 'single_entity' | 'co_packaged' | 'cross_labeled';
export type FdaLeadCenter = 'CDER' | 'CBER' | 'CDRH';

export interface CombinationProductInput {
  /** The constituent component types (e.g. ['drug','device']). */
  components: ComponentType[];
  /** The component providing the Primary Mode of Action, if established. */
  primaryModeOfAction?: ComponentType;
  combinationType?: CombinationType;
}

const PMOA_TO_CENTER: Record<ComponentType, FdaLeadCenter> = {
  drug: 'CDER',
  biologic: 'CBER',
  device: 'CDRH',
};

const CENTER_LABEL: Record<FdaLeadCenter, string> = {
  CDER: 'CDER (Center for Drug Evaluation and Research)',
  CBER: 'CBER (Center for Biologics Evaluation and Research)',
  CDRH: 'CDRH (Center for Devices and Radiological Health)',
};

export interface CombinationProductAssessment {
  isCombination: boolean;
  /** Distinct component types. */
  components: ComponentType[];
  combinationType?: CombinationType;
  fdaLeadCenter?: FdaLeadCenter;
  fdaLeadCenterLabel?: string;
  /** EU consideration for the combination. */
  euConsideration: string;
  /** Practical regulatory considerations. */
  considerations: string[];
  caveat: string;
}

const CAVEAT =
  'Applies the 21 CFR Part 3 assignment logic from the supplied PMOA. The FDA Office of Combination Products (OCP) makes the binding center assignment — file a Request for Designation (RFD) when the PMOA is not clearly established.';

/** EU consideration based on the component mix. */
function euConsideration(components: Set<ComponentType>): string {
  const hasDevice = components.has('device');
  const hasMedicinal = components.has('drug') || components.has('biologic');
  if (hasDevice && hasMedicinal) {
    return 'EU: if the device is integral to a medicinal product, the whole is assessed under the medicines framework with a Notified Body opinion on the device part (MDR Article 117 / Directive 2001/83 Annex I §12). If a medicinal substance is ancillary to a device, it is an MDR device (Rule 14) with a competent-authority consultation.';
  }
  return 'EU: single-framework product — assessed under the applicable medicines or MDR/IVDR framework for its type.';
}

/**
 * Assess a (possible) combination product. Deterministic: ≥2 distinct component
 * types → combination; PMOA → lead center; otherwise recommend an RFD.
 */
export function assessCombinationProduct(input: CombinationProductInput): CombinationProductAssessment {
  const distinct = [...new Set(input.components ?? [])];
  const isCombination = distinct.length >= 2;
  const componentsSet = new Set(distinct);

  const considerations: string[] = [];
  let fdaLeadCenter: FdaLeadCenter | undefined;

  if (isCombination) {
    considerations.push('21 CFR Part 4: a streamlined cGMP approach applies (satisfy the drug/device/biologic cGMPs for the constituent parts).');
    if (input.combinationType === 'co_packaged' || input.combinationType === 'cross_labeled') {
      considerations.push('Co-packaged / cross-labeled: each constituent part may also retain its own marketing application; coordinate labeling for combined use.');
    }
    if (input.primaryModeOfAction && componentsSet.has(input.primaryModeOfAction)) {
      fdaLeadCenter = PMOA_TO_CENTER[input.primaryModeOfAction];
      considerations.push(`PMOA is the ${input.primaryModeOfAction} constituent → ${CENTER_LABEL[fdaLeadCenter]} leads; the other center(s) consult.`);
    } else {
      considerations.push('PMOA not established → file a Request for Designation (RFD, 21 CFR 3.7) so OCP assigns the lead center.');
    }
  } else {
    considerations.push('Single-component product — not a combination product; follow the standard pathway for its type.');
  }

  return {
    isCombination,
    components: distinct,
    combinationType: input.combinationType,
    fdaLeadCenter,
    fdaLeadCenterLabel: fdaLeadCenter ? CENTER_LABEL[fdaLeadCenter] : undefined,
    euConsideration: euConsideration(componentsSet),
    considerations,
    caveat: CAVEAT,
  };
}

export default { assessCombinationProduct };
