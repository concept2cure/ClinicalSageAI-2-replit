/**
 * Post-Approval Lifecycle Management (ICH Q12) — fixed reference tables
 * =====================================================================
 *
 * The citation library, the change-area profiles, the US and EU category texts,
 * the established-condition base rules and the default PACMP test panels of
 * post-approval-knowledge.ts, moved here unchanged on 2026-11-09 (Rule 2 S5d) so
 * that the engine stays under the 100,000-byte ceiling (CLAUDE.md Rule 6: a file
 * split out of a large one goes inside the folder it came from). Pure data and
 * pure lookups: no LLM, no network, no database. The engine is the only importer.
 *
 * @module server/services/post-approval/post-approval-reference
 */

import type {
  ChangeArea,
  DossierElementType,
  EuVariationType,
  PacmpTestInput,
  ProductModality,
  RegulatoryCitation,
  SupacLevel,
  UsReportingCategory,
  ChangeRiskTier,
} from './post-approval-knowledge.js';

export interface CitationRecord extends RegulatoryCitation {
  key: string;
}

/**
 * Master citation table. Every function pulls citations from here by key so the
 * exact reference text is identical everywhere it appears.
 */
export const CITATIONS: CitationRecord[] = [
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
    key: 'fda_bio_cmc_changes',
    source: 'US FDA',
    reference: 'FDA Draft Guidance: Chemistry, Manufacturing, and Controls Changes to an Approved Application: Certain Biological Products (June 2021)',
    note: 'Biologics counterpart of the NDA/ANDA changes guidance for 601.12 reporting categories. Recall: title and date not re-read on fda.gov.',
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

export interface ChangeAreaProfile {
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
export const CHANGE_AREA_PROFILES: ChangeAreaProfile[] = [
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

export function usRegulationFor(category: UsReportingCategory, biologic: boolean): string {
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

export function usDistributionRule(category: UsReportingCategory): string {
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

export function euProcedure(type: EuVariationType): string {
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

export function supacLevelFromTier(tier: ChangeRiskTier): SupacLevel {
  switch (tier) {
    case 'low':
      return 'Level 1';
    case 'moderate':
      return 'Level 2';
    case 'high':
      return 'Level 3';
  }
}

export interface EcBaseRule {
  elementType: DossierElementType;
  /** Is this element an EC by default (minimal approach)? */
  defaultEc: boolean;
  /** Default reporting category for a change to this EC. */
  defaultUs: UsReportingCategory;
  defaultEu: EuVariationType;
  description: string;
}

export const EC_BASE_RULES: EcBaseRule[] = [
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

export function defaultPacmpTests(area: ChangeArea, modality: ProductModality): PacmpTestInput[] {
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
