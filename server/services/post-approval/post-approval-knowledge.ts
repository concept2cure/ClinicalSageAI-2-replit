/**
 * Post-Approval Lifecycle Management (ICH Q12) — Deterministic Knowledge Engine
 * ============================================================================
 *
 * Pure, closed-form, reproducible TypeScript. NO LLM, NO network, NO database,
 * NO imports from other services. Identical input always yields identical output.
 *
 * This module encodes the regulatory science of managing chemistry, manufacturing
 * and controls (CMC) changes AFTER a product is approved — the "lifecycle" phase
 * of the product. It is grounded in and cites:
 *
 *   • ICH Q12 (2019) — Technical and Regulatory Considerations for Pharmaceutical
 *     Product Lifecycle Management. Introduces Established Conditions (ECs), the
 *     Post-Approval Change Management Protocol (PACMP), and the Product Lifecycle
 *     Management (PLCM) document. FDA adopted Q12 in May 2021 (guidance + annex).
 *   • 21 CFR 314.70 — "Supplements and other changes to an approved NDA". Defines
 *     Prior Approval Supplement (PAS), Changes Being Effected in 30 days (CBE-30),
 *     Changes Being Effected (CBE-0), and Annual Report (AR) reporting categories.
 *   • 21 CFR 314.71 / 314.97 (ANDA analogues) and 21 CFR 601.12 (biologics, BLA).
 *   • FDA Guidance "Changes to an Approved NDA or ANDA" (April 2004) and the
 *     scale-up and post-approval changes (SUPAC) guidances (SUPAC-IR 1995,
 *     SUPAC-MR 1997, SUPAC-SS 1997).
 *   • FDA Guidance "Comparability Protocols — Chemistry, Manufacturing, and
 *     Controls Information" (2016, draft) and "CMC Postapproval Manufacturing
 *     Changes To Be Documented in Annual Reports" (2014).
 *   • EU Variations Regulation (EC) No 1234/2008 and the "Guidelines on the
 *     details of the various categories of variations" (2013/C 223/01). Defines
 *     Type IA / IAIN (Immediate Notification), Type IB, and Type II variations,
 *     plus Extensions of marketing authorisation.
 *   • ICH Q8(R2) Pharmaceutical Development, Q9(R1) Quality Risk Management,
 *     Q10 Pharmaceutical Quality System, Q11 Development & Manufacture of Drug
 *     Substances — the "QbD" quintet that establishes the science/risk basis for
 *     the regulatory flexibility codified in Q12.
 *   • ICH Q5E — Comparability of Biotechnological/Biological Products Subject to
 *     Changes in Their Manufacturing Process.
 *
 * IMPORTANT — every numeric threshold, category mapping, and citation in this file
 * is reproduced from the public regulatory texts above. Callers (including LLM
 * agents) must report the returned values and citations verbatim. A fabricated or
 * misattributed regulatory citation in a post-approval submission is a critical
 * defect.
 *
 * @module server/services/post-approval/post-approval-knowledge
 */

/* eslint-disable @typescript-eslint/no-magic-numbers */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 0 — Shared types
// ─────────────────────────────────────────────────────────────────────────────

/** US (FDA) post-approval reporting categories under 21 CFR 314.70 / 601.12. */
export type UsReportingCategory =
  | 'PAS' // Prior Approval Supplement — 314.70(b); FDA must approve before distribution
  | 'CBE-30' // Changes Being Effected in 30 days — 314.70(c)(3); distribute 30 days after FDA receipt
  | 'CBE-0' // Changes Being Effected (immediately) — 314.70(c)(6); distribute upon FDA receipt
  | 'Annual Report'; // Minor change — 314.70(d); document in next annual report

/** EU variation classifications under Reg (EC) 1234/2008. */
export type EuVariationType =
  | 'IA' // Type IA — minor, "Do and Tell"; notify within 12 months
  | 'IAIN' // Type IA requiring Immediate Notification; notify within 14 days of implementation
  | 'IB' // Type IB — minor, "Tell, Wait and Do"; default for unclassified minor changes
  | 'II' // Type II — major; requires approval before implementation
  | 'Extension'; // Line extension — new application annex

/** Overall change-risk tier from quality risk management (ICH Q9). */
export type ChangeRiskTier = 'low' | 'moderate' | 'high';

/** Development approach affects EC granularity and regulatory flexibility (Q8/Q11/Q12). */
export type DevelopmentApproach = 'minimal' | 'enhanced'; // "enhanced" = QbD

/** Product modality — biologics get tighter comparability rules (Q5E, 601.12). */
export type ProductModality =
  | 'small_molecule'
  | 'biologic' // mAb, fusion protein, recombinant
  | 'vaccine'
  | 'cell_gene_therapy'
  | 'peptide_oligonucleotide';

/** A single regulatory citation with a short scope note. */
export interface RegulatoryCitation {
  source: string;
  reference: string;
  note: string;
}

/** Generic structured result envelope used across the engine. */
export interface EngineProvenance {
  engine: string;
  version: string;
  deterministic: true;
}

const ENGINE_VERSION = '1.0.0';

