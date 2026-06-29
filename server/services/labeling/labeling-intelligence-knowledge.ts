/**
 * Labeling Intelligence Knowledge Base Service
 *
 * Deterministic, citation-backed knowledge base covering the core regulatory
 * labeling disciplines required for drug product labeling development across
 * FDA and EMA jurisdictions. Every function returns structured output grounded
 * in 21 CFR, FDA guidance, and EMA QRD templates — NO LLM calls, NO network
 * requests, NO database queries.
 *
 * Covered domains:
 *   1. PLR (Physician Labeling Rule) structure assessment (21 CFR 201.56-57)
 *   2. Boxed Warning criteria and formatting (21 CFR 201.57(c)(1))
 *   3. REMS (Risk Evaluation and Mitigation Strategies) design (FD&C Act §505-1)
 *   4. Pregnancy and Lactation labeling (PLLR Final Rule, 79 FR 72064)
 *   5. EU SmPC (Summary of Product Characteristics) structure (EMA QRD template)
 *   6. OTC Drug Facts labeling (21 CFR 201.66)
 *
 * @module server/services/labeling/labeling-intelligence-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProductType = 'prescription_drug' | 'biological' | 'biosimilar' | 'generic';
export type ApplicationType = 'NDA' | 'BLA' | 'ANDA' | 'supplement';
export type OTCCategory = 'analgesic' | 'antacid' | 'antihistamine' | 'antidiarrheal' | 'laxative' | 'cough_cold' | 'topical_antibiotic' | 'topical_antifungal' | 'sunscreen' | 'antiperspirant' | 'acne' | 'other';
export type REMSElement = 'medication_guide' | 'communication_plan' | 'etasu' | 'implementation_system';
export type SafetySignalType = 'cardiovascular' | 'hepatotoxicity' | 'suicidality' | 'infection' | 'malignancy' | 'teratogenicity' | 'cytokine_release' | 'pml' | 'anaphylaxis' | 'gi_perforation' | 'bleeding' | 'nephrotoxicity' | 'other';
export type SmPCProcedure = 'centralized' | 'mutual_recognition' | 'decentralized' | 'national';
export type SmPCProductType = 'medicinal_product' | 'herbal' | 'homeopathic';

export interface Citation {
  guideline: string;
  section?: string;
  title: string;
  year: number;
  url?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 1 Interfaces — PLR Structure Assessment
// ─────────────────────────────────────────────────────────────────────────────

export interface PLRSectionDescriptor {
  sectionNumber: string;
  sectionTitle: string;
  required: boolean;
  subsections?: string[];
  contentGuidance: string;
  loincCode?: string;
}

export interface FormattingRequirements {
  highlightsFontSize: string;
  fpiMinFontSize: string;
  headingFormat: string;
  boldingRules: string[];
  layoutRules: string[];
  columnFormat: string;
}

export interface SPLRequirements {
  format: string;
  submissionSystem: string;
  loincCodesRequired: boolean;
  xmlVersion: string;
  stylesheetRequired: boolean;
  validationRules: string[];
}

export interface AssessPLRStructureInput {
  productType: ProductType;
  applicationType: ApplicationType;
  therapeuticArea: string;
  specialPopulations?: string[];
  hasBoxedWarning?: boolean;
  isNewFormulation?: boolean;
}

export interface AssessPLRStructureResult {
  highlightsStructure: PLRSectionDescriptor[];
  fullPIStructure: PLRSectionDescriptor[];
  formattingRequirements: FormattingRequirements;
  splRequirements: SPLRequirements;
  specialConsiderations: string[];
  citations: Citation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 2 Interfaces — Boxed Warning Assessment
// ─────────────────────────────────────────────────────────────────────────────

export interface BoxedWarningCriterion {
  criterionNumber: number;
  description: string;
  met: boolean;
  rationale: string;
}

export interface BoxedWarningFormatRequirements {
  headerText: string;
  borderStyle: string;
  placement: string[];
  fontRequirements: string;
  symbolRequirements: string;
}

export interface BoxedWarningCategory {
  category: string;
  riskType: SafetySignalType;
  exampleDrugs: string[];
  warningDescription: string;
}

export interface AssessBoxedWarningInput {
  safetySignalType: SafetySignalType;
  severity: 'life_threatening' | 'serious' | 'significant';
  clinicalEvidenceLevel: 'controlled_trials' | 'observational' | 'postmarketing' | 'case_reports';
  riskMitigationAvailable: boolean;
  classWide: boolean;
  productSpecific: boolean;
}

export interface AssessBoxedWarningResult {
  meetsBoxedWarningCriteria: boolean;
  criteriaAssessment: BoxedWarningCriterion[];
  formatRequirements: BoxedWarningFormatRequirements;
  commonCategories: BoxedWarningCategory[];
  remsRelationship: string;
  safetyLabelingChangeProcess: string[];
  citations: Citation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 3 Interfaces — REMS Design
// ─────────────────────────────────────────────────────────────────────────────

export interface REMSElementDescriptor {
  element: REMSElement;
  description: string;
  rationale: string;
  implementationDetails: string[];
}

export interface REMSAssessmentSchedule {
  initialAssessment: string;
  subsequentAssessments: string[];
  sunsetProvision: string;
}

export interface ExistingREMSModel {
  programName: string;
  drugNames: string[];
  elements: REMSElement[];
  keyFeatures: string[];
  yearEstablished: number;
}

export interface ETASUDetail {
  subElement: string;
  description: string;
  examples: string[];
}

export interface DesignREMSInput {
  identifiedRisk: string;
  safetySignalType: SafetySignalType;
  productType: ProductType;
  riskSeverity: 'high' | 'moderate' | 'significant';
  riskFrequency: 'common' | 'uncommon' | 'rare' | 'very_rare';
  riskMitigationOptions: string[];
  targetPopulation: string;
}

export interface DesignREMSResult {
  recommendedElements: REMSElementDescriptor[];
  elementHierarchy: string[];
  assessmentSchedule: REMSAssessmentSchedule;
  existingModels: ExistingREMSModel[];
  etasuDetails: ETASUDetail[];
  sharedSystemConsiderations: string[];
  fdoraChanges: string[];
  citations: Citation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 4 Interfaces — Pregnancy/Lactation Labeling
// ─────────────────────────────────────────────────────────────────────────────

export interface AnimalReproToxData {
  species: string;
  findings: string;
  dose: string;
}

export interface PregnancyLabelingSection {
  sectionTitle: string;
  subsections: { name: string; contentGuidance: string; }[];
  requiredStatements: string[];
}

export interface RiskCommunicationItem {
  scenario: string;
  recommendedLanguage: string;
}

export interface FormerCategoryMapping {
  oldCategory: string;
  description: string;
  status: string;
}

export interface AssessPregnancyLactationInput {
  animalReproToxData: AnimalReproToxData[];
  humanPregnancyData: boolean;
  placentalTransfer: 'known' | 'likely' | 'unknown' | 'none';
  breastMilkExcretion: 'known' | 'likely' | 'unknown' | 'none';
  mechanismBasedRisk: boolean;
  pregnancyRegistryData: boolean;
}

export interface AssessPregnancyLactationResult {
  section8_1: PregnancyLabelingSection;
  section8_2: PregnancyLabelingSection;
  section8_3: PregnancyLabelingSection;
  riskCommunicationFramework: RiskCommunicationItem[];
  pregnancyRegistryRequirements: string[];
  implementationTimeline: string[];
  formerCategoryMapping: FormerCategoryMapping[];
  citations: Citation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 5 Interfaces — EU SmPC Structure
// ─────────────────────────────────────────────────────────────────────────────

export interface SmPCSectionDescriptor {
  sectionNumber: string;
  sectionTitle: string;
  subsections?: { number: string; title: string; guidance: string; }[];
  contentGuidance: string;
}

export interface FDAvsEMAComparison {
  topic: string;
  fdaApproach: string;
  emaApproach: string;
}

export interface PILRequirements {
  structure: string[];
  readabilityTesting: string;
  userConsultation: string;
  languageRequirements: string;
}

export interface AnnexRequirements {
  annex: string;
  title: string;
  contents: string;
}

export interface StructureSmPCInput {
  productType: SmPCProductType;
  procedure: SmPCProcedure;
  specialPopulations?: string[];
  hasAdditionalMonitoring?: boolean;
}

export interface StructureSmPCResult {
  smpcSections: SmPCSectionDescriptor[];
  differences: FDAvsEMAComparison[];
  pilRequirements: PILRequirements;
  qrdTemplateGuidance: string[];
  annexRequirements: AnnexRequirements[];
  blueBoxRequirements: string[];
  citations: Citation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 6 Interfaces — OTC Drug Facts Labeling
// ─────────────────────────────────────────────────────────────────────────────

export interface DrugFactsSection {
  order: number;
  heading: string;
  required: boolean;
  contentGuidance: string;
  formatRules: string[];
}

export interface OTCFontRequirements {
  minimumFontSize: string;
  headingFontSize: string;
  bodyFontSize: string;
  bulletFormat: string;
  contrastRequirements: string;
}

export interface MonographComparison {
  aspect: string;
  monographRoute: string;
  ndaRoute: string;
}

export interface StudyDesignRequirement {
  studyType: string;
  purpose: string;
  designElements: string[];
  regulatoryContext: string;
}

export interface AssessOTCLabelingInput {
  otcCategory: OTCCategory;
  activeIngredients: string[];
  dosageForm: string;
  targetPopulation: 'adult' | 'pediatric' | 'both';
}

export interface AssessOTCLabelingResult {
  drugFactsPanel: DrugFactsSection[];
  fontRequirements: OTCFontRequirements;
  monographVsNDA: MonographComparison[];
  monographReform: string[];
  labelComprehensionStudy: StudyDesignRequirement;
  selfSelectionStudy: StudyDesignRequirement;
  bilingualRequirements: string[];
  citations: Citation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants — Regulatory Reference Tables
// ─────────────────────────────────────────────────────────────────────────────

/** Core labeling regulatory citations used across multiple functions */
const LABELING_CITATIONS = {
  CFR_201_56: {
    guideline: '21 CFR 201.56',
    title: 'Requirements on Content and Format of Labeling for Human Prescription Drug and Biological Products',
    year: 2006,
    url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.56',
  },
  CFR_201_57: {
    guideline: '21 CFR 201.57',
    title: 'Specific Requirements on Content and Format of Labeling for Human Prescription Drug and Biological Products Described in 201.56(b)(1)',
    year: 2006,
    url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.57',
  },
  PLR_GUIDANCE: {
    guideline: 'FDA Guidance',
    section: 'Labeling',
    title: 'Labeling for Human Prescription Drug and Biological Products — Implementing the PLR Content and Format Requirements',
    year: 2013,
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/labeling-human-prescription-drug-and-biological-products-implementing-plr-content-and-format',
  },
  SPL_GUIDANCE: {
    guideline: 'FDA Guidance',
    section: 'SPL',
    title: 'Providing Regulatory Submissions in Electronic Format — Content of Labeling',
    year: 2014,
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/providing-regulatory-submissions-electronic-format-content-labeling',
  },
  CFR_201_57_C1: {
    guideline: '21 CFR 201.57(c)(1)',
    title: 'Boxed Warning — Criteria for Inclusion',
    year: 2006,
    url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.57',
  },
  REMS_GUIDANCE: {
    guideline: 'FDA Guidance',
    section: 'REMS',
    title: 'Format and Content of a REMS Document',
    year: 2017,
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/format-and-content-rems-document',
  },
  FDCA_505_1: {
    guideline: 'FD&C Act Section 505-1',
    title: 'Risk Evaluation and Mitigation Strategies',
    year: 2007,
    url: 'https://www.govinfo.gov/content/pkg/USCODE-2023-title21/pdf/USCODE-2023-title21-chap9-subchapV-partA-sec355-1.pdf',
  },
  PLLR_FINAL_RULE: {
    guideline: '79 FR 72064',
    section: 'Final Rule',
    title: 'Content and Format of Labeling for Human Prescription Drug and Biological Products; Requirements for Pregnancy and Lactation Labeling',
    year: 2014,
    url: 'https://www.federalregister.gov/documents/2014/12/04/2014-28241/content-and-format-of-labeling-for-human-prescription-drug-and-biological-products-requirements-for',
  },
  PLLR_GUIDANCE: {
    guideline: 'FDA Guidance',
    section: 'PLLR',
    title: 'Pregnancy, Lactation, and Reproductive Potential: Labeling for Human Prescription Drug and Biological Products — Content and Format',
    year: 2020,
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/pregnancy-lactation-and-reproductive-potential-labeling-human-prescription-drug-and-biological',
  },
  EMA_QRD: {
    guideline: 'EMA QRD Template',
    section: 'Version 10.3',
    title: 'QRD Product Information Annotated Template',
    year: 2023,
    url: 'https://www.ema.europa.eu/en/human-regulatory-overview/marketing-authorisation/product-information/product-information-templates-annotated-qrd-templates',
  },
  SMPC_GUIDELINE: {
    guideline: 'Directive 2001/83/EC',
    section: 'Article 11',
    title: 'Summary of Product Characteristics — Requirements',
    year: 2001,
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32001L0083',
  },
  CFR_201_66: {
    guideline: '21 CFR 201.66',
    title: 'Format and Content Requirements for Over-the-Counter (OTC) Drug Products',
    year: 1999,
    url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.66',
  },
  OTC_MONOGRAPH_REFORM: {
    guideline: 'FD&C Act Section 505G',
    title: 'OTC Monograph Drugs — Administrative Orders (CARES Act)',
    year: 2020,
    url: 'https://www.fda.gov/drugs/over-counter-otc-nonprescription-drugs/otc-monograph-reform',
  },
  FDORA_2022: {
    guideline: 'FDORA',
    section: 'Title III',
    title: 'Food and Drug Omnibus Reform Act of 2022 — REMS Provisions',
    year: 2022,
    url: 'https://www.congress.gov/bill/117th-congress/house-bill/7667',
  },
  SAFETY_LABELING_CHANGES: {
    guideline: 'FDA Guidance',
    section: 'CBE-0/CBE-30',
    title: 'Safety Labeling Changes — Implementation of Section 505(o)(4) of the FD&C Act',
    year: 2013,
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/safety-labeling-changes-implementation-section-505o4-fdca-act',
  },
  EXCLAIM: {
    guideline: 'EMA',
    section: 'Regulation (EC) No 726/2004',
    title: 'Additional Monitoring — Black Triangle Requirements',
    year: 2013,
    url: 'https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance/additional-monitoring',
  },
} as const;

