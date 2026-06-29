/**
 * Health-economics & market-access taxonomy — the shared vocabulary for HTA,
 * reimbursement, and value-based access across markets.
 *
 * After a product is approved, access ≠ reimbursement. Each major market runs
 * a health-technology assessment (HTA) that separately evaluates value — using
 * economic evidence, comparator-relative data, and cost-effectiveness thresholds
 * that differ from (and exceed) the regulatory evidence package. This module
 * defines the types, catalogs, and predicates that the server-side health-economics
 * engines share:
 *
 *   - `server/services/heor/heor-models.ts`
 *       → Budget-impact + cost-effectiveness (ICER) deterministic models
 *   - `server/services/regulatory/market-access.ts`
 *       → CPT/HCPCS classification + coverage dossier completeness
 *   - `server/services/regulatory/coverage-simulation.ts`
 *       → Coverage-adjusted revenue / NPV simulation
 *   - `server/services/ana/value-dossier.ts`
 *       → Value dossier guidance + HTA body catalog for AnA
 *
 * Pure, no DB. Grounded in real HTA/payer practice:
 *   - NICE methods guide / reference case (England)
 *   - G-BA / IQWiG AMNOG process (Germany)
 *   - HAS transparency committee SMR/ASMR (France)
 *   - CADTH / pCPA (Canada)
 *   - PBAC (Australia)
 *   - ICER value assessment framework (US)
 *   - EU HTA Regulation 2021/2282 (Joint Clinical Assessment)
 *   - AMCP Format for Formulary Submissions v4.x (US payer)
 *   - ISPOR good-practice guidelines (BIA, CEA, value dossier)
 *
 * @module shared/regulatory/health-economics
 */

import type { CanonicalRegion } from './region-identity.js';

// ─── HTA body taxonomy ─────────────────────────────────────────────────────

export type HtaBodyId =
  | 'nice'       // National Institute for Health and Care Excellence (England)
  | 'smc'        // Scottish Medicines Consortium (Scotland)
  | 'gba_iqwig'  // G-BA / IQWiG (Germany — AMNOG)
  | 'has'        // Haute Autorité de Santé (France)
  | 'aifa'       // Agenzia Italiana del Farmaco (Italy)
  | 'cadth'      // Canada's Drug Agency (formerly CADTH)
  | 'pbac'       // Pharmaceutical Benefits Advisory Committee (Australia)
  | 'icer'       // Institute for Clinical and Economic Review (US — independent)
  | 'tlv'        // Tandvårds- och läkemedelsförmånsverket (Sweden)
  | 'zin'        // Zorginstituut Nederland (Netherlands)
  | 'eu_jca';    // EU Joint Clinical Assessment (HTA Regulation 2021/2282)

export interface HtaBodyDescriptor {
  id: HtaBodyId;
  label: string;
  region: CanonicalRegion;
  decisionMetric: HtaDecisionMetric;
  threshold: string;
  process: string;
  bindingOnPricing: boolean;
  citation: string;
}

export type HtaDecisionMetric =
  | 'cost_per_qaly'       // ICER vs threshold (NICE, PBAC, CADTH, ICER, TLV, ZIN)
  | 'added_benefit'       // Zusatznutzen / ASMR rating vs comparator (G-BA, HAS)
  | 'relative_effectiveness'; // EU JCA clinical assessment only (no economic component)

// ─── HTA body catalog ──────────────────────────────────────────────────────