function provenance(engine: string): EngineProvenance {
  return { engine, version: ENGINE_VERSION, deterministic: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Canonical citation library
// ─────────────────────────────────────────────────────────────────────────────

interface CitationRecord extends RegulatoryCitation {
  key: string;
}

/**
 * Master citation table. Every function pulls citations from here by key so the
 * exact reference text is identical everywhere it appears.
 */
const CITATIONS: CitationRecord[] = [
  {
    key: 'ich_q12',
    source: 'ICH',
    reference: 'ICH Q12 (2019), Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management',
    note: 'Introduces Established Conditions (ECs), PACMP, and the PLCM document.',
  },
  {
    key: 'ich_q12_ec',
    source: 'ICH',
    reference: 'ICH Q12 Section 3 — Established Conditions',
    note: 'ECs are legally binding information considered necessary to assure product quality; changes to ECs require a regulatory submission.',
  },
  {
    key: 'ich_q12_pacmp',
    source: 'ICH',
    reference: 'ICH Q12 Section 4 — Post-Approval Change Management Protocol (PACMP)',
    note: 'A regulatory tool providing predictability via a pre-agreed plan describing a specific change and how it will be evaluated.',
  },
  {
    key: 'ich_q12_plcm',
    source: 'ICH',
    reference: 'ICH Q12 Section 5 — Product Lifecycle Management (PLCM) document',
    note: 'A central repository summarizing ECs, reporting categories, PACMPs, and post-approval CMC commitments.',
  },
  {
    key: 'ich_q12_annex',
    source: 'ICH',
    reference: 'ICH Q12 Annex — illustrative examples of ECs by development approach',
    note: 'Shows how enhanced (QbD) development can justify fewer/parameter-level ECs and lower reporting categories.',
  },
  {
    key: 'cfr_314_70',
    source: 'US FDA',
    reference: '21 CFR 314.70 — Supplements and other changes to an approved NDA',
    note: 'Defines PAS (b), CBE-30 (c)(3), CBE-0 (c)(6), and Annual Report (d) categories.',
  },
  {
    key: 'cfr_314_70b',
    source: 'US FDA',
    reference: '21 CFR 314.70(b) — Changes requiring supplement submission and approval prior to distribution (Prior Approval Supplement)',
    note: 'Major changes with substantial potential to affect product quality.',
  },
  {
    key: 'cfr_314_70c',
    source: 'US FDA',
    reference: '21 CFR 314.70(c) — Changes requiring supplement submission at least 30 days prior to distribution (CBE-30)',
    note: 'Moderate changes; product may be distributed 30 days after FDA receives the supplement unless FDA objects.',
  },
  {
    key: 'cfr_314_70c6',
    source: 'US FDA',
    reference: '21 CFR 314.70(c)(6) — Changes that may be distributed upon receipt of the supplement by FDA (CBE-0)',
    note: 'Subset of moderate changes specifically permitted for immediate distribution.',
  },
  {
    key: 'cfr_314_70d',
    source: 'US FDA',
    reference: '21 CFR 314.70(d) — Minor changes; documentation in the annual report',
    note: 'Minimal potential to affect product quality; no supplement required.',
  },
  {
    key: 'cfr_601_12',
    source: 'US FDA',
    reference: '21 CFR 601.12 — Changes to an approved application (biologics / BLA)',
    note: 'Biologics analogue of 314.70; major (601.12(b)), moderate CBE-30 (601.12(c)), and minor/AR (601.12(d)).',
  },
  {
    key: 'fda_changes_guidance',
    source: 'US FDA',
    reference: 'FDA Guidance for Industry: Changes to an Approved NDA or ANDA (April 2004)',
    note: 'Component/composition, manufacturing site, process, scale, equipment, specification, and container-closure change categories.',
  },
  {
    key: 'fda_comparability_protocols',
    source: 'US FDA',
    reference: 'FDA Draft Guidance: Comparability Protocols — Chemistry, Manufacturing, and Controls Information (2016)',
    note: 'US analogue of the PACMP; a CP may reduce the reporting category for a prospectively defined change.',
  },
  {
    key: 'fda_ar_changes',
    source: 'US FDA',
    reference: 'FDA Guidance: CMC Postapproval Manufacturing Changes To Be Documented in Annual Reports (2014)',
    note: 'Lists specific manufacturing changes reportable in the annual report.',
  },
  {
    key: 'supac_ir',
    source: 'US FDA',
    reference: 'FDA SUPAC-IR (1995) — Immediate Release Solid Oral Dosage Forms: Scale-Up and Post-Approval Changes',
    note: 'Level 1/2/3 change framework for components, site, scale, and process for IR oral products.',
  },
  {
    key: 'supac_mr',
    source: 'US FDA',
    reference: 'FDA SUPAC-MR (1997) — Modified Release Solid Oral Dosage Forms',
    note: 'Level 1/2/3 framework for MR products; release-controlling excipient changes are higher risk.',
  },
  {
    key: 'eu_variations_reg',
    source: 'EU',
    reference: 'Commission Regulation (EC) No 1234/2008 on the examination of variations to the terms of marketing authorisations',
    note: 'Legal basis for Type IA / IAIN / IB / II variations and Extensions.',
  },
  {
    key: 'eu_variations_guideline',
    source: 'EU',
    reference: 'Guidelines on the details of the various categories of variations (2013/C 223/01)',
    note: 'Classification guideline listing specific changes and their default variation categories and conditions.',
  },
  {
    key: 'ich_q8',
    source: 'ICH',
    reference: 'ICH Q8(R2) — Pharmaceutical Development',
    note: 'Quality target product profile, critical quality attributes (CQAs), design space; basis for enhanced approach.',
  },
  {
    key: 'ich_q9',
    source: 'ICH',
    reference: 'ICH Q9(R1) — Quality Risk Management',
    note: 'Risk assessment methodology used to assign change-risk tiers and reporting categories.',
  },
  {
    key: 'ich_q10',
    source: 'ICH',
    reference: 'ICH Q10 — Pharmaceutical Quality System',
    note: 'Change management system; the PQS evaluates and manages changes throughout the lifecycle.',
  },
  {
    key: 'ich_q11',
    source: 'ICH',
    reference: 'ICH Q11 — Development and Manufacture of Drug Substances',
    note: 'Establishes CQAs and control strategy for the drug substance; informs ECs for DS changes.',
  },
  {
    key: 'ich_q5e',
    source: 'ICH',
    reference: 'ICH Q5E — Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process',
    note: 'Framework for demonstrating comparability after a manufacturing change for biologics.',
  },
  {
    key: 'ich_q14',
    source: 'ICH',
    reference: 'ICH Q14 — Analytical Procedure Development',
    note: 'Analytical procedures may have ECs; enhanced approach can lower reporting for method changes.',
  },
  {
    key: 'ich_q2',
    source: 'ICH',
    reference: 'ICH Q2(R2) — Validation of Analytical Procedures',
    note: 'Validation requirements supporting analytical comparability and method change reporting.',
  },
];

function cite(...keys: string[]): RegulatoryCitation[] {
  const out: RegulatoryCitation[] = [];
  for (const k of keys) {
    const rec = CITATIONS.find((c: CitationRecord) => c.key === k);
    if (rec) {
      out.push({ source: rec.source, reference: rec.reference, note: rec.note });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Change taxonomy reference tables
// ─────────────────────────────────────────────────────────────────────────────

/** Top-level CMC change areas recognized by this engine. */
export type ChangeArea =
  | 'manufacturing_site'
  | 'manufacturing_process'
  | 'scale'
  | 'equipment'
  | 'composition_excipient'
  | 'specification'
  | 'analytical_method'
  | 'container_closure'
  | 'stability_shelf_life'
  | 'drug_substance_source'
  | 'drug_substance_process'
  | 'starting_material'
  | 'labeling_cmc'
  | 'facility_administrative';

/** Magnitude qualifier supplied by the caller for the proposed change. */
export type ChangeMagnitude = 'minor' | 'moderate' | 'major';

/** SUPAC level mapping for solid oral products. */
export type SupacLevel = 'Level 1' | 'Level 2' | 'Level 3' | 'N/A';

interface ChangeAreaProfile {
  area: ChangeArea;
  label: string;
  /** Default US category when magnitude is not specified (conservative). */
  defaultUs: UsReportingCategory;
  /** Default EU type when magnitude is not specified (conservative). */
  defaultEu: EuVariationType;
  /** Whether this area typically involves comparability for biologics. */
  comparabilitySensitive: boolean;
  /** Whether this area is governed by SUPAC for solid oral products. */
  supacGoverned: boolean;
  /** Short description of what falls in this area. */
  scope: string;
  /** Citation keys most relevant to this area. */
  citationKeys: string[];
}

/**
 * Change-area profiles. Annotated with an explicit element interface (no
 * `as const`) per the strict-mode rules for module-level typed tables.
 */
const CHANGE_AREA_PROFILES: ChangeAreaProfile[] = [
  {
    area: 'manufacturing_site',
    label: 'Manufacturing site change',
    defaultUs: 'PAS',
    defaultEu: 'II',
    comparabilitySensitive: true,
    supacGoverned: true,
    scope: 'Move/addition of a drug product or drug substance manufacturing, testing, or packaging site.',
    citationKeys: ['fda_changes_guidance', 'supac_ir', 'eu_variations_guideline', 'cfr_314_70'],
  },
  {
    area: 'manufacturing_process',
    label: 'Manufacturing process change',
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    comparabilitySensitive: true,
    supacGoverned: true,
    scope: 'Changes to process steps, order, in-process controls, or processing parameters outside the approved design space.',
    citationKeys: ['fda_changes_guidance', 'supac_ir', 'ich_q8', 'eu_variations_guideline'],
  },
  {
    area: 'scale',
    label: 'Batch scale change',
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    comparabilitySensitive: false,
    supacGoverned: true,
    scope: 'Scale-up or scale-down of the batch size beyond approved ranges.',
    citationKeys: ['supac_ir', 'supac_mr', 'fda_changes_guidance', 'eu_variations_guideline'],
  },
  {
    area: 'equipment',
    label: 'Equipment change',
    defaultUs: 'CBE-30',
    defaultEu: 'IA',
    comparabilitySensitive: false,
    supacGoverned: true,
    scope: 'Change to equipment of the same or different design/operating principle.',
    citationKeys: ['fda_changes_guidance', 'supac_ir', 'eu_variations_guideline'],
  },
  {
    area: 'composition_excipient',
    label: 'Composition / excipient change',
    defaultUs: 'PAS',
    defaultEu: 'II',
    comparabilitySensitive: false,
    supacGoverned: true,
    scope: 'Qualitative or quantitative change in excipients of the drug product.',
    citationKeys: ['fda_changes_guidance', 'supac_ir', 'eu_variations_guideline'],
  },
  {
    area: 'specification',
    label: 'Specification change',
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    comparabilitySensitive: true,
    supacGoverned: false,
    scope: 'Change to acceptance criteria, addition/deletion of a test, or tightening/relaxing limits.',
    citationKeys: ['fda_changes_guidance', 'eu_variations_guideline', 'ich_q12_ec'],
  },
  {
    area: 'analytical_method',
    label: 'Analytical method change',
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    comparabilitySensitive: false,
    supacGoverned: false,
    scope: 'Replacement or modification of an analytical procedure used to release or test material.',
    citationKeys: ['fda_changes_guidance', 'ich_q14', 'ich_q2', 'eu_variations_guideline'],
  },
  {
    area: 'container_closure',
    label: 'Container-closure system change',
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    comparabilitySensitive: false,
    supacGoverned: false,
    scope: 'Change to primary or functional secondary packaging components.',
    citationKeys: ['fda_changes_guidance', 'eu_variations_guideline'],
  },
  {
    area: 'stability_shelf_life',
    label: 'Stability / shelf-life / storage change',
    defaultUs: 'PAS',
    defaultEu: 'II',
    comparabilitySensitive: false,
    supacGoverned: false,
    scope: 'Extension of shelf life, change of storage conditions, or revised stability protocol.',
    citationKeys: ['fda_changes_guidance', 'eu_variations_guideline'],
  },
  {
    area: 'drug_substance_source',
    label: 'Drug substance source / supplier change',
    defaultUs: 'PAS',
    defaultEu: 'II',
    comparabilitySensitive: true,
    supacGoverned: false,
    scope: 'New manufacturer or new source of the active pharmaceutical ingredient.',
    citationKeys: ['fda_changes_guidance', 'ich_q11', 'eu_variations_guideline', 'cfr_601_12'],
  },
  {
    area: 'drug_substance_process',
    label: 'Drug substance manufacturing process change',
    defaultUs: 'PAS',
    defaultEu: 'II',
    comparabilitySensitive: true,
    supacGoverned: false,
    scope: 'Change to the synthesis route, fermentation, purification, or DS process controls.',
    citationKeys: ['fda_changes_guidance', 'ich_q11', 'ich_q5e', 'eu_variations_guideline'],
  },
  {
    area: 'starting_material',
    label: 'Starting material / reagent change',
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    comparabilitySensitive: true,
    supacGoverned: false,
    scope: 'Change to a designated starting material, key reagent, or its specification.',
    citationKeys: ['ich_q11', 'fda_changes_guidance', 'eu_variations_guideline'],
  },
  {
    area: 'labeling_cmc',
    label: 'CMC-related labeling change',
    defaultUs: 'CBE-0',
    defaultEu: 'IA',
    comparabilitySensitive: false,
    supacGoverned: false,
    scope: 'Editorial or CMC-driven labeling changes (e.g., storage statement consistent with stability).',
    citationKeys: ['fda_changes_guidance', 'eu_variations_guideline'],
  },
  {
    area: 'facility_administrative',
    label: 'Administrative / facility change',
    defaultUs: 'Annual Report',
    defaultEu: 'IA',
    comparabilitySensitive: false,
    supacGoverned: false,
    scope: 'Name/address changes, administrative updates with no quality impact.',
    citationKeys: ['cfr_314_70d', 'eu_variations_guideline'],
  },
];

function profileFor(area: ChangeArea): ChangeAreaProfile {
  const p = CHANGE_AREA_PROFILES.find((x: ChangeAreaProfile) => x.area === area);
  // Fallback profile (conservative) — should not occur for valid ChangeArea.
  return (
    p ?? {
      area,
      label: 'Unclassified change',
      defaultUs: 'PAS',
      defaultEu: 'II',
      comparabilitySensitive: true,
      supacGoverned: false,
      scope: 'Unclassified change — treated conservatively as a major change.',
      citationKeys: ['cfr_314_70', 'eu_variations_reg'],
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Risk scoring primitives (ICH Q9)
// ─────────────────────────────────────────────────────────────────────────────

/** Inputs that move the change-risk score. */
export interface ChangeRiskInputs {
  /** Does the change affect a CQA (critical quality attribute)? */
  affectsCqa?: boolean;
  /** Does the change affect the control strategy / an established condition? */
  affectsControlStrategy?: boolean;
  /** Does the change touch a sterile / aseptic operation? */
  sterileProcess?: boolean;
  /** Is the change within an approved design space (enhanced approach)? */
  withinDesignSpace?: boolean;
  /** Has equivalent change been validated on similar products before? */
  priorKnowledge?: boolean;
  /** Magnitude qualifier supplied by the caller. */
  magnitude?: ChangeMagnitude;
}

interface RiskFactor {
  label: string;
  delta: number;
  applies: boolean;
}

interface RiskScore {
  score: number;
  tier: ChangeRiskTier;
  factors: RiskFactor[];
}

/**
 * Deterministic additive risk model. Base score by magnitude, then bounded
 * factor adjustments. Tier thresholds are fixed: <3 low, 3–6 moderate, >6 high.
 */
function scoreChangeRisk(
  modality: ProductModality,
  inputs: ChangeRiskInputs,
  comparabilitySensitiveArea: boolean,
): RiskScore {
  const base =
    inputs.magnitude === 'major' ? 6 : inputs.magnitude === 'moderate' ? 3 : inputs.magnitude === 'minor' ? 1 : 3;

  const factors: RiskFactor[] = [
    { label: 'Affects a critical quality attribute (CQA)', delta: 2, applies: inputs.affectsCqa === true },
    { label: 'Affects the control strategy or an established condition', delta: 2, applies: inputs.affectsControlStrategy === true },
    { label: 'Involves a sterile / aseptic operation', delta: 2, applies: inputs.sterileProcess === true },
    {
      label: 'Biologic / vaccine / cell-gene modality (process-sensitive)',
      delta: 2,
      applies: modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy',
    },
    {
      label: 'Comparability-sensitive change area',
      delta: 1,
      applies: comparabilitySensitiveArea === true,
    },
    { label: 'Change is within an approved design space', delta: -2, applies: inputs.withinDesignSpace === true },
    { label: 'Supported by prior knowledge / platform experience', delta: -1, applies: inputs.priorKnowledge === true },
  ];

  let score = base;
  for (const f of factors) {
    if (f.applies) score += f.delta;
  }
  if (score < 0) score = 0;

  const tier: ChangeRiskTier = score > 6 ? 'high' : score >= 3 ? 'moderate' : 'low';
  return { score, tier, factors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — classifyPostApprovalChange
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassifyPostApprovalChangeParams {
  changeArea: ChangeArea;
  description?: string;
  modality?: ProductModality;
  magnitude?: ChangeMagnitude;
  /** Solid oral IR/MR product? Enables SUPAC level mapping. */
  solidOralProduct?: boolean;
  /** Modified-release product (affects SUPAC-MR severity). */
  modifiedRelease?: boolean;
  risk?: ChangeRiskInputs;
  /** Is this filed against a BLA (biologic) rather than an NDA/ANDA? */
  biologicLicense?: boolean;
}

export interface ClassifyPostApprovalChangeResult {
  changeArea: ChangeArea;
  changeLabel: string;
  modality: ProductModality;
  us: {
    category: UsReportingCategory;
    regulation: string;
    distributionRule: string;
    rationale: string;
  };
  eu: {
    variationType: EuVariationType;
    procedure: string;
    rationale: string;
  };
  supac: {
    applicable: boolean;
    level: SupacLevel;
    note: string;
  };
  risk: RiskScore;
  comparabilityLikelyRequired: boolean;
  recommendedTools: string[];
  warnings: string[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

function adjustUsCategory(base: UsReportingCategory, tier: ChangeRiskTier): UsReportingCategory {
  const order: UsReportingCategory[] = ['Annual Report', 'CBE-0', 'CBE-30', 'PAS'];
  let idx = order.indexOf(base);
  if (tier === 'high') idx = Math.min(order.length - 1, idx + 1);
  if (tier === 'low') idx = Math.max(0, idx - 1);
  return order[idx];
}

function adjustEuType(base: EuVariationType, tier: ChangeRiskTier): EuVariationType {
  // Linear severity ladder excluding Extension (handled separately).
  const order: EuVariationType[] = ['IA', 'IAIN', 'IB', 'II'];
  if ((base as EuVariationType) === 'Extension') return 'Extension';
  let idx = order.indexOf(base);
  if (idx < 0) idx = 2; // default to IB
  if (tier === 'high') idx = Math.min(order.length - 1, idx + 1);
  if (tier === 'low') idx = Math.max(0, idx - 1);
  return order[idx];
}

function usRegulationFor(category: UsReportingCategory, biologic: boolean): string {
  if (biologic) {
    switch (category) {
      case 'PAS':
        return '21 CFR 601.12(b)';
      case 'CBE-30':
        return '21 CFR 601.12(c)(1)';
      case 'CBE-0':
        return '21 CFR 601.12(c)(5)';
      case 'Annual Report':
        return '21 CFR 601.12(d)';
    }
  }
  switch (category) {
    case 'PAS':
      return '21 CFR 314.70(b)';
    case 'CBE-30':
      return '21 CFR 314.70(c)(3)';
    case 'CBE-0':
      return '21 CFR 314.70(c)(6)';
    case 'Annual Report':
      return '21 CFR 314.70(d)';
  }
}

function usDistributionRule(category: UsReportingCategory): string {
  switch (category) {
    case 'PAS':
      return 'Product manufactured with the change may NOT be distributed until FDA approves the supplement.';
    case 'CBE-30':
      return 'Product may be distributed 30 days after FDA receives the supplement, unless FDA notifies the applicant within that period that a prior-approval supplement is required.';
    case 'CBE-0':
      return 'Product may be distributed immediately upon FDA receipt of the supplement (changes-being-effected).';
    case 'Annual Report':
      return 'No supplement required; the change is documented in the next annual report (no distribution hold).';
  }
}

function euProcedure(type: EuVariationType): string {
  switch (type) {
    case 'IA':
      return 'Type IA "Do and Tell": implement first, notify the competent authority within 12 months (annual notification window).';
    case 'IAIN':
      return 'Type IA Immediate Notification: implement first, notify within 14 days of implementation.';
    case 'IB':
      return 'Type IB "Tell, Wait and Do": submit notification and wait 30 days; implement if no objection ("default" category for minor changes not otherwise classified).';
    case 'II':
      return 'Type II major variation: submit and obtain approval before implementation (30/60/90-day assessment timetable).';
    case 'Extension':
      return 'Extension of the marketing authorisation: assessed as a new application annex (not a variation).';
  }
}

function supacLevelFromTier(tier: ChangeRiskTier): SupacLevel {
  switch (tier) {
    case 'low':
      return 'Level 1';
    case 'moderate':
      return 'Level 2';
    case 'high':
      return 'Level 3';
  }
}

/**
 * Classify a CMC change into a US reporting category (PAS / CBE-30 / CBE-0 /
 * Annual Report) and an EU variation type (IA / IAIN / IB / II), with a
 * quality-risk assessment per ICH Q9.
 */
export function classifyPostApprovalChange(
  params: ClassifyPostApprovalChangeParams,
): ClassifyPostApprovalChangeResult {
  const modality: ProductModality = params.modality ?? 'small_molecule';
  const profile = profileFor(params.changeArea);
  const risk = scoreChangeRisk(modality, params.risk ?? { magnitude: params.magnitude }, profile.comparabilitySensitive);

  const warnings: string[] = [];

  // Start from the area default, then move with risk tier.
  let usCategory = adjustUsCategory(profile.defaultUs, risk.tier);
  let euType = adjustEuType(profile.defaultEu, risk.tier);

  // Hard overrides — certain conditions always escalate to PAS / Type II.
  const risks = params.risk ?? {};
  if (risks.sterileProcess === true && (params.changeArea === 'manufacturing_process' || params.changeArea === 'manufacturing_site')) {
    usCategory = 'PAS';
    euType = 'II';
    warnings.push(
      'Change to a sterile/aseptic process or site is generally a Prior Approval Supplement (PAS) / Type II variation regardless of computed risk tier.',
    );
  }
  if (risks.affectsCqa === true && usCategory === 'Annual Report') {
    usCategory = 'CBE-30';
    warnings.push('A change affecting a CQA cannot be a minor (Annual Report) change; escalated to CBE-30 minimum.');
  }
  if (modality === 'cell_gene_therapy' && risk.tier !== 'low') {
    usCategory = 'PAS';
    euType = 'II';
    warnings.push('Cell & gene therapy manufacturing changes of moderate+ risk are treated as PAS / Type II given limited comparability tools.');
  }
  // If the change is explicitly within an approved design space, it may not need a submission at all.
  if (risks.withinDesignSpace === true && risk.tier === 'low') {
    warnings.push(
      'Movement within an approved design space is not a change requiring a regulatory submission per ICH Q8(R2); confirm the parameter range is covered by the approved design space before relying on this.',
    );
  }

  // SUPAC mapping for solid oral products.
  const supacApplicable = params.solidOralProduct === true && profile.supacGoverned;
  let supacLevel: SupacLevel = supacApplicable ? supacLevelFromTier(risk.tier) : 'N/A';
  let supacNote = supacApplicable
    ? `Maps to SUPAC ${supacLevel} for a ${params.modifiedRelease ? 'modified-release (SUPAC-MR)' : 'immediate-release (SUPAC-IR)'} solid oral product. Level 1 = annual report, Level 2 = CBE-30, Level 3 = PAS for most categories.`
    : 'SUPAC level framework does not apply to this change area / product type.';
  if (supacApplicable && params.modifiedRelease === true && params.changeArea === 'composition_excipient') {
    supacLevel = 'Level 3';
    supacNote =
      'A change to a release-controlling excipient in a modified-release product is a SUPAC-MR Level 3 change (PAS), per SUPAC-MR (1997).';
    usCategory = 'PAS';
    euType = 'II';
  }

  const comparabilityLikelyRequired =
    profile.comparabilitySensitive &&
    (modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy' || risk.tier === 'high');

  const recommendedTools: string[] = ['classify_post_approval_change'];
  if (comparabilityLikelyRequired) recommendedTools.push('assess_postapproval_comparability');
  if (risk.tier === 'high' || usCategory === 'PAS') recommendedTools.push('design_pacmp');
  recommendedTools.push('assess_established_conditions');

  const citationKeys = [...profile.citationKeys, 'ich_q9', 'ich_q12'];
  if (params.biologicLicense === true) citationKeys.push('cfr_601_12');
  else citationKeys.push('cfr_314_70');

  const usRationale = [
    `Area default for ${profile.label} is ${profile.defaultUs}.`,
    `Quality risk tier computed as ${risk.tier} (score ${risk.score}).`,
    `Final US category: ${usCategory}.`,
  ].join(' ');

  const euRationale = [
    `Area default EU type for ${profile.label} is ${profile.defaultEu}.`,
    `After risk adjustment: ${euType}.`,
    'EU default for an unclassified minor change is Type IB ("Tell, Wait and Do").',
  ].join(' ');

  return {
    changeArea: params.changeArea,
    changeLabel: profile.label,
    modality,
    us: {
      category: usCategory,
      regulation: usRegulationFor(usCategory, params.biologicLicense === true),
      distributionRule: usDistributionRule(usCategory),
      rationale: usRationale,
    },
    eu: {
      variationType: euType,
      procedure: euProcedure(euType),
      rationale: euRationale,
    },
    supac: {
      applicable: supacApplicable,
      level: supacLevel,
      note: supacNote,
    },
    risk,
    comparabilityLikelyRequired,
    recommendedTools: Array.from(new Set(recommendedTools)),
    warnings,
    citations: cite(...Array.from(new Set(citationKeys))),
    provenance: provenance('classifyPostApprovalChange'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — assessEstablishedConditions (ICH Q12)
// ─────────────────────────────────────────────────────────────────────────────

/** A CTD/dossier element that may or may not be an Established Condition. */
export type DossierElementType =
  | 'drug_substance_synthesis_step'
  | 'drug_substance_specification'
  | 'manufacturing_process_step'
  | 'process_parameter'
  | 'in_process_control'
  | 'drug_product_composition'
  | 'drug_product_specification'
  | 'analytical_procedure'
  | 'container_closure'
  | 'control_strategy_element'
  | 'shelf_life'
  | 'facility_site';

export interface DossierElementInput {
  elementType: DossierElementType;
  name: string;
  /** Is this element described as a parameter range (enhanced) or a fixed value (minimal)? */
  parameterRange?: boolean;
  /** Does this element have a direct, demonstrated impact on a CQA? */
  cqaImpact?: boolean;
  /** Is this element fully controlled downstream (so it need not be an EC)? */
  controlledDownstream?: boolean;
  /** Is this part of an approved design space? */
  withinDesignSpace?: boolean;
}

export interface AssessEstablishedConditionsParams {
  developmentApproach?: DevelopmentApproach;
  modality?: ProductModality;
  elements: DossierElementInput[];
}

export interface EstablishedConditionAssessment {
  name: string;
  elementType: DossierElementType;
  /** TRUE = legally binding Established Condition; FALSE = supportive information. */
  isEstablishedCondition: boolean;
  classification: 'established_condition' | 'supportive_information';
  /** Reporting category that a future CHANGE to this element would attract. */
  changeReportingCategory: UsReportingCategory;
  euChangeType: EuVariationType;
  rationale: string;
}

export interface AssessEstablishedConditionsResult {
  developmentApproach: DevelopmentApproach;
  modality: ProductModality;
  summary: {
    totalElements: number;
    establishedConditions: number;
    supportiveInformation: number;
    enhancedApproachBenefit: string;
  };
  assessments: EstablishedConditionAssessment[];
  guidance: string[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

interface EcBaseRule {
  elementType: DossierElementType;
  /** Is this element an EC by default (minimal approach)? */
  defaultEc: boolean;
  /** Default reporting category for a change to this EC. */
  defaultUs: UsReportingCategory;
  defaultEu: EuVariationType;
  description: string;
}

const EC_BASE_RULES: EcBaseRule[] = [
  {
    elementType: 'drug_substance_synthesis_step',
    defaultEc: true,
    defaultUs: 'PAS',
    defaultEu: 'II',
    description: 'Synthetic route steps are ECs; route changes are major.',
  },
  {
    elementType: 'drug_substance_specification',
    defaultEc: true,
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    description: 'DS specification acceptance criteria are ECs.',
  },
  {
    elementType: 'manufacturing_process_step',
    defaultEc: true,
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    description: 'Unit operations / process steps are ECs.',
  },
  {
    elementType: 'process_parameter',
    defaultEc: false,
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    description: 'Individual process parameters are ECs only if they impact a CQA and are not otherwise controlled.',
  },
  {
    elementType: 'in_process_control',
    defaultEc: true,
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    description: 'IPC tests/limits that are part of the control strategy are ECs.',
  },
  {
    elementType: 'drug_product_composition',
    defaultEc: true,
    defaultUs: 'PAS',
    defaultEu: 'II',
    description: 'Qualitative/quantitative composition is an EC.',
  },
  {
    elementType: 'drug_product_specification',
    defaultEc: true,
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    description: 'DP specification acceptance criteria are ECs.',
  },
  {
    elementType: 'analytical_procedure',
    defaultEc: true,
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    description: 'Analytical procedures are ECs; principle vs parameter-level ECs depend on Q14 approach.',
  },
  {
    elementType: 'container_closure',
    defaultEc: true,
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    description: 'Primary container-closure components are ECs.',
  },
  {
    elementType: 'control_strategy_element',
    defaultEc: true,
    defaultUs: 'CBE-30',
    defaultEu: 'IB',
    description: 'Elements of the documented control strategy are ECs.',
  },
  {
    elementType: 'shelf_life',
    defaultEc: true,
    defaultUs: 'PAS',
    defaultEu: 'II',
    description: 'Shelf life and storage conditions are ECs.',
  },
  {
    elementType: 'facility_site',
    defaultEc: true,
    defaultUs: 'PAS',
    defaultEu: 'II',
    description: 'Manufacturing site identity is an EC.',
  },
];

function ecRuleFor(elementType: DossierElementType): EcBaseRule {
  const r = EC_BASE_RULES.find((x: EcBaseRule) => x.elementType === elementType);
  return (
    r ?? {
      elementType,
      defaultEc: true,
      defaultUs: 'PAS',
      defaultEu: 'II',
      description: 'Unclassified element treated conservatively as an EC.',
    }
  );
}

/**
 * Assess which dossier elements are Established Conditions (legally binding) vs
 * supportive information, and the reporting category a future change to each
 * would attract — modulated by development approach (minimal vs enhanced/QbD)
 * per ICH Q12 Section 3 and its Annex.
 */
export function assessEstablishedConditions(
  params: AssessEstablishedConditionsParams,
): AssessEstablishedConditionsResult {
  const approach: DevelopmentApproach = params.developmentApproach ?? 'minimal';
  const modality: ProductModality = params.modality ?? 'small_molecule';

  const assessments: EstablishedConditionAssessment[] = params.elements.map(
    (el: DossierElementInput): EstablishedConditionAssessment => {
      const rule = ecRuleFor(el.elementType);

      // Determine EC status.
      let isEc = rule.defaultEc;

      // Enhanced approach: a parameter within a design space, fully controlled
      // downstream and without direct CQA impact, can be classified as
      // supportive information rather than an EC (Q12 Annex examples).
      if (el.controlledDownstream === true && el.cqaImpact !== true) {
        isEc = false;
      }
      if (el.withinDesignSpace === true) {
        isEc = false;
      }
      if (el.elementType === 'process_parameter') {
        isEc = el.cqaImpact === true && el.controlledDownstream !== true;
      }
      // CQA impact forces EC regardless of approach.
      if (el.cqaImpact === true && el.withinDesignSpace !== true) {
        isEc = true;
      }

      // Reporting category for a change to the element.
      let us = rule.defaultUs;
      let eu = rule.defaultEu;

      if (!isEc) {
        // Changes to supportive information generally need no submission (notify in AR at most).
        us = 'Annual Report';
        eu = 'IA';
      } else if (approach === 'enhanced') {
        // Enhanced approach can lower the reporting category by one tier for
        // parameter-level ECs that remain within the demonstrated knowledge space.
        if (el.elementType === 'process_parameter' || el.elementType === 'analytical_procedure') {
          us = adjustUsCategory(us, 'low');
          eu = adjustEuType(eu, 'low');
        }
      }

      const rationaleParts: string[] = [rule.description];
      if (!isEc) {
        rationaleParts.push(
          el.withinDesignSpace === true
            ? 'Element is within an approved design space, so movement is not a change requiring a submission (supportive information).'
            : 'Element is fully controlled downstream without direct CQA impact, so it is supportive information rather than an EC.',
        );
      } else if (approach === 'enhanced') {
        rationaleParts.push(
          'Enhanced (QbD) development can justify a parameter-level EC with a reduced reporting category for changes within the demonstrated knowledge space (Q12 Annex).',
        );
      } else {
        rationaleParts.push('Minimal development approach: element described as a fixed condition and is an EC.');
      }

      return {
        name: el.name,
        elementType: el.elementType,
        isEstablishedCondition: isEc,
        classification: isEc ? 'established_condition' : 'supportive_information',
        changeReportingCategory: us,
        euChangeType: eu,
        rationale: rationaleParts.join(' '),
      };
    },
  );

  const ecCount = assessments.filter((a: EstablishedConditionAssessment) => a.isEstablishedCondition).length;
  const siCount = assessments.length - ecCount;

  const enhancedBenefit =
    approach === 'enhanced'
      ? 'Enhanced (QbD) development supports parameter-level ECs and lower reporting categories for in-design-space changes, increasing post-approval regulatory flexibility (ICH Q12 Annex, ICH Q8(R2)).'
      : 'Minimal development typically yields more ECs at fixed values and higher reporting categories; consider an enhanced approach for elements where post-approval flexibility is valuable.';

  const guidance: string[] = [
    'Established Conditions (ECs) are the legally binding elements considered necessary to assure product quality; a change to an EC requires the indicated regulatory submission (ICH Q12 Section 3).',
    'Supportive information is descriptive material that is NOT legally binding; updating it does not by itself require a submission.',
    'Document the ECs and their reporting categories in the PLCM document (ICH Q12 Section 5).',
  ];
  if (modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy') {
    guidance.push(
      'For biologics, more process parameters tend to be ECs because the process defines the product; comparability (ICH Q5E) underpins any EC change.',
    );
  }

  return {
    developmentApproach: approach,
    modality,
    summary: {
      totalElements: assessments.length,
      establishedConditions: ecCount,
      supportiveInformation: siCount,
      enhancedApproachBenefit: enhancedBenefit,
    },
    assessments,
    guidance,
    citations: cite('ich_q12', 'ich_q12_ec', 'ich_q12_annex', 'ich_q8', 'ich_q11', 'ich_q14'),
    provenance: provenance('assessEstablishedConditions'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — designPACMP (ICH Q12 Section 4)
// ─────────────────────────────────────────────────────────────────────────────

export interface PacmpTestInput {
  attribute: string;
  test: string;
  acceptanceCriterion: string;
  /** Is this attribute a CQA? Drives whether comparability is implicated. */
  cqa?: boolean;
}

export interface DesignPacmpParams {
  plannedChangeArea: ChangeArea;
  plannedChangeDescription: string;
  modality?: ProductModality;
  /** Current (pre-PACMP) reporting category if filed as a one-off change. */
  currentCategoryIfNoProtocol?: UsReportingCategory;
  /** Proposed reduced category the applicant wants to achieve via the PACMP. */
  proposedReducedCategory?: UsReportingCategory;
  tests?: PacmpTestInput[];
  /** Will a stability commitment be part of the protocol? */
  includeStability?: boolean;
  risk?: ChangeRiskInputs;
}

export interface PacmpStep {
  step: number;
  title: string;
  detail: string;
}

export interface DesignPacmpResult {
  plannedChange: {
    area: ChangeArea;
    label: string;
    description: string;
  };
  modality: ProductModality;
  protocolType: 'PACMP (ICH Q12)' | 'Comparability Protocol (FDA)';
  twoStepDescription: string;
  testPlan: Array<{
    attribute: string;
    test: string;
    acceptanceCriterion: string;
    cqa: boolean;
    purpose: string;
  }>;
  stabilityCommitment: string | null;
  reportingCategory: {
    withoutProtocol: UsReportingCategory;
    proposedWithProtocol: UsReportingCategory;
    euMechanism: string;
    feasible: boolean;
    rationale: string;
  };
  executionSteps: PacmpStep[];
  prerequisites: string[];
  warnings: string[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

/** One-tier reduction is the typical PACMP/CP benefit; deeper reduction needs justification. */
function reduceCategoryOneTier(cat: UsReportingCategory): UsReportingCategory {
  return adjustUsCategory(cat, 'low');
}

/**
 * Design a Post-Approval Change Management Protocol (PACMP) — the ICH Q12 tool
 * that gives an applicant predictability by pre-agreeing the tests/studies and
 * acceptance criteria for a specific planned change, in exchange for a reduced
 * reporting category at the time of implementation.
 */
export function designPACMP(params: DesignPacmpParams): DesignPacmpResult {
  const modality: ProductModality = params.modality ?? 'small_molecule';
  const profile = profileFor(params.plannedChangeArea);

  const withoutProtocol =
    params.currentCategoryIfNoProtocol ??
    classifyPostApprovalChange({
      changeArea: params.plannedChangeArea,
      modality,
      risk: params.risk,
    }).us.category;

  // Default proposed category: one tier down from the unprotocoled category.
  const proposed = params.proposedReducedCategory ?? reduceCategoryOneTier(withoutProtocol);

  const warnings: string[] = [];

  // Feasibility: PACMP cannot reduce below CBE-0 to Annual Report for CQA-affecting
  // changes, and cannot turn a sterile process change into a notification.
  const order: UsReportingCategory[] = ['Annual Report', 'CBE-0', 'CBE-30', 'PAS'];
  let feasible = order.indexOf(proposed) <= order.indexOf(withoutProtocol);
  if (!feasible) {
    warnings.push('Proposed reduced category is not lower than the unprotocoled category; a PACMP provides no reporting benefit here.');
  }
  const risks = params.risk ?? {};
  if (risks.sterileProcess === true && proposed === 'Annual Report') {
    feasible = false;
    warnings.push('A sterile/aseptic process change cannot be reduced to an Annual Report category even with a PACMP.');
  }
  if ((modality === 'cell_gene_therapy') && order.indexOf(proposed) < order.indexOf('CBE-30')) {
    warnings.push('For cell & gene therapies, regulators rarely accept reduction below CBE-30 due to limited comparability assurance.');
  }

  // Build the test plan. If the caller supplies tests, annotate them; otherwise
  // generate a sensible default panel for the change area.
  const suppliedTests: PacmpTestInput[] = params.tests ?? defaultPacmpTests(params.plannedChangeArea, modality);
  const testPlan = suppliedTests.map((t: PacmpTestInput) => ({
    attribute: t.attribute,
    test: t.test,
    acceptanceCriterion: t.acceptanceCriterion,
    cqa: t.cqa === true,
    purpose: t.cqa === true
      ? 'Demonstrate the CQA remains within criteria after the change (comparability anchor).'
      : 'Confirm the quality attribute is unaffected by the change.',
  }));

  const stabilityCommitment =
    params.includeStability === true || profile.area === 'container_closure' || profile.area === 'stability_shelf_life'
      ? 'Place the first 1–3 production batches manufactured under the change on the approved stability protocol (e.g., long-term 25°C/60%RH and accelerated 40°C/75%RH per ICH Q1A) and commit to report any out-of-trend results; confirm shelf life is unaffected.'
      : null;

  const protocolType: 'PACMP (ICH Q12)' | 'Comparability Protocol (FDA)' = 'PACMP (ICH Q12)';

  const executionSteps: PacmpStep[] = [
    {
      step: 1,
      title: 'Submit the PACMP (Step 1)',
      detail:
        'File the PACMP as a Prior Approval Supplement describing the planned change, the risk assessment, the tests/studies, acceptance criteria, and the proposed reduced reporting category for implementation. FDA/EMA review and agree the protocol up front (ICH Q12 Section 4).',
    },
    {
      step: 2,
      title: 'Execute the change and tests',
      detail:
        'Implement the change and run the pre-agreed test plan and any stability commitment. Compare results to the agreed acceptance criteria.',
    },
    {
      step: 3,
      title: 'Report under the reduced category (Step 2)',
      detail: `If all acceptance criteria are met, implement and report the change under the agreed reduced category (${proposed}) rather than ${withoutProtocol}. If any criterion fails, the reduced category does not apply and the change reverts to ${withoutProtocol}.`,
    },
  ];

  const prerequisites: string[] = [
    'A documented control strategy and defined CQAs for the affected attribute(s) (ICH Q8/Q11).',
    'Quality risk management assessment of the planned change (ICH Q9).',
    'A Pharmaceutical Quality System capable of managing the change (ICH Q10).',
  ];
  if (modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy') {
    prerequisites.push('A comparability strategy consistent with ICH Q5E for the biologic.');
  }

  return {
    plannedChange: {
      area: params.plannedChangeArea,
      label: profile.label,
      description: params.plannedChangeDescription,
    },
    modality,
    protocolType,
    twoStepDescription:
      'A PACMP is a two-step regulatory tool: Step 1 — submit and obtain agreement on the change description, tests, and acceptance criteria; Step 2 — after executing the change and meeting the criteria, report under the pre-agreed reduced category (ICH Q12 Section 4). The FDA Comparability Protocol (2016 draft) is the analogous US mechanism.',
    testPlan,
    stabilityCommitment,
    reportingCategory: {
      withoutProtocol,
      proposedWithProtocol: feasible ? proposed : withoutProtocol,
      euMechanism:
        'In the EU, the equivalent mechanism is a Post-Approval Change Management Protocol submitted as a Type II variation; once approved, the subsequent change can be implemented as a lower-tier variation (often Type IB or IA) as agreed in the protocol.',
      feasible,
      rationale: feasible
        ? `A PACMP can reduce the reporting category from ${withoutProtocol} to ${proposed} because the assessment of the change is performed up front against agreed criteria.`
        : `The proposed reduction to ${proposed} is not supportable; the change should be reported as ${withoutProtocol}.`,
    },
    executionSteps,
    prerequisites,
    warnings,
    citations: cite('ich_q12', 'ich_q12_pacmp', 'fda_comparability_protocols', 'ich_q9', 'ich_q10', 'eu_variations_reg'),
    provenance: provenance('designPACMP'),
  };
}

function defaultPacmpTests(area: ChangeArea, modality: ProductModality): PacmpTestInput[] {
  const biologic = modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy';
  switch (area) {
    case 'manufacturing_site':
    case 'manufacturing_process':
    case 'scale':
    case 'equipment':
      return biologic
        ? [
            { attribute: 'Identity / primary structure', test: 'Peptide map / intact mass', acceptanceCriterion: 'Comparable to reference profile', cqa: true },
            { attribute: 'Purity / impurities', test: 'SEC-HPLC, CE-SDS', acceptanceCriterion: 'Within approved limits; comparable profile', cqa: true },
            { attribute: 'Potency', test: 'Validated bioassay', acceptanceCriterion: 'Within approved acceptance range', cqa: true },
            { attribute: 'Charge variants', test: 'iCIEF / IEX', acceptanceCriterion: 'Comparable distribution', cqa: true },
          ]
        : [
            { attribute: 'Assay', test: 'HPLC assay', acceptanceCriterion: '95.0–105.0% label claim', cqa: true },
            { attribute: 'Impurities', test: 'Related substances by HPLC', acceptanceCriterion: 'Within approved specification', cqa: true },
            { attribute: 'Dissolution', test: 'Dissolution profile (f2)', acceptanceCriterion: 'f2 ≥ 50 vs pre-change profile', cqa: true },
            { attribute: 'Uniformity', test: 'Content uniformity', acceptanceCriterion: 'Meets USP <905>', cqa: false },
          ];
    case 'composition_excipient':
      return [
        { attribute: 'Dissolution', test: 'Dissolution profile (f2)', acceptanceCriterion: 'f2 ≥ 50 vs reference', cqa: true },
        { attribute: 'Assay', test: 'HPLC assay', acceptanceCriterion: 'Within specification', cqa: true },
        { attribute: 'Physical attributes', test: 'Hardness, friability, disintegration', acceptanceCriterion: 'Within in-process limits', cqa: false },
      ];
    case 'specification':
    case 'analytical_method':
      return [
        { attribute: 'Method equivalence', test: 'Cross-validation old vs new method', acceptanceCriterion: 'Equivalent results within stated tolerance', cqa: false },
        { attribute: 'System suitability', test: 'Per ICH Q2(R2)', acceptanceCriterion: 'Meets validation acceptance criteria', cqa: false },
      ];
    case 'container_closure':
      return [
        { attribute: 'Container integrity', test: 'Container closure integrity test (CCIT)', acceptanceCriterion: 'Pass', cqa: true },
        { attribute: 'Extractables/leachables', test: 'E&L study (as applicable)', acceptanceCriterion: 'Below safety thresholds', cqa: false },
        { attribute: 'Stability', test: 'ICH Q1A stability', acceptanceCriterion: 'Meets specification through shelf life', cqa: true },
      ];
    default:
      return [
        { attribute: 'Release testing', test: 'Full release panel', acceptanceCriterion: 'Within approved specification', cqa: true },
      ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — planAnnualReport / PLCM (ICH Q12 Section 5)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnualReportChangeInput {
  changeArea: ChangeArea;
  description: string;
  /** The category the applicant believes this change attracts. */
  assertedCategory?: UsReportingCategory;
  modality?: ProductModality;
  magnitude?: ChangeMagnitude;
}

export interface PlanAnnualReportParams {
  productName?: string;
  reportingPeriod?: string;
  modality?: ProductModality;
  changes?: AnnualReportChangeInput[];
  stabilityProtocolOngoing?: boolean;
  includePlcmDocument?: boolean;
}

export interface AnnualReportableChange {
  changeArea: ChangeArea;
  description: string;
  classifiedCategory: UsReportingCategory;
  annualReportable: boolean;
  note: string;
}

export interface PlcmSection {
  section: string;
  title: string;
  contents: string;
}

export interface PlanAnnualReportResult {
  productName: string;
  reportingPeriod: string;
  modality: ProductModality;
  annualReportContents: {
    requiredSections: string[];
    reportableChanges: AnnualReportableChange[];
    nonAnnualReportableFlagged: AnnualReportableChange[];
    stabilityUpdate: string;
  };
  plcmDocument: {
    included: boolean;
    purpose: string;
    sections: PlcmSection[];
  };
  guidance: string[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

/**
 * Plan the content of an annual report and (optionally) the ICH Q12 Product
 * Lifecycle Management (PLCM) document: which changes are annual-reportable,
 * stability updates, and the PLCM structure that centralizes ECs and reporting
 * categories.
 */
export function planAnnualReport(params: PlanAnnualReportParams): PlanAnnualReportResult {
  const modality: ProductModality = params.modality ?? 'small_molecule';
  const productName = params.productName ?? 'the product';
  const reportingPeriod = params.reportingPeriod ?? 'the current annual reporting period';

  const reportable: AnnualReportableChange[] = [];
  const nonReportableFlagged: AnnualReportableChange[] = [];

  for (const ch of params.changes ?? []) {
    const classified =
      ch.assertedCategory ??
      classifyPostApprovalChange({
        changeArea: ch.changeArea,
        modality: ch.modality ?? modality,
        magnitude: ch.magnitude,
      }).us.category;

    const isAr = classified === 'Annual Report';
    const entry: AnnualReportableChange = {
      changeArea: ch.changeArea,
      description: ch.description,
      classifiedCategory: classified,
      annualReportable: isAr,
      note: isAr
        ? 'Minor change — document in the annual report under 21 CFR 314.70(d); no supplement required.'
        : `This change is classified ${classified} and requires a supplement; it is NOT merely annual-reportable. Include only after the supplement is filed/approved as appropriate.`,
    };
    if (isAr) reportable.push(entry);
    else nonReportableFlagged.push(entry);
  }

  const stabilityUpdate = params.stabilityProtocolOngoing === true
    ? 'Include updated stability data for batches on the approved stability protocol, any commitment batches, and a statement of conformance to the approved shelf life. Report any confirmed out-of-specification or significant out-of-trend results promptly (these may require a separate field alert or supplement).'
    : 'Provide a statement on stability status; if no new long-term data are available this period, state so and reference the approved stability commitment.';

  const requiredSections: string[] = [
    'Summary of significant new information from the previous year (21 CFR 314.81 / 314.70(d) annual report).',
    'Distribution data.',
    'Labeling changes (with current labeling).',
    'CMC changes made under the annual report category (minor changes).',
    'Nonclinical/clinical data summaries as applicable.',
    'Stability data and shelf-life status update.',
  ];

  const plcmIncluded = params.includePlcmDocument === true;
  const plcmSections: PlcmSection[] = plcmIncluded
    ? [
        {
          section: '1',
          title: 'Established Conditions (ECs) and reporting categories',
          contents: 'Tabulate ECs for drug substance and drug product with the reporting category for a future change to each (ICH Q12 Section 3 & 5).',
        },
        {
          section: '2',
          title: 'Post-Approval CMC commitments',
          contents: 'List outstanding commitments (e.g., stability commitments, process validation lifecycle stage 3 monitoring) with timelines.',
        },
        {
          section: '3',
          title: 'PACMPs / Comparability Protocols',
          contents: 'Reference any approved PACMPs/CPs and the reduced reporting categories they enable.',
        },
        {
          section: '4',
          title: 'Change history',
          contents: 'Summarize implemented post-approval changes and their reporting categories since approval.',
        },
      ]
    : [];

  const guidance: string[] = [
    'The annual report captures minor (Annual Report category) CMC changes; moderate/major changes need CBE-30/CBE-0/PAS supplements respectively (21 CFR 314.70).',
    'The PLCM document is a structured, living summary of ECs, their reporting categories, PACMPs, and post-approval commitments that travels with the dossier (ICH Q12 Section 5).',
    'Keep the PLCM document consistent with the approved application; update it whenever ECs or reporting categories change.',
  ];
  if (modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy') {
    guidance.push('For biologics, annual reportable changes are governed by 21 CFR 601.12(d); confirm against the BLA annual report requirements.');
  }

  return {
    productName,
    reportingPeriod,
    modality,
    annualReportContents: {
      requiredSections,
      reportableChanges: reportable,
      nonAnnualReportableFlagged: nonReportableFlagged,
      stabilityUpdate,
    },
    plcmDocument: {
      included: plcmIncluded,
      purpose:
        'The PLCM document (ICH Q12 Section 5) is a central repository describing how the applicant intends to manage post-approval CMC changes: it lists ECs, their reporting categories, approved PACMPs, and post-approval commitments.',
      sections: plcmSections,
    },
    guidance,
    citations: cite('ich_q12', 'ich_q12_plcm', 'cfr_314_70d', 'fda_ar_changes', 'cfr_601_12'),
    provenance: provenance('planAnnualReport'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — assessPostApprovalComparability (ICH Q5E)
// ─────────────────────────────────────────────────────────────────────────────

export interface AssessPostApprovalComparabilityParams {
  changeArea: ChangeArea;
  modality?: ProductModality;
  changeDescription?: string;
  /** Does the change occur upstream (e.g., cell line, fermentation) or downstream (fill/finish)? */
  changeStage?: 'upstream' | 'downstream' | 'formulation' | 'analytical' | 'fill_finish';
  affectsCqa?: boolean;
  /** Are validated, sensitive analytical methods available for all CQAs? */
  analyticalCoverageComplete?: boolean;
  /** Existing PK/PD or clinical data that could bridge? */
  clinicalDataAvailable?: boolean;
  risk?: ChangeRiskInputs;
}

export type ComparabilityExtent = 'analytical_only' | 'analytical_plus_nonclinical' | 'analytical_plus_clinical';

export interface AssessPostApprovalComparabilityResult {
  modality: ProductModality;
  changeArea: ChangeArea;
  comparabilityApplicable: boolean;
  framework: string;
  extent: ComparabilityExtent;
  analyticalComparability: {
    required: boolean;
    recommendedAttributes: string[];
    note: string;
  };
  functionalBiologicalComparability: {
    required: boolean;
    note: string;
  };
  bridgingStudies: {
    nonclinicalRequired: boolean;
    clinicalRequired: boolean;
    pkPdRequired: boolean;
    rationale: string;
  };
  riskBasedExtentRationale: string;
  decisionTree: string[];
  warnings: string[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

/**
 * Assess comparability for a manufacturing change: analytical and biological
 * comparability, whether nonclinical/clinical bridging is needed, and the
 * risk-based extent — grounded in ICH Q5E (biologics) and the comparability
 * principles underlying FDA/EU change assessment.
 */
export function assessPostApprovalComparability(
  params: AssessPostApprovalComparabilityParams,
): AssessPostApprovalComparabilityResult {
  const modality: ProductModality = params.modality ?? 'small_molecule';
  const isBiologic = modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy' || modality === 'peptide_oligonucleotide';
  const profile = profileFor(params.changeArea);
  const risk = scoreChangeRisk(modality, params.risk ?? {}, profile.comparabilitySensitive);

  const warnings: string[] = [];

  // For small molecules, formal Q5E comparability is generally not invoked; instead
  // physicochemical equivalence + dissolution + impurities suffices.
  const comparabilityApplicable = isBiologic || profile.comparabilitySensitive;

  const framework = isBiologic
    ? 'ICH Q5E — Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process'
    : 'Physicochemical and in vitro equivalence per FDA Changes Guidance and SUPAC (no formal Q5E comparability exercise for small molecules)';

  // Determine extent via decision tree.
  const stage = params.changeStage ?? (profile.comparabilitySensitive ? 'upstream' : 'downstream');
  const upstream = stage === 'upstream';
  const cqaAffected = params.affectsCqa === true || (params.risk?.affectsCqa === true);
  const analyticalComplete = params.analyticalCoverageComplete !== false; // default true unless explicitly false

  let extent: ComparabilityExtent = 'analytical_only';
  let nonclinicalRequired = false;
  let clinicalRequired = false;
  let pkPdRequired = false;

  if (isBiologic) {
    if (!analyticalComplete) {
      // Gaps in analytical coverage push toward bridging studies.
      extent = 'analytical_plus_clinical';
      clinicalRequired = true;
      pkPdRequired = true;
      warnings.push('Incomplete analytical coverage of CQAs typically necessitates clinical/PK bridging per ICH Q5E.');
    } else if (upstream && cqaAffected && risk.tier === 'high') {
      extent = 'analytical_plus_clinical';
      clinicalRequired = true;
      pkPdRequired = true;
    } else if ((upstream && cqaAffected) || risk.tier === 'high') {
      extent = 'analytical_plus_nonclinical';
      nonclinicalRequired = true;
      pkPdRequired = cqaAffected;
    } else {
      extent = 'analytical_only';
    }
  } else {
    // Small molecule: analytical/in vitro only in nearly all cases.
    extent = 'analytical_only';
    if (cqaAffected && risk.tier === 'high') {
      pkPdRequired = true;
      extent = 'analytical_plus_clinical';
      warnings.push('A high-risk change affecting a CQA of a small molecule (e.g., affecting bioavailability) may require an in vivo bioequivalence/PK study.');
    }
  }

  // If clinical exists already, a new study may be avoidable.
  if (clinicalRequired && params.clinicalDataAvailable === true) {
    warnings.push('Existing clinical/PK data may bridge the change; confirm relevance and avoid a new clinical study if the prior data cover the affected CQAs.');
  }

  const recommendedAttributes: string[] = isBiologic
    ? [
        'Primary structure (peptide map, intact/subunit mass)',
        'Higher-order structure (CD, DSC, HDX-MS as applicable)',
        'Purity & impurities (SEC, CE-SDS, rCE-SDS)',
        'Charge heterogeneity (iCIEF, IEX)',
        'Glycosylation / post-translational modifications',
        'Potency / biological activity (validated bioassay)',
        'Product- and process-related impurities (HCP, residual DNA)',
      ]
    : [
        'Assay / content',
        'Related substances & degradation products',
        'Dissolution profile (f2 where applicable)',
        'Polymorphic form / particle size (if CQA)',
        'Residual solvents / elemental impurities',
      ];

  const decisionTree: string[] = [
    '1. Define the CQAs potentially affected by the change (ICH Q8/Q11).',
    '2. Perform analytical comparability across release and characterization attributes (ICH Q5E for biologics).',
    '3. If analytical methods fully characterize the affected CQAs and results are comparable → analytical comparability may suffice.',
    '4. If residual uncertainty remains (limited analytical sensitivity, upstream change, CQA impact) → add nonclinical (functional/animal) comparability.',
    '5. If uncertainty persists or the affected CQA links to clinical safety/efficacy (e.g., immunogenicity, PK) → add clinical/PK bridging.',
    '6. Conclude comparable / not comparable; if not comparable, the change may be treated as a new product requiring additional data.',
  ];

  return {
    modality,
    changeArea: params.changeArea,
    comparabilityApplicable,
    framework,
    extent,
    analyticalComparability: {
      required: comparabilityApplicable,
      recommendedAttributes,
      note: isBiologic
        ? 'Use orthogonal, validated, sensitive methods; compare pre- and post-change material side-by-side against predefined comparability acceptance criteria (ICH Q5E).'
        : 'Compare physicochemical and in vitro release attributes of pre- and post-change batches against the approved specification and pre-change profile.',
    },
    functionalBiologicalComparability: {
      required: isBiologic && (cqaAffected || risk.tier !== 'low'),
      note: isBiologic
        ? 'Include potency/bioactivity and, where mechanism-relevant, binding (e.g., FcRn, FcγR) and functional (ADCC/CDC) assays.'
        : 'Functional/biological comparability assays are generally not applicable to small molecules.',
    },
    bridgingStudies: {
      nonclinicalRequired,
      clinicalRequired,
      pkPdRequired,
      rationale: `Extent "${extent}" selected from change stage (${stage}), CQA impact (${cqaAffected}), analytical coverage (${analyticalComplete ? 'complete' : 'incomplete'}), and risk tier (${risk.tier}).`,
    },
    riskBasedExtentRationale:
      'ICH Q5E and quality risk management (ICH Q9) direct a risk-based, stepwise approach: the extent of comparability data is proportionate to the potential of the change to affect quality, safety, and efficacy. Analytical data are the foundation; nonclinical/clinical bridging is added only when residual uncertainty warrants it.',
    decisionTree,
    warnings,
    citations: isBiologic
      ? cite('ich_q5e', 'ich_q9', 'ich_q12', 'ich_q8', 'cfr_601_12')
      : cite('fda_changes_guidance', 'supac_ir', 'ich_q9', 'ich_q12'),
    provenance: provenance('assessPostApprovalComparability'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — planLifecycleManagement (integrated, ICH Q12 tools selection)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannedChangeSummary {
  changeArea: ChangeArea;
  description?: string;
  expectedFrequency?: 'one_time' | 'recurring' | 'multiple_sites';
  magnitude?: ChangeMagnitude;
  risk?: ChangeRiskInputs;
}

export interface HistoricalChangeSummary {
  changeArea: ChangeArea;
  description?: string;
  reportedCategory?: UsReportingCategory;
  yearImplemented?: number;
}

export interface PlanLifecycleManagementParams {
  productName?: string;
  modality?: ProductModality;
  developmentApproach?: DevelopmentApproach;
  marketedRegions?: Array<'US' | 'EU' | 'global'>;
  plannedChanges?: PlannedChangeSummary[];
  changeHistory?: HistoricalChangeSummary[];
}

export type Q12Tool =
  | 'Established Conditions (ECs)'
  | 'PACMP / Comparability Protocol'
  | 'PLCM Document'
  | 'Design Space (ICH Q8)'
  | 'Annual Report category'
  | 'Standard supplement/variation';

export interface LifecycleToolRecommendation {
  changeArea: ChangeArea;
  description: string;
  recommendedTool: Q12Tool;
  defaultUsCategory: UsReportingCategory;
  defaultEuType: EuVariationType;
  rationale: string;
}

export interface PlanLifecycleManagementResult {
  productName: string;
  modality: ProductModality;
  developmentApproach: DevelopmentApproach;
  marketedRegions: Array<'US' | 'EU' | 'global'>;
  ecStrategy: {
    approachNote: string;
    recommendation: string;
  };
  toolRecommendations: LifecycleToolRecommendation[];
  pacmpCandidates: ChangeArea[];
  changeHistorySummary: {
    totalChanges: number;
    byCategory: Record<string, number>;
    note: string;
  };
  plcmDocumentPlan: PlcmSection[];
  integratedPlan: string[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

/**
 * Build an integrated lifecycle management plan: EC strategy, ICH Q12 tool
 * selection per planned change, PACMP candidates, change-history summary, and
 * the PLCM document structure.
 */
export function planLifecycleManagement(
  params: PlanLifecycleManagementParams,
): PlanLifecycleManagementResult {
  const modality: ProductModality = params.modality ?? 'small_molecule';
  const approach: DevelopmentApproach = params.developmentApproach ?? 'minimal';
  const productName = params.productName ?? 'the product';
  const regions = params.marketedRegions ?? ['global'];

  const toolRecommendations: LifecycleToolRecommendation[] = (params.plannedChanges ?? []).map(
    (pc: PlannedChangeSummary): LifecycleToolRecommendation => {
      const classified = classifyPostApprovalChange({
        changeArea: pc.changeArea,
        modality,
        magnitude: pc.magnitude,
        risk: pc.risk,
      });
      const profile = profileFor(pc.changeArea);

      // Tool selection logic.
      let tool: Q12Tool;
      if (classified.us.category === 'Annual Report') {
        tool = 'Annual Report category';
      } else if (pc.expectedFrequency === 'recurring' || pc.expectedFrequency === 'multiple_sites') {
        tool = 'PACMP / Comparability Protocol';
      } else if (approach === 'enhanced' && (pc.changeArea === 'manufacturing_process' || pc.changeArea === 'process_parameter' as ChangeArea)) {
        tool = 'Design Space (ICH Q8)';
      } else if (classified.us.category === 'PAS' && profile.comparabilitySensitive) {
        tool = 'PACMP / Comparability Protocol';
      } else {
        tool = 'Standard supplement/variation';
      }

      const rationale =
        tool === 'PACMP / Comparability Protocol'
          ? 'A recurring/major comparability-sensitive change benefits from a pre-agreed PACMP to gain predictability and a reduced reporting category (ICH Q12 Section 4).'
          : tool === 'Design Space (ICH Q8)'
            ? 'An enhanced (QbD) process change may be managed within an approved design space, avoiding a submission for in-space movement (ICH Q8(R2)).'
            : tool === 'Annual Report category'
              ? 'A minor change is managed via the annual report category without a supplement (21 CFR 314.70(d)).'
              : 'A standard one-time change is best handled with a conventional supplement/variation.';

      return {
        changeArea: pc.changeArea,
        description: pc.description ?? profile.label,
        recommendedTool: tool,
        defaultUsCategory: classified.us.category,
        defaultEuType: classified.eu.variationType,
        rationale,
      };
    },
  );

  const pacmpCandidates: ChangeArea[] = Array.from(
    new Set(
      toolRecommendations
        .filter((t: LifecycleToolRecommendation) => t.recommendedTool === 'PACMP / Comparability Protocol')
        .map((t: LifecycleToolRecommendation) => t.changeArea),
    ),
  );

  // Change-history summary.
  const byCategory: Record<string, number> = {};
  for (const h of params.changeHistory ?? []) {
    const cat =
      h.reportedCategory ??
      classifyPostApprovalChange({ changeArea: h.changeArea, modality }).us.category;
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }
  const totalHistory = (params.changeHistory ?? []).length;

  const ecStrategy = {
    approachNote:
      approach === 'enhanced'
        ? 'Enhanced (QbD) development: define ECs at the parameter level with justified ranges and design spaces, enabling lower reporting categories for in-space changes (ICH Q12 Annex, ICH Q8).'
        : 'Minimal development: ECs default to fixed conditions; consider targeted enhanced characterization for elements where post-approval flexibility is valuable.',
    recommendation:
      'Explicitly propose ECs and their reporting categories in the dossier and capture them in the PLCM document so that future changes have a predictable regulatory pathway.',
  };

  const plcmDocumentPlan: PlcmSection[] = [
    { section: '1', title: 'Established Conditions table', contents: 'ECs for DS and DP with the reporting category for each potential change.' },
    { section: '2', title: 'Reporting category justifications', contents: 'Rationale (risk + development approach) for each proposed reporting category.' },
    { section: '3', title: 'Approved PACMPs / Comparability Protocols', contents: 'List of pre-agreed protocols and the reduced categories they enable.' },
    { section: '4', title: 'Post-approval CMC commitments', contents: 'Stability commitments, process validation stage-3 monitoring, and timelines.' },
    { section: '5', title: 'Change history', contents: 'Chronological log of implemented post-approval changes with categories.' },
  ];

  const integratedPlan: string[] = [
    `1. Establish the control strategy and CQAs for ${productName} (ICH Q8/Q9/Q10/Q11).`,
    '2. Define Established Conditions and their reporting categories; document them in the PLCM (ICH Q12 Section 3 & 5).',
    '3. For recurring or comparability-sensitive changes, prepare PACMPs/Comparability Protocols to lock in reduced reporting (ICH Q12 Section 4).',
    '4. For enhanced-development process changes, use design space to avoid submissions for in-space movement (ICH Q8).',
    '5. Route minor changes through the annual report; moderate/major changes through CBE-30/CBE-0/PAS (US) or Type IA/IB/II (EU).',
    '6. Maintain the PLCM document as a living record and keep it consistent across all marketed regions.',
  ];

  const regionNote = regions.includes('EU') || regions.includes('global')
    ? 'For EU-marketed products, map each US category to the corresponding variation type (IA/IB/II) and follow Reg (EC) 1234/2008 procedures and timelines.'
    : 'Product is US-focused; apply 21 CFR 314.70 / 601.12 categories.';
  integratedPlan.push(`7. ${regionNote}`);

  return {
    productName,
    modality,
    developmentApproach: approach,
    marketedRegions: regions,
    ecStrategy,
    toolRecommendations,
    pacmpCandidates,
    changeHistorySummary: {
      totalChanges: totalHistory,
      byCategory,
      note:
        totalHistory === 0
          ? 'No change history supplied; the PLCM change-history section will be initialized empty.'
          : 'Change history summarized by reporting category; use it to demonstrate a robust, well-managed PQS (ICH Q10).',
    },
    plcmDocumentPlan,
    integratedPlan,
    citations: cite('ich_q12', 'ich_q12_ec', 'ich_q12_pacmp', 'ich_q12_plcm', 'ich_q8', 'ich_q9', 'ich_q10', 'ich_q11', 'cfr_314_70', 'eu_variations_reg'),
    provenance: provenance('planLifecycleManagement'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — Reference accessors (deterministic, no side effects)
// ─────────────────────────────────────────────────────────────────────────────

/** Return the full citation library (copy) for callers that need to enumerate it. */
export function listCitations(): RegulatoryCitation[] {
  return CITATIONS.map((c: CitationRecord) => ({ source: c.source, reference: c.reference, note: c.note }));
}

/** Return the change-area taxonomy (copy) for callers that need to enumerate it. */
export function listChangeAreas(): Array<{ area: ChangeArea; label: string; scope: string }> {
  return CHANGE_AREA_PROFILES.map((p: ChangeAreaProfile) => ({ area: p.area, label: p.label, scope: p.scope }));
}
