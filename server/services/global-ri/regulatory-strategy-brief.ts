/**
 * Regulatory strategy brief — the cross-market RA strategist's one-call deliverable.
 *
 * Composes the global-RI expert services into a single, structured strategy brief
 * for a product across its target markets: the recommended pathway, orphan/
 * pediatric designation eligibility, matching expedited programs, the right HA
 * meeting for the next milestone, and the regional Module 1 component checklist —
 * the synthesis a regulatory strategist hands to a program team.
 *
 * Pure / deterministic — it orchestrates the underlying deterministic services
 * and adds no nondeterminism. Each market section degrades gracefully when a
 * sub-service does not model that jurisdiction.
 *
 * @module server/services/global-ri/regulatory-strategy-brief
 */

import { recommendPathway, type ProductType, type Market } from './regulatory-pathway-advisor';
import { assessDesignationEligibility, type DesignationResult } from './special-designations';
import { matchExpeditedPrograms, type MatchFact, type Region as ExpeditedRegion } from './expedited-programs';
import { recommendMeetings, type DevelopmentMilestone, type MeetingType } from './ha-meetings';
import { getRegionalModule1Requirements, type Module1Component, type RegulatoryMarket } from './regional-module1-requirements';
import { getCtaRequirements, type CtaComponent, type CtaMarket } from './clinical-trial-application-requirements';
import { getLabelingRequirements, type LabelingSection, type LabelMarket } from './labeling-requirements';
import { estimateFees, type FeeEstimate, type FeeMarket } from './regulatory-fee-estimator';
import {
  computeExclusivity,
  type ExclusivityComponent,
  type ExclusivityInput,
  type ExclusivityResult,
  type ExclusivityMarket,
  type ProductClass,
} from './exclusivity-periods';
import { assessPediatricPlan, type PediatricMarket, type PediatricPlanAssessment } from './pediatric-requirements';
import { getPvObligations, type PvMarket, type PvObligations } from './pharmacovigilance-obligations';

/** Agency/region code a target market maps to across the RI services. */
const MARKET_AGENCY: Record<Market, string> = {
  US: 'FDA',
  EU: 'EMA',
  JP: 'PMDA',
  CA: 'HEALTH_CANADA',
  UK: 'MHRA',
  AU: 'TGA',
};