const HTA_BODIES: HtaBodyDescriptor[] = [
  {
    id: 'nice', label: 'NICE', region: 'UK',
    decisionMetric: 'cost_per_qaly',
    threshold: '£20,000–£30,000/QALY (higher for end-of-life/HST)',
    process: 'Single Technology Appraisal (STA) or Diagnostics Assessment (DAP/EVA)',
    bindingOnPricing: true,
    citation: 'NICE methods guide / reference case',
  },
  {
    id: 'smc', label: 'SMC', region: 'UK',
    decisionMetric: 'cost_per_qaly',
    threshold: 'Similar to NICE (~£20,000–£30,000/QALY)',
    process: 'SMC assessment (Scotland)',
    bindingOnPricing: true,
    citation: 'SMC assessment guidance',
  },
  {
    id: 'gba_iqwig', label: 'G-BA / IQWiG', region: 'EU',
    decisionMetric: 'added_benefit',
    threshold: 'Zusatznutzen rating (major/considerable/minor/non-quantifiable/none) vs zVT comparator',
    process: 'AMNOG: dossier → IQWiG assessment → G-BA decision → price negotiation',
    bindingOnPricing: true,
    citation: 'AMNOG (Arzneimittelmarkt-Neuordnungsgesetz)',
  },
  {
    id: 'has', label: 'HAS (CT)', region: 'EU',
    decisionMetric: 'added_benefit',
    threshold: 'SMR (clinical benefit I–IV) + ASMR (added benefit I–V) vs comparator',
    process: 'Transparency Committee assessment → SMR/ASMR rating → CEPS price negotiation',
    bindingOnPricing: true,
    citation: 'HAS Transparency Committee evaluation rules',
  },
  {
    id: 'aifa', label: 'AIFA', region: 'EU',
    decisionMetric: 'cost_per_qaly',
    threshold: 'Cost-effectiveness + budget-impact assessment',
    process: 'CTS (Commissione Tecnico Scientifica) + CPR (Comitato Prezzi e Rimborso)',
    bindingOnPricing: true,
    citation: 'AIFA assessment procedures',
  },
  {
    id: 'cadth', label: "CADTH", region: 'CA',
    decisionMetric: 'cost_per_qaly',
    threshold: 'No published threshold; ~CAD $50,000–$100,000/QALY commonly cited',
    process: 'CADTH review → recommendation → pCPA pan-Canadian price negotiation',
    bindingOnPricing: true,
    citation: 'CADTH procedures for drug reviews',
  },
  {
    id: 'pbac', label: 'PBAC', region: 'AU',
    decisionMetric: 'cost_per_qaly',
    threshold: 'No published threshold; ~AUD $45,000–$75,000/QALY informally',
    process: 'PBAC assessment → recommendation → PBS listing + PBPA price negotiation',
    bindingOnPricing: true,
    citation: 'PBAC Guidelines (Section 3)',
  },
  {
    id: 'icer', label: 'ICER', region: 'US',
    decisionMetric: 'cost_per_qaly',
    threshold: '$100,000–$150,000/QALY value-based benchmarks + budget-impact alerts',
    process: 'Independent value assessment → evidence report → public meeting → voting',
    bindingOnPricing: false,
    citation: 'ICER value assessment framework 2020',
  },
  {
    id: 'tlv', label: 'TLV', region: 'EU',
    decisionMetric: 'cost_per_qaly',
    threshold: 'Severity-adjusted; ~SEK 500,000–1,000,000/QALY for high-severity',
    process: 'TLV assessment → pricing/reimbursement decision (Sweden)',
    bindingOnPricing: true,
    citation: 'TLV methods and principles',
  },
  {
    id: 'zin', label: 'ZIN', region: 'EU',
    decisionMetric: 'cost_per_qaly',
    threshold: 'Severity-weighted; €20,000–€80,000/QALY range',
    process: 'ZIN assessment → package advice (Netherlands)',
    bindingOnPricing: true,
    citation: 'ZIN assessment procedures / Guideline for economic evaluations',
  },
  {
    id: 'eu_jca', label: 'EU Joint Clinical Assessment', region: 'EU',
    decisionMetric: 'relative_effectiveness',
    threshold: 'No threshold — clinical assessment only; pricing remains national',
    process: 'JCA: EU-level clinical assessment → national pricing/reimbursement decisions',
    bindingOnPricing: false,
    citation: 'Regulation (EU) 2021/2282 (HTA Regulation)',
  },
];

const HTA_BY_ID = new Map(HTA_BODIES.map((b) => [b.id, b]));

// ─── Economic analysis types ────────────────────────────────────────────────

export type EconomicAnalysisType =
  | 'cea'   // cost-effectiveness analysis (cost per clinical outcome)
  | 'cua'   // cost-utility analysis (cost per QALY — the NICE/PBAC standard)
  | 'cba'   // cost-benefit analysis (monetary valuation of outcomes)
  | 'cma'   // cost-minimization analysis (when outcomes proven equivalent)
  | 'bia';  // budget-impact analysis (payer affordability, not CE)

export interface EconomicAnalysisDescriptor {
  id: EconomicAnalysisType;
  label: string;
  effectMetric: string;
  perspective: string;
  whenToUse: string;
}