/** PLR Highlights of Prescribing Information — Section Structure */
const HIGHLIGHTS_SECTIONS: PLRSectionDescriptor[] = [
  {
    sectionNumber: 'H.1',
    sectionTitle: 'Boxed Warning (if applicable)',
    required: false,
    contentGuidance: 'A concise summary of the boxed warning from FPI; included only if the product has a boxed warning. Must be enclosed in a box. Limited to the most critical information.',
    loincCode: '34066-1',
  },
  {
    sectionNumber: 'H.2',
    sectionTitle: 'Recent Major Changes',
    required: true,
    contentGuidance: 'List of sections with substantive labeling changes within the past year. Each entry includes section name/number and date of change (month/year). Updated on a rolling basis.',
    loincCode: '43683-2',
  },
  {
    sectionNumber: 'H.3',
    sectionTitle: 'Indications and Usage',
    required: true,
    contentGuidance: 'Concise statement of each approved indication. Includes limitations of use if clinically important. Cross-references full prescribing information section.',
    loincCode: '34067-9',
  },
  {
    sectionNumber: 'H.4',
    sectionTitle: 'Dosage and Administration',
    required: true,
    contentGuidance: 'Key dosing information only (starting dose, dose range, route). Detailed titration/adjustment instructions in FPI. Must not duplicate full dose tables.',
    loincCode: '34068-7',
  },
  {
    sectionNumber: 'H.5',
    sectionTitle: 'Dosage Forms and Strengths',
    required: true,
    contentGuidance: 'List of available dosage forms and strengths. Helps prescribers quickly identify available options.',
    loincCode: '43678-2',
  },
  {
    sectionNumber: 'H.6',
    sectionTitle: 'Contraindications',
    required: true,
    contentGuidance: 'Concise listing of contraindications. If none known, state "None."',
    loincCode: '34070-3',
  },
  {
    sectionNumber: 'H.7',
    sectionTitle: 'Warnings and Precautions',
    required: true,
    contentGuidance: 'Concise summary of the most clinically significant warnings and precautions. Each summarized to 1-2 sentences with cross-reference to FPI.',
    loincCode: '43685-7',
  },
  {
    sectionNumber: 'H.8',
    sectionTitle: 'Adverse Reactions',
    required: true,
    contentGuidance: 'Most common adverse reactions (incidence and/or severity). State the most frequently reported ARs and the threshold. Include reporting contact information.',
    loincCode: '34084-4',
  },
  {
    sectionNumber: 'H.9',
    sectionTitle: 'Drug Interactions',
    required: true,
    contentGuidance: 'Clinically important drug interactions only. Full details in FPI Section 7.',
    loincCode: '34073-7',
  },
  {
    sectionNumber: 'H.10',
    sectionTitle: 'Use in Specific Populations',
    required: true,
    contentGuidance: 'Key information for pregnancy, lactation, pediatric, geriatric, hepatic impairment, renal impairment populations.',
    loincCode: '43684-0',
  },
];

/** PLR Full Prescribing Information — Complete Section Structure per 21 CFR 201.57 */
const FPI_SECTIONS: PLRSectionDescriptor[] = [
  {
    sectionNumber: '1',
    sectionTitle: 'Indications and Usage',
    required: true,
    contentGuidance: 'Statement of each indication with description of any limitations of use. Must specify whether approval is based on a surrogate endpoint (accelerated approval). Includes relevant patient population details.',
    loincCode: '34067-9',
  },
  {
    sectionNumber: '2',
    sectionTitle: 'Dosage and Administration',
    required: true,
    subsections: [
      '2.1 Recommended Dosage',
      '2.2 Dosage Modifications',
      '2.3 Reconstitution/Preparation Instructions',
      '2.4 Administration Instructions',
    ],
    contentGuidance: 'Recommended dosage for each indication, dose modifications for adverse reactions or special populations, preparation and administration instructions, monitoring parameters.',
    loincCode: '34068-7',
  },
  {
    sectionNumber: '3',
    sectionTitle: 'Dosage Forms and Strengths',
    required: true,
    contentGuidance: 'Description of each dosage form including strength, physical description (color, shape, markings), and any distinguishing characteristics.',
    loincCode: '43678-2',
  },
  {
    sectionNumber: '4',
    sectionTitle: 'Contraindications',
    required: true,
    contentGuidance: 'Situations in which the drug should NOT be used because the risk clearly outweighs any possible benefit. Each contraindication must be supported by evidence. State "None" if no contraindications are known.',
    loincCode: '34070-3',
  },
  {
    sectionNumber: '5',
    sectionTitle: 'Warnings and Precautions',
    required: true,
    subsections: [
      '5.x [Numbered by risk, most clinically significant first]',
    ],
    contentGuidance: 'Clinically significant adverse reactions (not otherwise described in Boxed Warning). Arranged by seriousness/clinical significance. Each warning is a separately numbered subsection. Includes steps to prevent/mitigate risk.',
    loincCode: '43685-7',
  },
  {
    sectionNumber: '6',
    sectionTitle: 'Adverse Reactions',
    required: true,
    subsections: [
      '6.1 Clinical Trials Experience',
      '6.2 Postmarketing Experience',
      '6.3 Clinical Trials Experience in Specific Populations (if applicable)',
    ],
    contentGuidance: 'Clinical trials experience: adverse reactions in adequate and well-controlled trials. Organized by system organ class or decreasing frequency. Includes tables for common ARs. Postmarketing: identified from spontaneous reports; state that frequency cannot be reliably estimated.',
    loincCode: '34084-4',
  },
  {
    sectionNumber: '7',
    sectionTitle: 'Drug Interactions',
    required: true,
    subsections: [
      '7.1 Effects of Other Drugs on [Drug Name]',
      '7.2 Effects of [Drug Name] on Other Drugs',
      '7.3 Drug-Food Interactions',
      '7.4 Drug-Laboratory Test Interactions',
    ],
    contentGuidance: 'Clinically important drug interactions. Organized by direction of interaction. Includes clinical consequences and management recommendations. Based on clinical PK studies, in vitro data, or population PK.',
    loincCode: '34073-7',
  },
  {
    sectionNumber: '8',
    sectionTitle: 'Use in Specific Populations',
    required: true,
    subsections: [
      '8.1 Pregnancy',
      '8.2 Lactation',
      '8.3 Females and Males of Reproductive Potential',
      '8.4 Pediatric Use',
      '8.5 Geriatric Use',
      '8.6 Renal Impairment',
      '8.7 Hepatic Impairment',
    ],
    contentGuidance: 'PLLR-formatted pregnancy/lactation sections (Risk Summary, Clinical Considerations, Data). Pediatric and geriatric use based on substantial evidence. Organ impairment dosing based on PK studies.',
    loincCode: '43684-0',
  },
  {
    sectionNumber: '9',
    sectionTitle: '[Reserved]',
    required: false,
    contentGuidance: 'Section 9 is reserved and not currently used. Previously contained "Drug Abuse and Dependence" content which has been relocated.',
    loincCode: undefined,
  },
  {
    sectionNumber: '10',
    sectionTitle: 'Overdosage',
    required: true,
    contentGuidance: 'Signs and symptoms of overdosage, recommended treatment, dialyzability. Maximum tolerated dose information if known.',
    loincCode: '34088-5',
  },
  {
    sectionNumber: '11',
    sectionTitle: 'Description',
    required: true,
    contentGuidance: 'Proprietary name, established (generic) name, dosage form, route, chemical name, molecular formula, molecular weight, structural formula, physical description, pharmacological class.',
    loincCode: '34089-3',
  },
  {
    sectionNumber: '12',
    sectionTitle: 'Clinical Pharmacology',
    required: true,
    subsections: [
      '12.1 Mechanism of Action',
      '12.2 Pharmacodynamics',
      '12.3 Pharmacokinetics',
    ],
    contentGuidance: 'MOA description. PD including exposure-response. PK including absorption, distribution, metabolism (CYP enzymes), elimination, and effects of intrinsic/extrinsic factors.',
    loincCode: '34090-1',
  },
  {
    sectionNumber: '13',
    sectionTitle: 'Nonclinical Toxicology',
    required: true,
    subsections: [
      '13.1 Carcinogenesis, Mutagenesis, Impairment of Fertility',
      '13.2 Animal Toxicology and/or Pharmacology',
    ],
    contentGuidance: 'Carcinogenicity study results with species, dose, duration. Genotoxicity battery results. Fertility study findings. Other relevant nonclinical data.',
    loincCode: '34091-9',
  },
  {
    sectionNumber: '14',
    sectionTitle: 'Clinical Studies',
    required: true,
    contentGuidance: 'Description of adequate and well-controlled studies supporting each indication. Study design, population, endpoints, and results including effect size and statistical significance. Includes relevant subgroup analyses.',
    loincCode: '34092-7',
  },
  {
    sectionNumber: '15',
    sectionTitle: 'References',
    required: false,
    contentGuidance: 'Published references that support labeling claims. Only included when necessary to provide prescribers with access to supporting data. Not required for all products.',
    loincCode: '34093-5',
  },
  {
    sectionNumber: '16',
    sectionTitle: 'How Supplied/Storage and Handling',
    required: true,
    contentGuidance: 'Available dosage forms, NDC numbers, descriptions (color, shape, imprint), storage conditions, dispensing instructions, special handling.',
    loincCode: '34069-5',
  },
  {
    sectionNumber: '17',
    sectionTitle: 'Patient Counseling Information',
    required: true,
    contentGuidance: 'Information to be communicated to patients. Includes reference to FDA-approved Medication Guide or PPI if applicable. Key counseling points for each important risk.',
    loincCode: '34076-0',
  },
];

/** LOINC codes for SPL sections (key section mappings) */
const SPL_LOINC_CODES = {
  'boxed_warning': '34066-1',
  'recent_major_changes': '43683-2',
  'indications_usage': '34067-9',
  'dosage_administration': '34068-7',
  'dosage_forms_strengths': '43678-2',
  'contraindications': '34070-3',
  'warnings_precautions': '43685-7',
  'adverse_reactions': '34084-4',
  'drug_interactions': '34073-7',
  'use_specific_populations': '43684-0',
  'overdosage': '34088-5',
  'description': '34089-3',
  'clinical_pharmacology': '34090-1',
  'nonclinical_toxicology': '34091-9',
  'clinical_studies': '34092-7',
  'references': '34093-5',
  'how_supplied': '34069-5',
  'patient_counseling': '34076-0',
  'medication_guide': '34072-9',
  'spl_unclassified': '42231-1',
} as const;

/** Boxed Warning Common Categories with Real Drug Examples */
const BOXED_WARNING_CATEGORIES: BoxedWarningCategory[] = [
  {
    category: 'Cardiovascular Thrombotic Events',
    riskType: 'cardiovascular',
    exampleDrugs: ['ibuprofen (Advil)', 'naproxen (Aleve)', 'celecoxib (Celebrex)', 'diclofenac (Voltaren)', 'meloxicam (Mobic)'],
    warningDescription: 'NSAIDs cause an increased risk of serious cardiovascular thrombotic events, including myocardial infarction and stroke, which can be fatal. This risk may occur early in treatment and may increase with duration of use.',
  },
  {
    category: 'Suicidal Thoughts and Behaviors',
    riskType: 'suicidality',
    exampleDrugs: ['fluoxetine (Prozac)', 'sertraline (Zoloft)', 'paroxetine (Paxil)', 'citalopram (Celexa)', 'venlafaxine (Effexor)', 'duloxetine (Cymbalta)'],
    warningDescription: 'Antidepressants increased the risk of suicidal thoughts and behavior in children, adolescents, and young adults in short-term studies. Monitor closely for clinical worsening and suicidality.',
  },
  {
    category: 'Serious Infections',
    riskType: 'infection',
    exampleDrugs: ['infliximab (Remicade)', 'adalimumab (Humira)', 'etanercept (Enbrel)', 'certolizumab pegol (Cimzia)', 'golimumab (Simponi)'],
    warningDescription: 'Increased risk of serious infections leading to hospitalization or death including tuberculosis, bacterial sepsis, invasive fungal infections, and infections due to opportunistic pathogens.',
  },
  {
    category: 'Teratogenicity (Thalidomide-class)',
    riskType: 'teratogenicity',
    exampleDrugs: ['thalidomide (Thalomid)', 'lenalidomide (Revlimid)', 'pomalidomide (Pomalyst)'],
    warningDescription: 'Causes severe life-threatening birth defects. Pregnancy must be excluded before start of treatment. REMS program (formerly STEPS/RevAssist, now Thalomid/Revlimid REMS) required.',
  },
  {
    category: 'Agranulocytosis',
    riskType: 'infection',
    exampleDrugs: ['clozapine (Clozaril)'],
    warningDescription: 'Severe neutropenia, defined as an absolute neutrophil count (ANC) less than 500/microL, which can lead to fatal infections. Mandatory ANC monitoring through the Clozapine REMS Program.',
  },
  {
    category: 'Isotretinoin Teratogenicity',
    riskType: 'teratogenicity',
    exampleDrugs: ['isotretinoin (Accutane, Absorica, Amnesteem, Claravis, Myorisan, Zenatane)'],
    warningDescription: 'Must not be used by female patients who are or may become pregnant. There is an extremely high risk of severe birth defects. iPLEDGE REMS program required.',
  },
  {
    category: 'Tendon Rupture and Tendinitis',
    riskType: 'other',
    exampleDrugs: ['ciprofloxacin (Cipro)', 'levofloxacin (Levaquin)', 'moxifloxacin (Avelox)', 'ofloxacin (Floxin)', 'gemifloxacin (Factive)'],
    warningDescription: 'Fluoroquinolones are associated with disabling and potentially irreversible serious adverse reactions including tendinitis, tendon rupture, peripheral neuropathy, and CNS effects.',
  },
  {
    category: 'Respiratory Depression and Death (Opioids)',
    riskType: 'other',
    exampleDrugs: ['fentanyl (Duragesic)', 'oxycodone (OxyContin)', 'hydromorphone (Dilaudid)', 'morphine (MS Contin)', 'methadone (Dolophine)'],
    warningDescription: 'Serious, life-threatening, or fatal respiratory depression may occur. Risk is greatest during initiation and dose increase. Concomitant use with benzodiazepines or other CNS depressants increases risk.',
  },
  {
    category: 'Increased Mortality in Elderly Patients with Dementia-Related Psychosis',
    riskType: 'other',
    exampleDrugs: ['olanzapine (Zyprexa)', 'risperidone (Risperdal)', 'quetiapine (Seroquel)', 'aripiprazole (Abilify)', 'ziprasidone (Geodon)', 'haloperidol (Haldol)'],
    warningDescription: 'Antipsychotic drugs are not approved for the treatment of dementia-related psychosis. Elderly patients with dementia-related psychosis treated with antipsychotic drugs are at an increased risk of death.',
  },
  {
    category: 'Cytokine Release Syndrome (CRS)',
    riskType: 'cytokine_release',
    exampleDrugs: ['tisagenlecleucel (Kymriah)', 'axicabtagene ciloleucel (Yescarta)', 'brexucabtagene autoleucel (Tecartus)', 'lisocabtagene maraleucel (Breyanzi)', 'idecabtagene vicleucel (Abecma)'],
    warningDescription: 'Cytokine Release Syndrome (CRS), including fatal or life-threatening reactions, occurred. Do not administer to patients with active infection or inflammatory disorders. Treat severe CRS with tocilizumab.',
  },
  {
    category: 'Progressive Multifocal Leukoencephalopathy (PML)',
    riskType: 'pml',
    exampleDrugs: ['natalizumab (Tysabri)'],
    warningDescription: 'Progressive multifocal leukoencephalopathy (PML), an opportunistic viral infection of the brain caused by JC virus, has been reported. Risk factors include duration of therapy, prior immunosuppressant use, and anti-JCV antibody status.',
  },
  {
    category: 'Hepatotoxicity',
    riskType: 'hepatotoxicity',
    exampleDrugs: ['bosentan (Tracleer)', 'lomitapide (Juxtapid)', 'valproic acid (Depakene)', 'isoniazid'],
    warningDescription: 'Severe liver injury including cases of acute liver failure, sometimes fatal, has been reported. Obtain liver function tests prior to and during treatment. Discontinue if clinically significant liver injury develops.',
  },
  {
    category: 'GI Bleeding (NSAIDs)',
    riskType: 'gi_perforation',
    exampleDrugs: ['ibuprofen (Advil)', 'naproxen (Aleve)', 'diclofenac (Voltaren)', 'ketorolac (Toradol)', 'piroxicam (Feldene)'],
    warningDescription: 'NSAIDs cause an increased risk of serious gastrointestinal adverse events including bleeding, ulceration, and perforation of the stomach or intestines, which can be fatal. Risk increases with duration of use and in elderly patients.',
  },
];

