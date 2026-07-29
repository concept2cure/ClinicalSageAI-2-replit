/**
 * SUPAC / variations classifier with cross-module impact analysis.
 *
 * Deterministic classifier that takes a proposed post-approval (or
 * pre-approval) manufacturing change and returns:
 *   - FDA reporting category (Annual Report / CBE-0 / CBE-30 / PAS)
 *   - SUPAC tier (level 1 / 2 / 3) when applicable
 *   - EMA variation classification (Type IA / IAIN / IB / II) when relevant
 *   - Bioequivalence study requirements
 *   - Impacted CTD sections per change type
 *   - Validation requirements and timeline estimate
 *   - Citations to the controlling guidance
 *
 * Grounded in: SUPAC-IR (Nov 1995), SUPAC-MR (Sep 1997), SUPAC-SS (May 1997),
 * 21 CFR 314.70 (changes to an approved application), ICH Q12, and the
 * EMA Commission Regulation (EC) No 1234/2008 variations classification.
 *
 * Pure function — no DB, no LLM, no side effects. Can run inside a route
 * or be reused by the pre-submission gate to surface variation risk.
 *
 * @module server/services/cmc/supac-classifier
 */

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type ChangeCategory =
  | 'components_composition'
  | 'manufacturing_site'
  | 'scale_up'
  | 'manufacturing_process'
  | 'equipment'
  | 'container_closure'
  | 'specifications'
  | 'analytical_method'
  | 'stability_protocol';

export type DosageFormFamily =
  | 'immediate_release_oral_solid'  // SUPAC-IR applies
  | 'modified_release_oral_solid'   // SUPAC-MR applies
  | 'nonsterile_semisolid'          // SUPAC-SS applies
  | 'sterile_injectable'            // No SUPAC; CDER inspectional + 21 CFR 314.70
  | 'biologic'                      // Q12 / Q5E / CBE-30 / PAS
  | 'inhalation'
  | 'transdermal'
  | 'other';

export type ScaleChangeFactor = 'within_10x' | 'gt_10x';

export type ExcipientLevelChange = 'level_1' | 'level_2' | 'level_3';
// SUPAC-IR Section IV: Level 1 = up to specified % shifts; Level 2 = up to higher
// % shifts; Level 3 = beyond Level 2. Detailed limits depend on excipient class.

export type SiteChangeKind =
  | 'within_same_facility'         // Different building, same site
  | 'contiguous_site'              // Adjacent campus
  | 'different_site_same_country'
  | 'different_country';

export type ProcessChangeKind =
  | 'minor_in_kind'                // No change in equipment class, same operating principles
  | 'equipment_class_change'       // e.g. high-shear vs low-shear granulator
  | 'principle_change';            // e.g. wet to dry granulation