const ECONOMIC_ANALYSES: EconomicAnalysisDescriptor[] = [
  { id: 'cea', label: 'Cost-Effectiveness Analysis', effectMetric: 'Natural clinical units (LYG, events avoided)', perspective: 'Healthcare system', whenToUse: 'When outcomes differ on a single clinical dimension' },
  { id: 'cua', label: 'Cost-Utility Analysis', effectMetric: 'QALYs (quality-adjusted life years)', perspective: 'Healthcare system / societal', whenToUse: 'Default for most HTA bodies (NICE, PBAC, CADTH, ICER)' },
  { id: 'cba', label: 'Cost-Benefit Analysis', effectMetric: 'Monetary value (willingness-to-pay)', perspective: 'Societal', whenToUse: 'When outcomes must be monetized for cross-sector comparison' },
  { id: 'cma', label: 'Cost-Minimization Analysis', effectMetric: 'None (outcomes assumed equivalent)', perspective: 'Payer', whenToUse: 'Only when clinical equivalence is pre-established (e.g., generics/biosimilars)' },
  { id: 'bia', label: 'Budget-Impact Analysis', effectMetric: 'Total cost / PMPM', perspective: 'Payer (plan-level)', whenToUse: 'Always — accompanies any CE analysis to show affordability' },
];

const ANALYSIS_BY_ID = new Map(ECONOMIC_ANALYSES.map((a) => [a.id, a]));

// ─── Value evidence types ───────────────────────────────────────────────────

export type ValueEvidenceType =
  | 'comparative_effectiveness'  // vs active comparator (not just placebo)
  | 'clinical_utility'           // test changes management + improves outcomes (IVD payer bar)
  | 'patient_reported_outcome'   // PRO / QoL instruments (EQ-5D, SF-36, disease-specific)
  | 'real_world_evidence'        // RWE from registries, claims, EHR
  | 'health_economic_model'      // decision-analytic model (Markov, partitioned survival, DES)
  | 'indirect_comparison';       // NMA / ITC when no head-to-head data

// ─── Payer channel taxonomy ─────────────────────────────────────────────────

export type PayerChannelId =
  | 'medicare_b'          // US Medicare Part B (physician-administered / outpatient)
  | 'medicare_d'          // US Medicare Part D (prescription drugs / oral)
  | 'medicaid'            // US Medicaid (state-administered)
  | 'us_commercial'       // US commercial / employer-sponsored
  | 'va_dod'              // US Veterans Affairs / Department of Defense
  | 'national_formulary'  // national formulary / reimbursement list (ex-US)
  | 'hospital_formulary'; // hospital-level formulary / DRG bundled

export interface PayerChannelDescriptor {
  id: PayerChannelId;
  label: string;
  region: CanonicalRegion | 'global';
  coverageMechanism: string;
}

const PAYER_CHANNELS: PayerChannelDescriptor[] = [
  { id: 'medicare_b', label: 'Medicare Part B', region: 'US', coverageMechanism: 'NCD/LCD coverage determination (physician-administered drugs, devices, diagnostics)' },
  { id: 'medicare_d', label: 'Medicare Part D', region: 'US', coverageMechanism: 'Plan formulary (oral/self-administered drugs); Part D plan sponsor determines tier' },
  { id: 'medicaid', label: 'Medicaid', region: 'US', coverageMechanism: 'State-administered; mandatory coverage of FDA-approved drugs with rebates (Medicaid Drug Rebate Program)' },
  { id: 'us_commercial', label: 'US Commercial', region: 'US', coverageMechanism: 'P&T committee formulary decision; AMCP dossier is the standard submission format' },
  { id: 'va_dod', label: 'VA / DoD', region: 'US', coverageMechanism: 'VA National Formulary (VANF) / DoD Uniform Formulary; VISN P&T review' },
  { id: 'national_formulary', label: 'National Formulary / Reimbursement List', region: 'global', coverageMechanism: 'HTA recommendation → national listing (PBS, NHS, GKV, etc.)' },
  { id: 'hospital_formulary', label: 'Hospital Formulary', region: 'global', coverageMechanism: 'Hospital P&T committee decision; DRG/case-rate bundled payment' },
];

const PAYER_BY_ID = new Map(PAYER_CHANNELS.map((p) => [p.id, p]));

// ─── Coding systems ─────────────────────────────────────────────────────────