/** REMS Existing Program Models */
const EXISTING_REMS_MODELS: ExistingREMSModel[] = [
  {
    programName: 'iPLEDGE',
    drugNames: ['isotretinoin (Accutane, Absorica, Amnesteem, Claravis, Myorisan, Zenatane)'],
    elements: ['medication_guide', 'etasu', 'implementation_system'],
    keyFeatures: [
      'Prescriber certification and enrollment',
      'Pharmacy certification and enrollment',
      'Patient enrollment and informed consent',
      'Pregnancy testing protocol: two negative tests before starting, monthly tests during treatment',
      'Two forms of contraception required for females of reproductive potential',
      'Dispensing limited to 30-day supply with 7-day window',
      'Central electronic system (iPLEDGE website) linking prescribers, pharmacies, and patients',
    ],
    yearEstablished: 2006,
  },
  {
    programName: 'TIRF REMS Access Program',
    drugNames: ['fentanyl (Actiq, Fentora, Abstral, Lazanda, Subsys, transmucosal immediate-release fentanyl products)'],
    elements: ['medication_guide', 'communication_plan', 'etasu', 'implementation_system'],
    keyFeatures: [
      'Shared system REMS — covers all TIRF products under one program',
      'Prescriber enrollment and knowledge assessment',
      'Pharmacy enrollment and knowledge assessment',
      'Patient-prescriber agreement form',
      'Restricted to opioid-tolerant patients with breakthrough cancer pain',
      'Inpatient and outpatient dispensing requirements differ',
    ],
    yearEstablished: 2012,
  },
  {
    programName: 'Clozapine REMS Program',
    drugNames: ['clozapine (Clozaril, FazaClo, Versacloz, generic clozapine)'],
    elements: ['medication_guide', 'etasu', 'implementation_system'],
    keyFeatures: [
      'Mandatory ANC monitoring at specified intervals',
      'Prescriber, pharmacy, and patient enrollment in central registry',
      'ANC results must be entered before dispensing',
      'Monitoring schedule varies by patient baseline ANC and BEN status',
      'General population: weekly ANC x 6 months, biweekly x 6 months, then monthly',
      'Benign Ethnic Neutropenia (BEN) patients: modified ANC thresholds',
    ],
    yearEstablished: 2015,
  },
  {
    programName: 'Mifepristone REMS (Mifeprex)',
    drugNames: ['mifepristone (Mifeprex)'],
    elements: ['etasu', 'implementation_system'],
    keyFeatures: [
      'Must be dispensed in healthcare settings (clinics, medical offices, hospitals)',
      'Prescriber must be certified',
      'Patient must sign Patient Agreement Form',
      'Not dispensed through retail pharmacies (as of original REMS — subsequently modified)',
      'Follow-up assessment to confirm complete termination of pregnancy',
    ],
    yearEstablished: 2011,
  },
  {
    programName: 'Addyi REMS Program',
    drugNames: ['flibanserin (Addyi)'],
    elements: ['communication_plan', 'etasu'],
    keyFeatures: [
      'Prescriber certification required — must counsel on risks of hypotension and syncope with alcohol',
      'Pharmacy certification required',
      'Patients must be counseled about interaction with alcohol',
      'Limited distribution through certified pharmacies',
    ],
    yearEstablished: 2015,
  },
  {
    programName: 'Thalomid/Revlimid/Pomalyst REMS',
    drugNames: ['thalidomide (Thalomid)', 'lenalidomide (Revlimid)', 'pomalidomide (Pomalyst)'],
    elements: ['medication_guide', 'communication_plan', 'etasu', 'implementation_system'],
    keyFeatures: [
      'Prescriber enrollment and agreement to comply with REMS requirements',
      'Patient enrollment — females of reproductive potential have additional requirements',
      'Pregnancy testing protocol similar to iPLEDGE',
      'Two forms of contraception required for females of reproductive potential',
      'Counseling on venous thromboembolism risk (lenalidomide, pomalidomide)',
      'Monthly surveys for prescribers regarding patient compliance',
      'Limited dispensing: maximum 28-day supply, no telephone prescriptions, no automatic refills',
    ],
    yearEstablished: 2005,
  },
];

/** ETASU Sub-Elements */
const ETASU_ELEMENTS: ETASUDetail[] = [
  {
    subElement: 'Prescriber Certification/Enrollment',
    description: 'Healthcare providers must be specially certified or enrolled in the REMS program before prescribing the drug. May require passing a knowledge assessment or completing training.',
    examples: ['iPLEDGE prescriber enrollment', 'Clozapine REMS prescriber certification', 'TIRF REMS prescriber knowledge assessment'],
  },
  {
    subElement: 'Pharmacy Certification/Enrollment',
    description: 'Pharmacies must be certified or enrolled in the REMS program. May require designated pharmacist training, specific dispensing procedures, or infrastructure requirements.',
    examples: ['iPLEDGE pharmacy enrollment', 'TIRF REMS pharmacy enrollment and knowledge assessment', 'Clozapine REMS pharmacy certification'],
  },
  {
    subElement: 'Patient Enrollment',
    description: 'Patients must be enrolled in the program, often requiring signed acknowledgment forms, informed consent, and agreement to comply with monitoring requirements.',
    examples: ['iPLEDGE patient registration and qualification', 'Clozapine patient enrollment', 'Thalomid REMS patient survey'],
  },
  {
    subElement: 'Safe Use Conditions',
    description: 'Specific clinical conditions that must be verified before or during prescribing, such as laboratory tests, imaging, pregnancy testing, or clinical assessments.',
    examples: ['ANC monitoring (clozapine)', 'Pregnancy testing (iPLEDGE, Thalomid REMS)', 'Liver function test monitoring (bosentan REMS)'],
  },
  {
    subElement: 'Monitoring Requirements',
    description: 'Ongoing clinical monitoring requirements that must be completed as a condition of continued prescribing/dispensing.',
    examples: ['Monthly ANC checks (clozapine)', 'Monthly pregnancy tests (isotretinoin)', 'Cardiac monitoring (certain kinase inhibitors)'],
  },
  {
    subElement: 'Restricted Distribution',
    description: 'Drug may only be dispensed through specific pharmacies, healthcare settings, or distribution channels rather than through all pharmacies.',
    examples: ['Mifepristone — healthcare setting dispensing only', 'Addyi — certified pharmacies only', 'TIRF products — enrolled pharmacies/prescribers only'],
  },
];

/** Safety Labeling Change Process Steps */
const SAFETY_LABELING_CHANGE_STEPS: string[] = [
  'Step 1: FDA identifies safety signal through FAERS, published literature, or periodic safety reports',
  'Step 2: FDA evaluates the signal — determines whether the data support a labeling change',
  'Step 3: FDA issues a Safety Labeling Change (SLC) notification letter to the application holder under Section 505(o)(4) of the FD&C Act',
  'Step 4: Application holder has 30 days to submit a labeling supplement or notify FDA of intent to submit (with explanation if more time needed)',
  'Step 5: If agreed, holder submits a CBE-0 (Changes Being Effected) supplement to implement the safety labeling change immediately without prior FDA approval',
  'Step 6: Alternatively, CBE-30 supplement allows implementation 30 days after FDA receipt unless FDA notifies holder that prior approval is required',
  'Step 7: For Boxed Warning additions or significant risk communications, FDA may require a Prior Approval Supplement (PAS)',
  'Step 8: If holder does not comply, FDA may initiate an order to make the labeling change under Section 505(o)(4)(B)',
  'Step 9: Holder may request an informal hearing to dispute the ordered labeling change',
  'Step 10: Post-implementation: FDA monitors effectiveness of the labeling change through FAERS data, published literature, and REMS assessments if applicable',
];

/** Former Pregnancy Category Definitions (removed by PLLR) */
const FORMER_PREGNANCY_CATEGORIES: FormerCategoryMapping[] = [
  {
    oldCategory: 'Category A',
    description: 'Adequate and well-controlled studies in pregnant women have failed to demonstrate a risk to the fetus in the first trimester (and no evidence of risk in later trimesters).',
    status: 'Removed by PLLR Final Rule. Replaced by narrative risk summaries in Section 8.1.',
  },
  {
    oldCategory: 'Category B',
    description: 'Animal reproduction studies have failed to demonstrate a risk to the fetus, and there are no adequate and well-controlled studies in pregnant women. OR animal studies have shown an adverse effect, but adequate studies in pregnant women have failed to demonstrate risk.',
    status: 'Removed by PLLR Final Rule. Replaced by narrative risk summaries in Section 8.1.',
  },
  {
    oldCategory: 'Category C',
    description: 'Animal reproduction studies have shown an adverse effect on the fetus, and there are no adequate and well-controlled studies in humans. Potential benefits may warrant use despite potential risks.',
    status: 'Removed by PLLR Final Rule. Replaced by narrative risk summaries in Section 8.1.',
  },
  {
    oldCategory: 'Category D',
    description: 'There is positive evidence of human fetal risk based on adverse reaction data, but potential benefits may warrant use despite potential risks.',
    status: 'Removed by PLLR Final Rule. Replaced by narrative risk summaries in Section 8.1.',
  },
  {
    oldCategory: 'Category X',
    description: 'Studies in animals or humans have demonstrated fetal abnormalities and/or positive evidence of human fetal risk. The risks clearly outweigh any possible benefit. Contraindicated in pregnancy.',
    status: 'Removed by PLLR Final Rule. Replaced by narrative risk summaries in Section 8.1. Products formerly Category X typically include contraindication statement in Section 4.',
  },
];

/** EU SmPC Complete Section Structure (QRD Template) */
const SMPC_SECTION_STRUCTURE: SmPCSectionDescriptor[] = [
  {
    sectionNumber: '1',
    sectionTitle: 'Name of the Medicinal Product',
    contentGuidance: 'Name of the medicinal product followed by strength and pharmaceutical form. Use INN (International Nonproprietary Name). Include qualifier for products subject to additional monitoring.',
  },
  {
    sectionNumber: '2',
    sectionTitle: 'Qualitative and Quantitative Composition',
    contentGuidance: 'List all active substances using INN with quantitative composition per dosage unit. State excipients with known effect (e.g., lactose, sodium). Include full list reference to Section 6.1.',
  },
  {
    sectionNumber: '3',
    sectionTitle: 'Pharmaceutical Form',
    contentGuidance: 'Pharmaceutical form using Standard Terms. Physical description including color, shape, markings, dimensions, scoring.',
  },
  {
    sectionNumber: '4',
    sectionTitle: 'Clinical Particulars',
    subsections: [
      { number: '4.1', title: 'Therapeutic Indications', guidance: 'Precise and complete statement of therapeutic indications. Specify target population (adults, children with age range). State clearly if orphan designation exists.' },
      { number: '4.2', title: 'Posology and Method of Administration', guidance: 'Dosage for each indication and each relevant population. Includes dose adjustments for renal/hepatic impairment, elderly, paediatric. Method of administration with any special instructions.' },
      { number: '4.3', title: 'Contraindications', guidance: 'Situations where the product must not be used. Absolute contraindications only.' },
      { number: '4.4', title: 'Special Warnings and Precautions for Use', guidance: 'Warnings and precautions for safe and effective use. Includes excipient warnings per EMA excipient guideline. Traceability statement for biologicals.' },
      { number: '4.5', title: 'Interaction with Other Medicinal Products and Other Forms of Interaction', guidance: 'Pharmacokinetic and pharmacodynamic interactions. Based on in vitro and in vivo data. Include recommendation on co-administration.' },
      { number: '4.6', title: 'Fertility, Pregnancy and Lactation', guidance: 'Structured as: Pregnancy, Breast-feeding, Fertility. Include human data, animal data, and recommendation. State whether contraception is needed.' },
      { number: '4.7', title: 'Effects on Ability to Drive and Use Machines', guidance: 'Influence on driving and machine operation. Use standardized statements: no influence / minor influence / moderate influence / major influence.' },
      { number: '4.8', title: 'Undesirable Effects', guidance: 'Tabulated summary of adverse reactions by frequency (very common, common, uncommon, rare, very rare, not known) and MedDRA System Organ Class. Description of selected reactions. Post-marketing data included separately.' },
      { number: '4.9', title: 'Overdose', guidance: 'Symptoms and signs of overdose. Immediate management including antidotes. Expected complications of overdose.' },
    ],
    contentGuidance: 'Section 4 is the primary clinical information section of the SmPC. Subsections 4.1-4.9 cover all clinical aspects of the product.',
  },
  {
    sectionNumber: '5',
    sectionTitle: 'Pharmacological Properties',
    subsections: [
      { number: '5.1', title: 'Pharmacodynamic Properties', guidance: 'ATC code. Mechanism of action. Clinical efficacy and safety data from clinical trials. Paediatric population data.' },
      { number: '5.2', title: 'Pharmacokinetic Properties', guidance: 'Absorption (Cmax, Tmax, bioavailability). Distribution (Vd, protein binding). Biotransformation (metabolic pathways, CYP involvement). Elimination (t1/2, clearance, route). Special populations (renal/hepatic impairment, elderly, paediatric).' },
      { number: '5.3', title: 'Preclinical Safety Data', guidance: 'Non-clinical safety findings relevant to the prescriber. Includes carcinogenicity, mutagenicity, reproductive toxicity. Only findings not already in Sections 4.6 or 4.8.' },
    ],
    contentGuidance: 'Pharmacological data covering pharmacodynamics, pharmacokinetics, and preclinical safety. Focus on clinically relevant information.',
  },
  {
    sectionNumber: '6',
    sectionTitle: 'Pharmaceutical Particulars',
    subsections: [
      { number: '6.1', title: 'List of Excipients', guidance: 'Complete list of excipients by INN or usual name.' },
      { number: '6.2', title: 'Incompatibilities', guidance: 'Known incompatibilities with other products, diluents, devices.' },
      { number: '6.3', title: 'Shelf Life', guidance: 'Shelf life as packaged for sale. Shelf life after reconstitution/dilution/first opening.' },
      { number: '6.4', title: 'Special Precautions for Storage', guidance: 'Storage conditions using standard phrases. Temperature, light, moisture requirements.' },
      { number: '6.5', title: 'Nature and Contents of Container', guidance: 'Container type and material. Pack sizes authorized.' },
      { number: '6.6', title: 'Special Precautions for Disposal and Other Handling', guidance: 'Instructions for safe handling, preparation, and disposal. Reconstitution/dilution instructions for parenteral products.' },
    ],
    contentGuidance: 'Pharmaceutical quality information including excipients, stability, storage, and handling instructions.',
  },
  {
    sectionNumber: '7',
    sectionTitle: 'Marketing Authorisation Holder',
    contentGuidance: 'Name and address of the marketing authorisation holder.',
  },
  {
    sectionNumber: '8',
    sectionTitle: 'Marketing Authorisation Number(s)',
    contentGuidance: 'Marketing authorisation number(s) for each presentation.',
  },
  {
    sectionNumber: '9',
    sectionTitle: 'Date of First Authorisation/Renewal of the Authorisation',
    contentGuidance: 'Date of the first authorisation and date of the latest renewal.',
  },
  {
    sectionNumber: '10',
    sectionTitle: 'Date of Revision of the Text',
    contentGuidance: 'Date of the last revision of the SmPC text.',
  },
];