export interface VariationInput {
  /** The dosage form family the product belongs to. */
  dosageFormFamily: DosageFormFamily;
  /** Category of change being proposed. */
  changeCategory: ChangeCategory;
  /** Free-text human description of the change for the report narrative. */
  description?: string;
  /** Scale-up / scale-down factor relative to the approved batch size. */
  scaleChangeFactor?: ScaleChangeFactor;
  /** For components/composition changes, SUPAC excipient level. */
  excipientLevelChange?: ExcipientLevelChange;
  /** For site changes, the kind of site move. */
  siteChangeKind?: SiteChangeKind;
  /** For process / equipment changes, the kind of process change. */
  processChangeKind?: ProcessChangeKind;
  /** Whether the change touches a critical step (release, sterilisation, etc.). */
  touchesCriticalStep?: boolean;
  /** Whether the change affects the drug substance vs drug product. */
  affects?: 'drug_substance' | 'drug_product' | 'both';
  /** Whether comparability data already exists per ICH Q5E / Q12. */
  hasComparabilityData?: boolean;
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

export type FdaReportingCategory =
  | 'annual_report'   // CBE-0; reportable annually under 21 CFR 314.81
  | 'cbe_30'          // Effective 30 days after submission unless FDA objects
  | 'cbe_0'           // Effective immediately on submission
  | 'pas'             // Prior Approval Supplement; requires FDA approval before implementation
  | 'no_filing';      // Internal change documented in records but not filed

export type EmaVariationCategory =
  | 'type_ia'
  | 'type_ia_in'  // Type IA immediate notification
  | 'type_ib'
  | 'type_ii'
  | 'not_applicable';

export type SupacTier = 'level_1' | 'level_2' | 'level_3' | 'not_applicable';

export type BioequivalenceRequirement =
  | 'none'
  | 'in_vitro_dissolution'
  | 'in_vivo_be';

export interface VariationClassification {
  fdaReportingCategory: FdaReportingCategory;
  emaVariationCategory: EmaVariationCategory;
  supacTier: SupacTier;
  bioequivalence: BioequivalenceRequirement;
  /**
   * CTD sections requiring update for this change. Drawn from 21 CFR 314.70
   * exhibit list + SUPAC reporting expectations.
   */
  impactedCtdSections: string[];
  /** Validation, comparability, or stability studies that the change triggers. */
  validationRequirements: string[];
  /** Estimated implementation timeline in days from preparation to effective date. */
  estimatedTimelineDays: number;
  /** Confidence in the classification (0..1). */
  confidence: number;
  /** Citations to the controlling guidance / regulation. */
  citations: string[];
  /** Free-text rationale describing why this classification applies. */
  rationale: string[];
  /** Cross-module impact analysis. */
  crossModuleImpact: CrossModuleImpactItem[];
}

export interface CrossModuleImpactItem {
  /** CTD module affected. */
  module: 'Module 1' | 'Module 2' | 'Module 3' | 'Module 4' | 'Module 5';
  /** Specific CTD section(s) affected. */
  sections: string[];
  /** What needs to be updated. */
  whatToUpdate: string;
  /** Whether the update is mandatory or recommended. */
  required: boolean;
}

// ─── Classifier ──────────────────────────────────────────────────────────────

export function classifyVariation(input: VariationInput): VariationClassification {
  const citations: string[] = [];
  const rationale: string[] = [];

  // FDA path (SUPAC + 21 CFR 314.70)
  const fda = classifyFda(input, citations, rationale);

  // EMA path (Commission Regulation 1234/2008)
  const ema = classifyEma(input, citations, rationale);

  // SUPAC tier
  const supacTier = classifySupacTier(input, citations, rationale);

  // Bioequivalence
  const be = classifyBioequivalence(input, citations, rationale);

  // Impacted CTD sections
  const impactedCtdSections = impactedSectionsFor(input);

  // Validation requirements
  const validationRequirements = validationRequirementsFor(input);

  // Cross-module impact
  const crossModuleImpact = crossModuleImpactFor(input, impactedCtdSections);

  // Timeline estimate based on path
  const estimatedTimelineDays = estimateTimeline(fda, ema, be);

  // Confidence: drop confidence when input is sparse.
  const confidence = computeConfidence(input);

  return {
    fdaReportingCategory: fda,
    emaVariationCategory: ema,
    supacTier,
    bioequivalence: be,
    impactedCtdSections,
    validationRequirements,
    estimatedTimelineDays,
    confidence,
    citations: Array.from(new Set(citations)),
    rationale,
    crossModuleImpact,
  };
}

// ─── FDA classification ──────────────────────────────────────────────────────

function classifyFda(
  input: VariationInput,
  citations: string[],
  rationale: string[],
): FdaReportingCategory {
  citations.push('21 CFR 314.70 — Supplements and other changes to an approved application');

  // PAS triggers — major impact changes
  if (input.touchesCriticalStep
      && (input.changeCategory === 'manufacturing_process'
          || input.changeCategory === 'manufacturing_site'
          || input.changeCategory === 'components_composition')) {
    rationale.push('Change touches a critical step in process / site / composition — PAS per 21 CFR 314.70(b).');
    return 'pas';
  }

  if (input.processChangeKind === 'principle_change') {
    rationale.push('Process principle change (e.g. wet→dry granulation) is a major change requiring PAS.');
    citations.push('SUPAC-IR §V.C.3 (Level 3 process change)');
    return 'pas';
  }

  if (input.scaleChangeFactor === 'gt_10x') {
    rationale.push('Scale-up beyond 10× the approved batch size is a Level 3 change requiring PAS.');
    citations.push('SUPAC-IR §V.B.3 (Level 3 scale-up)');
    return 'pas';
  }

  if (input.excipientLevelChange === 'level_3') {
    rationale.push('SUPAC Level 3 excipient change requires PAS.');
    citations.push('SUPAC-IR §IV.C.3 (Level 3 component change)');
    return 'pas';
  }

  if (input.siteChangeKind === 'different_country') {
    rationale.push('Manufacturing site change to a different country requires PAS plus pre-approval inspection.');
    citations.push('21 CFR 314.70(b)(2)(i)(B)');
    return 'pas';
  }

  // CBE-30 triggers — moderate changes
  if (input.excipientLevelChange === 'level_2'
      || input.processChangeKind === 'equipment_class_change'
      || input.siteChangeKind === 'different_site_same_country') {
    rationale.push('Moderate change — CBE-30 supplement filed at least 30 days before implementation.');
    citations.push('21 CFR 314.70(c) — Changes Being Effected in 30 Days');
    if (input.excipientLevelChange === 'level_2') citations.push('SUPAC-IR §IV.C.2');
    if (input.processChangeKind === 'equipment_class_change') citations.push('SUPAC-IR §V.D.2');
    return 'cbe_30';
  }

  if (input.changeCategory === 'container_closure' && !input.touchesCriticalStep) {
    rationale.push('Container-closure change without critical-step impact — CBE-30.');
    citations.push('21 CFR 314.70(c)');
    return 'cbe_30';
  }

  if (input.changeCategory === 'analytical_method' && !input.touchesCriticalStep) {
    rationale.push('Analytical method change (non-critical) — CBE-30 with comparability.');
    citations.push('21 CFR 314.70(c)');
    return 'cbe_30';
  }

  // CBE-0 — immediate effect
  if (input.changeCategory === 'specifications' && !input.touchesCriticalStep) {
    rationale.push('Specification tightening (non-critical) — CBE-0 supplement effective on submission.');
    citations.push('21 CFR 314.70(c)(6)');
    return 'cbe_0';
  }

  // Annual Report — minor changes
  if (input.excipientLevelChange === 'level_1'
      || input.scaleChangeFactor === 'within_10x'
      || input.processChangeKind === 'minor_in_kind'
      || input.siteChangeKind === 'within_same_facility') {
    rationale.push('Minor change — documented in the annual report under 21 CFR 314.81.');
    citations.push('21 CFR 314.81 — Other postmarketing reports');
    return 'annual_report';
  }

  rationale.push('No specific trigger matched; defaulting to CBE-30 with sponsor justification.');
  return 'cbe_30';
}

// ─── EMA classification ──────────────────────────────────────────────────────

function classifyEma(
  input: VariationInput,
  citations: string[],
  rationale: string[],
): EmaVariationCategory {
  citations.push('Commission Regulation (EC) No 1234/2008 — Variations to marketing authorisations');

  if (input.touchesCriticalStep
      && (input.changeCategory === 'manufacturing_process'
          || input.changeCategory === 'components_composition')) {
    rationale.push('Major change touching critical step — Type II variation in EMA.');
    citations.push('EMA Guideline on Variations Classification §C — Major variations');
    return 'type_ii';
  }

  if (input.processChangeKind === 'principle_change' || input.scaleChangeFactor === 'gt_10x') {
    return 'type_ii';
  }

  if (input.siteChangeKind === 'different_site_same_country'
      || input.siteChangeKind === 'different_country'
      || input.processChangeKind === 'equipment_class_change'
      || input.excipientLevelChange === 'level_2') {
    rationale.push('Moderate change — Type IB variation; effective if no concerns within 30 days.');
    return 'type_ib';
  }

  if (input.changeCategory === 'analytical_method'
      || input.changeCategory === 'specifications'
      || input.excipientLevelChange === 'level_1') {
    rationale.push('Minor change — Type IA or IAIN (immediate notification) variation.');
    return input.touchesCriticalStep ? 'type_ia_in' : 'type_ia';
  }

  rationale.push('Defaulting to Type IB in absence of specific signal.');
  return 'type_ib';
}

// ─── SUPAC tier ──────────────────────────────────────────────────────────────

function classifySupacTier(
  input: VariationInput,
  citations: string[],
  rationale: string[],
): SupacTier {
  // SUPAC only applies to specific dosage form families.
  const supacApplies =
    input.dosageFormFamily === 'immediate_release_oral_solid'
    || input.dosageFormFamily === 'modified_release_oral_solid'
    || input.dosageFormFamily === 'nonsterile_semisolid';
  if (!supacApplies) {
    rationale.push('SUPAC tiers do not apply to this dosage form family.');
    return 'not_applicable';
  }

  if (input.dosageFormFamily === 'immediate_release_oral_solid') citations.push('FDA SUPAC-IR (November 1995)');
  if (input.dosageFormFamily === 'modified_release_oral_solid') citations.push('FDA SUPAC-MR (September 1997)');
  if (input.dosageFormFamily === 'nonsterile_semisolid') citations.push('FDA SUPAC-SS (May 1997)');

  if (input.excipientLevelChange) return input.excipientLevelChange;
  if (input.scaleChangeFactor === 'gt_10x') return 'level_3';
  if (input.scaleChangeFactor === 'within_10x') return 'level_2';
  if (input.processChangeKind === 'principle_change') return 'level_3';
  if (input.processChangeKind === 'equipment_class_change') return 'level_2';
  return 'level_1';
}

// ─── Bioequivalence ──────────────────────────────────────────────────────────

function classifyBioequivalence(
  input: VariationInput,
  citations: string[],
  rationale: string[],
): BioequivalenceRequirement {
  if (input.dosageFormFamily === 'sterile_injectable' || input.dosageFormFamily === 'biologic') {
    return 'none';
  }

  if (input.excipientLevelChange === 'level_3'
      || input.processChangeKind === 'principle_change'
      || input.scaleChangeFactor === 'gt_10x') {
    rationale.push('Level 3 change requires in vivo BE study per SUPAC.');
    citations.push('SUPAC-IR §V.B.3 / §IV.C.3');
    return 'in_vivo_be';
  }

  if (input.excipientLevelChange === 'level_2'
      || input.processChangeKind === 'equipment_class_change'
      || input.siteChangeKind === 'different_site_same_country'
      || input.siteChangeKind === 'different_country') {
    rationale.push('Level 2 / site change requires in vitro dissolution comparison.');
    return 'in_vitro_dissolution';
  }

  return 'none';
}

// ─── CTD section impact ──────────────────────────────────────────────────────

function impactedSectionsFor(input: VariationInput): string[] {
  const sections = new Set<string>();
  const isDs = input.affects === 'drug_substance' || input.affects === 'both';
  const isDp = input.affects === 'drug_product' || input.affects === 'both' || input.affects == null;

  switch (input.changeCategory) {
    case 'components_composition':
      if (isDp) {
        sections.add('3.2.P.1');  // Description and composition
        sections.add('3.2.P.2');  // Pharmaceutical development
        sections.add('3.2.P.3.2'); // Batch formula
      }
      break;
    case 'manufacturing_site':
      if (isDs) sections.add('3.2.S.2.1');
      if (isDp) sections.add('3.2.P.3.1');
      sections.add('3.2.A.1');  // Facilities and equipment
      break;
    case 'scale_up':
      if (isDp) {
        sections.add('3.2.P.3.2'); // Batch formula
        sections.add('3.2.P.3.3'); // Description of manufacturing process and process controls
        sections.add('3.2.P.3.4'); // Controls of critical steps
        sections.add('3.2.P.3.5'); // Process validation
      }
      break;
    case 'manufacturing_process':
    case 'equipment':
      if (isDs) {
        sections.add('3.2.S.2.2'); // Description of manufacturing process
        sections.add('3.2.S.2.5'); // Process validation
      }
      if (isDp) {
        sections.add('3.2.P.3.3');
        sections.add('3.2.P.3.4');
        sections.add('3.2.P.3.5');
      }
      break;
    case 'container_closure':
      if (isDp) {
        sections.add('3.2.P.7');
        sections.add('3.2.P.8.1'); // Stability summary
      }
      break;
    case 'specifications':
      if (isDs) {
        sections.add('3.2.S.4.1'); // Specification
        sections.add('3.2.S.4.5'); // Justification of specification
      }
      if (isDp) {
        sections.add('3.2.P.5.1'); // Specification
        sections.add('3.2.P.5.6'); // Justification of specification
      }
      break;
    case 'analytical_method':
      if (isDs) {
        sections.add('3.2.S.4.2'); // Analytical procedures
        sections.add('3.2.S.4.3'); // Validation of analytical procedures
      }
      if (isDp) {
        sections.add('3.2.P.5.2');
        sections.add('3.2.P.5.3');
      }
      break;
    case 'stability_protocol':
      if (isDs) {
        sections.add('3.2.S.7.1'); // Stability summary and conclusions
        sections.add('3.2.S.7.2'); // Post-approval stability protocol and commitment
      }
      if (isDp) {
        sections.add('3.2.P.8.1');
        sections.add('3.2.P.8.2');
      }
      break;
  }

  return Array.from(sections).sort();
}

// ─── Validation requirements ─────────────────────────────────────────────────

function validationRequirementsFor(input: VariationInput): string[] {
  const reqs: string[] = [];

  if (input.changeCategory === 'manufacturing_process'
      || input.changeCategory === 'equipment'
      || input.changeCategory === 'scale_up') {
    reqs.push('Process re-validation per FDA Process Validation Guidance (2011) — Stage 2 PPQ');
  }
  if (input.changeCategory === 'analytical_method') {
    reqs.push('Analytical method comparability per ICH Q2(R1) and Q14');
  }
  if (input.changeCategory === 'container_closure') {
    reqs.push('Container-closure compatibility + leachables under product contact');
  }
  if (input.changeCategory === 'manufacturing_site') {
    reqs.push('Site qualification + transfer protocol + 3 commercial-scale batches at new site');
  }
  if (input.changeCategory === 'components_composition' || input.changeCategory === 'scale_up') {
    reqs.push('Comparability per ICH Q5E (biologics) or pharmaceutical equivalence demonstration (small molecule)');
  }
  if (input.changeCategory === 'stability_protocol') {
    reqs.push('Stability commitment per ICH Q1A(R2) for ongoing batches at the new condition');
  }
  return reqs;
}

// ─── Cross-module impact ─────────────────────────────────────────────────────

function crossModuleImpactFor(
  input: VariationInput,
  impactedCtdSections: string[],
): CrossModuleImpactItem[] {
  const items: CrossModuleImpactItem[] = [];

  // Module 3 update is always required for variations that touch Module 3 sections.
  if (impactedCtdSections.length > 0) {
    items.push({
      module: 'Module 3',
      sections: impactedCtdSections,
      whatToUpdate: 'Update narrative + supporting data for the impacted Module 3 subsections; refresh batch formula and process description.',
      required: true,
    });
  }

  // Module 2 Quality Overall Summary always needs to reflect the change.
  items.push({
    module: 'Module 2',
    sections: ['2.3 (QOS)', '2.3.S', '2.3.P'].slice(0, input.affects === 'drug_substance' ? 2 : 3),
    whatToUpdate: 'Update Quality Overall Summary to reflect the change rationale, risk assessment, and revised control strategy.',
    required: true,
  });

  // Module 1 administrative + RMP cross-link
  items.push({
    module: 'Module 1',
    sections: ['1.4 (Administrative information)', '1.8 (Cover letter / variation justification)'],
    whatToUpdate: 'Cover letter, variation justification, change-control reference, and any commitments on post-approval stability.',
    required: true,
  });

  // Module 5 only if BE / bridging study is triggered.
  if (input.changeCategory === 'components_composition'
      || input.changeCategory === 'scale_up'
      || input.changeCategory === 'manufacturing_process') {
    if (input.dosageFormFamily === 'immediate_release_oral_solid'
        || input.dosageFormFamily === 'modified_release_oral_solid') {
      items.push({
        module: 'Module 5',
        sections: ['5.3.1.2 (Reports of comparative BA / BE studies)'],
        whatToUpdate: 'Cross-reference the dissolution / in vivo BE study supporting the change.',
        required: false,
      });
    }
  }

  return items;
}

// ─── Timeline estimate ───────────────────────────────────────────────────────

function estimateTimeline(
  fda: FdaReportingCategory,
  ema: EmaVariationCategory,
  be: BioequivalenceRequirement,
): number {
  // FDA timeline anchor
  let days: number;
  switch (fda) {
    case 'annual_report': days = 30; break;
    case 'cbe_0':         days = 14; break;
    case 'cbe_30':        days = 60; break;
    case 'pas':           days = 240; break;
    case 'no_filing':     days = 0;  break;
  }

  // EMA can extend
  if (ema === 'type_ii') days = Math.max(days, 180);
  if (ema === 'type_ib') days = Math.max(days, 90);

  // BE study extends
  if (be === 'in_vivo_be') days += 180;
  else if (be === 'in_vitro_dissolution') days += 30;

  return days;
}

function computeConfidence(input: VariationInput): number {
  let score = 0.5;
  if (input.dosageFormFamily) score += 0.1;
  if (input.changeCategory) score += 0.1;
  if (input.scaleChangeFactor) score += 0.1;
  if (input.excipientLevelChange) score += 0.05;
  if (input.siteChangeKind) score += 0.05;
  if (input.processChangeKind) score += 0.05;
  if (input.affects) score += 0.05;
  return Math.min(0.95, score);
}