export type CodingSystemId =
  | 'cpt'         // AMA CPT (Category I/II/III)
  | 'hcpcs'       // CMS HCPCS Level II (alphanumeric)
  | 'pla'         // Proprietary Laboratory Analyses (CPT NNNNU codes)
  | 'icd10_cm'    // ICD-10-CM diagnosis codes
  | 'icd10_pcs'   // ICD-10-PCS procedure codes
  | 'drg'         // MS-DRG (inpatient bundled payment)
  | 'apc'         // Ambulatory Payment Classification (outpatient bundled)
  | 'ndc';        // National Drug Code (pharmacy billing)

// ─── Value dossier sections ─────────────────────────────────────────────────

export type ValueDossierSectionId =
  | 'product_overview'           // product information and mechanism
  | 'disease_burden'             // epidemiology, unmet need, current treatment landscape
  | 'clinical_evidence'          // pivotal trial results (efficacy + safety)
  | 'comparative_evidence'       // vs relevant comparator(s), not just placebo
  | 'economic_evaluation'        // CEA/CUA model + results
  | 'budget_impact'              // BIA model + PMPM
  | 'patient_value'              // PRO, QoL, patient preference
  | 'coding_billing'             // CPT/HCPCS/DRG coding strategy
  | 'coverage_landscape'         // NCD/LCD/formulary status analysis
  | 'value_proposition';         // summary value story + key messages

export interface ValueDossierSection {
  id: ValueDossierSectionId;
  label: string;
  required: boolean;
  htaRelevance: string;
}

const DOSSIER_SECTIONS: ValueDossierSection[] = [
  { id: 'product_overview', label: 'Product Information & Mechanism', required: true, htaRelevance: 'All — establishes the technology under assessment' },
  { id: 'disease_burden', label: 'Disease Burden & Unmet Need', required: true, htaRelevance: 'All — frames the clinical and economic context' },
  { id: 'clinical_evidence', label: 'Clinical Evidence (Pivotal)', required: true, htaRelevance: 'All — the evidentiary foundation' },
  { id: 'comparative_evidence', label: 'Comparative Effectiveness', required: true, htaRelevance: 'Critical — most HTA rejections trace to inadequate comparator data' },
  { id: 'economic_evaluation', label: 'Economic Evaluation (CEA/CUA)', required: true, htaRelevance: 'NICE, PBAC, CADTH, ICER, TLV, ZIN — drives the ICER assessment' },
  { id: 'budget_impact', label: 'Budget-Impact Analysis', required: true, htaRelevance: 'All — payer affordability is assessed separately from CE' },
  { id: 'patient_value', label: 'Patient-Reported Outcomes & QoL', required: false, htaRelevance: 'NICE (EQ-5D preferred), PBAC, others — feeds utility values into models' },
  { id: 'coding_billing', label: 'Coding & Billing Strategy', required: false, htaRelevance: 'US payers — CPT/HCPCS/DRG assignment drives reimbursement amount' },
  { id: 'coverage_landscape', label: 'Coverage Landscape Analysis', required: false, htaRelevance: 'US — NCD/LCD/prior authorization status informs access strategy' },
  { id: 'value_proposition', label: 'Value Proposition & Key Messages', required: true, htaRelevance: 'All — the synthesized value story for each audience' },
];

const SECTION_BY_ID = new Map(DOSSIER_SECTIONS.map((s) => [s.id, s]));

// ─── HTA assessment lifecycle ───────────────────────────────────────────────

export type HtaAssessmentStatus =
  | 'planning'           // evidence-generation planning, pre-HTA engagement
  | 'dossier_prep'       // assembling the value dossier / HTA submission
  | 'submitted'          // submitted to the HTA body
  | 'under_assessment'   // HTA assessment in progress
  | 'appraisal'          // committee appraisal / deliberation
  | 'recommended'        // positive recommendation (with or without restrictions)
  | 'not_recommended'    // negative recommendation
  | 'price_negotiation'  // post-recommendation pricing negotiation
  | 'listed'             // product listed / reimbursed
  | 'restricted'         // listed with restrictions (patient access scheme, MEA)
  | 'delisted';          // removed from reimbursement