const DESIGNATION_MARKETS = new Set(['FDA', 'EMA', 'PMDA']);
const EXPEDITED_REGIONS = new Set(['FDA', 'EMA', 'PMDA']);
const MEETING_MARKETS = new Set(['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA']);
const MODULE1_MARKETS = new Set(['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'MHRA', 'TGA', 'NMPA']);
const CTA_MARKETS = new Set(['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'MHRA']);
const LABELING_MARKETS = new Set(['FDA', 'EMA', 'PMDA']);
const FEE_MARKETS = new Set(['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA']);
const EXCLUSIVITY_MARKETS = new Set(['FDA', 'EMA', 'PMDA']);
const PEDIATRIC_PLAN_MARKETS = new Set(['FDA', 'EMA', 'PMDA']);
const PV_MARKETS = new Set(['FDA', 'EMA', 'PMDA']);

/** Map a product type to the exclusivity regime's product class. */
const PRODUCT_CLASS_BY_TYPE: Record<ProductType, ProductClass> = {
  small_molecule_nce: 'new_chemical_entity',
  biologic: 'biologic',
  vaccine: 'biologic',
  cell_gene_therapy: 'biologic',
  biosimilar: 'generic_or_biosimilar',
  generic: 'generic_or_biosimilar',
};

export interface DiseaseProfile {
  usPrevalence?: number;
  euPrevalencePer10k?: number;
  jpPrevalence?: number;
  seriousOrLifeThreatening?: boolean;
  noSatisfactoryTreatment?: boolean;
  /** Significant benefit over existing methods: the EU orphan criterion (Reg (EC) No 141/2000 Art 3(1)(b)). */
  significantBenefit?: boolean;
  /** Substantial improvement over existing therapy: the expedited-program criterion, a different fact. */
  substantialImprovementOverExisting?: boolean;
  unmetMedicalNeed?: boolean;
}

export interface StrategyBriefInput {
  productType: ProductType;
  targetMarkets: Market[];
  developmentPhase?: 'preclinical' | 'phase1' | 'phase2' | 'phase3' | 'filed';
  /** The next milestone to plan a HA meeting for. */
  nextMilestone?: DevelopmentMilestone;
  disease?: DiseaseProfile;
  pediatricDevelopment?: boolean;
}

/** An exclusivity component the program could add, with what it waits on. Never counted in bindingMonths. */
export interface PotentialExclusivityComponent extends ExclusivityComponent {
  condition: string;
}

export interface MarketStrategy {
  market: Market;
  agency: string;
  pathway: { clinicalTrialPathway: string; marketingApplication: string; agency: string; notes?: string };
  designations: DesignationResult | null;
  /** Programs screened eligible on the stated facts, and those not assessed because a fact they need was not stated. */
  expeditedPrograms: { eligible: { name: string }[]; count: number; notAssessed: { name: string; missing: MatchFact[] }[] } | null;
  recommendedMeetings: MeetingType[];
  module1Checklist: Module1Component[];
  ctaRequirements: CtaComponent[];
  labelingRequirements: LabelingSection[];
  /**
   * Indicative fees with no designation recorded: charged in full; lines an orphan
   * designation would waive say so, and where its fee effect is not modelled that is said.
   */
  feeEstimate: FeeEstimate | null;
  /** The statutory exclusivity for the product class on approval; no orphan designation or pediatric extension counted. */
  exclusivity: ExclusivityResult | null;
  /** Orphan exclusivity / pediatric extension the program could add, each with its condition. Null where exclusivity is not modeled. */
  potentialExclusivity: PotentialExclusivityComponent[] | null;
  /** Extensions the program declared that the exclusivity engine does not assess for this product class, each with why. Null where exclusivity is not modeled. */
  potentialExclusivityNotAssessed: string[] | null;
  pediatricRequirements: PediatricPlanAssessment | null;
  pharmacovigilance: PvObligations | null;
}

export interface RegulatoryStrategyBrief {
  productType: ProductType;
  targetMarkets: Market[];
  markets: MarketStrategy[];
  summary: {
    marketCount: number;
    /** Agencies whose orphan screen is met on the stated facts (a screen, not a designation). */
    orphanEligibleMarkets: string[];
    /** Agencies whose orphan screen was not assessed: a fact it needs was not stated. */
    orphanNotAssessedMarkets: string[];
    /** Expedited programs screened eligible on the stated facts, or null when no target market models them. */
    totalExpeditedPrograms: number | null;
    /** Expedited programs not assessed because a fact they need was not stated, or null when no target market models them. */
    expeditedProgramsNotAssessed: number | null;
    /**
     * The longest statutory exclusivity across the markets that model it (months;
     * potential extensions excluded), or null when no target market models it.
     */
    maxExclusivityMonths: number | null;
  };
  generalNotes: string[];
}

const ORPHAN_EXCLUSIVITY_CONDITION =
  'If orphan designation is granted and still holds at approval: the orphan screen is met on the stated facts, but no designation is recorded.';
const PEDIATRIC_EXTENSION_CONDITION =
  'If the pediatric studies are completed and the extension is granted: pediatric development is declared, but no extension is earned.';

/**
 * The orphan exclusivity and pediatric extension a program could add on top of
 * the statutory base, each with the condition it waits on. The exclusivity
 * engine decides whether a market's extension applies; the components it adds
 * are listed here and kept out of the base result's bindingMonths. An extension
 * the engine does not assess for the class is listed in `notAssessed`, with why
 * (2026-10-15: a generic/biosimilar was listed the FDA +6 months as potential).
 */
function listPotentialExclusivity(
  base: Pick<ExclusivityInput, 'market' | 'productClass'>,
  baseResult: ExclusivityResult,
  orphanScreenMet: boolean,
  pediatricDeclared: boolean,
): { potential: PotentialExclusivityComponent[]; notAssessed: string[] } {
  const added = (from: ExclusivityResult, to: ExclusivityResult): ExclusivityComponent[] => {
    const had = new Set(from.components.map((c) => c.type));
    return to.components.filter((c) => !had.has(c.type));
  };
  const potential: PotentialExclusivityComponent[] = [];
  const notAssessed: string[] = [];
  let reached = baseResult;
  if (orphanScreenMet) {
    const withOrphan = computeExclusivity({ ...base, orphan: true });
    potential.push(...added(reached, withOrphan).map((c) => ({ ...c, condition: ORPHAN_EXCLUSIVITY_CONDITION })));
    reached = withOrphan;
  }
  if (pediatricDeclared) {
    const withPediatric = computeExclusivity({ ...base, orphan: orphanScreenMet, pediatricExtension: true });
    potential.push(...added(reached, withPediatric).map((c) => ({ ...c, condition: PEDIATRIC_EXTENSION_CONDITION })));
    if (withPediatric.pediatricExtension?.status === 'not_assessed') notAssessed.push(withPediatric.pediatricExtension.note);
  }
  return { potential, notAssessed };
}

/**
 * Build the cross-market regulatory strategy brief. Pure / deterministic;
 * market sections follow the input targetMarkets order.
 */
export function buildStrategyBrief(input: StrategyBriefInput): RegulatoryStrategyBrief {
  const pathway = recommendPathway({
    productType: input.productType,
    targetMarkets: input.targetMarkets,
    developmentPhase: input.developmentPhase,
  });
  const pathwayByMarket = new Map(pathway.recommendations.map((r) => [r.market, r]));
  const disease = input.disease ?? {};
  const milestone = input.nextMilestone ?? 'general';

  const markets: MarketStrategy[] = input.targetMarkets.map((market) => {
    const agency = MARKET_AGENCY[market];
    const p = pathwayByMarket.get(market);

    // Designations (orphan/pediatric) — FDA/EMA/PMDA only.
    let designations: DesignationResult | null = null;
    if (DESIGNATION_MARKETS.has(agency)) {
      designations = assessDesignationEligibility({
        market: agency as 'FDA' | 'EMA' | 'PMDA',
        usPrevalence: disease.usPrevalence,
        euPrevalencePer10k: disease.euPrevalencePer10k,
        jpPrevalence: disease.jpPrevalence,
        seriousOrLifeThreatening: disease.seriousOrLifeThreatening,
        noSatisfactoryTreatment: disease.noSatisfactoryTreatment,
        significantBenefit: disease.significantBenefit,
        pediatricDevelopment: input.pediatricDevelopment,
      });
    }
    // A met screen only: nothing in the brief records a granted designation.
    const orphanScreenMet = designations?.orphan.eligible === true;

    // Expedited programs (FDA/EMA/PMDA).
    let expeditedPrograms: MarketStrategy['expeditedPrograms'] = null;
    if (EXPEDITED_REGIONS.has(agency)) {
      // 2026-10-15: substantialImprovementOverExisting was fed disease.significantBenefit
      // (the EU orphan criterion), so an orphan "significant benefit" alone screened FDA
      // Priority Review eligible. They are different criteria, stated separately.
      const match = matchExpeditedPrograms({
        region: agency as ExpeditedRegion,
        seriousOrLifeThreatening: disease.seriousOrLifeThreatening,
        unmetMedicalNeed: disease.unmetMedicalNeed,
        substantialImprovementOverExisting: disease.substantialImprovementOverExisting,
      });
      const list = match.eligible.map((e) => ({ name: e.name }));
      const notAssessed = match.notAssessed.map((p) => ({ name: p.name, missing: p.missing }));
      expeditedPrograms = { eligible: list, count: list.length, notAssessed };
    }

    // HA meetings for the next milestone.
    const recommendedMeetings = MEETING_MARKETS.has(agency)
      ? recommendMeetings({ market: agency as any, milestone }).recommended
      : [];

    // Regional Module 1 checklist.
    const module1Checklist = MODULE1_MARKETS.has(agency)
      ? getRegionalModule1Requirements(agency as RegulatoryMarket)
      : [];

    // CTA/IND requirements, labeling sections, and an indicative fee estimate.
    const ctaRequirements = CTA_MARKETS.has(agency) ? getCtaRequirements(agency as CtaMarket) : [];
    const labelingRequirements = LABELING_MARKETS.has(agency) ? getLabelingRequirements(agency as LabelMarket) : [];
    // 2026-10-15: fees and exclusivity were given `orphan: designations.orphan.eligible`
    // and `pediatricExtension: input.pediatricDevelopment`, so a met prevalence screen
    // was costed as a held designation (fees "Waived — orphan-designated product",
    // total 0) and a declared intent as an earned extension (EU 144 months). Nothing
    // here records a designation or completed pediatric studies: fees are charged in
    // full, and orphan exclusivity / the pediatric extension are listed as potential.
    const feeEstimate = FEE_MARKETS.has(agency)
      ? estimateFees({ market: agency as FeeMarket, orphanScreenMet })
      : null;

    // Regulatory exclusivity (FDA/EMA/PMDA): the statutory base for the product
    // class, with what the program could add listed separately.
    let exclusivity: ExclusivityResult | null = null;
    let potentialExclusivity: PotentialExclusivityComponent[] | null = null;
    let potentialExclusivityNotAssessed: string[] | null = null;
    if (EXCLUSIVITY_MARKETS.has(agency)) {
      const exclusivityBase = { market: agency as ExclusivityMarket, productClass: PRODUCT_CLASS_BY_TYPE[input.productType] };
      exclusivity = computeExclusivity(exclusivityBase);
      const listed = listPotentialExclusivity(exclusivityBase, exclusivity, orphanScreenMet, input.pediatricDevelopment === true);
      potentialExclusivity = listed.potential;
      potentialExclusivityNotAssessed = listed.notAssessed;
    }

    // Pediatric study-plan obligation (PREA iPSP / EMA PIP) when pediatric
    // development is declared — surfaces the plan requirement, timing, and status.
    const pediatricRequirements =
      input.pediatricDevelopment && PEDIATRIC_PLAN_MARKETS.has(agency)
        ? assessPediatricPlan({ market: agency as PediatricMarket, triggersRequirement: true })
        : null;

    // Post-approval pharmacovigilance obligations (FDA/EMA/PMDA) — the lifecycle
    // safety commitments that attach once the product is authorised.
    const pharmacovigilance = PV_MARKETS.has(agency) ? getPvObligations(agency as PvMarket) : null;

    return {
      market,
      agency,
      pathway: p
        ? { clinicalTrialPathway: p.clinicalTrialPathway, marketingApplication: p.marketingApplication, agency: p.agency, notes: p.notes }
        : { clinicalTrialPathway: 'consult agency', marketingApplication: 'consult agency', agency },
      designations,
      expeditedPrograms,
      recommendedMeetings,
      module1Checklist,
      ctaRequirements,
      labelingRequirements,
      feeEstimate,
      exclusivity,
      potentialExclusivity,
      potentialExclusivityNotAssessed,
      pediatricRequirements,
      pharmacovigilance,
    };
  });

  return {
    productType: input.productType,
    targetMarkets: input.targetMarkets,
    markets,
    summary: summarizeMarkets(markets),
    generalNotes: pathway.generalNotes ?? [],
  };
}

/** The cross-market summary of the per-market sections. */
function summarizeMarkets(markets: MarketStrategy[]): RegulatoryStrategyBrief['summary'] {
  // 2026-10-15: unassessed orphan screens and expedited programs were folded into
  // "none" (orphanEligibleMarkets [], totalExpeditedPrograms 0), and the totals
  // were 0 when no target market models them.
  const expedited = markets.flatMap((m) => (m.expeditedPrograms ? [m.expeditedPrograms] : []));
  const modeledExclusivity = markets.flatMap((m) => (m.exclusivity ? [m.exclusivity.bindingMonths] : []));
  return {
    marketCount: markets.length,
    orphanEligibleMarkets: markets.filter((m) => m.designations?.orphan.eligible === true).map((m) => m.agency),
    orphanNotAssessedMarkets: markets
      .filter((m) => m.designations?.orphan.eligible === 'not_assessed')
      .map((m) => m.agency),
    totalExpeditedPrograms: expedited.length > 0 ? expedited.reduce((n, e) => n + e.count, 0) : null,
    expeditedProgramsNotAssessed: expedited.length > 0 ? expedited.reduce((n, e) => n + e.notAssessed.length, 0) : null,
    maxExclusivityMonths: modeledExclusivity.length > 0 ? Math.max(...modeledExclusivity) : null,
  };
}