/** FDA PLR vs EU SmPC Comparison Table */
const FDA_EMA_DIFFERENCES: FDAvsEMAComparison[] = [
  {
    topic: 'Document Name',
    fdaApproach: 'Full Prescribing Information (FPI) / Prescribing Information (PI)',
    emaApproach: 'Summary of Product Characteristics (SmPC)',
  },
  {
    topic: 'Highlights Section',
    fdaApproach: 'Required "Highlights of Prescribing Information" — a concise summary page preceding the FPI',
    emaApproach: 'No equivalent highlights section. SmPC begins directly with Section 1.',
  },
  {
    topic: 'Boxed Warning',
    fdaApproach: 'Boxed Warning (Black Box) in Highlights and Section 5; specific formatting per 21 CFR 201.57(c)(1)',
    emaApproach: 'No boxed warning concept. Critical safety information in Section 4.4 Special Warnings. Additional monitoring (black triangle) serves different purpose.',
  },
  {
    topic: 'Pregnancy/Lactation',
    fdaApproach: 'PLLR format: Section 8.1 (Pregnancy), 8.2 (Lactation), 8.3 (Females/Males of Reproductive Potential) with narrative risk summaries replacing letter categories',
    emaApproach: 'Section 4.6 Fertility, Pregnancy and Lactation — subsections for pregnancy, breast-feeding, fertility with narrative descriptions',
  },
  {
    topic: 'Adverse Reactions Frequency',
    fdaApproach: 'Listed by incidence in clinical trials. Tables show AR vs placebo percentages. No standardized frequency bands.',
    emaApproach: 'Tabulated by MedDRA SOC and frequency using CIOMS bands: very common (>=1/10), common (>=1/100), uncommon (>=1/1000), rare (>=1/10000), very rare (<1/10000), not known.',
  },
  {
    topic: 'Patient Leaflet',
    fdaApproach: 'Patient Package Insert (PPI) or Medication Guide — not part of the PI. Separate document.',
    emaApproach: 'Package Leaflet (PIL/PL) is mandatory Annex III. Part of the product information dossier. Must undergo user testing (readability testing).',
  },
  {
    topic: 'Driving/Machine Operation',
    fdaApproach: 'No dedicated section. May be mentioned in Patient Counseling Information (Section 17) or Warnings.',
    emaApproach: 'Dedicated Section 4.7 — mandatory. Standardized statements on influence level.',
  },
  {
    topic: 'Drug Abuse and Dependence',
    fdaApproach: 'Formerly Section 9 (now reserved). Content on controlled substance schedule, abuse, dependence, and withdrawal addressed elsewhere.',
    emaApproach: 'No dedicated section. Addressed in Section 4.4 (Special Warnings) and Section 4.8 (Undesirable Effects) as appropriate.',
  },
  {
    topic: 'Pediatric Information',
    fdaApproach: 'Section 8.4 Pediatric Use — states whether pediatric studies conducted, extrapolation basis, or waiver status',
    emaApproach: 'Integrated throughout relevant sections (4.1, 4.2, 4.4, 4.8, 5.1, 5.2). Section 5.1 must include pediatric clinical trial results.',
  },
  {
    topic: 'Traceability (Biologics)',
    fdaApproach: 'Lot number tracking encouraged but not mandated in labeling text',
    emaApproach: 'Section 4.4 must include a standard traceability statement for all biological medicinal products: "In order to improve the traceability of biological medicinal products, the name and batch number of the administered product should be clearly recorded."',
  },
  {
    topic: 'Regulatory Submission Format',
    fdaApproach: 'SPL (Structured Product Labeling) in HL7 SPL XML format, submitted via FDA ESG to DailyMed',
    emaApproach: 'Word/PDF format following QRD template. Submitted as part of Module 1.3 of the eCTD.',
  },
];