export const HTA_ASSESSMENT_TRANSITIONS: Record<HtaAssessmentStatus, HtaAssessmentStatus[]> = {
  planning: ['dossier_prep'],
  dossier_prep: ['submitted'],
  submitted: ['under_assessment'],
  under_assessment: ['appraisal'],
  appraisal: ['recommended', 'not_recommended'],
  recommended: ['price_negotiation', 'listed'],
  not_recommended: ['dossier_prep', 'planning'],
  price_negotiation: ['listed', 'restricted'],
  listed: ['restricted', 'delisted'],
  restricted: ['listed', 'delisted'],
  delisted: [],
};

// ─── Pricing framework ─────────────────────────────────────────────────────

export type PricingFrameworkId =
  | 'free_pricing'          // manufacturer sets the price (US)
  | 'external_reference'    // international reference pricing (many EU)
  | 'internal_reference'    // therapeutic class reference pricing
  | 'value_based'           // price linked to HTA outcome / CE threshold
  | 'managed_entry'         // conditional reimbursement (outcomes-based, financial-based)
  | 'tendering';            // competitive procurement (hospitals, some national)

export interface PricingFramework {
  id: PricingFrameworkId;
  label: string;
  description: string;
}

const PRICING_FRAMEWORKS: PricingFramework[] = [
  { id: 'free_pricing', label: 'Free Pricing', description: 'Manufacturer sets the price; no statutory price control (US market)' },
  { id: 'external_reference', label: 'External Reference Pricing', description: 'Price benchmarked against a basket of other countries (common in EU)' },
  { id: 'internal_reference', label: 'Internal Reference Pricing', description: 'Price benchmarked within a therapeutic class or ATC group' },
  { id: 'value_based', label: 'Value-Based Pricing', description: 'Price linked to demonstrated clinical value / cost-effectiveness outcome' },
  { id: 'managed_entry', label: 'Managed Entry Agreement', description: 'Conditional reimbursement with outcomes-based or financial risk-sharing' },
  { id: 'tendering', label: 'Tendering / Procurement', description: 'Competitive procurement (hospital tenders, national biosimilar tenders)' },
];

const PRICING_BY_ID = new Map(PRICING_FRAMEWORKS.map((f) => [f.id, f]));

// ─── Market access profile per region ───────────────────────────────────────

export interface MarketAccessProfile {
  region: CanonicalRegion;
  primaryHtaBodies: HtaBodyId[];
  defaultPricingFramework: PricingFrameworkId;
  payerChannels: PayerChannelId[];
  htaRequired: boolean;
  typicalTimelineMonths: string;
}

const MARKET_PROFILES: MarketAccessProfile[] = [
  {
    region: 'US',
    primaryHtaBodies: ['icer'],
    defaultPricingFramework: 'free_pricing',
    payerChannels: ['medicare_b', 'medicare_d', 'medicaid', 'us_commercial', 'va_dod'],
    htaRequired: false,
    typicalTimelineMonths: '3–12 (payer-by-payer; no centralized HTA gate)',
  },
  {
    region: 'UK',
    primaryHtaBodies: ['nice', 'smc'],
    defaultPricingFramework: 'value_based',
    payerChannels: ['national_formulary'],
    htaRequired: true,
    typicalTimelineMonths: '6–12 (NICE STA)',
  },
  {
    region: 'EU',
    primaryHtaBodies: ['eu_jca', 'gba_iqwig', 'has', 'aifa', 'tlv', 'zin'],
    defaultPricingFramework: 'external_reference',
    payerChannels: ['national_formulary', 'hospital_formulary'],
    htaRequired: true,
    typicalTimelineMonths: '6–18 (varies by member state; JCA adds coordination)',
  },
  {
    region: 'CA',
    primaryHtaBodies: ['cadth'],
    defaultPricingFramework: 'value_based',
    payerChannels: ['national_formulary'],
    htaRequired: true,
    typicalTimelineMonths: '6–12 (CADTH review + pCPA negotiation)',
  },
  {
    region: 'AU',
    primaryHtaBodies: ['pbac'],
    defaultPricingFramework: 'value_based',
    payerChannels: ['national_formulary'],
    htaRequired: true,
    typicalTimelineMonths: '6–12 (PBAC cycle; 3 meetings/year)',
  },
  {
    region: 'JP',
    primaryHtaBodies: [],
    defaultPricingFramework: 'external_reference',
    payerChannels: ['national_formulary'],
    htaRequired: false,
    typicalTimelineMonths: '2–3 (NHI listing after PMDA approval; cost-effectiveness for high-cost)',
  },
];

