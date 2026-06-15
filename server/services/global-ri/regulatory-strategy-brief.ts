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
import { matchExpeditedPrograms, type Region as ExpeditedRegion } from './expedited-programs';
import { recommendMeetings, type DevelopmentMilestone, type MeetingType } from './ha-meetings';
import { getRegionalModule1Requirements, type Module1Component, type RegulatoryMarket } from './regional-module1-requirements';
import { getCtaRequirements, type CtaComponent, type CtaMarket } from './clinical-trial-application-requirements';
import { getLabelingRequirements, type LabelingSection, type LabelMarket } from './labeling-requirements';
import { estimateFees, type FeeEstimate, type FeeMarket } from './regulatory-fee-estimator';

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

export interface DiseaseProfile {
  usPrevalence?: number;
  euPrevalencePer10k?: number;
  jpPrevalence?: number;
  seriousOrLifeThreatening?: boolean;
  noSatisfactoryTreatment?: boolean;
  significantBenefit?: boolean;
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

export interface MarketStrategy {
  market: Market;
  agency: string;
  pathway: { clinicalTrialPathway: string; marketingApplication: string; agency: string; notes?: string };
  designations: DesignationResult | null;
  expeditedPrograms: { eligible: { name: string }[]; count: number } | null;
  recommendedMeetings: MeetingType[];
  module1Checklist: Module1Component[];
  ctaRequirements: CtaComponent[];
  labelingRequirements: LabelingSection[];
  feeEstimate: FeeEstimate | null;
}

export interface RegulatoryStrategyBrief {
  productType: ProductType;
  targetMarkets: Market[];
  markets: MarketStrategy[];
  summary: {
    marketCount: number;
    orphanEligibleMarkets: string[];
    totalExpeditedPrograms: number;
  };
  generalNotes: string[];
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

    // Expedited programs (FDA/EMA/PMDA).
    let expeditedPrograms: MarketStrategy['expeditedPrograms'] = null;
    if (EXPEDITED_REGIONS.has(agency)) {
      const match = matchExpeditedPrograms({
        region: agency as ExpeditedRegion,
        seriousOrLifeThreatening: disease.seriousOrLifeThreatening,
        unmetMedicalNeed: disease.unmetMedicalNeed,
        substantialImprovementOverExisting: disease.significantBenefit,
      });
      const list = match.eligible.map((e) => ({ name: e.name }));
      expeditedPrograms = { eligible: list, count: list.length };
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
    const feeEstimate = FEE_MARKETS.has(agency)
      ? estimateFees({ market: agency as FeeMarket, orphan: designations?.orphan.eligible })
      : null;

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
    };
  });

  const orphanEligibleMarkets = markets.filter((m) => m.designations?.orphan.eligible).map((m) => m.agency);
  const totalExpeditedPrograms = markets.reduce((n, m) => n + (m.expeditedPrograms?.count ?? 0), 0);

  return {
    productType: input.productType,
    targetMarkets: input.targetMarkets,
    markets,
    summary: {
      marketCount: markets.length,
      orphanEligibleMarkets,
      totalExpeditedPrograms,
    },
    generalNotes: pathway.generalNotes ?? [],
  };
}
