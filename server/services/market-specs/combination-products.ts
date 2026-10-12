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
 * ONE ENGINE: whether the product is a combination product (21 CFR 3.2(e)) and
 * which Center leads it (21 CFR 3.2(m), 3.4) are read from the canonical engine,
 * server/services/combination-products/combination-products-knowledge.ts
 * (classifyCombinationProduct, determinePrimaryModeOfAction). This module adapts
 * those answers to the assessment shape served by AnA's assess_combination_product
 * and the submissions route; it holds no PMOA → Center map of its own.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/combination-products
 */

import {
  classifyCombinationProduct,
  determinePrimaryModeOfAction,
  type ClassifyParams,
  type ConstituentType,
  type FdaCenter,
} from '../combination-products/combination-products-knowledge';

export type ComponentType = ConstituentType;
export type CombinationType = 'single_entity' | 'co_packaged' | 'cross_labeled';
export type FdaLeadCenter = FdaCenter;

export interface CombinationProductInput {
  /** The constituent component types (e.g. ['drug','device']). */
  components: ComponentType[];
  /** The component providing the Primary Mode of Action, if established. */
  primaryModeOfAction?: ComponentType;
  combinationType?: CombinationType;
}

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

/** The canonical engine's 3.2(e) relationship for this module's combination type. */
function relationshipOf(type: CombinationType | undefined): Pick<ClassifyParams, 'relationship' | 'crossLabeled'> {
  if (type === 'co_packaged') return { relationship: 'co-packaged' };
  if (type === 'cross_labeled') return { relationship: 'separately-marketed', crossLabeled: true };
  return { relationship: 'physically-combined' };
}

/**
 * Assess a (possible) combination product. Deterministic: combination status from
 * the canonical 21 CFR 3.2(e) classifier (two or more different article types);
 * a PMOA that is one of the components → the canonical lead Center; otherwise an RFD.
 */
export function assessCombinationProduct(input: CombinationProductInput): CombinationProductAssessment {
  const distinct = [...new Set(input.components ?? [])];
  const { isCombinationProduct: isCombination } = classifyCombinationProduct({
    constituentTypes: distinct,
    ...relationshipOf(input.combinationType),
  });
  const componentsSet = new Set(distinct);

  const considerations: string[] = [];
  let fdaLeadCenter: FdaLeadCenter | undefined;

  if (isCombination) {
    considerations.push('21 CFR Part 4: a streamlined cGMP approach applies (satisfy the drug/device/biologic cGMPs for the constituent parts).');
    if (input.combinationType === 'co_packaged' || input.combinationType === 'cross_labeled') {
      considerations.push('Co-packaged / cross-labeled: each constituent part may also retain its own marketing application; coordinate labeling for combined use.');
    }
    if (input.primaryModeOfAction && componentsSet.has(input.primaryModeOfAction)) {
      fdaLeadCenter = determinePrimaryModeOfAction({
        constituents: distinct.map((type) => ({ type })),
        assertedPmoaType: input.primaryModeOfAction,
      }).leadCenter;
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