const PROFILE_BY_REGION = new Map(MARKET_PROFILES.map((p) => [p.region, p]));

// ─── Tracked HTA submission (project-level record) ─────────────────────────

export interface TrackedHtaSubmission {
  id: string;
  productId: string;
  region: CanonicalRegion;
  htaBody: HtaBodyId;
  status: HtaAssessmentStatus;
  comparator: string | null;
  submittedDate?: string;
  decisionDate?: string;
  outcome?: 'recommended' | 'not_recommended' | 'restricted';
  restrictions?: string;
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export function getHtaBody(id: HtaBodyId): HtaBodyDescriptor | undefined {
  return HTA_BY_ID.get(id);
}

export function allHtaBodies(): readonly HtaBodyDescriptor[] {
  return HTA_BODIES;
}

export function htaBodiesForRegion(region: CanonicalRegion): HtaBodyDescriptor[] {
  return HTA_BODIES.filter((b) => b.region === region);
}

export function getEconomicAnalysis(id: EconomicAnalysisType): EconomicAnalysisDescriptor | undefined {
  return ANALYSIS_BY_ID.get(id);
}

export function allEconomicAnalyses(): readonly EconomicAnalysisDescriptor[] {
  return ECONOMIC_ANALYSES;
}

export function getPayerChannel(id: PayerChannelId): PayerChannelDescriptor | undefined {
  return PAYER_BY_ID.get(id);
}

export function payerChannelsForRegion(region: CanonicalRegion): PayerChannelDescriptor[] {
  return PAYER_CHANNELS.filter((p) => p.region === region || p.region === 'global');
}

export function getDossierSection(id: ValueDossierSectionId): ValueDossierSection | undefined {
  return SECTION_BY_ID.get(id);
}

export function allDossierSections(): readonly ValueDossierSection[] {
  return DOSSIER_SECTIONS;
}

export function requiredDossierSections(): ValueDossierSection[] {
  return DOSSIER_SECTIONS.filter((s) => s.required);
}

export function getPricingFramework(id: PricingFrameworkId): PricingFramework | undefined {
  return PRICING_BY_ID.get(id);
}

export function getMarketAccessProfile(region: CanonicalRegion): MarketAccessProfile | undefined {
  return PROFILE_BY_REGION.get(region);
}

// ─── Predicates ─────────────────────────────────────────────────────────────

export function isHtaGated(region: CanonicalRegion): boolean {
  const profile = PROFILE_BY_REGION.get(region);
  return profile?.htaRequired ?? false;
}

export function usesQalyThreshold(id: HtaBodyId): boolean {
  const body = HTA_BY_ID.get(id);
  return body?.decisionMetric === 'cost_per_qaly';
}

export function isPricingBinding(id: HtaBodyId): boolean {
  const body = HTA_BY_ID.get(id);
  return body?.bindingOnPricing ?? false;
}

export function canAdvanceHtaAssessment(from: HtaAssessmentStatus, to: HtaAssessmentStatus): boolean {
  return HTA_ASSESSMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalHtaStatus(status: HtaAssessmentStatus): boolean {
  return HTA_ASSESSMENT_TRANSITIONS[status]?.length === 0;
}

// ─── Analysis routing ───────────────────────────────────────────────────────

export function preferredAnalysisForBody(id: HtaBodyId): EconomicAnalysisType {
  const body = HTA_BY_ID.get(id);
  if (!body) return 'cua';
  if (body.decisionMetric === 'cost_per_qaly') return 'cua';
  if (body.decisionMetric === 'added_benefit') return 'cea';
  return 'cea';
}

export function defaultPricingForRegion(region: CanonicalRegion): PricingFrameworkId {
  const profile = PROFILE_BY_REGION.get(region);
  return profile?.defaultPricingFramework ?? 'free_pricing';
}

export default {
  getHtaBody,
  allHtaBodies,
  htaBodiesForRegion,
  getEconomicAnalysis,
  allEconomicAnalyses,
  getPayerChannel,
  payerChannelsForRegion,
  getDossierSection,
  allDossierSections,
  requiredDossierSections,
  getPricingFramework,
  getMarketAccessProfile,
  isHtaGated,
  usesQalyThreshold,
  isPricingBinding,
  canAdvanceHtaAssessment,
  isTerminalHtaStatus,
  preferredAnalysisForBody,
  defaultPricingForRegion,
};