/** OTC Drug Facts Panel Sections per 21 CFR 201.66 */
const DRUG_FACTS_SECTIONS: DrugFactsSection[] = [
  {
    order: 1,
    heading: 'Drug Facts',
    required: true,
    contentGuidance: 'Title heading "Drug Facts" in bold type, prominently displayed at the top of the panel.',
    formatRules: ['Title must be bold', 'Must be the first element on the Drug Facts panel', 'Preceded by a hairline rule separating it from other labeling'],
  },
  {
    order: 2,
    heading: 'Active ingredient(s)',
    required: true,
    contentGuidance: 'Active ingredient name followed by the amount per dosage unit. Use established (USAN) name. If combination product, list each active ingredient.',
    formatRules: ['Heading in bold', 'Active ingredient name followed by amount in each dosage unit', 'Use USAN name unless monograph specifies otherwise'],
  },
  {
    order: 3,
    heading: 'Purpose(s)',
    required: true,
    contentGuidance: 'Pharmacological/therapeutic category of each active ingredient aligned with the monograph category or NDA-approved labeling.',
    formatRules: ['Heading in bold', 'Aligned on same line as or immediately following each active ingredient', 'Use recognized category terms'],
  },
  {
    order: 4,
    heading: 'Use(s)',
    required: true,
    contentGuidance: 'Indications for use stated in consumer-friendly language. Limited to monograph indications or NDA-approved uses.',
    formatRules: ['Heading in bold', 'Bulleted list', 'Use consumer-understandable terms (e.g., "temporarily relieves" instead of "for the symptomatic treatment of")'],
  },
  {
    order: 5,
    heading: 'Warnings',
    required: true,
    contentGuidance: 'Includes required warnings from the applicable monograph or NDA labeling. Must include: "Do not use" subheading, "Ask a doctor before use if" subheading, "Ask a doctor or pharmacist before use if" subheading, "When using this product" subheading, "Stop use and ask a doctor if" subheading, pregnancy/breastfeeding warning, keep out of reach of children statement.',
    formatRules: [
      'Heading in bold',
      'Sub-headings in bold for each warning category',
      'Bulleted lists under each sub-heading',
      '"Keep out of reach of children" is always required',
      'Allergy alert, liver warning, stomach bleeding warning as applicable',
    ],
  },
  {
    order: 6,
    heading: 'Directions',
    required: true,
    contentGuidance: 'Dosage and administration instructions for each age group. Include dose, frequency, maximum daily dose, and any special administration instructions.',
    formatRules: ['Heading in bold', 'Bulleted list or table format', 'Age-specific dosing must be clear', 'Include maximum daily dose'],
  },
  {
    order: 7,
    heading: 'Other information',
    required: true,
    contentGuidance: 'Storage conditions, tamper-evident packaging statements, and any other required statements.',
    formatRules: ['Heading in bold', 'Bulleted list', 'Storage temperature in both Fahrenheit and Celsius'],
  },
  {
    order: 8,
    heading: 'Inactive ingredients',
    required: true,
    contentGuidance: 'List of all inactive ingredients in alphabetical order using USAN or common name.',
    formatRules: ['Heading in bold', 'Listed in alphabetical order', 'Separated by commas'],
  },
  {
    order: 9,
    heading: 'Questions or comments?',
    required: false,
    contentGuidance: 'Telephone number for consumer inquiries. Optional but recommended by FDA.',
    formatRules: ['Heading in bold', 'Toll-free number preferred'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Function 1: assessPLRStructure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assesses the required PLR (Physician Labeling Rule) structure for a
 * prescription drug or biological product based on product type, application
 * type, therapeutic area, and other characteristics.
 *
 * Returns the complete Highlights and Full Prescribing Information section
 * structures per 21 CFR 201.56-57, formatting requirements, and SPL
 * submission specifications.
 */
export function assessPLRStructure(params: AssessPLRStructureInput): AssessPLRStructureResult {
  const { productType, applicationType, therapeuticArea, specialPopulations, hasBoxedWarning, isNewFormulation } = params;
  const specialConsiderations: string[] = [];

  // Build Highlights structure
  const highlightsStructure: PLRSectionDescriptor[] = HIGHLIGHTS_SECTIONS.map(section => {
    if (section.sectionNumber === 'H.1' && hasBoxedWarning) {
      return { ...section, required: true };
    }
    return { ...section };
  });

  // Build FPI structure with product-specific adjustments
  const fullPIStructure: PLRSectionDescriptor[] = FPI_SECTIONS.map(section => {
    const adjusted = { ...section };

    // Section 8 adjustments for special populations
    if (section.sectionNumber === '8' && specialPopulations && specialPopulations.length > 0) {
      const additionalSubsections: string[] = [];
      if (specialPopulations.includes('pediatric')) {
        additionalSubsections.push('8.4 Pediatric Use — include results of pediatric studies or state that safety/efficacy not established');
      }
      if (specialPopulations.includes('geriatric')) {
        additionalSubsections.push('8.5 Geriatric Use — state whether clinical studies included sufficient numbers of subjects 65 and over');
      }
      if (specialPopulations.includes('renal_impairment')) {
        additionalSubsections.push('8.6 Renal Impairment — PK data and dose adjustment recommendations');
      }
      if (specialPopulations.includes('hepatic_impairment')) {
        additionalSubsections.push('8.7 Hepatic Impairment — PK data and dose adjustment recommendations based on Child-Pugh classification');
      }
      if (additionalSubsections.length > 0) {
        adjusted.subsections = [...(adjusted.subsections || []), ...additionalSubsections];
      }
    }

    return adjusted;
  });

  // Product type-specific considerations
  if (productType === 'biological' || productType === 'biosimilar') {
    specialConsiderations.push(
      'Biological products (BLA): Section 11 Description must include the source of the biological substance, method of preparation, and relevant biological characteristics.',
      'Immunogenicity data should be included in Section 6 Adverse Reactions with appropriate caveats about cross-study comparability.',
    );
    if (productType === 'biosimilar') {
      specialConsiderations.push(
        'Biosimilar labeling per FDA Guidance "Labeling for Biosimilar Products" (2018): Include biosimilarity statement in Section 1 and Section 11.',
        'If interchangeable designation: include statement regarding substitution without prescriber intervention.',
        'Biosimilar Highlights must include statement: "[Product name] is biosimilar to [reference product]."',
      );
    }
  }

  if (productType === 'generic') {
    specialConsiderations.push(
      'Generic drug labeling (ANDA): must be the same as the RLD labeling with limited exceptions per 21 CFR 314.94(a)(8).',
      'Labeling carve-out under section 505(j)(2)(A)(viii): may omit information protected by method-of-use patents for the remaining patent term.',
      'Generic labeling must be updated to match RLD labeling changes in a timely manner.',
    );
  }

  if (applicationType === 'supplement') {
    specialConsiderations.push(
      'Labeling supplement types: Prior Approval Supplement (PAS), CBE-30, CBE-0. Select based on the nature of the change.',
      'CBE-0 supplements used for safety labeling changes — can be implemented immediately upon submission.',
      'CBE-30 supplements used for other labeling changes — may be implemented 30 days after FDA receipt.',
      'Annual Report labeling changes limited to editorial/minor formatting changes per 21 CFR 314.70(d).',
    );
  }

  if (hasBoxedWarning) {
    specialConsiderations.push(
      'Boxed Warning must appear in BOTH Highlights (H.1) and Full Prescribing Information.',
      'Highlights boxed warning is a concise summary; FPI boxed warning contains the full text.',
      'The boxed warning in Highlights must be enclosed within a box using a black border.',
    );
  }

  if (isNewFormulation) {
    specialConsiderations.push(
      'New formulation: include comparative bioavailability/bioequivalence data in Section 12.3 if relevant to prescribing decisions.',
      'If switching from existing formulation, Section 2 Dosage and Administration should include conversion guidance.',
    );
  }

  // Therapeutic area-specific additions
  const lowerTA = therapeuticArea.toLowerCase();
  if (lowerTA.includes('oncology') || lowerTA.includes('cancer')) {
    specialConsiderations.push(
      'Oncology products: Section 14 should include waterfall plots, Kaplan-Meier curves, or forest plots as appropriate. FDA oncology labeling often includes these visual data displays.',
      'Accelerated approval products must state that continued approval may be contingent upon verification of clinical benefit in confirmatory trials.',
    );
  }
  if (lowerTA.includes('cns') || lowerTA.includes('psychiatric') || lowerTA.includes('neurolog')) {
    specialConsiderations.push(
      'CNS products: Antidepressant suicidality boxed warning applies to all antidepressants regardless of indication (class-wide).',
      'Antiepileptic suicidality warning required per FDA 2008 labeling changes.',
    );
  }
  if (lowerTA.includes('cardiovascular') || lowerTA.includes('cardiac')) {
    specialConsiderations.push(
      'Cardiovascular products: QTc prolongation data from thorough QT study (ICH E14) must be reflected in Section 5 Warnings and Precautions and Section 12.2 Pharmacodynamics.',
    );
  }

  // Formatting requirements per PLR guidance
  const formattingRequirements: FormattingRequirements = {
    highlightsFontSize: 'Minimum 8-point type for Highlights of Prescribing Information',
    fpiMinFontSize: 'Minimum 6-point type for Full Prescribing Information per 21 CFR 201.57(d)(8)',
    headingFormat: 'Section headings must be in bold and in upper case. Subsection headings in bold with initial capitals.',
    boldingRules: [
      'Section headings: ALL CAPS, bold',
      'Subsection headings: Initial Capitals, bold',
      'Boxed Warning header "WARNING:" in bold caps',
      'Contraindication heading: bold',
      'Drug name in Highlights title line: bold',
      'Reference to Boxed Warning: bold, with inverted black triangle symbol',
    ],
    layoutRules: [
      'Highlights limited to approximately one half page (one column of a two-column page) per 21 CFR 201.57(d)(4)',
      'FPI organized in two-column format for print labeling',
      'Table of Contents required between Highlights and FPI if FPI exceeds one page',
      'Horizontal hairline rules separate major sections in Highlights',
      'Running header includes drug name and initial U.S. approval year',
    ],
    columnFormat: 'Two-column format for print labeling. Single-column acceptable for electronic labeling (DailyMed).',
  };

  // SPL submission requirements
  const splRequirements: SPLRequirements = {
    format: 'HL7 SPL (Structured Product Labeling) XML format, Release 6',
    submissionSystem: 'FDA Electronic Submissions Gateway (ESG) for SPL submissions. Published on DailyMed (NIH NLM) for public access.',
    loincCodesRequired: true,
    xmlVersion: 'SPL schema version r6 (Release 6) or as specified by current FDA SPL guidance',
    stylesheetRequired: true,
    validationRules: [
      'Each section must be tagged with the appropriate LOINC code',
      'Document type code must match application type (NDA, BLA, ANDA)',
      'NDC numbers must be included for each packaged product configuration',
      'Images must be in PNG or JPEG format within the SPL XML',
      'Structural formulas required in Section 11 Description',
      'SPL must pass FDA SPL validation engine before submission',
      'Effective date must be specified',
      'Prior SPL version ID required for supplements/updates (version chain)',
    ],
  };

  const citations: Citation[] = [
    LABELING_CITATIONS.CFR_201_56,
    LABELING_CITATIONS.CFR_201_57,
    LABELING_CITATIONS.PLR_GUIDANCE,
    LABELING_CITATIONS.SPL_GUIDANCE,
  ];

  if (productType === 'biosimilar') {
    citations.push({
      guideline: 'FDA Guidance',
      section: 'Biosimilar Labeling',
      title: 'Labeling for Biosimilar Products',
      year: 2018,
      url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/labeling-biosimilar-products',
    });
  }

  return {
    highlightsStructure,
    fullPIStructure,
    formattingRequirements,
    splRequirements,
    specialConsiderations,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 2: assessBoxedWarning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates whether a safety signal meets the criteria for a Boxed Warning
 * under 21 CFR 201.57(c)(1), provides formatting requirements, and returns
 * common boxed warning categories with real drug examples.
 *
 * The three criteria from 21 CFR 201.57(c)(1) are:
 *   (i)  An adverse reaction so serious that the risk must be weighed against
 *        the potential benefit of the drug
 *   (ii) A serious adverse reaction that can be prevented, reduced in
 *        frequency, or reduced in severity by appropriate use
 *   (iii) FDA approved the drug with restrictions on use to ensure safe use
 *         because the drug has a serious safety concern
 */
export function assessBoxedWarning(params: AssessBoxedWarningInput): AssessBoxedWarningResult {
  const { safetySignalType, severity, clinicalEvidenceLevel, riskMitigationAvailable, classWide, productSpecific } = params;

  // Criterion (i): Serious adverse reaction requiring risk-benefit weighing
  const criterion1Met = severity === 'life_threatening' || severity === 'serious';
  const criterion1: BoxedWarningCriterion = {
    criterionNumber: 1,
    description: '21 CFR 201.57(c)(1)(i): There is an adverse reaction so serious in proportion to the potential benefit from the drug that it is essential that the adverse reaction be considered in assessing whether to use the drug.',
    met: criterion1Met,
    rationale: criterion1Met
      ? `The safety signal involves a ${severity} adverse reaction (type: ${safetySignalType}). This level of severity meets the threshold for weighing risk against potential benefit.`
      : `The safety signal is classified as "${severity}" which, while notable, does not independently meet the threshold for Criterion (i). However, this determination may be modified based on clinical context.`,
  };

  // Criterion (ii): Risk can be mitigated through appropriate use
  const criterion2Met = riskMitigationAvailable && (severity === 'life_threatening' || severity === 'serious');
  const criterion2: BoxedWarningCriterion = {
    criterionNumber: 2,
    description: '21 CFR 201.57(c)(1)(ii): There is a serious adverse reaction that can be prevented or reduced in frequency or severity by appropriate use of the drug (e.g., monitoring, patient selection, avoiding certain concomitant therapy).',
    met: criterion2Met,
    rationale: criterion2Met
      ? `Risk mitigation measures are available for this ${severity} safety signal. A boxed warning can communicate necessary steps to prevent or reduce the frequency/severity of the adverse reaction.`
      : riskMitigationAvailable
        ? 'Risk mitigation is available but the severity classification may not independently support Criterion (ii).'
        : 'No risk mitigation measures have been identified. Criterion (ii) typically requires that appropriate use can prevent or reduce the adverse reaction.',
  };

  // Criterion (iii): Approved with restrictions (REMS-linked)
  const criterion3Met = severity === 'life_threatening' && (safetySignalType === 'teratogenicity' || safetySignalType === 'pml' || safetySignalType === 'cytokine_release');
  const criterion3: BoxedWarningCriterion = {
    criterionNumber: 3,
    description: '21 CFR 201.57(c)(1)(iii): FDA approved the drug with restrictions to ensure that use of the drug is safe (e.g., restricting distribution to certain facilities, requiring special training/certification, mandating monitoring).',
    met: criterion3Met,
    rationale: criterion3Met
      ? `The safety signal type (${safetySignalType}) and life-threatening severity suggest that restricted distribution or use conditions are appropriate. This aligns with REMS ETASU requirements.`
      : 'Based on the provided parameters, restricted distribution or use conditions may not be the primary mechanism for managing this risk.',
  };

  // Overall assessment
  const meetsBoxedWarningCriteria = criterion1Met || criterion2Met || criterion3Met;

  // Additional assessment factors based on evidence level
  if (clinicalEvidenceLevel === 'controlled_trials') {
    criterion1.rationale += ' The evidence from controlled clinical trials provides the strongest evidentiary basis for a boxed warning.';
  } else if (clinicalEvidenceLevel === 'observational') {
    criterion1.rationale += ' Observational evidence supports the signal. FDA may request additional controlled data depending on the effect size and biological plausibility.';
  } else if (clinicalEvidenceLevel === 'postmarketing') {
    criterion1.rationale += ' Postmarketing reports, while not as rigorous as controlled trials, may support a boxed warning if the signal is strong (large number of reports, clear temporal relationship, biological plausibility).';
  } else if (clinicalEvidenceLevel === 'case_reports') {
    criterion1.rationale += ' Case reports alone are generally insufficient for a boxed warning but may support one when combined with mechanistic plausibility and class-effect data.';
  }

  // Class-wide vs product-specific considerations
  if (classWide) {
    criterion1.rationale += ' This is a class-wide signal, suggesting all members of the pharmacological class may carry this risk. Class-wide boxed warnings are applied uniformly (e.g., NSAIDs, antidepressants, antipsychotics).';
  }
  if (productSpecific && !classWide) {
    criterion1.rationale += ' This is a product-specific signal. The boxed warning would be limited to this specific product rather than applied class-wide.';
  }

  // Format requirements
  const formatRequirements: BoxedWarningFormatRequirements = {
    headerText: 'WARNING: [Descriptive Title in ALL CAPS]',
    borderStyle: 'The boxed warning must be set off by a prominently printed box with a black border. In Highlights, "See full prescribing information for complete boxed warning" must appear.',
    placement: [
      'Highlights of Prescribing Information: Concise summary in a box immediately after the product header',
      'Full Prescribing Information: Complete text in a box preceding Section 1 Indications and Usage',
      'Medication Guide (if applicable): Boxed warning text must be included',
    ],
    fontRequirements: 'Text within the box must be in bold type. The word "WARNING" must appear at the top of the box in bold capital letters.',
    symbolRequirements: 'An inverted black triangle symbol (or text reference) must appear in Highlights adjacent to each section that is described in the Boxed Warning, cross-referencing to the relevant section of the FPI.',
  };

  // Filter relevant categories based on safety signal type
  const relevantCategories = BOXED_WARNING_CATEGORIES.filter(cat => {
    if (safetySignalType === 'other') return true;
    return cat.riskType === safetySignalType;
  });
  const commonCategories = relevantCategories.length > 0 ? relevantCategories : BOXED_WARNING_CATEGORIES.slice(0, 5);

  // REMS relationship
  let remsRelationship: string;
  if (criterion3Met) {
    remsRelationship = 'Products with boxed warnings that meet Criterion (iii) are typically accompanied by a REMS with ETASU. The REMS operationalizes the restrictions described in or implied by the boxed warning. Not all boxed warnings require a REMS, but all REMS with ETASU products have boxed warnings. Per FDA, approximately 60+ currently active REMS exist, and the majority of products with REMS ETASU carry boxed warnings.';
  } else if (criterion2Met) {
    remsRelationship = 'This safety signal may benefit from a REMS, but a Medication Guide or Communication Plan may suffice without ETASU. A boxed warning can be present without a REMS (e.g., NSAID cardiovascular/GI warnings). The determination of whether a REMS is needed is a separate regulatory assessment under FD&C Act Section 505-1.';
  } else {
    remsRelationship = 'A boxed warning does not automatically require a REMS. Many products carry boxed warnings without any associated REMS (e.g., fluoroquinolone class warnings). A REMS is required when FDA determines that a Medication Guide, patient package insert, or communication plan alone is insufficient to ensure the benefits outweigh the risks.';
  }

  const citations: Citation[] = [
    LABELING_CITATIONS.CFR_201_57_C1,
    LABELING_CITATIONS.CFR_201_57,
    LABELING_CITATIONS.PLR_GUIDANCE,
    LABELING_CITATIONS.SAFETY_LABELING_CHANGES,
    LABELING_CITATIONS.REMS_GUIDANCE,
  ];

  return {
    meetsBoxedWarningCriteria,
    criteriaAssessment: [criterion1, criterion2, criterion3],
    formatRequirements,
    commonCategories,
    remsRelationship,
    safetyLabelingChangeProcess: SAFETY_LABELING_CHANGE_STEPS,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 3: designREMS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Designs a REMS (Risk Evaluation and Mitigation Strategy) based on the
 * identified risk profile, product type, and target population. Returns
 * recommended elements, assessment schedules, existing model programs,
 * and FDORA 2022 modifications.
 *
 * REMS authority derives from FD&C Act Section 505-1, added by the FDA
 * Amendments Act (FDAAA) of 2007 and modified by FDORA 2022.
 */
export function designREMS(params: DesignREMSInput): DesignREMSResult {
  const { safetySignalType, productType, riskSeverity, riskFrequency, targetPopulation } = params;

  // Element hierarchy from least to most restrictive
  const elementHierarchy: string[] = [
    'Level 1: Medication Guide and/or Patient Package Insert — provides standardized patient information. Least restrictive; appropriate when risk can be mitigated through patient education alone.',
    'Level 2: Communication Plan — targets healthcare providers with educational materials (Dear HCP letters, training, continuing education). Adds provider-facing risk communication.',
    'Level 3: Elements to Assure Safe Use (ETASU) without restricted distribution — includes prescriber/pharmacy certification, patient enrollment, laboratory monitoring, but drug available through normal distribution channels.',
    'Level 4: ETASU with restricted distribution — most restrictive. Drug only available through limited/specialty distribution. May require administration in certified healthcare settings. Reserved for highest-risk products.',
  ];

  // Determine recommended elements based on risk profile
  const recommendedElements: REMSElementDescriptor[] = [];

  // Medication Guide — recommended for almost all REMS
  recommendedElements.push({
    element: 'medication_guide',
    description: 'A Medication Guide (MedGuide) is an FDA-approved patient labeling document that must be dispensed with each prescription fill. It is written in consumer-friendly language and addresses specific serious risks.',
    rationale: `The identified risk (${safetySignalType}, severity: ${riskSeverity}) warrants patient-directed risk communication. Medication Guides are appropriate when patient understanding can help mitigate the risk.`,
    implementationDetails: [
      'Must be written at or below an 8th-grade reading level',
      'Must be dispensed with each prescription and refill by the pharmacist',
      'Content must be consistent with the approved labeling',
      'Formatted per 21 CFR 208 requirements',
      'Distributed by the manufacturer to wholesalers and pharmacies',
    ],
  });

  // Communication Plan — recommended for moderate+ severity
  if (riskSeverity === 'moderate' || riskSeverity === 'significant' || riskSeverity === 'high') {
    recommendedElements.push({
      element: 'communication_plan',
      description: 'A Communication Plan specifies how the REMS applicant will communicate safety information to healthcare providers. Includes Dear HCP letters, professional society outreach, CME/CE programs, and provider fact sheets.',
      rationale: `A ${riskSeverity}-severity risk requires healthcare provider education beyond standard labeling. Communication Plan ensures prescribers are aware of risk mitigation strategies for ${safetySignalType}.`,
      implementationDetails: [
        'Dear Healthcare Provider (HCP) letter with approved content',
        'REMS-compliant training materials for prescribers',
        'Optional: continuing education (CE/CME) programs',
        'FDA review and approval of all communication materials',
        'Timetable for dissemination activities',
      ],
    });
  }

  // ETASU — recommended for high or significant severity
  if (riskSeverity === 'high' || riskSeverity === 'significant') {
    let etasuRationale: string;
    if (safetySignalType === 'teratogenicity') {
      etasuRationale = 'Teratogenic risk requires ETASU with pregnancy prevention programs, prescriber and pharmacy certification, and patient enrollment to prevent fetal exposure.';
    } else if (safetySignalType === 'infection') {
      etasuRationale = 'Serious infection risk may require prescriber certification to ensure appropriate patient selection, monitoring, and management of infections.';
    } else if (safetySignalType === 'cytokine_release') {
      etasuRationale = 'Cytokine release syndrome risk requires ETASU to ensure administration in certified healthcare settings with appropriate monitoring and management capabilities.';
    } else if (safetySignalType === 'hepatotoxicity') {
      etasuRationale = 'Hepatotoxicity risk requires ETASU with mandatory liver function monitoring as a condition of prescribing and continued dispensing.';
    } else if (safetySignalType === 'pml') {
      etasuRationale = 'PML risk requires ETASU with patient enrollment, periodic MRI monitoring, and JCV antibody testing protocols.';
    } else {
      etasuRationale = `The ${riskSeverity}-severity ${safetySignalType} risk cannot be adequately managed through labeling and communication alone. ETASU provides systematic safeguards.`;
    }

    recommendedElements.push({
      element: 'etasu',
      description: 'Elements to Assure Safe Use (ETASU) are the most restrictive REMS components. They may include prescriber certification, pharmacy certification, patient enrollment, monitoring requirements, and/or restricted distribution.',
      rationale: etasuRationale,
      implementationDetails: [
        'Prescriber certification or enrollment requirements',
        'Pharmacy certification or enrollment requirements',
        'Patient enrollment and informed consent',
        'Specific monitoring parameters (lab tests, imaging, clinical assessments)',
        'Dispensing conditions (limited supply, no auto-refill, specific settings)',
        'Central database/registry for tracking compliance',
      ],
    });
  }

  // Implementation System — recommended when ETASU is present
  if (riskSeverity === 'high' || (riskSeverity === 'significant' && (safetySignalType === 'teratogenicity' || safetySignalType === 'pml'))) {
    recommendedElements.push({
      element: 'implementation_system',
      description: 'An implementation system is the infrastructure (typically an electronic database/registry) that supports ETASU. It tracks prescriber and pharmacy certification, patient enrollment, monitoring compliance, and dispensing authorization.',
      rationale: `The ETASU requirements for ${safetySignalType} risk management require a robust implementation system to track compliance across prescribers, pharmacies, and patients.`,
      implementationDetails: [
        'Central electronic database accessible to prescribers, pharmacies, and FDA',
        'Real-time verification of prescriber/pharmacy certification before dispensing',
        'Patient tracking and monitoring compliance verification',
        'Automated alerts for missed monitoring windows',
        'Periodic compliance reporting to FDA',
        'Technical support and help desk for participants',
      ],
    });
  }

  // Assessment schedule
  const assessmentSchedule: REMSAssessmentSchedule = {
    initialAssessment: 'Initial REMS assessment due 18 months after the REMS approval date. The assessment evaluates whether the REMS is meeting its goals, whether the REMS elements are appropriate, and whether modifications are needed.',
    subsequentAssessments: [
      'Second assessment: 3 years after REMS approval (or as specified by FDA)',
      'Subsequent assessments: Every 3 years thereafter, or more frequently if FDA determines necessary',
      'FDA may require more frequent assessments for newly approved REMS or if safety concerns emerge',
      'Assessment reports must include: REMS goal evaluation, element effectiveness, burden assessment, and proposed modifications',
      'Surveys of prescribers, pharmacists, and patients to evaluate knowledge and behavior',
      'Utilization data and compliance metrics',
    ],
    sunsetProvision: 'Per FDORA 2022, FDA must periodically evaluate whether the REMS remains necessary. If the REMS goals can be achieved through labeling alone, FDA should release the REMS requirements. There is no automatic sunset — REMS remain in effect until FDA determines they are no longer necessary.',
  };

  // Select relevant existing models
  let existingModels: ExistingREMSModel[];
  if (safetySignalType === 'teratogenicity') {
    existingModels = EXISTING_REMS_MODELS.filter(m =>
      m.programName === 'iPLEDGE' || m.programName === 'Thalomid/Revlimid/Pomalyst REMS'
    );
  } else if (safetySignalType === 'infection') {
    existingModels = EXISTING_REMS_MODELS.filter(m =>
      m.programName === 'Clozapine REMS Program'
    );
  } else {
    existingModels = EXISTING_REMS_MODELS;
  }

  // Shared system considerations
  const sharedSystemConsiderations: string[] = [
    'FD&C Act Section 505-1(f)(7): FDA shall facilitate development of shared REMS when multiple holders market products requiring similar REMS elements.',
    'Shared REMS reduce burden on prescribers, pharmacies, and patients who would otherwise navigate multiple systems for the same drug class.',
    'TIRF REMS Access Program is the model shared REMS — covers all transmucosal immediate-release fentanyl products under a single program.',
    'Cost-sharing among REMS holders must be addressed per FDORA 2022 provisions.',
    'FDA maintains a public list of approved REMS at www.fda.gov/drugs/rems.',
    'Shared REMS require governance agreements among participating applicants for decision-making, costs, and operational responsibilities.',
  ];

  // FDORA 2022 changes
  const fdoraChanges: string[] = [
    'FDORA Section 3210: Requires FDA to periodically evaluate whether REMS remain necessary and to release REMS requirements when goals can be met through labeling alone.',
    'FDORA Section 3211: Enhances transparency by requiring FDA to publish a summary of REMS assessments, including whether REMS goals are being met.',
    'FDORA Section 3212: Facilitates shared REMS by clarifying cost-sharing responsibilities among multiple holders.',
    'FDORA Section 3213: Requires FDA to issue or update guidance on the format and content of REMS assessments.',
    'FDORA Section 3214: Addresses the interaction between REMS and generic/biosimilar access — REMS must not be used to block competition.',
    'FDORA Section 3215: Requires REMS modifications to be reviewed within a specified timeframe to reduce implementation delays.',
    'FDORA provisions strengthen the requirement that REMS must use the least burdensome approach necessary to achieve safety goals.',
    'FDORA codifies the principle that REMS ETASU should not unduly restrict patient access to beneficial medications.',
  ];

  const citations: Citation[] = [
    LABELING_CITATIONS.FDCA_505_1,
    LABELING_CITATIONS.REMS_GUIDANCE,
    LABELING_CITATIONS.FDORA_2022,
    {
      guideline: 'FDA Guidance',
      section: 'REMS Assessment',
      title: 'REMS Assessment: Planning and Reporting',
      year: 2019,
      url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/rems-assessment-planning-and-reporting',
    },
    {
      guideline: 'FDA Guidance',
      section: 'Shared REMS',
      title: 'Development of Shared System REMS',
      year: 2018,
      url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/development-shared-system-rems',
    },
  ];

  return {
    recommendedElements,
    elementHierarchy,
    assessmentSchedule,
    existingModels,
    etasuDetails: ETASU_ELEMENTS,
    sharedSystemConsiderations,
    fdoraChanges,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 4: assessPregnancyLactationLabeling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assesses pregnancy and lactation labeling requirements under the PLLR
 * (Pregnancy and Lactation Labeling Rule), Final Rule 79 FR 72064, effective
 * June 30, 2015. Returns structured section content, risk communication
 * framework, and implementation guidance.
 *
 * The PLLR replaced the former A/B/C/D/X pregnancy letter categories with
 * narrative risk summaries in three subsections: 8.1 Pregnancy, 8.2 Lactation,
 * and 8.3 Females and Males of Reproductive Potential.
 */
export function assessPregnancyLactationLabeling(params: AssessPregnancyLactationInput): AssessPregnancyLactationResult {
  const { animalReproToxData, humanPregnancyData, placentalTransfer, breastMilkExcretion, mechanismBasedRisk, pregnancyRegistryData } = params;

  // ── Section 8.1: Pregnancy ──
  const pregnancyRequiredStatements: string[] = [];
  const pregnancyRiskSummaryGuidance: string[] = [];

  if (humanPregnancyData) {
    pregnancyRiskSummaryGuidance.push(
      'Human data available: Risk Summary should describe the available human data first. State the nature, size, and design of the data source (prospective pregnancy registry, retrospective cohort, case series, etc.).',
      'Contextualize findings: compare observed malformation rates to background rates in the general population (approximately 2-4% for major birth defects and 15-20% for miscarriage in clinically recognized pregnancies).',
    );
    if (pregnancyRegistryData) {
      pregnancyRiskSummaryGuidance.push(
        'Pregnancy registry data available: Describe the design (prospective enrollment before outcome is known), sample size, comparison group, and key findings.',
        'If the registry is ongoing, state: "There is a pregnancy exposure registry that monitors pregnancy outcomes in women exposed to [drug name] during pregnancy. Healthcare providers are encouraged to register patients by calling [phone number] or visiting [website]."',
      );
    }
  } else {
    pregnancyRiskSummaryGuidance.push(
      'No human data available: State "There are no adequate data on the developmental risk associated with the use of [drug name] in pregnant women." Then proceed to describe animal data.',
    );
  }

  if (animalReproToxData.length > 0) {
    const hasAdverseFindings = animalReproToxData.some(d => d.findings.toLowerCase().includes('malformation') || d.findings.toLowerCase().includes('embryoleth') || d.findings.toLowerCase().includes('teratogen') || d.findings.toLowerCase().includes('fetal death'));
    if (hasAdverseFindings) {
      pregnancyRiskSummaryGuidance.push(
        'Adverse animal findings: Describe the species, adverse developmental outcomes (malformations, embryolethality, reduced fetal weight), doses at which effects occurred, and relationship to human exposure (multiples of MRHD on a mg/m2 or AUC basis).',
        'Include standard statement: "In animal reproduction studies, [adverse effect] was observed in [species] at doses [X] times the maximum recommended human dose (MRHD) based on [body surface area/AUC]."',
      );
      pregnancyRequiredStatements.push(
        'Based on animal data, advise pregnant women and females of reproductive potential of the potential risk to a fetus.',
      );
    } else {
      pregnancyRiskSummaryGuidance.push(
        'No adverse animal findings: State "In animal reproduction studies, no adverse developmental effects were observed at doses up to [X] times the MRHD based on [body surface area/AUC]." Provide details of species, doses, and exposure multiples in the Data subsection.',
      );
    }
  } else {
    pregnancyRiskSummaryGuidance.push(
      'No animal data: State "Animal reproduction studies have not been conducted with [drug name]." This represents a data gap that should be acknowledged.',
    );
  }

  if (mechanismBasedRisk) {
    pregnancyRiskSummaryGuidance.push(
      'Mechanism-based risk: If the pharmacological mechanism suggests developmental risk (e.g., antiangiogenic agents, retinoids, ACE inhibitors in 2nd/3rd trimester), describe the mechanistic basis for concern even in the absence of direct evidence.',
    );
    pregnancyRequiredStatements.push(
      'Based on the mechanism of action, [drug name] may cause fetal harm when administered to a pregnant woman.',
    );
  }

  // Placental transfer assessment
  if (placentalTransfer === 'known') {
    pregnancyRiskSummaryGuidance.push('Placental transfer is known to occur. State this in the Risk Summary and describe implications for fetal exposure.');
  } else if (placentalTransfer === 'likely') {
    pregnancyRiskSummaryGuidance.push('Placental transfer is likely based on molecular characteristics (e.g., IgG antibodies cross the placenta, small molecules generally cross). Note this in the Risk Summary.');
  } else if (placentalTransfer === 'unknown') {
    pregnancyRiskSummaryGuidance.push('Placental transfer status is unknown. Acknowledge this data gap in the Risk Summary.');
  }

  pregnancyRequiredStatements.push(
    'Background risk statement required: "The estimated background risk of major birth defects and miscarriage for the indicated population is unknown. All pregnancies have a background risk of birth defect, loss, or other adverse outcomes. In the U.S. general population, the estimated background risk of major birth defects and miscarriage in clinically recognized pregnancies is 2% to 4% and 15% to 20%, respectively."',
  );

  const section8_1: PregnancyLabelingSection = {
    sectionTitle: '8.1 Pregnancy',
    subsections: [
      {
        name: 'Pregnancy Exposure Registry',
        contentGuidance: pregnancyRegistryData
          ? 'Include pregnancy exposure registry information with contact details (phone number and/or website). This statement appears first in Section 8.1, before the Risk Summary.'
          : 'If no registry exists, this subsection is omitted. Consider whether a registry should be established based on the anticipated patient population.',
      },
      {
        name: 'Risk Summary',
        contentGuidance: pregnancyRiskSummaryGuidance.join(' '),
      },
      {
        name: 'Clinical Considerations',
        contentGuidance: 'Describe disease-associated maternal and/or embryo/fetal risk if the disease itself poses a risk in pregnancy. Include information on dose adjustments during pregnancy and labor/delivery considerations if relevant. Address fetal/neonatal adverse reactions if the drug is used during pregnancy or near delivery.',
      },
      {
        name: 'Data',
        contentGuidance: 'Detailed description of human data (epidemiological studies, pregnancy registries, clinical trials) and animal data (species, study design, doses, route, timing, findings, exposure margins). Present animal data with doses expressed as multiples of the MRHD on a mg/m2 or AUC basis.',
      },
    ],
    requiredStatements: pregnancyRequiredStatements,
  };

  // ── Section 8.2: Lactation ──
  const lactationGuidance: string[] = [];

  if (breastMilkExcretion === 'known') {
    lactationGuidance.push(
      'Drug is known to be present in human milk. Describe the amount detected, milk-to-plasma ratio if known, and effects on the breastfed infant if observed.',
      'Include statement: "[Drug name] is present in human milk. [Describe effects on breastfed infant or state that effects are unknown.] Consider the developmental and health benefits of breastfeeding along with the mother\'s clinical need for [drug name] and any potential adverse effects on the breastfed infant from [drug name] or from the underlying maternal condition."',
    );
  } else if (breastMilkExcretion === 'likely') {
    lactationGuidance.push(
      'Drug is likely excreted in human milk based on molecular characteristics or animal lactation data. State: "There are no data on the presence of [drug name] in human milk. [Drug name] is present in [animal species] milk. Because of the potential for [adverse reactions] in breastfed infants from [drug name], advise [appropriate action]."',
    );
  } else if (breastMilkExcretion === 'unknown') {
    lactationGuidance.push(
      'Breast milk excretion is unknown. State: "There are no data on the presence of [drug name] in human milk, the effects on the breastfed infant, or the effects on milk production."',
    );
  } else {
    lactationGuidance.push(
      'Drug is not excreted in breast milk. State this and note whether breastfeeding may be continued during therapy.',
    );
  }

  const section8_2: PregnancyLabelingSection = {
    sectionTitle: '8.2 Lactation',
    subsections: [
      {
        name: 'Risk Summary',
        contentGuidance: lactationGuidance.join(' '),
      },
      {
        name: 'Clinical Considerations',
        contentGuidance: 'If the drug could affect the breastfed infant, describe monitoring or management strategies. If pumping and discarding milk is recommended, specify the duration (e.g., "during treatment and for [X days/weeks] after the last dose").',
      },
      {
        name: 'Data',
        contentGuidance: 'Detailed human and animal lactation data if available, including milk concentrations, infant exposure estimates, and observed effects in nursing offspring.',
      },
    ],
    requiredStatements: [
      'A risk-benefit statement regarding breastfeeding is required: "Consider the developmental and health benefits of breastfeeding along with the mother\'s clinical need for [drug name] and any potential adverse effects on the breastfed infant from [drug name] or from the underlying maternal condition."',
    ],
  };

  // ── Section 8.3: Females and Males of Reproductive Potential ──
  const reproGuidance: string[] = [];
  if (mechanismBasedRisk || animalReproToxData.some(d => d.findings.toLowerCase().includes('fertility'))) {
    reproGuidance.push(
      'Based on mechanism of action or animal fertility data, this section should address pregnancy testing requirements, contraception recommendations, and infertility potential.',
    );
  }

  const section8_3: PregnancyLabelingSection = {
    sectionTitle: '8.3 Females and Males of Reproductive Potential',
    subsections: [
      {
        name: 'Pregnancy Testing',
        contentGuidance: mechanismBasedRisk
          ? 'Verify pregnancy status in females of reproductive potential prior to initiating therapy. Specify the type of pregnancy test and timing.'
          : 'Include pregnancy testing recommendation if the drug poses a risk to the embryo/fetus. Omit if not applicable.',
      },
      {
        name: 'Contraception',
        contentGuidance: mechanismBasedRisk
          ? 'Advise females of reproductive potential to use effective contraception during treatment and for a specified period after the last dose. If the drug affects male fertility, male patients should also be advised. Specify the recommended duration based on the drug\'s half-life (typically 5 half-lives plus the duration of any relevant biologic effect).'
          : 'Include contraception recommendations if warranted by animal or human data. State duration of contraception relative to treatment completion.',
      },
      {
        name: 'Infertility',
        contentGuidance: animalReproToxData.some(d => d.findings.toLowerCase().includes('fertility'))
          ? 'Based on animal findings, [drug name] may impair fertility in [males/females/both]. Describe the animal findings, reversibility, and relevance to humans.'
          : 'Include only if there is evidence of potential impairment of fertility from nonclinical or clinical data.',
      },
    ],
    requiredStatements: reproGuidance,
  };

  // ── Risk Communication Framework ──
  const riskCommunicationFramework: RiskCommunicationItem[] = [
    {
      scenario: 'Known human risk from controlled data',
      recommendedLanguage: '"Based on [data source], [drug name] can cause [specific adverse developmental outcome] when administered during pregnancy. Advise pregnant women of the potential risk to a fetus."',
    },
    {
      scenario: 'Animal data suggests risk, no human data',
      recommendedLanguage: '"Based on animal data, [drug name] may cause fetal harm when administered to a pregnant woman. In animal reproduction studies, [adverse effect] occurred at doses [X] times the MRHD. Advise pregnant women of the potential risk to a fetus."',
    },
    {
      scenario: 'Mechanism of action suggests risk',
      recommendedLanguage: '"Based on its mechanism of action, [drug name] can cause fetal harm when administered to a pregnant woman. [Describe mechanism and expected fetal effect.] Advise pregnant women of the potential risk to a fetus."',
    },
    {
      scenario: 'No data available (human or animal)',
      recommendedLanguage: '"There are no available data on [drug name] use in pregnant women to evaluate for a drug-associated risk of major birth defects, miscarriage, or other adverse maternal or fetal outcomes. Animal reproduction studies have not been conducted with [drug name]."',
    },
    {
      scenario: 'Animal data is reassuring, no human data',
      recommendedLanguage: '"There are no available data on [drug name] use in pregnant women. In animal reproduction studies, no adverse developmental effects were observed at doses up to [X] times the MRHD based on [body surface area/AUC]. The estimated background risk of major birth defects is 2% to 4% and of miscarriage is 15% to 20%."',
    },
    {
      scenario: 'Drug is contraindicated in pregnancy',
      recommendedLanguage: '"[Drug name] is contraindicated in females who are pregnant [Section 4]. [Drug name] can cause embryo-fetal harm when administered to a pregnant woman based on [data source]. Advise females of reproductive potential of the potential risk to a fetus. Obtain a pregnancy test before initiating [drug name] [Section 8.3]."',
    },
  ];

  // ── Pregnancy Registry Requirements ──
  const pregnancyRegistryRequirements: string[] = [
    'FDA encourages establishment of pregnancy exposure registries for drugs likely to be used by women of reproductive potential.',
    'Registry design: prospective enrollment (before outcome is known) to minimize ascertainment bias.',
    'Registry should include a comparison group (disease-matched unexposed or general population) for context.',
    'Minimum sample size should provide 80% power to detect a 2-fold increase in major malformations over the background rate.',
    'Registry contact information must appear at the beginning of Section 8.1 (before Risk Summary) if a registry exists.',
    'FDA maintains a list of pregnancy exposure registries at: https://www.fda.gov/science-research/womens-health-research/list-pregnancy-exposure-registries',
    'Results from pregnancy registries should be incorporated into the Risk Summary and Data subsections as they become available.',
  ];

  // ── Implementation Timeline ──
  const implementationTimeline: string[] = [
    'PLLR Final Rule published: December 4, 2014 (79 FR 72064)',
    'Effective date: June 30, 2015',
    'New applications (NDA/BLA) submitted on or after June 30, 2015: must use PLLR format',
    'Products approved after June 29, 2001 (PLR products): phased implementation over 3-5 years after June 30, 2015',
    'Products approved before June 30, 2001 (pre-PLR products): must remove pregnancy letter category within 3 years of June 30, 2015. Full PLLR format is recommended but the subsection structure is not required for pre-PLR products.',
    'Supplements to update pregnancy/lactation labeling: Prior Approval Supplement (PAS) required for the initial PLLR conversion. Subsequent updates may use CBE-0 or CBE-30 as appropriate.',
    'OTC products are NOT subject to PLLR requirements. OTC pregnancy warnings follow 21 CFR 201.63 and applicable monograph provisions.',
  ];

  const citations: Citation[] = [
    LABELING_CITATIONS.PLLR_FINAL_RULE,
    LABELING_CITATIONS.PLLR_GUIDANCE,
    LABELING_CITATIONS.CFR_201_57,
    {
      guideline: 'FDA Guidance',
      section: 'Pregnancy Registries',
      title: 'Establishing Pregnancy Exposure Registries',
      year: 2002,
      url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/establishing-pregnancy-exposure-registries',
    },
    {
      guideline: '21 CFR 201.57(c)(9)',
      title: 'Specific Requirements — Use in Specific Populations: Pregnancy',
      year: 2006,
    },
  ];

  return {
    section8_1,
    section8_2,
    section8_3,
    riskCommunicationFramework,
    pregnancyRegistryRequirements,
    implementationTimeline,
    formerCategoryMapping: FORMER_PREGNANCY_CATEGORIES,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 5: structureSmPC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structures an EU Summary of Product Characteristics (SmPC) based on the
 * EMA QRD template, product type, authorization procedure, and special
 * population considerations. Returns the complete section structure, FDA/EMA
 * comparison, PIL requirements, and annex requirements.
 *
 * The SmPC is the legal basis for prescribing information in the EU/EEA,
 * governed by Directive 2001/83/EC (Article 11) and Regulation (EC) No 726/2004
 * for centrally authorized products.
 */
export function structureSmPC(params: StructureSmPCInput): StructureSmPCResult {
  const { productType, procedure, specialPopulations, hasAdditionalMonitoring } = params;

  // Build section structure
  const smpcSections: SmPCSectionDescriptor[] = SMPC_SECTION_STRUCTURE.map(section => {
    const adjusted = { ...section };

    // Add additional monitoring statement to Section 1
    if (section.sectionNumber === '1' && hasAdditionalMonitoring) {
      adjusted.contentGuidance += ' This product is subject to additional monitoring. Include the inverted black triangle symbol (▼) before the product name and the standard statement: "This medicinal product is subject to additional monitoring. This will allow quick identification of new safety information. Healthcare professionals are asked to report any suspected adverse reactions."';
    }

    // Herbal product modifications
    if (productType === 'herbal' && section.sectionNumber === '2') {
      adjusted.contentGuidance = 'For herbal medicinal products: state the herbal substance(s) and/or herbal preparation(s) as active ingredient(s), quantified by mass or ratio. Include the extraction solvent and drug-to-extract ratio.';
    }
    if (productType === 'herbal' && section.sectionNumber === '4') {
      if (adjusted.subsections) {
        adjusted.subsections = adjusted.subsections.map(sub => {
          if (sub.number === '4.1') {
            return { ...sub, guidance: 'For traditional herbal medicinal products: state "Traditional herbal medicinal product for [indication]. The product is a traditional herbal medicinal product for use in specified indications exclusively based upon long-standing use."' };
          }
          return sub;
        });
      }
    }

    // Homeopathic product modifications
    if (productType === 'homeopathic' && section.sectionNumber === '1') {
      adjusted.contentGuidance = 'For homeopathic medicinal products: name of the product. Note: simplified registration procedures under Article 14 of Directive 2001/83/EC may apply.';
    }

    // Special population additions to Section 4.2
    if (section.sectionNumber === '4' && specialPopulations && specialPopulations.length > 0 && adjusted.subsections) {
      adjusted.subsections = adjusted.subsections.map(sub => {
        if (sub.number === '4.2') {
          let additionalGuidance = sub.guidance;
          if (specialPopulations.includes('paediatric')) {
            additionalGuidance += ' Paediatric population: state the posology for each relevant paediatric age group or state "The safety and efficacy of [product] in children [aged X to Y] have not been established. No data are available."';
          }
          if (specialPopulations.includes('elderly')) {
            additionalGuidance += ' Elderly: state dose adjustments for patients >=65 years or state that no dose adjustment is required.';
          }
          if (specialPopulations.includes('renal_impairment')) {
            additionalGuidance += ' Renal impairment: state dose adjustments based on eGFR/CrCl or state that no dose adjustment is required.';
          }
          if (specialPopulations.includes('hepatic_impairment')) {
            additionalGuidance += ' Hepatic impairment: state dose adjustments based on Child-Pugh classification or state that no dose adjustment is required.';
          }
          return { ...sub, guidance: additionalGuidance };
        }
        return sub;
      });
    }

    return adjusted;
  });

  // Differences between FDA PLR and EU SmPC
  const differences = FDA_EMA_DIFFERENCES;

  // PIL Requirements
  const pilRequirements: PILRequirements = {
    structure: [
      '1. What [product] is and what it is used for',
      '2. What you need to know before you take/use [product]',
      '3. How to take/use [product]',
      '4. Possible side effects',
      '5. How to store [product]',
      '6. Contents of the pack and other information',
    ],
    readabilityTesting: 'User testing (readability testing) is mandatory for all new applications and for significant revisions to the PIL. The test must demonstrate that the PIL can be found, understood, and acted upon by patients. Testing typically involves 20 participants in two rounds (10 + 10). Success criteria: >=80% of participants can find information, and of those, >=80% can understand it.',
    userConsultation: 'Consultation with target patient groups is required per Article 59(3) of Directive 2001/83/EC. Results of user testing must be submitted with the application.',
    languageRequirements: 'PIL must be available in the official language(s) of each Member State where the product is marketed. For centrally authorized products, all EU official languages are required.',
  };

  // QRD Template guidance
  const qrdTemplateGuidance: string[] = [
    'Use the current version of the EMA QRD template (v10.3 or later) for all new applications and variations.',
    'Blue text in the QRD template provides instructions and explanatory notes — remove before submission.',
    'Bold text in the QRD template indicates section headings and must be retained.',
    'Standard terms from the EDQM Standard Terms database must be used for pharmaceutical form descriptions.',
    'Frequency convention for adverse reactions: Very common (>=1/10), Common (>=1/100 to <1/10), Uncommon (>=1/1,000 to <1/100), Rare (>=1/10,000 to <1/1,000), Very rare (<1/10,000), Not known (cannot be estimated from available data).',
    'MedDRA System Organ Class ordering must be used for the adverse reactions table in Section 4.8.',
    'Excipients with known effect must be listed in Section 2 and detailed in the PIL, following the EMA Guideline on Excipients in the Labelling and Package Leaflet (EMA/CHMP/302620/2017).',
    'For centrally authorized products, the application must include product information in all EU official languages.',
  ];

  // Procedure-specific guidance
  if (procedure === 'centralized') {
    qrdTemplateGuidance.push(
      'Centralized procedure: Product information is approved by the CHMP and adopted as an Annex to the EPAR. A single SmPC/PIL applies across all EU/EEA Member States.',
      'Day 120 assessment includes detailed review of product information. Responses at Day 180 include any product information revisions.',
      'Post-authorization variations to the SmPC follow the Variation Regulation (EC) No 1234/2008.',
    );
  } else if (procedure === 'mutual_recognition') {
    qrdTemplateGuidance.push(
      'Mutual recognition procedure: SmPC approved by the Reference Member State (RMS) forms the basis. Concerned Member States (CMS) may request minor modifications.',
      'National annexes may be required for country-specific information (e.g., local representative, pricing).',
    );
  } else if (procedure === 'decentralized') {
    qrdTemplateGuidance.push(
      'Decentralized procedure: RMS leads the assessment. SmPC must be agreed upon by all CMS. Any disagreements may be referred to the CMDh or CHMP.',
    );
  } else if (procedure === 'national') {
    qrdTemplateGuidance.push(
      'National procedure: SmPC format follows the national competent authority requirements but should still align with the QRD template structure.',
      'Products authorized nationally may subsequently be submitted for mutual recognition in other Member States.',
    );
  }

  // Annex requirements
  const annexRequirements: AnnexRequirements[] = [
    {
      annex: 'Annex I',
      title: 'Summary of Product Characteristics',
      contents: 'The complete SmPC (Sections 1-10). This is the primary document for healthcare professionals. Contains all clinical, pharmaceutical, and regulatory information.',
    },
    {
      annex: 'Annex II',
      title: 'Conditions or Restrictions Regarding Supply and Use, and Other Conditions',
      contents: 'Section A: Manufacturer of the biological active substance and manufacturer responsible for batch release. Section B: Conditions or restrictions regarding supply and use (e.g., restricted medical prescription, PSUR submission schedule). Section C: Other conditions and requirements of the marketing authorisation (e.g., PSUR cycle, RMP commitments). Section D: Conditions or restrictions with regard to the safe and effective use of the medicinal product (e.g., additional risk minimization measures, educational materials).',
    },
    {
      annex: 'Annex III',
      title: 'Labelling and Package Leaflet',
      contents: 'Section A: Labelling (outer packaging, immediate packaging, blister text). Section B: Package Leaflet (PIL). The PIL must undergo readability testing and be written in patient-friendly language.',
    },
    {
      annex: 'Annex IIIA',
      title: 'Labelling and Package Leaflet (Alternate)',
      contents: 'For products where no separate PIL is included (e.g., products administered exclusively by healthcare professionals in a hospital setting), this Annex combines labelling information. Rare usage.',
    },
  ];

  // Blue box requirements (mock-up/labeling)
  const blueBoxRequirements: string[] = [
    'The "blue box" refers to outer packaging information that may vary between Member States (e.g., national identifiers, reimbursement codes).',
    'Common blue box elements include: national barcode, pharmacode, price, reimbursement status, anti-tampering device information.',
    'The Falsified Medicines Directive (2011/62/EU) requires a unique identifier (2D data matrix code) and anti-tampering device on the outer packaging of most prescription medicines.',
    'Safety features (serialization) requirements per Commission Delegated Regulation (EU) 2016/161: unique identifier, product code, national reimbursement number, batch number, expiry date.',
    'Braille: product name must be in Braille on the outer packaging per Article 56a of Directive 2001/83/EC. MAH may request a waiver for justified cases.',
    'Additional monitoring symbol (▼): must appear on the outer packaging if the product is subject to additional monitoring per Regulation (EC) No 726/2004.',
  ];

  const citations: Citation[] = [
    LABELING_CITATIONS.EMA_QRD,
    LABELING_CITATIONS.SMPC_GUIDELINE,
    LABELING_CITATIONS.EXCLAIM,
    {
      guideline: 'Directive 2001/83/EC',
      section: 'Article 59',
      title: 'Package Leaflet Requirements',
      year: 2001,
      url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32001L0083',
    },
    {
      guideline: 'Regulation (EC) No 726/2004',
      title: 'Community Procedures for the Authorisation and Supervision of Medicinal Products',
      year: 2004,
      url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004R0726',
    },
    {
      guideline: 'EMA Guideline',
      section: 'Excipients',
      title: 'Guideline on Excipients in the Labelling and Package Leaflet of Medicinal Products for Human Use',
      year: 2017,
      url: 'https://www.ema.europa.eu/en/documents/scientific-guideline/annex-european-commission-guideline-excipients-labelling-and-package-leaflet-medicinal-products-human_en.pdf',
    },
    {
      guideline: 'Directive 2011/62/EU',
      title: 'Falsified Medicines Directive — Serialization and Anti-Tampering Requirements',
      year: 2011,
      url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0062',
    },
  ];

  return {
    smpcSections,
    differences,
    pilRequirements,
    qrdTemplateGuidance,
    annexRequirements,
    blueBoxRequirements,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 6: assessOTCLabeling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assesses OTC (Over-the-Counter) drug labeling requirements under 21 CFR
 * 201.66, including Drug Facts panel structure, font requirements, monograph
 * vs NDA pathway comparison, OTC Monograph Reform (CARES Act Section 505G),
 * label comprehension and self-selection study design, and bilingual labeling.
 */
export function assessOTCLabeling(params: AssessOTCLabelingInput): AssessOTCLabelingResult {
  const { otcCategory, activeIngredients, dosageForm, targetPopulation } = params;

  // Build Drug Facts panel with category-specific adjustments
  const drugFactsPanel: DrugFactsSection[] = DRUG_FACTS_SECTIONS.map(section => {
    const adjusted = { ...section };

    // Category-specific warnings adjustments
    if (section.heading === 'Warnings') {
      const categoryWarnings: string[] = [];

      switch (otcCategory) {
        case 'analgesic':
          categoryWarnings.push(
            'Liver warning (acetaminophen): "This product contains acetaminophen. Severe liver damage may occur if [adult/child] takes more than [X] doses in 24 hours, with other drugs containing acetaminophen, or [adults:] 3 or more alcoholic drinks every day while using this product."',
            'Stomach bleeding warning (NSAIDs): "Stomach bleeding warning: This product contains an NSAID, which may cause severe stomach bleeding. The chance is higher if the [person/child] is age 60 or older, has had stomach ulcers or bleeding problems, takes a blood thinning (anticoagulant) or steroid drug, takes other drugs containing prescription or nonprescription NSAIDs, has 3 or more alcoholic drinks every day while using this product, takes more or for a longer time than directed."',
            'Allergy alert (NSAIDs): "Allergy alert: [active ingredient] may cause a severe allergic reaction, especially in people allergic to aspirin."',
          );
          break;
        case 'antihistamine':
          categoryWarnings.push(
            '"Do not use to make a child sleepy" (for diphenhydramine and similar sedating antihistamines in pediatric products)',
            '"When using this product: drowsiness may occur; avoid alcoholic drinks; alcohol, sedatives, and tranquilizers may increase drowsiness; be careful when driving a motor vehicle or operating machinery; excitability may occur, especially in children"',
          );
          break;
        case 'cough_cold':
          categoryWarnings.push(
            '"Do not use in children under [age] years of age" (per FDA advisory for children under 2; industry voluntarily extended to under 4)',
            '"Ask a doctor before use if you have: heart disease, high blood pressure, thyroid disease, diabetes, trouble urinating due to an enlarged prostate gland, a breathing problem such as emphysema or chronic bronchitis, persistent or chronic cough, cough that occurs with too much phlegm (mucus)"',
          );
          break;
        case 'antacid':
          categoryWarnings.push(
            '"Ask a doctor before use if you have kidney disease" (for magnesium and aluminum-containing antacids)',
            '"Stop use and ask a doctor if symptoms last more than 2 weeks"',
          );
          break;
        case 'laxative':
          categoryWarnings.push(
            '"Ask a doctor before use if you have stomach pain, nausea, or vomiting; a sudden change in bowel habits that lasts over 2 weeks"',
            '"Stop use and ask a doctor if you have rectal bleeding or fail to have a bowel movement after use"',
          );
          break;
        case 'topical_antibiotic':
          categoryWarnings.push(
            '"For external use only"',
            '"Stop use and ask a doctor if the condition persists or gets worse, or if a rash or other allergic reaction develops"',
          );
          break;
        case 'topical_antifungal':
          categoryWarnings.push(
            '"For external use only"',
            '"Do not use on children under 2 years of age unless directed by a doctor"',
            '"Stop use and ask a doctor if irritation occurs or there is no improvement within [specified time]"',
          );
          break;
        case 'sunscreen':
          categoryWarnings.push(
            '"For external use only"',
            '"Do not use on damaged or broken skin"',
            '"When using this product keep out of eyes. Rinse with water to remove."',
            '"Stop use and ask a doctor if rash occurs"',
            'SPF and Broad Spectrum labeling per 21 CFR Part 352 and FDA Final Rule on Sunscreen labeling',
          );
          break;
        case 'antiperspirant':
          categoryWarnings.push(
            '"Do not use on broken skin"',
            '"Stop use and ask a doctor if rash develops"',
            '"Ask a doctor before use if you have kidney disease" (for aluminum-containing antiperspirants)',
          );
          break;
        case 'acne':
          categoryWarnings.push(
            '"For external use only"',
            '"When using this product: skin irritation and dryness is more likely to occur if you use another topical acne medication at the same time"',
            '"If going outside, apply sunscreen after using this product"',
            'Benzoyl peroxide allergy warning: rare but serious hypersensitivity reactions reported (per 2014 FDA Drug Safety Communication)',
          );
          break;
        case 'antidiarrheal':
          categoryWarnings.push(
            '"Ask a doctor before use if you have fever, mucus in the stool, a history of liver disease" (for loperamide)',
            '"Stop use and ask a doctor if symptoms last more than 2 days, or diarrhea is accompanied by high fever"',
          );
          break;
        default:
          break;
      }

      // Pregnancy/breastfeeding warning (applies to all categories)
      if (targetPopulation === 'adult' || targetPopulation === 'both') {
        categoryWarnings.push(
          'Pregnancy/breast-feeding warning: "If pregnant or breast-feeding, ask a health professional before use." (per 21 CFR 201.63)',
        );
      }

      adjusted.contentGuidance += ' Category-specific warnings: ' + categoryWarnings.join(' | ');
    }

    // Directions adjustments based on target population
    if (section.heading === 'Directions') {
      if (targetPopulation === 'pediatric') {
        adjusted.contentGuidance += ' Pediatric dosing: include age-specific dosing for all approved pediatric age groups. Include weight-based dosing if available. State "ask a doctor" for ages below the approved range.';
      } else if (targetPopulation === 'both') {
        adjusted.contentGuidance += ' Include dosing for adults AND children separately. Typical structure: "adults and children [age] years and over: [dose]", "children [age range]: [dose]", "children under [age] years: ask a doctor".';
      }
    }

    // Active ingredient formatting
    if (section.heading === 'Active ingredient(s)') {
      if (activeIngredients.length > 1) {
        adjusted.contentGuidance += ` This is a combination product with ${activeIngredients.length} active ingredients. List each on a separate line with its amount per dosage unit, followed by its purpose/category.`;
      }
      adjusted.contentGuidance += ` Dosage form: ${dosageForm}. The active ingredient amount should be expressed per dosage unit (e.g., "per tablet", "per 5 mL", "per capsule").`;
    }

    return adjusted;
  });

  // Font requirements per 21 CFR 201.66(d)
  const fontRequirements: OTCFontRequirements = {
    minimumFontSize: 'Minimum 6-point font size for the Drug Facts panel. If the package is very small (total surface area <12 square inches), minimum 4.5-point font may be used with additional formatting requirements.',
    headingFontSize: '"Drug Facts" title: must be in a font size larger than the largest type size used elsewhere on the Drug Facts panel. Typically at least 2 points larger.',
    bodyFontSize: 'Body text: minimum 6-point. Subheadings: same or larger than body text. All text must be legible and in a sans-serif font (e.g., Helvetica, Arial).',
    bulletFormat: 'Bulleted lists must use a clearly visible bullet character (solid circle or equivalent). Each item on a separate line with consistent indentation.',
    contrastRequirements: 'Drug Facts label must be printed in black ink on a white or light-colored, non-glossy background. Sufficient contrast to ensure legibility. Hairline rules separate sections. Bold hairline rules separate the "Drug Facts" title from the body and separate "Warnings" from other sections.',
  };

  // Monograph vs NDA comparison
  const monographVsNDA: MonographComparison[] = [
    {
      aspect: 'Regulatory Pathway',
      monographRoute: 'OTC Monograph (21 CFR Parts 330-358): Drug marketed under a monograph does not require individual FDA approval. Must conform to monograph conditions (active ingredient, dose, indication, labeling).',
      ndaRoute: 'NDA/ANDA: Requires individual FDA approval. Full NDA (505(b)(1)) or NDA with literature support (505(b)(2)). Clinical data required for safety and efficacy.',
    },
    {
      aspect: 'Active Ingredients',
      monographRoute: 'Limited to ingredients listed in the applicable monograph as Category I (generally recognized as safe and effective).',
      ndaRoute: 'Any active ingredient supported by adequate safety and efficacy data. Includes new chemical entities (NCEs) and Rx-to-OTC switches.',
    },
    {
      aspect: 'Indications',
      monographRoute: 'Limited to indications specified in the monograph. Cannot add new indications without monograph amendment (now via administrative order under CARES Act).',
      ndaRoute: 'Indications supported by clinical data as submitted in the NDA. May include indications not in any monograph.',
    },
    {
      aspect: 'Labeling Changes',
      monographRoute: 'Labeling must conform to monograph specifications. Changes to required warnings or directions require monograph amendment/administrative order.',
      ndaRoute: 'Labeling changes follow NDA supplement procedures (PAS, CBE-30, CBE-0, Annual Report) per 21 CFR 314.70.',
    },
    {
      aspect: 'Marketing Exclusivity',
      monographRoute: 'No exclusivity. Any manufacturer can market a product conforming to the monograph conditions.',
      ndaRoute: 'May receive 3-year exclusivity for new clinical investigations essential to approval (e.g., Rx-to-OTC switch data). NCE exclusivity (5 years) if applicable.',
    },
    {
      aspect: 'Clinical Data Required',
      monographRoute: 'No clinical data required if product conforms to monograph conditions. Monograph conditions were established through the OTC Drug Review process (1972-present).',
      ndaRoute: 'Clinical data required. For OTC NDA products, typically includes: label comprehension study, self-selection (actual use) study, and clinical efficacy/safety trials.',
    },
    {
      aspect: 'Drug Facts Labeling',
      monographRoute: 'Drug Facts format per 21 CFR 201.66 required. Content must match monograph requirements.',
      ndaRoute: 'Drug Facts format per 21 CFR 201.66 required. Content per NDA-approved labeling. FDA reviews Drug Facts during NDA review.',
    },
  ];

  // OTC Monograph Reform (CARES Act Section 505G)
  const monographReform: string[] = [
    'The CARES Act (March 2020) enacted Section 505G of the FD&C Act, fundamentally reforming the OTC monograph system.',
    'Administrative Orders replace the rulemaking process: FDA can now issue administrative orders to establish, amend, or revoke OTC monograph conditions. This replaces the decades-long notice-and-comment rulemaking process.',
    'Sunscreen order: Section 505G established an expedited process for finalizing the sunscreen monograph (pending since 2019 proposed rule).',
    'User fees: OTC Monograph Drug User Fee Amendments (OMUFA) authorized FDA to collect user fees from OTC monograph drug manufacturers to fund the monograph reform program.',
    'Deemed final orders: Existing monograph conditions that were in effect as final rules before the CARES Act are deemed to be final administrative orders. Products currently marketed under these conditions may continue.',
    'Exclusivity for monograph innovation: Section 505G provides 18 months of exclusivity for sponsors who submit and obtain approval for a new monograph condition (new active ingredient, new indication, new dosage form) supported by clinical data.',
    'Misbranding enforcement: Products not conforming to a final administrative order are deemed misbranded, enabling more efficient enforcement than the prior system.',
    'The reform was designed to make the OTC monograph system more responsive, allowing timely incorporation of new safety data and scientific evidence into monograph conditions.',
  ];

  // Label Comprehension Study
  const labelComprehensionStudy: StudyDesignRequirement = {
    studyType: 'Label Comprehension Study',
    purpose: 'Evaluates whether consumers can find, read, and understand the key messages in the proposed OTC drug labeling. Required for OTC NDA products (including Rx-to-OTC switches) but not for monograph products.',
    designElements: [
      'Study population: representative sample of the target consumer population (age, education, health literacy levels)',
      'Sample size: typically 300-900 participants across multiple study sites to ensure demographic diversity',
      'Questionnaire design: open-ended and closed-ended questions testing key labeling messages',
      'Key messages tested: active ingredient, purpose, uses, warnings (especially "Do not use" and "Ask a doctor before use"), directions, and any novel elements',
      'Metrics: percentage of respondents who correctly identify/understand each key message. FDA generally expects >=90% correct for critical safety messages and >=70-80% for other messages.',
      'Literacy assessment: include a health literacy measure (e.g., REALM, S-TOFHLA) to assess label comprehension across literacy levels',
      'Multiple label versions may be tested if FDA requests comparative evaluation',
      'Statistical analysis: descriptive statistics with subgroup analyses by age, education, and health literacy',
    ],
    regulatoryContext: 'FDA Guidance: "Self-Selection Studies for Nonprescription Drug Products" (2013) and "Label Comprehension Studies for Nonprescription Drug Products" (2010). Required as part of the NDA submission for OTC products.',
  };

  // Self-Selection (Actual Use) Study
  const selfSelectionStudy: StudyDesignRequirement = {
    studyType: 'Self-Selection / Actual Use Study',
    purpose: 'Evaluates whether consumers can correctly self-select (determine if the product is appropriate for them) and use the product safely and effectively based solely on the OTC labeling, without professional guidance. Critical for Rx-to-OTC switch applications.',
    designElements: [
      'Study design: open-label, single-arm or parallel-arm study in the actual use setting (pharmacy, simulated OTC environment)',
      'Study population: consumers who self-select in a simulated OTC purchasing environment; must include the target population AND people for whom the product is NOT appropriate (to test correct self-deselection)',
      'Self-selection assessment: participants presented with the label and asked whether they would purchase/use the product. Correct self-selection = appropriate use; correct self-deselection = not using when contraindicated',
      'Actual use phase: participants who self-select use the product per label directions for a defined period. Compliance with dosing, duration, and warnings is measured.',
      'Endpoints: self-selection accuracy (proportion who correctly identify themselves as appropriate/inappropriate users), compliance with directions, compliance with warnings, safety outcomes',
      'Sample size: typically 500-1000+ participants to adequately power subgroup analyses',
      'Study sites: multiple geographic regions to ensure demographic diversity',
      'No counseling: participants must NOT receive any counseling or professional advice during the study — the label is the only source of information',
      'Safety monitoring: ongoing safety monitoring during the actual use phase',
      'Diary data: participants may keep diaries to record usage patterns, symptoms, and adverse events',
    ],
    regulatoryContext: 'FDA Guidance: "Self-Selection Studies for Nonprescription Drug Products" (2013). FDA Guidance: "Considerations Regarding Nonprescription Drug Products" (2022). These studies are pivotal for demonstrating that a product can be used safely and effectively as an OTC drug.',
  };

  // Bilingual labeling requirements
  const bilingualRequirements: string[] = [
    '21 CFR 201.15(c): If any representation on the label or labeling is in a foreign language, all required label statements must appear in both English and the foreign language.',
    'If the Drug Facts panel is provided in English only but other labeling (outer carton, promotional material) includes a foreign language, the Drug Facts must also be provided in that foreign language.',
    'Bilingual Drug Facts: same formatting requirements apply to both languages. The non-English Drug Facts must include all mandatory sections.',
    'Spanish-language labeling: most common bilingual format in the US market. FDA has issued translated templates for common OTC Drug Facts content.',
    'Translation quality: translations must be accurate and understandable to native speakers of the target language. Back-translation verification is recommended.',
    'Placement: bilingual labeling may be on the same panel (side-by-side) or on separate panels of the package. Both must be equally prominent and legible.',
    'Puerto Rico: products marketed in Puerto Rico must include Spanish-language labeling per local requirements.',
    'No FDA pre-approval of translations is required, but FDA may take enforcement action against inaccurate translations.',
  ];

  const citations: Citation[] = [
    LABELING_CITATIONS.CFR_201_66,
    LABELING_CITATIONS.OTC_MONOGRAPH_REFORM,
    {
      guideline: '21 CFR 201.66(d)',
      title: 'Format Requirements for Drug Facts Labeling',
      year: 1999,
      url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.66',
    },
    {
      guideline: 'FDA Guidance',
      section: 'OTC',
      title: 'Label Comprehension Studies for Nonprescription Drug Products',
      year: 2010,
      url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/label-comprehension-studies-nonprescription-drug-products',
    },
    {
      guideline: 'FDA Guidance',
      section: 'OTC',
      title: 'Self-Selection Studies for Nonprescription Drug Products',
      year: 2013,
      url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/self-selection-studies-nonprescription-drug-products',
    },
    {
      guideline: '21 CFR 201.63',
      title: 'Pregnancy/Nursing Warning for OTC Drug Products',
      year: 1982,
      url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.63',
    },
    {
      guideline: '21 CFR 201.15(c)',
      title: 'Foreign Language Labeling Requirements',
      year: 1979,
    },
    {
      guideline: 'CARES Act',
      section: 'Section 505G',
      title: 'Coronavirus Aid, Relief, and Economic Security Act — OTC Monograph Reform',
      year: 2020,
      url: 'https://www.congress.gov/bill/116th-congress/house-bill/748',
    },
  ];

  return {
    drugFactsPanel,
    fontRequirements,
    monographVsNDA,
    monographReform,
    labelComprehensionStudy,
    selfSelectionStudy,
    bilingualRequirements,
    citations,
  };
}
