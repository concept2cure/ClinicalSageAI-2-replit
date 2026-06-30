/**
 * Biosimilar Development Intelligence -- Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for biosimilar analytical
 * similarity assessment, clinical program design, indication extrapolation,
 * interchangeability evaluation, IP strategy, and CMC development.
 *
 * NO LLM, NO network, NO database. Every function is closed-form and
 * reproducible: identical input always yields identical output.
 *
 * Regulatory citations: FDA Biosimilars Action Plan, 42 USC 262(k) (BPCIA),
 * FDA Guidance for Industry: Quality Considerations in Demonstrating Biosimilarity
 * of a Therapeutic Protein Product to a Reference Product (2015), FDA Guidance:
 * Statistical Approaches to Evaluate Analytical Similarity (2017), FDA Guidance:
 * Clinical Pharmacology Data to Support a Demonstration of Biosimilarity to a
 * Reference Product (2016), FDA Guidance: Scientific Considerations in
 * Demonstrating Biosimilarity to a Reference Product (2015), FDA Guidance:
 * Considerations in Demonstrating Interchangeability With a Reference Product
 * (2019), EMA/CHMP/BMWP/437/04 Rev. 1, ICH Q5E, ICH Q6B.
 *
 * @module server/services/biosimilar/biosimilar-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0. Common Types
// ─────────────────────────────────────────────────────────────────────────────

export type BiosimilarProductType =
  | 'mAb'
  | 'fusion_protein'
  | 'insulin'
  | 'epo'
  | 'filgrastim'
  | 'pegfilgrastim'
  | 'adalimumab_biosimilar'
  | 'trastuzumab_biosimilar';

export type TierClassification = 'tier1' | 'tier2' | 'tier3';

export type MechanismOfAction =
  | 'ADCC_dependent'
  | 'CDC_dependent'
  | 'neutralization'
  | 'receptor_blocking'
  | 'enzyme_replacement'
  | 'signaling_modulation'
  | 'growth_factor_stimulation'
  | 'anti_proliferative';

export type Market = 'US' | 'EU' | 'both';

export type ExpressionSystem = 'CHO' | 'E_coli' | 'yeast' | 'insect' | 'HEK293';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Analytical Similarity — Reference Data & CQA Registry
// ─────────────────────────────────────────────────────────────────────────────

export interface CQATierAssignment {
  attribute: string;
  category: string;
  tier: TierClassification;
  statisticalApproach: string;
  rationale: string;
  analyticalMethods: string[];
}

export interface AnalyticalSimilarityResult {
  productType: BiosimilarProductType;
  cqaTierAssignments: CQATierAssignment[];
  referenceLotRequirements: {
    fdaMinimum: number;
    emaMinimum: number;
    rationale: string;
    lotSelectionGuidance: string[];
  };
  tier1StatisticalDetails: {
    method: string;
    qualityRangeDerivation: string;
    sdMinimumRule: string;
    equivalenceMargin: string;
    hypothesisTesting: string;
    sampleSizeConsiderations: string;
  };
  tier2StatisticalDetails: {
    method: string;
    qualityRangeDerivation: string;
    interpretationGuidance: string;
  };
  tier3StatisticalDetails: {
    method: string;
    dataPresentation: string;
    interpretationGuidance: string;
  };
  productSpecificGuidance: string[];
  regulatoryCitations: string[];
}

/** CQA categories applicable to therapeutic proteins. */
const CQA_CATEGORIES = {
  primaryStructure: 'Primary Structure',
  higherOrderStructure: 'Higher-Order Structure',
  biologicalActivity: 'Biological Activity',
  productQuality: 'Product Quality Attributes',
  glycosylation: 'Glycosylation Profile',
  processRelatedImpurities: 'Process-Related Impurities',
  productRelatedSubstances: 'Product-Related Substances',
} as const;

/** Reference CQA lists by product type with default tier assignment. */
const CQA_REGISTRY: Record<BiosimilarProductType, Array<{
  attribute: string;
  category: string;
  defaultTier: TierClassification;
  methods: string[];
  rationale: string;
}>> = {
  mAb: [
    // Primary Structure
    {
      attribute: 'Amino acid sequence identity',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['LC-MS/MS peptide mapping', 'Edman degradation', 'Intact mass spectrometry'],
      rationale: 'Binary attribute (identical or not); sequence identity must be confirmed but is not subjected to statistical comparison.',
    },
    {
      attribute: 'Disulfide bond mapping',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['Non-reduced peptide mapping LC-MS', 'Free thiol assay (Ellman reagent)'],
      rationale: 'Structural confirmation attribute — correct disulfide connectivity verified qualitatively.',
    },
    {
      attribute: 'N-terminal / C-terminal sequence variants',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier2',
      methods: ['LC-MS/MS peptide mapping', 'Intact mass', 'CE-SDS reduced'],
      rationale: 'Quantitative attribute with moderate clinical impact; quality range comparison appropriate.',
    },
    {
      attribute: 'Post-translational modifications: Deamidation',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['Charge-based methods (CEX-HPLC, icIEF)', 'LC-MS/MS peptide mapping'],
      rationale: 'Can affect potency, stability, and immunogenicity — high clinical relevance requires equivalence testing.',
    },
    {
      attribute: 'Post-translational modifications: Oxidation (Met)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['RP-HPLC', 'LC-MS/MS peptide mapping', 'Tryptic mapping'],
      rationale: 'Methionine oxidation (especially Fc Met252/Met428) can affect FcRn binding and half-life — tier 1.',
    },
    {
      attribute: 'Post-translational modifications: Glycation',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier2',
      methods: ['Boronate affinity chromatography', 'LC-MS/MS peptide mapping'],
      rationale: 'Moderate impact on charge profile and potentially binding; quality range assessment.',
    },
    // Higher-Order Structure
    {
      attribute: 'Secondary structure (alpha-helix, beta-sheet content)',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Far-UV circular dichroism (CD)', 'FTIR (amide I/II bands)'],
      rationale: 'Confirms folding similarity; moderate sensitivity to minor differences.',
    },
    {
      attribute: 'Tertiary structure',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Near-UV CD', 'Intrinsic fluorescence spectroscopy', 'DSC (Tm values)', '2D-NMR (1H-13C HSQC)'],
      rationale: 'Global conformation assessment; quality range comparison for thermal stability and spectral overlap.',
    },
    {
      attribute: 'Thermal stability (Tm, Tonset)',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier1',
      methods: ['DSC (differential scanning calorimetry)', 'DSF (differential scanning fluorimetry)'],
      rationale: 'Quantitative measure of conformational stability directly linked to product quality — equivalence testing.',
    },
    // Biological Activity
    {
      attribute: 'Target binding affinity (Fab-mediated)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR (Biacore)', 'ELISA', 'BLI (Octet)'],
      rationale: 'Directly linked to mechanism of action efficacy; most sensitive tier for clinical relevance.',
    },
    {
      attribute: 'FcRn binding',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR (Biacore)', 'ELISA', 'Cell-based FcRn binding assay'],
      rationale: 'Governs serum half-life; critical PK-relevant attribute requiring equivalence testing.',
    },
    {
      attribute: 'Fc-gamma receptor binding (FcgRIIIa, FcgRIIa, FcgRIIb, FcgRI)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR', 'AlphaLISA', 'Cell-based reporter assays'],
      rationale: 'Determines ADCC, ADCP effector function; critical for mAbs where effector function contributes to MOA.',
    },
    {
      attribute: 'C1q binding / CDC activity',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['C1q ELISA', 'CDC cell-based assay (complement-dependent cytotoxicity)'],
      rationale: 'CDC is part of MOA for anti-CD20 mAbs (rituximab) — tier 1 when CDC is clinically relevant.',
    },
    {
      attribute: 'ADCC activity',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['ADCC reporter bioassay (Jurkat NFAT-luc)', 'PBMC-based ADCC (51Cr release or LDH)'],
      rationale: 'ADCC contributes to clinical efficacy for trastuzumab, rituximab — highest sensitivity tier.',
    },
    {
      attribute: 'Cell-based potency (anti-proliferation / apoptosis)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['Cell proliferation/viability assay', 'Apoptosis assay (Annexin V/PI)', 'Reporter gene assay'],
      rationale: 'Integrative measure of biological function; directly relevant to clinical outcome.',
    },
    // Product Quality Attributes
    {
      attribute: 'Charge variants (acidic/main/basic species)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'icIEF (imaged capillary isoelectric focusing)', 'CZE'],
      rationale: 'Charge heterogeneity reflects multiple PTMs; directly linked to potency and PK.',
    },
    {
      attribute: 'Size variants: Monomer purity',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC (size exclusion)', 'Analytical ultracentrifugation (AUC-SV)'],
      rationale: 'Aggregates linked to immunogenicity risk; monomer purity is a critical safety attribute.',
    },
    {
      attribute: 'Size variants: High molecular weight species (aggregates)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'DLS (dynamic light scattering)', 'SV-AUC', 'MFI (micro-flow imaging)'],
      rationale: 'Aggregates are the primary immunogenicity risk factor for therapeutic proteins.',
    },
    {
      attribute: 'Size variants: Low molecular weight species (fragments)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'CE-SDS (reduced and non-reduced)', 'SDS-PAGE'],
      rationale: 'Fragments affect potency and can generate novel immunogenic epitopes.',
    },
    {
      attribute: 'Subvisible particles (>= 2 um, >= 10 um, >= 25 um)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier2',
      methods: ['Light obscuration (HIAC)', 'MFI (micro-flow imaging)', 'Flow imaging microscopy'],
      rationale: 'Particle counts per USP <787>/<788>; quality range comparison appropriate.',
    },
    {
      attribute: 'Visible particles',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier3',
      methods: ['Visual inspection per USP <790>'],
      rationale: 'Pass/fail attribute — graphical or descriptive comparison only.',
    },
    // Glycosylation Profile
    {
      attribute: 'N-glycan profile (overall distribution)',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC with fluorescence detection', 'CE-LIF', 'LC-MS glycan mapping'],
      rationale: 'Glycosylation is the single most impactful quality attribute for mAb biosimilars; affects PK, effector function, immunogenicity.',
    },
    {
      attribute: 'Afucosylation level',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS glycopeptide mapping', 'Lectin affinity'],
      rationale: 'Afucosylation directly controls ADCC potency via FcgRIIIa binding (Shields et al. 2002). Critical for ADCC-dependent mAbs.',
    },
    {
      attribute: 'Galactosylation (G0F, G1F, G2F)',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS', 'Lectin ELISA (RCA)'],
      rationale: 'Affects CDC (C1q binding) and potentially FcRn binding; tier 1 for mAbs with CDC-dependent MOA.',
    },
    {
      attribute: 'Sialic acid content',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier2',
      methods: ['HILIC-UPLC', 'HPAEC-PAD', 'Sialic acid quantification (DMB labeling)'],
      rationale: 'Can affect half-life and clearance; generally lower impact for IgG1 mAbs.',
    },
    {
      attribute: 'High mannose species (Man5, Man6, Man7, Man8, Man9)',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS glycan mapping'],
      rationale: 'High mannose glycans increase clearance via mannose receptor and reduce ADCC; impacts PK.',
    },
    {
      attribute: 'Non-human glycans (alpha-Gal, NGNA)',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier2',
      methods: ['LC-MS/MS', 'HILIC-UPLC', 'Lectin blotting'],
      rationale: 'Immunogenicity risk; should be minimized but quality range comparison is adequate.',
    },
    // Process-Related Impurities
    {
      attribute: 'Host cell protein (HCP)',
      category: CQA_CATEGORIES.processRelatedImpurities,
      defaultTier: 'tier2',
      methods: ['HCP ELISA (process-specific or generic)', 'LC-MS/MS HCP identification'],
      rationale: 'Safety attribute; levels should be within quality range of reference product.',
    },
    {
      attribute: 'Host cell DNA',
      category: CQA_CATEGORIES.processRelatedImpurities,
      defaultTier: 'tier3',
      methods: ['qPCR', 'Threshold assay'],
      rationale: 'Typically below detection limits; graphical/descriptive comparison sufficient.',
    },
    {
      attribute: 'Residual Protein A (for Protein A-purified products)',
      category: CQA_CATEGORIES.processRelatedImpurities,
      defaultTier: 'tier3',
      methods: ['Protein A ELISA'],
      rationale: 'Process-specific; typically below quantitation limits. Graphical comparison.',
    },
  ],

  fusion_protein: [
    {
      attribute: 'Amino acid sequence identity (fusion partners)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['LC-MS/MS peptide mapping', 'Intact mass'],
      rationale: 'Structural confirmation — must match reference sequence including linker region.',
    },
    {
      attribute: 'Disulfide bond mapping (including inter-chain)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['Non-reduced peptide mapping LC-MS', 'Free thiol assay'],
      rationale: 'Fusion proteins may have complex disulfide patterns at the junction region.',
    },
    {
      attribute: 'Deamidation and oxidation',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'LC-MS/MS peptide mapping'],
      rationale: 'Can affect binding of both fusion partners; high clinical relevance.',
    },
    {
      attribute: 'Target binding (receptor/ligand for each domain)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR', 'ELISA', 'Cell-based binding assay'],
      rationale: 'Dual-domain binding must be assessed independently; directly linked to MOA.',
    },
    {
      attribute: 'Fc effector function',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['FcgR binding (SPR)', 'ADCC reporter assay', 'C1q binding ELISA'],
      rationale: 'Fusion proteins with Fc domain retain effector function potential.',
    },
    {
      attribute: 'Cell-based potency',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['Cell proliferation assay', 'Reporter gene assay', 'Ligand neutralization'],
      rationale: 'Integrative measure of both fusion domains working in concert.',
    },
    {
      attribute: 'Charge variants',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'icIEF'],
      rationale: 'Charge heterogeneity reflects PTM landscape affecting binding.',
    },
    {
      attribute: 'Size variants (monomer, aggregates, fragments)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'CE-SDS', 'SV-AUC'],
      rationale: 'Aggregates and fragments impact both safety and efficacy.',
    },
    {
      attribute: 'N-glycan profile',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS glycan mapping'],
      rationale: 'Glycosylation of Fc domain and potentially the non-Fc domain affects function.',
    },
    {
      attribute: 'Sialic acid content',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier2',
      methods: ['HILIC-UPLC', 'HPAEC-PAD'],
      rationale: 'Can affect clearance particularly for fusion proteins with exposed glycan sites.',
    },
    {
      attribute: 'Secondary/Tertiary structure',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Far-UV CD', 'Near-UV CD', 'DSC', 'Intrinsic fluorescence'],
      rationale: 'Confirms proper folding of both fusion domains.',
    },
    {
      attribute: 'HCP / Host cell DNA',
      category: CQA_CATEGORIES.processRelatedImpurities,
      defaultTier: 'tier2',
      methods: ['HCP ELISA', 'qPCR'],
      rationale: 'Process-related impurities; quality range comparison.',
    },
  ],

  insulin: [
    {
      attribute: 'Amino acid sequence / mass confirmation',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['Intact mass (ESI-MS)', 'LC-MS/MS peptide mapping', 'RP-HPLC'],
      rationale: 'Identity test; insulin analogs have specific sequence modifications that must match.',
    },
    {
      attribute: 'Deamidation products (A21 desamido)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['RP-HPLC', 'LC-MS/MS'],
      rationale: 'A21 desamido insulin is a primary degradation product affecting potency.',
    },
    {
      attribute: 'Insulin-related impurities (A-chain, B-chain, covalent dimers)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['RP-HPLC (per USP/Ph.Eur.)', 'SE-HPLC'],
      rationale: 'Dimers and individual chains are immunogenic and affect bioactivity.',
    },
    {
      attribute: 'Higher molecular weight proteins (HMWP / polymers)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC'],
      rationale: 'Aggregates in insulin products are linked to injection-site reactions and immunogenicity.',
    },
    {
      attribute: 'Biological potency (in vivo or cell-based)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['Cell-based insulin receptor binding', 'In vivo rabbit blood glucose assay (historical)', 'Cell proliferation assay'],
      rationale: 'Potency is the primary measure of biological function; directly linked to glucose-lowering effect.',
    },
    {
      attribute: 'Zinc content',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier2',
      methods: ['ICP-OES', 'Atomic absorption spectroscopy'],
      rationale: 'Zinc stabilizes insulin hexamers; affects dissolution rate and pharmacokinetics.',
    },
    {
      attribute: 'Phenol/m-cresol preservative content',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier2',
      methods: ['RP-HPLC'],
      rationale: 'Preservatives stabilize insulin conformation and serve as antimicrobial agents.',
    },
    {
      attribute: 'pH and osmolality',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier2',
      methods: ['pH meter', 'Osmometer'],
      rationale: 'Critical for injection tolerability and insulin stability.',
    },
    {
      attribute: 'Particulate matter',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier3',
      methods: ['Light obscuration', 'Visual inspection'],
      rationale: 'Compendial requirement; pass/fail with graphical comparison.',
    },
    {
      attribute: 'Secondary structure (CD spectrum overlay)',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Far-UV CD', 'FTIR'],
      rationale: 'Insulin has characteristic alpha-helical secondary structure; confirms folding.',
    },
  ],

  epo: [
    {
      attribute: 'Amino acid sequence identity',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['LC-MS/MS peptide mapping', 'Intact mass'],
      rationale: 'Identity confirmation; EPO has 165 amino acids.',
    },
    {
      attribute: 'Isoform distribution (isoelectric focusing pattern)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['IEF gel', 'CZE', 'icIEF'],
      rationale: 'EPO isoforms differ in sialic acid content; directly affects in vivo clearance and potency.',
    },
    {
      attribute: 'Sialic acid content (total and per-glycan)',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HPAEC-PAD', 'DMB fluorometric assay', 'LC-MS glycan mapping'],
      rationale: 'Sialic acid is the DOMINANT quality attribute for EPO: higher sialylation = longer half-life = higher in vivo potency.',
    },
    {
      attribute: 'N-glycan profile (3 N-linked sites: Asn24, Asn38, Asn83)',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'HPAEC-PAD', 'LC-MS/MS glycopeptide mapping'],
      rationale: 'Each glycosylation site has distinct glycan populations affecting overall molecule properties.',
    },
    {
      attribute: 'O-glycosylation (Ser126)',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier2',
      methods: ['LC-MS/MS', 'Lectin blotting'],
      rationale: 'Single O-linked site; moderate impact on clearance compared to N-glycans.',
    },
    {
      attribute: 'In vitro biological potency',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['TF-1 cell proliferation assay', 'UT-7/EPO cell-based potency', 'EPO receptor binding (SPR)'],
      rationale: 'Potency in IU/mg is the defining quality measure for EPO products.',
    },
    {
      attribute: 'Size variants (aggregates, dimers)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'SV-AUC'],
      rationale: 'EPO aggregates linked to pure red cell aplasia (PRCA) risk — critical safety attribute.',
    },
    {
      attribute: 'Oxidation',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier2',
      methods: ['RP-HPLC', 'LC-MS/MS peptide mapping'],
      rationale: 'Methionine oxidation can affect receptor binding; quality range comparison.',
    },
    {
      attribute: 'HCP',
      category: CQA_CATEGORIES.processRelatedImpurities,
      defaultTier: 'tier2',
      methods: ['HCP ELISA'],
      rationale: 'Process-related impurity; quality range comparison.',
    },
    {
      attribute: 'Higher-order structure',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Far-UV CD', 'Intrinsic fluorescence', 'DSC'],
      rationale: 'EPO is a four-helix bundle; structural confirmation by spectroscopic methods.',
    },
  ],

  filgrastim: [
    {
      attribute: 'Amino acid sequence identity (175 aa, Met at N-terminus)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['LC-MS/MS peptide mapping', 'Intact mass (ESI-TOF)'],
      rationale: 'Filgrastim is non-glycosylated G-CSF from E. coli with N-terminal Met.',
    },
    {
      attribute: 'Oxidation (Met1, Met122, Met127, Met138, Met159, Met170)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['RP-HPLC', 'LC-MS/MS peptide mapping'],
      rationale: 'Multiple Met residues susceptible to oxidation affecting receptor binding.',
    },
    {
      attribute: 'Biological potency (G-CSF receptor binding and cell proliferation)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['NFS-60 cell proliferation assay', 'G-CSFR binding assay (SPR)', 'OCI/AML cell-based assay'],
      rationale: 'Cell-based potency in IU/mg is the primary quality measure.',
    },
    {
      attribute: 'Size variants (monomer, dimer, aggregates)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'SDS-PAGE', 'SV-AUC'],
      rationale: 'Non-glycosylated proteins are more aggregation-prone; immunogenicity risk.',
    },
    {
      attribute: 'Charge variants',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'icIEF', 'CZE'],
      rationale: 'Charge heterogeneity reflects deamidation, oxidation, and other modifications.',
    },
    {
      attribute: 'Secondary/Tertiary structure',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Far-UV CD', 'Near-UV CD', 'DSC', 'FTIR'],
      rationale: 'Filgrastim is a four-helix bundle; confirm folding similarity.',
    },
    {
      attribute: 'Endotoxin',
      category: CQA_CATEGORIES.processRelatedImpurities,
      defaultTier: 'tier3',
      methods: ['LAL (Limulus amebocyte lysate) assay', 'Recombinant Factor C assay'],
      rationale: 'E. coli-derived product; endotoxin control is critical but pass/fail.',
    },
    {
      attribute: 'HCP (E. coli)',
      category: CQA_CATEGORIES.processRelatedImpurities,
      defaultTier: 'tier2',
      methods: ['E. coli HCP ELISA', 'LC-MS/MS HCP identification'],
      rationale: 'E. coli HCPs are foreign proteins; quality range comparison.',
    },
  ],

  pegfilgrastim: [
    {
      attribute: 'PEG conjugation site (N-terminal Met)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['LC-MS/MS peptide mapping (PEGylated vs. non-PEGylated peptides)', 'Intact mass'],
      rationale: 'Site-specific mono-PEGylation at N-terminal Met is critical; heterogeneous PEGylation would alter PK.',
    },
    {
      attribute: 'PEG molecular weight and polydispersity',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['MALDI-TOF', 'SE-HPLC', 'GPC/SEC with MALS'],
      rationale: 'PEG size (20 kDa) directly determines half-life extension; polydispersity affects PK consistency.',
    },
    {
      attribute: 'Free (unconjugated) filgrastim',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'RP-HPLC', 'SDS-PAGE'],
      rationale: 'Free filgrastim has shorter half-life; excessive free protein alters PK profile.',
    },
    {
      attribute: 'Free PEG',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier2',
      methods: ['SE-HPLC', 'Iodine staining', 'Barium chloride/iodine colorimetric'],
      rationale: 'Safety attribute; should be minimized but quality range comparison adequate.',
    },
    {
      attribute: 'Biological potency',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['NFS-60 cell proliferation assay', 'G-CSFR binding (SPR)'],
      rationale: 'PEGylation reduces in vitro potency vs. filgrastim but extends in vivo duration.',
    },
    {
      attribute: 'Size variants (mono-PEG, di-PEG, aggregates)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'SDS-PAGE', 'SV-AUC'],
      rationale: 'Multi-PEGylated species and aggregates alter PK and immunogenicity risk.',
    },
    {
      attribute: 'Charge variants',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'icIEF'],
      rationale: 'PEGylation affects charge profile; similarity important for consistency.',
    },
    {
      attribute: 'Higher-order structure',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Far-UV CD', 'DSC'],
      rationale: 'Confirm PEGylation does not alter protein conformation vs. reference.',
    },
  ],

  adalimumab_biosimilar: [
    {
      attribute: 'Amino acid sequence identity',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['LC-MS/MS peptide mapping', 'Intact mass', 'Reduced/non-reduced mass'],
      rationale: 'Identity confirmation for anti-TNFalpha IgG1 mAb.',
    },
    {
      attribute: 'TNF-alpha binding affinity',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR (Biacore)', 'ELISA', 'BLI'],
      rationale: 'Primary MOA is TNF-alpha neutralization; binding affinity is the most critical functional attribute.',
    },
    {
      attribute: 'TNF-alpha neutralization potency',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['L929 cytotoxicity neutralization assay', 'Reporter gene assay (NF-kB)'],
      rationale: 'Cell-based potency integrates binding and downstream signaling inhibition.',
    },
    {
      attribute: 'FcRn binding',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR', 'ELISA'],
      rationale: 'Determines serum half-life; critical PK attribute.',
    },
    {
      attribute: 'Fc-gamma receptor binding (FcgRIIIa 158V, 158F)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR', 'AlphaLISA'],
      rationale: 'Adalimumab MOA includes Fc effector function (ADCC contribution debated but must be similar).',
    },
    {
      attribute: 'ADCC activity',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['ADCC reporter bioassay', 'PBMC-based ADCC'],
      rationale: 'ADCC may contribute to adalimumab MOA in inflammatory conditions (macrophage killing).',
    },
    {
      attribute: 'CDC activity',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier2',
      methods: ['C1q ELISA', 'CDC assay'],
      rationale: 'CDC is generally not considered part of adalimumab MOA; tier 2 sufficient.',
    },
    {
      attribute: 'Apoptosis induction (reverse signaling via transmembrane TNF)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['Transmembrane TNF binding assay', 'Reverse signaling apoptosis assay'],
      rationale: 'Binding to transmembrane TNF and inducing reverse signaling is part of adalimumab MOA in IBD.',
    },
    {
      attribute: 'N-glycan profile',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS glycan mapping'],
      rationale: 'Glycosylation affects effector function and immunogenicity.',
    },
    {
      attribute: 'Afucosylation level',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS'],
      rationale: 'Controls ADCC potency via FcgRIIIa binding.',
    },
    {
      attribute: 'Charge variants',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'icIEF'],
      rationale: 'Charge heterogeneity profile must be similar to reference.',
    },
    {
      attribute: 'Size variants (monomer, HMW, LMW)',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'CE-SDS', 'SV-AUC'],
      rationale: 'Aggregates and fragments impact safety and efficacy.',
    },
    {
      attribute: 'Higher-order structure',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Far-UV CD', 'DSC', 'HDX-MS', '2D-NMR'],
      rationale: 'Comprehensive structural similarity assessment.',
    },
    {
      attribute: 'Deamidation (Asn residues in CDRs)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'LC-MS/MS peptide mapping'],
      rationale: 'Deamidation in CDR regions can affect TNF-alpha binding.',
    },
    {
      attribute: 'Oxidation (Met252, Met358)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['RP-HPLC', 'LC-MS/MS peptide mapping'],
      rationale: 'Fc Met oxidation affects FcRn binding and half-life.',
    },
  ],

  trastuzumab_biosimilar: [
    {
      attribute: 'Amino acid sequence identity',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier3',
      methods: ['LC-MS/MS peptide mapping', 'Intact and subunit mass'],
      rationale: 'Identity confirmation for anti-HER2 IgG1 mAb.',
    },
    {
      attribute: 'HER2 binding affinity (ECD domain IV)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR (Biacore)', 'ELISA', 'BLI', 'Cell-based binding (SK-BR-3, BT-474)'],
      rationale: 'Primary MOA — HER2 binding blocks dimerization and downstream signaling.',
    },
    {
      attribute: 'Anti-proliferative activity',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['BT-474 / SK-BR-3 cell proliferation inhibition assay'],
      rationale: 'Integrative measure of anti-tumor activity from HER2 signaling blockade.',
    },
    {
      attribute: 'ADCC activity (critical MOA component)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['ADCC reporter bioassay (Jurkat NFAT-luc/FcgRIIIa)', 'PBMC-based ADCC', 'NK cell-mediated ADCC'],
      rationale: 'ADCC is a MAJOR component of trastuzumab clinical efficacy (Clynes et al. 2000). Most sensitive tier required.',
    },
    {
      attribute: 'FcRn binding',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR', 'Cell-based FcRn binding'],
      rationale: 'Determines serum half-life; critical PK attribute.',
    },
    {
      attribute: 'FcgRIIIa binding (V158 and F158 allotypes)',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['SPR', 'AlphaLISA'],
      rationale: 'FcgRIIIa engagement mediates ADCC; both allotypes must be tested for comprehensive assessment.',
    },
    {
      attribute: 'C1q binding / CDC',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier2',
      methods: ['C1q ELISA', 'CDC assay'],
      rationale: 'CDC role in trastuzumab MOA is secondary to ADCC; tier 2.',
    },
    {
      attribute: 'Inhibition of HER2 shedding',
      category: CQA_CATEGORIES.biologicalActivity,
      defaultTier: 'tier1',
      methods: ['ECD shedding assay (ELISA for soluble HER2 ECD)'],
      rationale: 'Trastuzumab inhibits metalloprotease-mediated HER2 ECD shedding — part of clinical MOA.',
    },
    {
      attribute: 'N-glycan profile',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS glycan mapping'],
      rationale: 'Glycosylation directly impacts ADCC — the most critical effector function for trastuzumab.',
    },
    {
      attribute: 'Afucosylation level',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS'],
      rationale: 'Afucosylation is THE dominant glycan attribute for trastuzumab: 50-fold increase in FcgRIIIa affinity.',
    },
    {
      attribute: 'High mannose species',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS glycan mapping'],
      rationale: 'High mannose increases clearance and reduces ADCC; critical for trastuzumab.',
    },
    {
      attribute: 'Galactosylation',
      category: CQA_CATEGORIES.glycosylation,
      defaultTier: 'tier1',
      methods: ['HILIC-UPLC', 'LC-MS'],
      rationale: 'Galactosylation affects CDC (C1q binding); important quality attribute.',
    },
    {
      attribute: 'Charge variants',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'icIEF', 'CZE'],
      rationale: 'Charge heterogeneity reflects cumulative PTMs affecting function.',
    },
    {
      attribute: 'Size variants',
      category: CQA_CATEGORIES.productQuality,
      defaultTier: 'tier1',
      methods: ['SE-HPLC', 'CE-SDS (reduced/non-reduced)', 'SV-AUC'],
      rationale: 'Aggregates and fragments critical for safety and efficacy.',
    },
    {
      attribute: 'Higher-order structure',
      category: CQA_CATEGORIES.higherOrderStructure,
      defaultTier: 'tier2',
      methods: ['Far-UV CD', 'Near-UV CD', 'DSC', 'HDX-MS'],
      rationale: 'Comprehensive structural characterization to confirm proper folding.',
    },
    {
      attribute: 'Deamidation (CDR Asn residues)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['CEX-HPLC', 'LC-MS/MS peptide mapping'],
      rationale: 'Deamidation in CDR can affect HER2 binding.',
    },
    {
      attribute: 'Oxidation (Fc Met residues)',
      category: CQA_CATEGORIES.primaryStructure,
      defaultTier: 'tier1',
      methods: ['RP-HPLC', 'LC-MS/MS'],
      rationale: 'Fc methionine oxidation affects FcRn binding and serum half-life.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1a. assessAnalyticalSimilarity — Exported Function
// ─────────────────────────────────────────────────────────────────────────────

export interface AssessAnalyticalSimilarityParams {
  productType: BiosimilarProductType;
  criticalQualityAttributes?: string[];
  analyticalMethodsUsed?: string[];
}

/**
 * Assess analytical similarity per FDA 2017 Statistical Approaches guidance
 * and EMA biosimilar quality guidelines. Returns tier classification for each
 * CQA, statistical approach per tier, reference lot requirements, and
 * product-specific guidance.
 *
 * Deterministic -- identical input always yields identical output.
 */
export function assessAnalyticalSimilarity(
  params: AssessAnalyticalSimilarityParams,
): AnalyticalSimilarityResult {
  const { productType, criticalQualityAttributes, analyticalMethodsUsed } = params;

  const registryCQAs = CQA_REGISTRY[productType] ?? CQA_REGISTRY.mAb;

  // Filter CQAs if user provided a specific list, otherwise use full set
  let selectedCQAs = registryCQAs;
  if (criticalQualityAttributes && criticalQualityAttributes.length > 0) {
    const requestedLower = criticalQualityAttributes.map(c => c.toLowerCase());
    selectedCQAs = registryCQAs.filter(cqa =>
      requestedLower.some(req =>
        cqa.attribute.toLowerCase().includes(req) ||
        req.includes(cqa.attribute.toLowerCase()),
      ),
    );
    // If none matched, fall back to full registry
    if (selectedCQAs.length === 0) selectedCQAs = registryCQAs;
  }

  // Build tier assignments
  const cqaTierAssignments: CQATierAssignment[] = selectedCQAs.map(cqa => {
    const methods = analyticalMethodsUsed
      ? cqa.methods.filter(m =>
          analyticalMethodsUsed.some(am => m.toLowerCase().includes(am.toLowerCase()) || am.toLowerCase().includes(m.toLowerCase())),
        )
      : cqa.methods;
    const finalMethods = methods.length > 0 ? methods : cqa.methods;

    let statApproach: string;
    switch (cqa.defaultTier) {
      case 'tier1':
        statApproach =
          'Equivalence test using quality range approach: biosimilar mean must fall within ' +
          '[reference mean - 1.5 * Sref, reference mean + 1.5 * Sref], where Sref is the ' +
          'reference product standard deviation (minimum SD = max(Sref, MinSD from 10-lot ' +
          'requirement)). Formally: reject H0 of non-equivalence if the 90% CI for ' +
          '(biosimilar mean - reference mean) falls entirely within the quality range.';
        break;
      case 'tier2':
        statApproach =
          'Quality range approach: biosimilar results should fall within [reference mean - k * Sref, ' +
          'reference mean + k * Sref], where k is typically 2 or 3. No formal hypothesis test; ' +
          'visual/numerical comparison against the quality range derived from reference lots.';
        break;
      case 'tier3':
        statApproach =
          'Raw data and/or graphical comparison. Present side-by-side data, overlay plots, ' +
          'or tabular comparison. No statistical test required; scientific judgment applied.';
        break;
    }

    return {
      attribute: cqa.attribute,
      category: cqa.category,
      tier: cqa.defaultTier,
      statisticalApproach: statApproach,
      rationale: cqa.rationale,
      analyticalMethods: finalMethods,
    };
  });

  // Product-specific guidance
  const productSpecificGuidance: string[] = [];
  switch (productType) {
    case 'mAb':
      productSpecificGuidance.push(
        'For mAb biosimilars: assess ALL Fc-mediated functions (FcgR binding, FcRn binding, C1q binding, ADCC, CDC) regardless of whether they are part of the primary MOA.',
        'Glycosylation analysis should include site-specific glycopeptide mapping in addition to released glycan profiling.',
        'Consider HDX-MS and/or 2D-NMR for higher-order structure comparison of mAb biosimilars.',
        'FDA recommends fingerprint-like analytical similarity for mAb biosimilars (totality of evidence).',
      );
      break;
    case 'adalimumab_biosimilar':
      productSpecificGuidance.push(
        'Adalimumab biosimilar: 10+ approved US biosimilars provide extensive precedent for analytical packages.',
        'Key differentiating CQAs for adalimumab: afucosylation (ADCC), charge variant distribution, aggregation profile.',
        'Transmembrane TNF binding and reverse signaling assays are expected in the analytical package.',
        'Citrate-free formulations acceptable; formulation differences do not disqualify biosimilarity.',
        'Reference: FDA reviews of Hadlima, Hyrimoz, Cyltezo, Amjevita for analytical similarity frameworks used.',
      );
      break;
    case 'trastuzumab_biosimilar':
      productSpecificGuidance.push(
        'Trastuzumab biosimilar: ADCC is THE most critical functional attribute — afucosylation level is the dominant CQA.',
        'Anti-proliferative activity on HER2-overexpressing cells (BT-474, SK-BR-3) is essential.',
        'Inhibition of HER2 ECD shedding should be included in the functional panel.',
        'Reference: FDA reviews of Ogivri, Herzuma, Ontruzant, Kanjinti, Trazimera for approved analytical packages.',
        'Relative potency by cell-based bioassay should be within 80-120% of reference.',
      );
      break;
    case 'insulin':
      productSpecificGuidance.push(
        'Insulin biosimilars: simpler analytical program due to well-characterized molecule.',
        'Key CQAs: HMWP (aggregates), A21 desamido, related impurities, potency.',
        'Insulin zinc content and preservative levels affect self-association state and PK.',
        'Device compatibility/interchangeability may be a separate consideration.',
        'Reference: FDA review of Semglee (insulin glargine-yfgn) for analytical package.',
      );
      break;
    case 'epo':
      productSpecificGuidance.push(
        'EPO biosimilars: glycosylation is the DOMINANT quality attribute — sialic acid content controls in vivo potency.',
        'Isoform distribution by IEF is a critical release and comparability assay.',
        'In vitro potency (IU/mg) may not correlate perfectly with in vivo half-life due to glycan-dependent clearance.',
        'Aggregation is a CRITICAL safety concern — link to anti-EPO antibody-mediated pure red cell aplasia (PRCA).',
        'Reference: EMA/CHMP/BMWP/301636/2008 — EPO-specific biosimilar guideline.',
      );
      break;
    case 'filgrastim':
      productSpecificGuidance.push(
        'Filgrastim biosimilars: non-glycosylated E. coli-derived protein — simpler glycosylation assessment.',
        'Oxidation of multiple Met residues is the primary stability-indicating degradation.',
        'E. coli-specific impurities (endotoxin, HCP) require process-specific assays.',
        'Reference: EMA/CHMP/BMWP/31329/2005 — Filgrastim-specific biosimilar guideline.',
        'Zarxio (filgrastim-sndz) was the first US biosimilar approved (2015) — strong precedent.',
      );
      break;
    case 'pegfilgrastim':
      productSpecificGuidance.push(
        'PEGylated biosimilar: PEG conjugation site, PEG MW/polydispersity, and free protein/PEG are unique CQAs.',
        'PEG characterization requires specialized methods (MALDI, SEC-MALS) not typical for non-PEGylated proteins.',
        'In vitro potency is reduced vs. filgrastim due to PEGylation — compare relative to PEGylated reference.',
        'Reference: FDA review of Udenyca, Ziextenzo, Nyvepria (pegfilgrastim biosimilars).',
      );
      break;
    case 'fusion_protein':
      productSpecificGuidance.push(
        'Fusion protein biosimilars: must assess binding of EACH functional domain independently.',
        'Linker region integrity and potential clipping at the junction is a unique CQA.',
        'Fc effector functions should be characterized even if not primary MOA.',
        'Reference: EMA guidelines on biosimilar monoclonal antibodies (applicable to Fc-fusion proteins).',
        'Etanercept (Enbrel) is the most prominent Fc-fusion biosimilar target — multiple approved biosimilars.',
      );
      break;
  }

  return {
    productType,
    cqaTierAssignments,
    referenceLotRequirements: {
      fdaMinimum: 10,
      emaMinimum: 3,
      rationale:
        'FDA 2017 Statistical Approaches guidance recommends a minimum of 10 reference product lots for ' +
        'robust estimation of the reference quality range. EMA requires at least 3 independent batches but ' +
        'recommends more for statistical robustness. The reference lots should represent different manufacturing ' +
        'campaigns, production dates spanning the shelf life, and ideally lots from both US-licensed and ' +
        'EU-approved reference products (to support global submissions).',
      lotSelectionGuidance: [
        'Select lots spanning the full shelf life to capture manufacturing variability.',
        'Include lots from different manufacturing sites if the reference product is made at multiple facilities.',
        'For global programs: acquire US-licensed (FDA) and EU-approved (EMA) reference lots separately.',
        'Document lot numbers, expiry dates, and sourcing for regulatory transparency.',
        'FDA minimum 10 lots; if fewer available, provide justification and use minimum SD rule in Tier 1.',
        'EMA: minimum 3 batches, but strongly recommends acquiring more (10+ preferred for statistical power).',
      ],
    },
    tier1StatisticalDetails: {
      method: 'Equivalence test with quality range approach (FDA 2017 Statistical Approaches Guidance)',
      qualityRangeDerivation:
        'Quality Range = [reference mean - 1.5 * max(Sref, MinSD), reference mean + 1.5 * max(Sref, MinSD)], ' +
        'where Sref = standard deviation of reference product lot means, and MinSD is the minimum SD derived ' +
        'from at least 10 reference lots. The 1.5 multiplier is FDA-recommended for tier 1 margin width.',
      sdMinimumRule:
        'If fewer than 10 reference lots are available, the minimum SD (MinSD) is set as the larger of: ' +
        '(a) the observed Sref, or (b) a pre-specified minimum SD based on assay precision/platform variability. ' +
        'This prevents an artificially narrow quality range from an insufficiently sampled reference.',
      equivalenceMargin:
        'Margin = 1.5 * max(Sref, MinSD). The 90% confidence interval for the difference (biosimilar mean - ' +
        'reference mean) must fall entirely within [-margin, +margin] to conclude analytical similarity.',
      hypothesisTesting:
        'H0: |mu_biosimilar - mu_reference| >= margin (non-equivalence). ' +
        'H1: |mu_biosimilar - mu_reference| < margin (equivalence). ' +
        'Reject H0 if the 90% CI for the difference falls within the quality range. ' +
        'Two one-sided test (TOST) framework applied to each Tier 1 CQA independently.',
      sampleSizeConsiderations:
        'Testing typically uses all available biosimilar lots (minimum 3-6 recommended) against 10+ reference lots. ' +
        'Multiple independent measurements per lot improve precision. Power depends on actual variability, ' +
        'lot-to-lot differences, and the quality range width.',
    },
    tier2StatisticalDetails: {
      method: 'Quality range approach (no formal hypothesis test)',
      qualityRangeDerivation:
        'Quality Range = [reference mean - k * Sref, reference mean + k * Sref], where k is typically 2 or 3. ' +
        'Alternatively, the range may be defined as [min, max] of the reference lot results.',
      interpretationGuidance:
        'Biosimilar lot means should fall within the quality range. Outliers outside the range require scientific ' +
        'justification. Side-by-side data presentation with the quality range boundaries is expected. ' +
        'Trend analysis or range plots are commonly used.',
    },
    tier3StatisticalDetails: {
      method: 'Raw data comparison / graphical overlay',
      dataPresentation:
        'Side-by-side tabular presentation, overlay chromatograms, spectral overlays, gel images, or ' +
        'mass spectra comparisons. No statistical test applied.',
      interpretationGuidance:
        'Scientific judgment is used to assess similarity. The expectation is that data are visually similar ' +
        'or that any differences are scientifically explained and do not affect clinical performance.',
    },
    productSpecificGuidance,
    regulatoryCitations: [
      'FDA Guidance: Statistical Approaches to Evaluate Analytical Similarity (2017)',
      'FDA Guidance: Quality Considerations in Demonstrating Biosimilarity of a Therapeutic Protein Product to a Reference Product (2015)',
      'FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015)',
      'EMA/CHMP/BMWP/437/04 Rev. 1 — Guideline on Similar Biological Medicinal Products (2014)',
      'EMA/CHMP/BWP/247713/2012 — Guideline on Similar Biological Medicinal Products Containing Biotechnology-Derived Proteins as Active Substance: Quality Issues (2014)',
      'ICH Q5E — Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process',
      'ICH Q6B — Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products',
      'USP <1032> Design and Development of Biological Assays',
      'USP <1034> Analysis of Biological Assays',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Clinical Program Design — Reference Data & Decision Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicalStudyDesign {
  studyType: string;
  population: string;
  design: string;
  primaryEndpoint: string;
  secondaryEndpoints: string[];
  sampleSizeRationale: string;
  margin: string;
  marginDerivation: string;
  duration: string;
}

export interface ImmunogenicityAssessment {
  adaAssayStrategy: string[];
  adaTestingTimepoints: string[];
  neutralizingAntibodyApproach: string;
  immunogenicityComparison: string;
  impactAssessment: string[];
}

export interface BiosimilarClinicalProgramResult {
  productType: BiosimilarProductType;
  referenceProduct: string;
  clinicalPharmacologyStudy: ClinicalStudyDesign;
  comparativeClinicalStudy: ClinicalStudyDesign;
  immunogenicityAssessment: ImmunogenicityAssessment;
  switchingStudyGuidance: string[];
  approvedPrecedents: Array<{
    biosimilar: string;
    referenceProduct: string;
    indication: string;
    clinicalEndpoint: string;
    designSummary: string;
  }>;
  regulatoryCitations: string[];
}

export interface DesignBiosimilarClinicalProgramParams {
  productType: BiosimilarProductType;
  referenceProduct: string;
  indications: string[];
  mechanismOfAction: MechanismOfAction;
  pkComplexity: 'low' | 'moderate' | 'high';
  immunogenicityRisk: 'low' | 'moderate' | 'high';
}

/** Approved biosimilar precedents with clinical designs used. */
const BIOSIMILAR_CLINICAL_PRECEDENTS: Array<{
  biosimilar: string;
  referenceProduct: string;
  productType: BiosimilarProductType;
  indication: string;
  clinicalEndpoint: string;
  designSummary: string;
}> = [
  {
    biosimilar: 'Zarxio (filgrastim-sndz)',
    referenceProduct: 'Neupogen (filgrastim)',
    productType: 'filgrastim',
    indication: 'Chemotherapy-induced neutropenia',
    clinicalEndpoint: 'Duration of severe neutropenia (DSN)',
    designSummary: 'Randomized, double-blind, parallel-group in breast cancer patients receiving myelosuppressive chemotherapy. PK/PD study + comparative efficacy.',
  },
  {
    biosimilar: 'Inflectra (infliximab-dyyb)',
    referenceProduct: 'Remicade (infliximab)',
    productType: 'mAb',
    indication: 'Rheumatoid arthritis (RA)',
    clinicalEndpoint: 'ACR20 response at Week 30',
    designSummary: 'Randomized, double-blind, parallel-group, equivalence study in RA patients. Margin: +/- 15%. Secondary: ACR50, ACR70, DAS28.',
  },
  {
    biosimilar: 'Amjevita (adalimumab-atto)',
    referenceProduct: 'Humira (adalimumab)',
    productType: 'adalimumab_biosimilar',
    indication: 'Rheumatoid arthritis (RA)',
    clinicalEndpoint: 'ACR20 at Week 24',
    designSummary: 'Randomized, double-blind, active-controlled equivalence study in moderate-to-severe RA. Margin: +/- 15%. MTX background therapy.',
  },
  {
    biosimilar: 'Cyltezo (adalimumab-adbm)',
    referenceProduct: 'Humira (adalimumab)',
    productType: 'adalimumab_biosimilar',
    indication: 'Rheumatoid arthritis (RA)',
    clinicalEndpoint: 'ACR20 at Week 24',
    designSummary: 'Randomized, double-blind, parallel-group equivalence study in RA. Also included a switching substudy for interchangeability.',
  },
  {
    biosimilar: 'Hadlima (adalimumab-bwwd)',
    referenceProduct: 'Humira (adalimumab)',
    productType: 'adalimumab_biosimilar',
    indication: 'Rheumatoid arthritis (RA)',
    clinicalEndpoint: 'ACR20 at Week 24',
    designSummary: 'Randomized, double-blind, parallel-group equivalence study in moderate-to-severe RA on MTX.',
  },
  {
    biosimilar: 'Ogivri (trastuzumab-dkst)',
    referenceProduct: 'Herceptin (trastuzumab)',
    productType: 'trastuzumab_biosimilar',
    indication: 'HER2+ metastatic breast cancer',
    clinicalEndpoint: 'ORR at Week 24',
    designSummary: 'Randomized, double-blind, parallel-group equivalence study in HER2+ MBC first-line with taxane. Margin: +/- 15%.',
  },
  {
    biosimilar: 'Herzuma (trastuzumab-pkrb)',
    referenceProduct: 'Herceptin (trastuzumab)',
    productType: 'trastuzumab_biosimilar',
    indication: 'HER2+ early breast cancer (neoadjuvant)',
    clinicalEndpoint: 'pCR (pathological complete response)',
    designSummary: 'Randomized, double-blind, equivalence study in HER2+ EBC neoadjuvant setting with chemotherapy. Margin: +/- 13%.',
  },
  {
    biosimilar: 'Kanjinti (trastuzumab-anns)',
    referenceProduct: 'Herceptin (trastuzumab)',
    productType: 'trastuzumab_biosimilar',
    indication: 'HER2+ metastatic breast cancer',
    clinicalEndpoint: 'ORR at Week 24',
    designSummary: 'Randomized, double-blind, parallel-group equivalence study in HER2+ MBC first-line.',
  },
  {
    biosimilar: 'Truxima (rituximab-abbs)',
    referenceProduct: 'Rituxan (rituximab)',
    productType: 'mAb',
    indication: 'Low-grade or follicular NHL',
    clinicalEndpoint: 'ORR (overall response rate)',
    designSummary: 'Randomized, double-blind, parallel-group equivalence study in first-line follicular lymphoma with CVP chemotherapy.',
  },
  {
    biosimilar: 'Retacrit (epoetin alfa-epbx)',
    referenceProduct: 'Epogen/Procrit (epoetin alfa)',
    productType: 'epo',
    indication: 'Anemia of CKD (dialysis)',
    clinicalEndpoint: 'Mean hemoglobin level maintenance',
    designSummary: 'Randomized, active-controlled study in CKD patients on hemodialysis. Non-inferiority on hemoglobin maintenance.',
  },
  {
    biosimilar: 'Udenyca (pegfilgrastim-cbqv)',
    referenceProduct: 'Neulasta (pegfilgrastim)',
    productType: 'pegfilgrastim',
    indication: 'Chemotherapy-induced neutropenia',
    clinicalEndpoint: 'Duration of severe neutropenia (DSN) in Cycle 1',
    designSummary: 'Randomized, double-blind, parallel-group equivalence study in breast cancer patients. Margin: 1 day DSN difference.',
  },
  {
    biosimilar: 'Semglee (insulin glargine-yfgn)',
    referenceProduct: 'Lantus (insulin glargine)',
    productType: 'insulin',
    indication: 'Diabetes mellitus type 1',
    clinicalEndpoint: 'Change in HbA1c from baseline at Week 24',
    designSummary: 'Randomized, double-blind, parallel-group equivalence study in T1DM. Margin: +/- 0.4% HbA1c. Also included PK/PD euglycemic clamp.',
  },
  {
    biosimilar: 'Erelzi (etanercept-szzs)',
    referenceProduct: 'Enbrel (etanercept)',
    productType: 'fusion_protein',
    indication: 'Psoriasis (plaque)',
    clinicalEndpoint: 'PASI 75 at Week 12',
    designSummary: 'Randomized, double-blind, parallel-group equivalence study in moderate-to-severe plaque psoriasis. Margin: +/- 15%.',
  },
];

/** Endpoint selection guidance by product type and indication. */
const ENDPOINT_SELECTION_GUIDANCE: Record<string, {
  preferredIndication: string;
  rationale: string;
  primaryEndpoint: string;
  alternativeEndpoints: string[];
}> = {
  'adalimumab_biosimilar': {
    preferredIndication: 'Rheumatoid arthritis (RA)',
    rationale: 'RA is the most sensitive indication for anti-TNF biosimilars due to well-validated endpoints (ACR criteria), established treatment response patterns, and large patient populations for enrollment.',
    primaryEndpoint: 'ACR20 at Week 24',
    alternativeEndpoints: ['DAS28-CRP at Week 24', 'ACR50/ACR70 (secondary)', 'HAQ-DI (secondary)'],
  },
  'trastuzumab_biosimilar': {
    preferredIndication: 'HER2-positive breast cancer (metastatic, first-line or neoadjuvant)',
    rationale: 'HER2+ breast cancer is the most sensitive setting for trastuzumab biosimilars. ORR in metastatic or pCR in neoadjuvant provides a sensitive efficacy readout in a homogeneous population.',
    primaryEndpoint: 'ORR at Week 24 (metastatic) or pCR (neoadjuvant)',
    alternativeEndpoints: ['Disease-free survival (too long for biosimilar study)', 'Duration of response (secondary)', 'PFS (secondary, requires longer follow-up)'],
  },
  'mAb': {
    preferredIndication: 'Varies by reference product — select most sensitive indication per mechanism',
    rationale: 'The most sensitive indication is one where the mechanism of action is well-characterized, treatment effects are measurable with validated endpoints, and the patient population is sufficiently homogeneous.',
    primaryEndpoint: 'Product-dependent: ORR for oncology mAbs, ACR20/DAS28 for anti-TNF, PASI for anti-IL17/IL23',
    alternativeEndpoints: ['Disease-specific response criteria', 'PK-based endpoints for dose-proportional products'],
  },
  'filgrastim': {
    preferredIndication: 'Chemotherapy-induced neutropenia (CIN) in breast cancer',
    rationale: 'CIN in breast cancer provides a homogeneous patient population receiving predictable myelosuppressive regimens. Duration of severe neutropenia (DSN) is a sensitive, well-validated endpoint.',
    primaryEndpoint: 'Duration of severe neutropenia (DSN) in Cycle 1',
    alternativeEndpoints: ['Depth of ANC nadir', 'Time to ANC recovery', 'Incidence of febrile neutropenia'],
  },
  'pegfilgrastim': {
    preferredIndication: 'Chemotherapy-induced neutropenia (CIN) in breast cancer',
    rationale: 'Same rationale as filgrastim — CIN in breast cancer with DSN as primary endpoint.',
    primaryEndpoint: 'Duration of severe neutropenia (DSN) in Cycle 1',
    alternativeEndpoints: ['ANC nadir', 'Time to ANC recovery', 'Febrile neutropenia incidence'],
  },
  'insulin': {
    preferredIndication: 'Type 1 diabetes mellitus',
    rationale: 'T1DM provides a more insulin-dependent population than T2DM, making it more sensitive to detect differences in insulin products. HbA1c and PK/PD clamp studies are well-validated.',
    primaryEndpoint: 'Change in HbA1c from baseline at Week 24',
    alternativeEndpoints: ['Fasting plasma glucose', 'Insulin dose adjustment', 'Hypoglycemia incidence'],
  },
  'epo': {
    preferredIndication: 'Anemia of chronic kidney disease (CKD) — dialysis patients',
    rationale: 'CKD-dialysis patients are EPO-dependent, providing a sensitive population. Hemoglobin maintenance is a well-validated endpoint.',
    primaryEndpoint: 'Mean hemoglobin level maintenance (within target range)',
    alternativeEndpoints: ['Hemoglobin change from baseline', 'EPO dose requirement', 'Transfusion avoidance'],
  },
  'fusion_protein': {
    preferredIndication: 'Varies by reference — psoriasis for etanercept, RA for TNF-trap',
    rationale: 'Select the most sensitive indication per the specific fusion protein reference product.',
    primaryEndpoint: 'Product-dependent: PASI 75 for psoriasis, ACR20 for RA',
    alternativeEndpoints: ['Disease-specific response criteria'],
  },
};

/**
 * Design a biosimilar clinical development program including PK similarity,
 * comparative clinical efficacy, immunogenicity assessment, and switching
 * study guidance. Returns designs based on approved precedents.
 *
 * Deterministic -- identical input always yields identical output.
 */
export function designBiosimilarClinicalProgram(
  params: DesignBiosimilarClinicalProgramParams,
): BiosimilarClinicalProgramResult {
  const {
    productType,
    referenceProduct,
    indications,
    mechanismOfAction,
    pkComplexity,
    immunogenicityRisk,
  } = params;

  // ── PK study design ──
  const isLargeMolecule = ['mAb', 'fusion_protein', 'adalimumab_biosimilar', 'trastuzumab_biosimilar'].includes(productType);
  const useHealthyVolunteers = !isLargeMolecule || immunogenicityRisk === 'low';
  const pkDesign = pkComplexity === 'high' ? 'parallel-group' : 'crossover';
  const pkSingleOrMultiDose = isLargeMolecule ? 'single-dose' : 'single-dose (multi-dose if absorption-dependent kinetics)';

  const clinicalPharmacologyStudy: ClinicalStudyDesign = {
    studyType: 'PK Similarity Study',
    population: useHealthyVolunteers
      ? 'Healthy volunteers (preferred for PK studies of products with acceptable safety in healthy subjects)'
      : 'Patients with the indicated condition (required when safety profile precludes healthy volunteer dosing)',
    design: isLargeMolecule
      ? `Randomized, double-blind, ${pkDesign}, ${pkSingleOrMultiDose} PK equivalence study. ` +
        'Three-arm design (biosimilar vs. US-licensed reference vs. EU-approved reference) is efficient for global programs.'
      : `Randomized, double-blind, ${pkDesign}, ${pkSingleOrMultiDose} PK equivalence study.`,
    primaryEndpoint: 'PK equivalence: AUC0-inf (or AUC0-t) and Cmax',
    secondaryEndpoints: [
      'AUC0-t (if AUC0-inf is primary)',
      'Tmax (descriptive)',
      'Terminal half-life (descriptive)',
      'Clearance and volume of distribution (for IV products)',
      'Immunogenicity (ADA incidence, titer, neutralizing antibodies)',
      'Safety and tolerability',
    ],
    sampleSizeRationale:
      'Sample size determined to provide >= 80% (preferably 90%) power to demonstrate PK equivalence ' +
      'with the standard 80-125% bioequivalence limits at alpha = 0.05 (two one-sided tests). ' +
      'Typical sample sizes: 30-70 per arm for mAbs (parallel), 20-40 total for crossover designs.',
    margin: '80.00% - 125.00% for the 90% CI of the geometric mean ratio (test/reference) for AUC and Cmax',
    marginDerivation:
      'Standard BE limits per FDA Guidance: Clinical Pharmacology Data to Support a Demonstration of ' +
      'Biosimilarity (2016). Tighter margins may be used if clinically justified but are not required.',
    duration: isLargeMolecule
      ? 'Single-dose PK follow-up until 5 half-lives post-dose (typically 8-12 weeks for mAbs). ADA sampling at baseline, Day 29, Day 57, end of study.'
      : 'Single-dose PK follow-up until AUC0-inf can be adequately characterized (typically 3-5 half-lives).',
  };

  // ── Comparative clinical study design ──
  const endpointGuidance = ENDPOINT_SELECTION_GUIDANCE[productType] ?? ENDPOINT_SELECTION_GUIDANCE['mAb'];

  const comparativeClinicalStudy: ClinicalStudyDesign = {
    studyType: 'Comparative Clinical Study (Efficacy)',
    population: endpointGuidance.preferredIndication + ' — ' + endpointGuidance.rationale,
    design:
      'Randomized, double-blind, parallel-group, equivalence study. Randomization ratio: 1:1 (biosimilar : reference). ' +
      'Stratification factors: disease severity, prior treatment, geographic region.',
    primaryEndpoint: endpointGuidance.primaryEndpoint,
    secondaryEndpoints: [
      ...endpointGuidance.alternativeEndpoints,
      'Safety profile comparison (AE incidence, SAE, discontinuation)',
      'Immunogenicity comparison (ADA incidence, neutralizing antibodies)',
      'PK sub-study (trough concentrations at steady state)',
    ],
    sampleSizeRationale:
      'Equivalence margin is derived from historical data of the reference product in the chosen indication. ' +
      'Margin must preserve a clinically meaningful fraction of the reference treatment effect (typically, the margin ' +
      'should not exceed the entire treatment effect of the reference vs. placebo). Sample size provides >= 80% power ' +
      'for equivalence at the pre-specified margin.',
    margin: deriveEquivalenceMargin(productType),
    marginDerivation:
      'Margin derived from meta-analysis of reference product controlled trials. The margin should be a fraction ' +
      'of the treatment effect that, if lost, would still leave a clinically meaningful benefit. For biosimilars, ' +
      'margins are typically symmetric (e.g., +/- 15% for ACR20, +/- 15% for ORR). FDA and EMA require scientific ' +
      'justification that the margin preserves assay sensitivity.',
    duration: deriveClinicalStudyDuration(productType),
  };

  // ── Immunogenicity assessment ──
  const immunogenicityAssessment: ImmunogenicityAssessment = {
    adaAssayStrategy: [
      'Tier 1 — Screening assay: High-sensitivity immunoassay (e.g., bridging ELISA or ECL/MSD format) to detect binding antibodies against the biosimilar.',
      'Tier 2 — Confirmatory assay: Drug-specific competition assay to confirm true positives (specificity).',
      'Tier 3 — Titer determination: Serial dilution of confirmed positives to determine antibody titer.',
      'Tier 4 — Neutralizing antibody (NAb) assay: Cell-based or competitive ligand-binding assay to detect neutralizing antibodies.',
      'Cross-reactivity: The ADA assay must detect antibodies that bind to BOTH biosimilar and reference product (use both as coating antigens or competitive agents).',
      'Drug tolerance: Characterize and report the drug tolerance of the ADA assay (ability to detect ADA in presence of residual drug).',
    ],
    adaTestingTimepoints: immunogenicityRisk === 'high'
      ? [
          'Baseline (pre-dose)',
          'Week 4',
          'Week 8',
          'Week 12',
          'Week 24 (primary assessment)',
          'Week 36',
          'Week 52 (if long-term extension)',
          'End of treatment + 3-6 months (washout)',
        ]
      : [
          'Baseline (pre-dose)',
          'Week 8 or 12 (early assessment)',
          'Week 24 (primary assessment)',
          'End of treatment + 3-6 months (washout)',
        ],
    neutralizingAntibodyApproach:
      'All ADA-positive samples are tested for neutralizing activity. NAb assay should be clinically relevant: ' +
      'cell-based NAb assay preferred for products where potency is cell-mediated. Competitive ligand-binding ' +
      'NAb assay acceptable for products where neutralization = blocking target binding.',
    immunogenicityComparison:
      'Head-to-head comparison of ADA incidence (binding and neutralizing) between biosimilar and reference. ' +
      'Report: ADA incidence, titer distribution, time to seroconversion, persistence (transient vs. persistent), ' +
      'and impact on PK (trough levels) and clinical outcomes (efficacy, safety events).',
    impactAssessment: [
      'Correlation of ADA status with PK: compare trough drug concentrations in ADA+ vs. ADA- subjects.',
      'Correlation of ADA status with efficacy: compare primary endpoint response in ADA+ vs. ADA- subjects.',
      'Correlation of ADA status with safety: tabulate injection-site reactions, infusion reactions, and hypersensitivity by ADA status.',
      'NAb impact: compare PK and efficacy in NAb+ vs. NAb- subjects.',
      'Biosimilar vs. reference ADA comparison: statistical comparison of ADA incidence rates (descriptive or formal test).',
    ],
  };

  // ── Switching study guidance ──
  const switchingStudyGuidance: string[] = [
    'A single switch from reference to biosimilar is evaluated within the comparative clinical study (at Week 24-30, reference arm switches to biosimilar).',
    'This single-switch design provides supportive evidence but is NOT sufficient for interchangeability designation under BPCIA.',
    'For interchangeability: a dedicated switching study with multiple alternations (typically >= 3 switches) is required.',
    'Switching safety endpoints: ADA incidence after switch, injection-site reactions, infusion reactions, PK trough levels, clinical response maintenance.',
    'EMA does not have a separate interchangeability pathway; switching data are assessed at the member state level.',
    'FDA recommends switching data be integrated with the totality-of-evidence for biosimilarity.',
  ];

  // ── Precedents for this product type ──
  const relevantPrecedents = BIOSIMILAR_CLINICAL_PRECEDENTS.filter(p => p.productType === productType);

  // Suppress unused variable lint
  void mechanismOfAction;
  void indications;

  return {
    productType,
    referenceProduct,
    clinicalPharmacologyStudy,
    comparativeClinicalStudy,
    immunogenicityAssessment,
    switchingStudyGuidance,
    approvedPrecedents: relevantPrecedents.map(p => ({
      biosimilar: p.biosimilar,
      referenceProduct: p.referenceProduct,
      indication: p.indication,
      clinicalEndpoint: p.clinicalEndpoint,
      designSummary: p.designSummary,
    })),
    regulatoryCitations: [
      'FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015)',
      'FDA Guidance: Clinical Pharmacology Data to Support a Demonstration of Biosimilarity to a Reference Product (2016)',
      'FDA Guidance: Biosimilar and Interchangeable Biosimilar Products — Labeling (2022)',
      'EMA/CHMP/BMWP/437/04 Rev. 1 — Guideline on Similar Biological Medicinal Products (2014)',
      'EMA/CHMP/BMWP/403543/2010 — Guideline on Immunogenicity Assessment of Therapeutic Proteins (2017)',
      'ICH S6(R1) — Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals',
      'FDA Guidance: Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for ADA Detection (2019)',
      '42 USC 262(k) — Biologics Price Competition and Innovation Act (BPCIA)',
    ],
  };
}

function deriveEquivalenceMargin(productType: BiosimilarProductType): string {
  switch (productType) {
    case 'adalimumab_biosimilar':
      return '+/- 15% (absolute difference in ACR20 response rate). Example: if reference ACR20 = 60%, acceptable range 45-75%. Precedent: Amjevita, Cyltezo, Hadlima all used +/- 15%.';
    case 'trastuzumab_biosimilar':
      return '+/- 15% (absolute difference in ORR). Example: if reference ORR = 65%, acceptable range 50-80%. For pCR endpoint, +/- 13% used by some programs (Herzuma).';
    case 'mAb':
      return 'Product-dependent. Anti-TNF mAbs: +/- 15% for ACR20. Anti-CD20: +/- 15% for ORR. Other mAbs: derive from reference product treatment effect vs. comparator.';
    case 'filgrastim':
    case 'pegfilgrastim':
      return '+/- 1 day for duration of severe neutropenia (DSN). Example: if reference DSN = 1.8 days, acceptable range 0.8-2.8 days.';
    case 'insulin':
      return '+/- 0.4% for HbA1c change from baseline (absolute). Precedent: Semglee used +/- 0.4% margin for HbA1c equivalence.';
    case 'epo':
      return 'Non-inferiority or equivalence on hemoglobin maintenance within target range. Typical margin: +/- 0.5-1.0 g/dL for hemoglobin.';
    case 'fusion_protein':
      return 'Product-dependent. Etanercept biosimilars: +/- 15% for PASI 75 (psoriasis) or ACR20 (RA).';
    default:
      return 'Derive from reference product treatment effect; margin should preserve clinically meaningful benefit.';
  }
}

function deriveClinicalStudyDuration(productType: BiosimilarProductType): string {
  switch (productType) {
    case 'adalimumab_biosimilar':
      return '24-30 weeks for primary endpoint (ACR20 at Week 24). Extended safety follow-up to Week 52-78 with optional single switch from reference to biosimilar at Week 26-30.';
    case 'trastuzumab_biosimilar':
      return '24 weeks for primary ORR endpoint (metastatic), or through surgery for pCR endpoint (neoadjuvant). Extended safety/efficacy follow-up to end of treatment course.';
    case 'mAb':
      return 'Product-dependent. Generally 24-52 weeks for primary endpoint with extended follow-up.';
    case 'filgrastim':
    case 'pegfilgrastim':
      return 'Cycle 1 for primary DSN endpoint. Safety follow-up through 4-6 chemotherapy cycles.';
    case 'insulin':
      return '24-26 weeks for HbA1c primary endpoint. Extended to 52 weeks for additional safety/efficacy data.';
    case 'epo':
      return '24-52 weeks for hemoglobin maintenance. Longer follow-up if hemoglobin stability endpoint.';
    case 'fusion_protein':
      return '12-24 weeks for primary endpoint (PASI 75 at Week 12 for psoriasis; ACR20 at Week 24 for RA).';
    default:
      return '24-52 weeks depending on indication and endpoint.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Extrapolation of Indications — Reference Data & Decision Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtrapolationAssessment {
  indication: string;
  moaInIndication: string;
  feasibility: 'likely_extrapolable' | 'conditional' | 'additional_data_needed';
  justificationRequirements: string[];
  precedents: string[];
  riskFactors: string[];
}

export interface ExtrapolationResult {
  referenceIndications: string[];
  clinicalStudyIndication: string;
  extrapolationAssessments: ExtrapolationAssessment[];
  generalPrinciples: string[];
  regulatoryCitations: string[];
}

export interface AssessExtrapolationParams {
  referenceProductIndications: string[];
  mechanismOfActionPerIndication: Record<string, string>;
  clinicalStudyIndication: string;
  targetReceptorPerIndication?: Record<string, string>;
}

/** Known extrapolation precedents from approved biosimilars. */
const EXTRAPOLATION_PRECEDENTS: Record<string, string[]> = {
  'infliximab': [
    'Infliximab biosimilars (Inflectra, Renflexis): studied in RA, extrapolated to AS, PsO, PsA, UC, CD.',
    'FDA and EMA granted extrapolation to all reference indications based on totality of evidence.',
    'Initial EMA concern about IBD extrapolation resolved by accumulated post-market data.',
    'Key scientific justification: same target (TNF-alpha), similar pathophysiology across autoimmune conditions.',
  ],
  'adalimumab': [
    'Adalimumab biosimilars: studied in RA (and/or psoriasis), extrapolated to PsO, PsA, AS, JIA, UC, CD, uveitis, HS.',
    'FDA granted full extrapolation for all approved biosimilars (Amjevita, Cyltezo, Hadlima, etc.).',
    'MOA is TNF-alpha neutralization across all indications; differences in relative contribution of ADCC debated for IBD.',
    'Transmembrane TNF binding (reverse signaling) is relevant for IBD — analytical similarity data for this function supports extrapolation.',
  ],
  'trastuzumab': [
    'Trastuzumab biosimilars: studied in HER2+ breast cancer, extrapolated to HER2+ gastric/GEJ cancer.',
    'Same target (HER2 ECD domain IV), same MOA (signaling blockade + ADCC).',
    'Extrapolation supported by similar receptor expression and pathway dependency.',
  ],
  'rituximab': [
    'Rituximab biosimilars: studied in NHL or RA, extrapolated to CLL, DLBCL, GPA, MPA, pemphigus.',
    'CDC-dependent MOA in some indications (CLL) vs. ADCC-dominant in others (NHL) creates complexity.',
    'Comprehensive Fc effector function analysis (ADCC + CDC) required to support extrapolation.',
  ],
  'bevacizumab': [
    'Bevacizumab biosimilars: studied in NSCLC, extrapolated to CRC, GBM, RCC, ovarian, cervical cancers.',
    'MOA is VEGF neutralization (no Fc effector function contribution); straightforward extrapolation.',
  ],
  'epo': [
    'EPO biosimilars: studied in CKD anemia (dialysis), extrapolated to CKD non-dialysis, chemotherapy-induced anemia.',
    'Same receptor (EPOR), same MOA (erythropoiesis stimulation) across indications.',
  ],
  'filgrastim': [
    'Filgrastim biosimilars: studied in chemotherapy-induced neutropenia, extrapolated to stem cell mobilization, congenital neutropenia, BMT.',
    'Same receptor (G-CSFR), same MOA (neutrophil stimulation) across all indications.',
  ],
};

/**
 * Assess the scientific justification for extrapolation of indications from
 * the clinical study indication to other approved reference product indications.
 *
 * Deterministic -- identical input always yields identical output.
 */
export function assessExtrapolationOfIndications(
  params: AssessExtrapolationParams,
): ExtrapolationResult {
  const {
    referenceProductIndications,
    mechanismOfActionPerIndication,
    clinicalStudyIndication,
    targetReceptorPerIndication,
  } = params;

  const extrapolationAssessments: ExtrapolationAssessment[] = [];

  for (const indication of referenceProductIndications) {
    if (indication.toLowerCase() === clinicalStudyIndication.toLowerCase()) {
      continue; // Skip the studied indication
    }

    const moaStudied = mechanismOfActionPerIndication[clinicalStudyIndication] ?? 'unknown';
    const moaTarget = mechanismOfActionPerIndication[indication] ?? 'unknown';
    const targetStudied = targetReceptorPerIndication?.[clinicalStudyIndication] ?? 'unknown';
    const targetTarget = targetReceptorPerIndication?.[indication] ?? 'unknown';

    const sameMOA = moaStudied.toLowerCase() === moaTarget.toLowerCase();
    const sameTarget = targetStudied.toLowerCase() === targetTarget.toLowerCase();

    let feasibility: ExtrapolationAssessment['feasibility'];
    const justificationRequirements: string[] = [];
    const riskFactors: string[] = [];

    if (sameMOA && sameTarget) {
      feasibility = 'likely_extrapolable';
      justificationRequirements.push(
        'Document that the mechanism of action is identical in the studied and extrapolated indications.',
        'Confirm the target/receptor is the same and expressed similarly across patient populations.',
        'Present PK similarity data demonstrating similar exposure in the studied population.',
        'Demonstrate that the safety and immunogenicity profile is applicable across indications.',
      );
    } else if (sameMOA || sameTarget) {
      feasibility = 'conditional';
      justificationRequirements.push(
        'Provide scientific justification for extrapolation despite differences in MOA or target involvement.',
        'Additional functional data (e.g., effector function characterization) may be needed.',
        'Consider whether the clinical study indication adequately tests the relevant aspects of MOA for the extrapolated indication.',
        'Regulatory pre-submission meeting recommended to align on extrapolation strategy.',
      );
      if (!sameMOA) {
        riskFactors.push(
          'Different mechanism of action in the extrapolated indication — may require additional clinical evidence.',
          'If the studied indication tests only one MOA component (e.g., receptor blocking), but the extrapolated indication relies on a different component (e.g., effector function), analytical similarity for the unstudied function becomes critical.',
        );
      }
    } else {
      feasibility = 'additional_data_needed';
      justificationRequirements.push(
        'Both mechanism of action and target differ — extrapolation requires strong scientific justification or additional clinical data.',
        'Consider whether a separate clinical study in the target indication is needed.',
        'Comprehensive analytical similarity data for ALL relevant functional attributes is essential.',
        'Regulatory agency interaction strongly recommended before submission.',
      );
      riskFactors.push(
        'Different MOA and target: highest risk for extrapolation failure.',
        'Regulatory agency may request indication-specific clinical data.',
      );
    }

    // Find relevant precedents
    const precedents: string[] = [];
    for (const [product, precs] of Object.entries(EXTRAPOLATION_PRECEDENTS)) {
      if (precs.some(p => p.toLowerCase().includes(indication.toLowerCase().split(' ')[0]))) {
        precedents.push(...precs.filter(p => p.toLowerCase().includes(product)));
      }
    }

    extrapolationAssessments.push({
      indication,
      moaInIndication: moaTarget,
      feasibility,
      justificationRequirements,
      precedents: precedents.length > 0 ? precedents : ['No specific precedent identified — consult regulatory agency.'],
      riskFactors,
    });
  }

  return {
    referenceIndications: referenceProductIndications,
    clinicalStudyIndication,
    extrapolationAssessments,
    generalPrinciples: [
      'FDA Scientific Considerations Guidance (2015): Extrapolation is permitted when scientifically justified based on the totality of evidence, including analytical similarity, PK similarity, immunogenicity, and clinical data.',
      'The clinical study should be conducted in the MOST SENSITIVE indication — the one most likely to detect clinically meaningful differences between the biosimilar and reference.',
      'Extrapolation requires that the MOA is sufficiently similar across indications and that the analytical and clinical data adequately address the relevant functional attributes.',
      'For products with multiple MOA components (e.g., mAbs with Fab binding + Fc effector functions), the clinical study indication should exercise the MOA component most relevant to the unstudied indications.',
      'EMA similarly allows extrapolation based on scientific justification (EMA/CHMP/BMWP/403543/2010).',
      'If the reference product has Fc effector function-dependent and -independent indications, comprehensive effector function analytical data (ADCC, CDC, ADCP) strengthens extrapolation justification.',
      'Post-market pharmacovigilance commitments may be required for extrapolated indications, especially when limited clinical data are available.',
    ],
    regulatoryCitations: [
      'FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015) — Section VI: Extrapolation of Data',
      'EMA/CHMP/BMWP/437/04 Rev. 1 — Section 5.3: Extrapolation to other therapeutic indications',
      'FDA Guidance: Biosimilar Development — Considerations for Demonstrating Interchangeability (2019) — Extrapolation considerations',
      'FDA public meeting transcript: Extrapolation of indications for biosimilar products (May 2014)',
      'WHO Expert Committee on Biological Standardization: Guidelines on evaluation of biosimilars (TRS 977)',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Interchangeability Assessment — Reference Data & Decision Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface InterchangeabilityRequirements {
  biosimilarityEstablished: boolean;
  expectedSameClinicalResult: boolean;
  switchingSafetyDemonstrated: boolean;
  overallEligible: boolean;
  missingRequirements: string[];
}

export interface SwitchingStudyDesign {
  design: string;
  sequences: string[];
  numberOfSwitches: number;
  pkEndpoints: string[];
  immunogenicityEndpoints: string[];
  duration: string;
  sampleSizeGuidance: string;
}

export interface InterchangeabilityResult {
  requirementsAssessment: InterchangeabilityRequirements;
  switchingStudyDesign: SwitchingStudyDesign;
  purpleBookReference: string;
  statePharmacySubstitution: string[];
  currentInterchangeableProducts: Array<{
    product: string;
    referenceProduct: string;
    approvalDate: string;
    significance: string;
  }>;
  emaApproach: string[];
  regulatoryCitations: string[];
}

export interface AssessInterchangeabilityParams {
  biosimilarityEstablished: boolean;
  switchingStudyDataAvailable: boolean;
  productType: BiosimilarProductType;
  dosingFrequency: string;
}

/**
 * Assess interchangeability requirements per FDA BPCIA and 2019 Guidance.
 * Returns requirements assessment, switching study design, current
 * interchangeable products, and state pharmacy substitution implications.
 *
 * Deterministic -- identical input always yields identical output.
 */
export function assessInterchangeability(
  params: AssessInterchangeabilityParams,
): InterchangeabilityResult {
  const {
    biosimilarityEstablished,
    switchingStudyDataAvailable,
    productType,
    dosingFrequency,
  } = params;

  const missingRequirements: string[] = [];
  if (!biosimilarityEstablished) {
    missingRequirements.push('Biosimilarity must be established first (analytical, PK, clinical comparative data).');
  }
  if (!switchingStudyDataAvailable) {
    missingRequirements.push('Dedicated switching study with multiple alternations between biosimilar and reference is required.');
  }

  const overallEligible = biosimilarityEstablished && switchingStudyDataAvailable;

  const requirementsAssessment: InterchangeabilityRequirements = {
    biosimilarityEstablished,
    expectedSameClinicalResult: biosimilarityEstablished,
    switchingSafetyDemonstrated: switchingStudyDataAvailable,
    overallEligible,
    missingRequirements: missingRequirements.length > 0
      ? missingRequirements
      : ['All requirements appear met — interchangeability designation may be pursued.'],
  };

  // ── Switching study design ──
  const isFrequentDosing = ['daily', 'twice daily', 'weekly', 'twice weekly', 'every 2 weeks'].includes(dosingFrequency.toLowerCase());

  const numberOfSwitches = 3; // FDA typical minimum
  const switchSequences = [
    'R → R → R → R (non-switching reference arm)',
    'R → B → R → B (switching arm: 3 alternations)',
  ];

  if (!isFrequentDosing) {
    switchSequences.push(
      'Note: For products with infrequent dosing (e.g., monthly, every 2-3 months), ' +
      'the study duration will be longer to accommodate the switching intervals.',
    );
  }

  const switchingStudyDesign: SwitchingStudyDesign = {
    design:
      'Randomized, double-blind, multiple-switch crossover (or parallel) study. FDA 2019 Guidance recommends ' +
      'a design where subjects alternate between the interchangeable biosimilar and reference product at least ' +
      '3 times, compared to a non-switching arm that remains on the reference throughout.',
    sequences: switchSequences,
    numberOfSwitches,
    pkEndpoints: [
      'Cmax and AUC at steady state (Css,max, AUCtau) after each switch',
      'Trough concentrations (Ctrough) at each switch point',
      'PK equivalence criteria: 80-125% for the 90% CI of GMR for each switch interval',
    ],
    immunogenicityEndpoints: [
      'ADA incidence (binding and neutralizing) in switching vs. non-switching arms',
      'ADA titer comparison between arms',
      'Time to seroconversion in switching vs. non-switching',
      'Impact of ADA on PK (trough levels) in switching arm',
    ],
    duration: deriveSwitchingStudyDuration(dosingFrequency, numberOfSwitches, productType),
    sampleSizeGuidance:
      'Sample size should provide >= 80% power to demonstrate PK equivalence (80-125% limits) ' +
      'in the switching arm. Typical range: 100-250 subjects for mAbs. The non-switching arm ' +
      'serves as the comparator for both PK and immunogenicity.',
  };

  // ── Current interchangeable products ──
  const currentInterchangeableProducts = [
    {
      product: 'Semglee (insulin glargine-yfgn)',
      referenceProduct: 'Lantus (insulin glargine)',
      approvalDate: 'July 2021',
      significance: 'First interchangeable biosimilar designated by FDA. Demonstrated through PK/PD euglycemic clamp study and multiple-switch clinical study.',
    },
    {
      product: 'Cyltezo (adalimumab-adbm)',
      referenceProduct: 'Humira (adalimumab)',
      approvalDate: 'October 2021 (interchangeability designation)',
      significance: 'First interchangeable adalimumab biosimilar. Included a dedicated switching substudy in RA patients.',
    },
    {
      product: 'Hadlima (adalimumab-bwwd)',
      referenceProduct: 'Humira (adalimumab)',
      approvalDate: 'March 2023 (interchangeability designation)',
      significance: 'Interchangeable adalimumab biosimilar with switching data in plaque psoriasis.',
    },
    {
      product: 'Hyrimoz (adalimumab-adaz)',
      referenceProduct: 'Humira (adalimumab)',
      approvalDate: 'October 2023 (interchangeability designation)',
      significance: 'Another interchangeable adalimumab with dedicated switching study.',
    },
    {
      product: 'Yuflyma (adalimumab-aaty)',
      referenceProduct: 'Humira (adalimumab)',
      approvalDate: 'December 2023 (interchangeability designation)',
      significance: 'High-concentration citrate-free formulation. Interchangeable with switching data.',
    },
  ];

  return {
    requirementsAssessment,
    switchingStudyDesign,
    purpleBookReference:
      'FDA Purple Book: Lists of Licensed Biological Products with Reference Product Exclusivity and ' +
      'Biosimilarity or Interchangeability Evaluations (https://purplebooksearch.fda.gov/). ' +
      'Updated regularly. Contains: reference product, biosimilar(s), interchangeability status, ' +
      'exclusivity dates, and BLA numbers.',
    statePharmacySubstitution: [
      'Interchangeability designation enables pharmacy-level substitution without prescriber intervention in states that have adopted substitution laws.',
      'As of 2024, all 50 US states plus DC have enacted biosimilar substitution laws (varying requirements).',
      'Common state law requirements: (1) product must be FDA-designated interchangeable, (2) pharmacist must notify prescriber within a specified timeframe (varies by state, typically 3-10 business days), (3) patient consent may be required (some states).',
      'Purple Book interchangeability designation is the prerequisite for state-level pharmacy substitution.',
      'Some states permit substitution of ANY FDA-approved biosimilar (not just interchangeable ones) for new prescriptions with prescriber authorization.',
      'Electronic health record and pharmacy systems should flag interchangeable products for automatic substitution.',
    ],
    currentInterchangeableProducts,
    emaApproach: [
      'EMA does NOT have a separate interchangeability regulatory pathway. Interchangeability/substitution decisions are made at the EU member state level.',
      'EMA CHMP position (2023): EMA-approved biosimilars can be used interchangeably with their reference products based on the totality of evidence supporting biosimilarity.',
      'Several EU member states (France, Germany, Netherlands, Denmark) have implemented or are implementing biosimilar substitution policies.',
      'France: automatic substitution at pharmacy level allowed since 2022 for treatment-naive patients.',
      'Germany: Quotas for biosimilar prescribing established by regional associations of physicians.',
      'The Netherlands: Active substitution policies (medical switch) implemented by hospital and health insurance policies.',
      'Norway: nationwide biosimilar switch programs (NOR-SWITCH study demonstrated non-inferiority of switching infliximab).',
    ],
    regulatoryCitations: [
      '42 USC 262(k)(4) — BPCIA interchangeability requirements',
      'FDA Guidance: Considerations in Demonstrating Interchangeability With a Reference Product (2019)',
      'FDA Purple Book — Lists of Licensed Biological Products',
      'FDA Federal Register 85 FR 50249 — Biological Product Definitions Under BPCIA',
      'FDA public meeting: Interchangeability of Biosimilar Products (May 2017)',
      'EMA CHMP: Biosimilars in the EU — Information Guide for Healthcare Professionals (2019)',
      'NOR-SWITCH study: Jorgensen et al., Lancet 2017; 389:2304-2316',
    ],
  };
}

function deriveSwitchingStudyDuration(
  dosingFrequency: string,
  numberOfSwitches: number,
  _productType: BiosimilarProductType,
): string {
  const freq = dosingFrequency.toLowerCase();
  let intervalWeeks: number;
  if (freq.includes('daily') || freq.includes('twice daily')) {
    intervalWeeks = 4; // 4-week intervals for daily dosing products
  } else if (freq.includes('weekly') && !freq.includes('every 2') && !freq.includes('biweekly')) {
    intervalWeeks = 8;
  } else if (freq.includes('every 2 weeks') || freq.includes('biweekly')) {
    intervalWeeks = 8; // 4 doses per interval
  } else if (freq.includes('monthly') || freq.includes('every 4 weeks')) {
    intervalWeeks = 12; // 3 doses per interval
  } else if (freq.includes('every 2 months') || freq.includes('every 8 weeks')) {
    intervalWeeks = 16;
  } else {
    intervalWeeks = 8;
  }

  const totalWeeks = intervalWeeks * (numberOfSwitches + 1) + 8; // +1 for initial period, +8 for washout/follow-up
  return (
    `Approximately ${totalWeeks} weeks total. Each treatment interval: ~${intervalWeeks} weeks ` +
    `(${numberOfSwitches} switches). Plus initial run-in period and post-study safety follow-up (including ADA washout sampling at 3-6 months). ` +
    `Dosing frequency (${dosingFrequency}) determines interval length to ensure steady-state PK assessment at each switch point.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Biosimilar IP Strategy — Reference Data & Decision Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface BPCIAPatentDance {
  step: string;
  timeline: string;
  description: string;
}

export interface ExclusivityAnalysis {
  type: string;
  duration: string;
  startDate: string;
  implications: string;
}

export interface IPStrategyResult {
  market: Market;
  bpciaPatentDance: BPCIAPatentDance[];
  usExclusivity: ExclusivityAnalysis[];
  euExclusivity: ExclusivityAnalysis[];
  freedomToOperateFramework: string[];
  designAroundStrategies: string[];
  riskAtLaunchConsiderations: string[];
  regulatoryCitations: string[];
}

export interface PlanBiosimilarIPStrategyParams {
  referenceProductName: string;
  patentExpiryDates: {
    substance?: string;
    formulation?: string;
    methodOfUse?: string;
    process?: string;
  };
  biosimilarExclusivityStatus?: string;
  market: Market;
}

/**
 * Analyze biosimilar IP landscape and exclusivity considerations for US
 * (BPCIA patent dance) and EU markets. Returns patent dance process,
 * exclusivity analysis, freedom-to-operate framework, and design-around
 * strategies.
 *
 * Deterministic -- identical input always yields identical output.
 */
export function planBiosimilarIPStrategy(
  params: PlanBiosimilarIPStrategyParams,
): IPStrategyResult {
  const {
    referenceProductName,
    patentExpiryDates,
    biosimilarExclusivityStatus,
    market,
  } = params;

  // ── BPCIA Patent Dance (US) ──
  const bpciaPatentDance: BPCIAPatentDance[] = [
    {
      step: '1. aBLA Filing (Subsection (l)(2))',
      timeline: 'Day 0 — Filing',
      description:
        'Biosimilar applicant files abbreviated BLA (aBLA) under 42 USC 262(k) with FDA. ' +
        'Within 20 days of FDA acceptance, the applicant MUST provide the reference product sponsor (RPS) with ' +
        'a copy of the aBLA and manufacturing information (confidential, attorneys-eyes-only).',
    },
    {
      step: '2. Disclosure by Applicant (Subsection (l)(2)(A))',
      timeline: 'Within 20 days of aBLA acceptance',
      description:
        'Applicant provides RPS with: (a) copy of the aBLA application, (b) information describing the process ' +
        'used to manufacture the biosimilar, and (c) such other information that describes the product.',
    },
    {
      step: '3. RPS Patent List (Subsection (l)(3)(A))',
      timeline: '60 days after receiving applicant disclosure',
      description:
        'RPS identifies all patents for which it believes a claim of patent infringement could reasonably be asserted ' +
        'against the applicant. The list must include patent number, expiry date, and a brief description of the ' +
        'patented subject matter.',
    },
    {
      step: '4. Applicant Response (Subsection (l)(3)(B))',
      timeline: '60 days after receiving RPS patent list',
      description:
        'Applicant provides: (a) its own list of additional patents it believes could be asserted, and (b) for each ' +
        'patent on both lists, a detailed statement of factual and legal basis for the opinion that the patent is ' +
        'invalid, unenforceable, or will not be infringed. Alternatively, applicant may state it does not intend ' +
        'to begin marketing before patent expiry.',
    },
    {
      step: '5. RPS Reply (Subsection (l)(3)(C))',
      timeline: '60 days after receiving applicant response',
      description:
        'RPS provides a detailed response to applicant\'s invalidity/non-infringement arguments for each patent.',
    },
    {
      step: '6. Patent Negotiation — First Wave (Subsection (l)(4))',
      timeline: '15 days after RPS reply',
      description:
        'Parties negotiate in good faith to agree on which patents to litigate immediately (first wave). ' +
        'If agreement is reached, litigation proceeds on the agreed patents. If not, each party identifies ' +
        'the patents it wishes to litigate (exchange of lists).',
    },
    {
      step: '7. First-Wave Patent Litigation (Subsection (l)(6))',
      timeline: 'Within 30 days of patent identification',
      description:
        'RPS must bring a patent infringement action within 30 days of the list exchange. If RPS fails to sue, ' +
        'the listed patents may be subject to a defense of estoppel or laches. This is the "Phase 1" litigation.',
    },
    {
      step: '8. Notice of Commercial Marketing (Subsection (l)(8))',
      timeline: '180 days before intended launch date',
      description:
        'Applicant must provide 180-day advance notice to RPS before commercially marketing the biosimilar. ' +
        'This notice triggers the right for RPS to seek a preliminary injunction on additional ("second wave") patents.',
    },
    {
      step: '9. Second-Wave Litigation (Subsection (l)(8))',
      timeline: 'After 180-day notice',
      description:
        'RPS may bring a patent infringement action on patents not included in the first wave. The court may grant ' +
        'a preliminary injunction to prevent launch during second-wave litigation.',
    },
  ];

  // ── US Exclusivity ──
  const usExclusivity: ExclusivityAnalysis[] = [
    {
      type: 'Reference Product Data Exclusivity (4-year)',
      duration: '4 years from date of first licensure of the reference product',
      startDate: 'Date of first BLA approval of the reference product (' + referenceProductName + ')',
      implications:
        'No aBLA can be SUBMITTED to FDA until 4 years after the reference product\'s first licensure date. ' +
        'This is a filing bar — the biosimilar developer cannot even submit the application during this period.',
    },
    {
      type: 'Reference Product Market Exclusivity (12-year)',
      duration: '12 years from date of first licensure of the reference product',
      startDate: 'Date of first BLA approval of the reference product (' + referenceProductName + ')',
      implications:
        'No aBLA can be APPROVED by FDA until 12 years after the reference product\'s first licensure date. ' +
        'The aBLA may be submitted after Year 4 and reviewed during the exclusivity period, but approval ' +
        'cannot be granted until Year 12. This is the key market exclusivity for biologics.',
    },
    {
      type: 'Pediatric Exclusivity Extension (6 months)',
      duration: '6 months added to the 12-year period (total 12.5 years)',
      startDate: 'If the reference product has pediatric exclusivity',
      implications:
        'Pediatric exclusivity, if granted for the reference product, extends the 12-year market exclusivity ' +
        'by an additional 6 months. Check the FDA Purple Book for pediatric exclusivity status.',
    },
    {
      type: 'First Interchangeable Biosimilar Exclusivity (1 year)',
      duration: '1 year from first commercial marketing (or 18 months if patent litigation ongoing)',
      startDate: 'Date of first commercial marketing of the first interchangeable biosimilar',
      implications:
        'The first biosimilar to receive interchangeability designation gets a period of exclusivity during which ' +
        'no other biosimilar can be designated interchangeable with the same reference product. Duration is the ' +
        'earlier of: 1 year after first commercial marketing, 18 months after resolution of patent litigation, ' +
        '18 months after approval if litigation ongoing, or 42 months after approval (maximum).',
    },
  ];

  // ── EU Exclusivity ──
  const euExclusivity: ExclusivityAnalysis[] = [
    {
      type: 'Data Exclusivity (8 years)',
      duration: '8 years from date of first EU marketing authorization of the reference product',
      startDate: 'Date of first EU marketing authorization',
      implications:
        'No biosimilar MAA can rely on the reference product\'s data until 8 years after the reference ' +
        'product\'s first authorization in the EU. The biosimilar developer may conduct studies but cannot ' +
        'reference the originator\'s data package.',
    },
    {
      type: 'Market Protection (2 years = "8+2" formula)',
      duration: '2 years after the 8-year data exclusivity (total 10 years)',
      startDate: '8 years after first EU marketing authorization',
      implications:
        'The biosimilar may not be PLACED ON THE MARKET until 10 years after the reference product\'s ' +
        'first EU authorization. The MAA can be submitted and reviewed during years 8-10, but the product ' +
        'cannot be commercialized until the 10-year mark.',
    },
    {
      type: 'Pediatric Extension (+1 year = "8+2+1" formula)',
      duration: '1 additional year (total 11 years) if pediatric PIP completed',
      startDate: 'If reference product completed pediatric investigation plan (PIP)',
      implications:
        'If the reference product completed all PIP studies and the results are reflected in the SmPC, ' +
        'an additional 1 year of market protection is granted (total 11 years from first authorization).',
    },
    {
      type: 'Orphan Drug Exclusivity (10 years)',
      duration: '10 years from date of orphan designation',
      startDate: 'Date of orphan drug marketing authorization',
      implications:
        'If the reference product has orphan drug designation in the EU, 10 years of market exclusivity ' +
        'applies. Biosimilar applications for the orphan indication cannot be approved during this period. ' +
        'Reducible to 6 years if orphan criteria no longer met.',
    },
  ];

  // ── Freedom-to-Operate (FTO) Framework ──
  const freedomToOperateFramework: string[] = [
    'Step 1: Patent landscape analysis — identify all patents (substance, formulation, process, method of use, device) held by the RPS and any third parties.',
    'Step 2: Claim mapping — map each patent claim to the biosimilar product/process. Identify claims that may be infringed.',
    'Step 3: Invalidity analysis — assess the validity of potentially infringed patents (prior art, written description, enablement, obviousness).',
    'Step 4: Non-infringement analysis — assess whether the biosimilar product/process falls outside the patent claims (literal infringement and doctrine of equivalents).',
    'Step 5: Design-around assessment — if infringement is likely, identify modifications to the process or formulation that avoid the claims.',
    'Step 6: Freedom-to-operate opinion — external patent counsel provides a written FTO opinion assessing infringement risk and recommending risk mitigation.',
    'Step 7: Patent challenge strategy — determine whether to pursue IPR (inter partes review), PGR (post-grant review), or argue invalidity in district court.',
    'Step 8: Continuous monitoring — track new patent filings, patent term adjustments (PTA), patent term extensions (PTE), and Orange/Purple Book listings.',
  ];

  // ── Design-Around Strategies ──
  const designAroundStrategies: string[] = [
    'Process patents: Use a different cell culture media composition, purification resin, or chromatography sequence.',
    'Process patents: Alter upstream parameters (temperature shifts, feed strategy) to operate outside claimed ranges.',
    'Formulation patents: Use different excipient combinations, buffer systems, or surfactant types/concentrations.',
    'Formulation patents: Different container closure system (vial vs. PFS, different syringe barrel material).',
    'Method of use patents: Carve-out (skinny labeling) — do not include patented indications in the biosimilar label.',
    'Method of use patents: Note that carve-out may limit market access but avoids infringement for patented uses.',
    'Device patents: Use a different delivery device (autoinjector, pen) with distinct mechanical design.',
    'Substance patents (limited options): These are harder to design around for biosimilars since the protein sequence must match. Focus on invalidity challenges.',
    'Lyophilized vs. liquid formulation: If the reference product patent covers a liquid formulation, a lyophilized presentation may avoid infringement (and vice versa).',
  ];

  // ── Risk-at-Launch ──
  const riskAtLaunchConsiderations: string[] = [
    'Risk-at-launch: Launching before resolution of all patent litigation. The biosimilar company assumes liability for potential damages if found to infringe.',
    'Potential damages: Lost profits of the reference product sponsor (can be substantial for blockbuster biologics).',
    'Preliminary injunction risk: RPS may seek a PI to prevent launch — court will assess likelihood of success on merits, irreparable harm, balance of hardships, and public interest.',
    'eBay v. MercExchange standard: permanent injunction not automatic even with infringement finding; four-factor equitable test applies.',
    'Insurance and indemnification: Biosimilar company should secure adequate insurance or reserves for potential damages.',
    'Market dynamics: First biosimilar to launch (even at risk) may capture significant market share. Consider competitive timing vs. litigation risk.',
    'Authorized biosimilar agreements: Some RPS have entered into settlement/licensing agreements granting early launch dates in exchange for royalties (e.g., AbbVie Humira settlements).',
  ];

  // Suppress unused variables
  void patentExpiryDates;
  void biosimilarExclusivityStatus;

  // Filter by market
  const result: IPStrategyResult = {
    market,
    bpciaPatentDance: market === 'EU' ? [] : bpciaPatentDance,
    usExclusivity: market === 'EU' ? [] : usExclusivity,
    euExclusivity: market === 'US' ? [] : euExclusivity,
    freedomToOperateFramework,
    designAroundStrategies,
    riskAtLaunchConsiderations: market === 'EU'
      ? ['Risk-at-launch is primarily a US concept (no equivalent patent dance in EU). EU patent disputes follow national court proceedings in each member state.', ...riskAtLaunchConsiderations.slice(0, 3)]
      : riskAtLaunchConsiderations,
    regulatoryCitations: [
      '42 USC 262(l) — BPCIA Patent Resolution Provisions',
      '42 USC 262(k)(7) — Reference Product Exclusivity (12 years)',
      'Sandoz v. Amgen (Supreme Court, 2017) — 180-day notice of commercial marketing',
      'Amgen v. Sanofi (Supreme Court, 2023) — Enablement requirement for broad antibody claims',
      'FDA Purple Book — Exclusivity dates for reference products',
      'Directive 2001/83/EC Article 10(1) — EU data exclusivity/market protection framework (8+2+1)',
      'EU Regulation (EC) No 141/2000 — Orphan medicinal products exclusivity',
      '35 USC 271(e)(2)(C) — Infringement provisions specific to biosimilar aBLA filing',
      '35 USC 271(e)(4) — Remedies for biosimilar patent infringement',
    ],
  };

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Biosimilar CMC Development — Reference Data & Decision Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpressionSystemGuidance {
  system: ExpressionSystem;
  suitableProductTypes: BiosimilarProductType[];
  advantages: string[];
  disadvantages: string[];
  glycosylationCapability: string;
  regulatoryConsiderations: string[];
}

export interface CMCDevelopmentResult {
  referenceProduct: string;
  reverseEngineeringStrategy: string[];
  expressionSystemGuidance: ExpressionSystemGuidance;
  processDevelopmentApproach: {
    cellLineDevelopment: string[];
    upstreamProcess: string[];
    downstreamProcess: string[];
    formulation: string[];
  };
  formulationMatchingStrategy: string[];
  containerClosureConsiderations: string[];
  specificationSetting: string[];
  manufacturingComparability: string[];
  qualityTargetProductProfile: string[];
  regulatoryCitations: string[];
}

export interface AssessBiosimilarCMCParams {
  referenceProduct: string;
  expressionSystem: ExpressionSystem;
  productionScale: 'bench' | 'pilot' | 'commercial';
  analyticalCapability: 'basic' | 'intermediate' | 'advanced';
}

/** Expression system guidance database. */
const EXPRESSION_SYSTEM_REGISTRY: Record<ExpressionSystem, ExpressionSystemGuidance> = {
  CHO: {
    system: 'CHO',
    suitableProductTypes: ['mAb', 'fusion_protein', 'adalimumab_biosimilar', 'trastuzumab_biosimilar', 'epo'],
    advantages: [
      'Industry standard for therapeutic protein production — most extensive regulatory precedent.',
      'Human-like post-translational modifications including complex N-glycosylation.',
      'Well-characterized host cell for regulatory filings (extensive safety database).',
      'Scalable to > 20,000L bioreactor volume.',
      'Multiple CHO lineages available (CHO-K1, CHO-DG44, CHO-S) with different metabolic profiles.',
      'Compatible with serum-free, chemically defined media.',
    ],
    disadvantages: [
      'Higher cost of goods vs. microbial systems.',
      'Longer cell line development timelines (6-12 months).',
      'Can produce non-human glycans (alpha-Gal, NGNA) requiring monitoring.',
      'Cell line instability possible — requires characterization of genetic stability over production cycles.',
    ],
    glycosylationCapability:
      'Full complex N-glycosylation capability (high mannose, hybrid, complex, bi/tri/tetra-antennary). ' +
      'Core fucosylation is default — afucosylation requires engineering (GnTIII overexpression, FUT8 knockout, ' +
      'or afucosylation-promoting media additives). Galactosylation and sialylation tunable by process conditions.',
    regulatoryConsiderations: [
      'CHO is the default expectation for glycosylated mAb biosimilars.',
      'ICH Q5A: viral safety evaluation required (CHO cell lines may harbor endogenous retroviruses).',
      'ICH Q5D: Cell line derivation, characterization, and banking documentation required.',
      'ICH Q5B: Genetic characterization (gene copy number, integration site, expression cassette integrity).',
    ],
  },
  E_coli: {
    system: 'E_coli',
    suitableProductTypes: ['filgrastim', 'insulin'],
    advantages: [
      'Lowest cost of goods — fast growth, high volumetric productivity.',
      'Short fermentation cycles (hours vs. days for mammalian cells).',
      'No glycosylation — appropriate for non-glycosylated proteins.',
      'Well-characterized host organism with extensive regulatory history.',
      'Multiple expression strategies: cytoplasmic (inclusion bodies) or periplasmic (soluble, disulfide bonds).',
    ],
    disadvantages: [
      'No glycosylation capability — cannot be used for glycoproteins (mAbs, EPO, etc.).',
      'Inclusion body formation requires refolding — can introduce heterogeneity.',
      'Endotoxin (LPS) contamination is a major process challenge — requires robust clearance.',
      'Limited to simpler proteins (generally < 50 kDa monomers).',
      'N-terminal methionine may be incompletely processed.',
    ],
    glycosylationCapability: 'None — E. coli does not glycosylate proteins. Only suitable for non-glycosylated products.',
    regulatoryConsiderations: [
      'Endotoxin clearance must be validated and documented (ICH Q6B).',
      'Refolding process characterization is critical — affects disulfide bond formation and molecular heterogeneity.',
      'ICH Q5A: Viral safety considerations are minimal for E. coli (no mammalian virus risk).',
      'Host cell protein clearance is critical — E. coli HCPs are highly immunogenic in humans.',
    ],
  },
  yeast: {
    system: 'yeast',
    suitableProductTypes: ['insulin'],
    advantages: [
      'Higher eukaryotic post-translational modification capability than E. coli.',
      'Moderate cost of goods — faster than CHO, cheaper infrastructure.',
      'Secreted expression possible — simplifies downstream processing.',
      'Pichia pastoris (Komagataella phaffii) and Saccharomyces cerevisiae are most common.',
      'Can perform basic N-glycosylation (high mannose type).',
    ],
    disadvantages: [
      'Hypermannosylation — yeast adds excessive mannose residues not found on human glycoproteins.',
      'Cannot produce complex human-type glycosylation without extensive engineering.',
      'Glycoengineered yeast strains (GlycoFi/Merck) are available but add complexity.',
      'Limited regulatory precedent vs. CHO for biosimilar mAbs.',
    ],
    glycosylationCapability:
      'Native yeast glycosylation produces high-mannose glycans (Man8-Man14) unsuitable for therapeutic mAbs. ' +
      'GlycoFi-engineered strains can produce human-like complex glycans but are patent-encumbered. ' +
      'Acceptable for insulin (non-glycosylated product from yeast).',
    regulatoryConsiderations: [
      'Yeast is well-accepted for insulin production (Novo Nordisk precedent with S. cerevisiae).',
      'For glycoproteins: glycan structure differences from CHO-produced reference product may pose biosimilarity challenges.',
      'ICH Q5A: Minimal viral safety risk (no mammalian virus concerns).',
    ],
  },
  insect: {
    system: 'insect',
    suitableProductTypes: [],
    advantages: [
      'Baculovirus expression vector system (BEVS) in Sf9 or Hi5 cells.',
      'Can produce complex proteins with post-translational modifications.',
      'High expression levels for certain protein types.',
      'Suitable for VLP (virus-like particle) vaccines.',
    ],
    disadvantages: [
      'Glycosylation is paucimannose (Man3) — significantly different from human glycoproteins.',
      'Not suitable for therapeutic mAb biosimilars due to non-human glycosylation.',
      'Lytic infection process complicates continuous manufacturing.',
      'Very limited regulatory precedent for therapeutic protein biosimilars.',
    ],
    glycosylationCapability:
      'Insect cells produce paucimannose glycans (Man3GlcNAc2Fuc) lacking galactose and sialic acid. ' +
      'Not compatible with biosimilar development for glycosylated therapeutic proteins.',
    regulatoryConsiderations: [
      'Not recommended for biosimilar development of glycosylated reference products.',
      'Regulatory precedent limited to vaccines (Cervarix, Flublok).',
      'If used: extensive justification required for glycan differences from reference product.',
    ],
  },
  HEK293: {
    system: 'HEK293',
    suitableProductTypes: ['mAb', 'fusion_protein'],
    advantages: [
      'Human-derived cell line — produces fully human glycosylation patterns.',
      'No non-human glycan epitopes (no alpha-Gal, no NGNA).',
      'Excellent for products requiring human-type sialylation (e.g., EPO, some fusion proteins).',
      'Can produce more complex glycosylation than CHO.',
    ],
    disadvantages: [
      'Lower volumetric productivity compared to CHO for most proteins.',
      'Human cell line — viral safety concerns are more complex (human virus susceptibility).',
      'Less established large-scale manufacturing infrastructure vs. CHO.',
      'Regulatory scrutiny regarding adventitious agent testing is more extensive.',
    ],
    glycosylationCapability:
      'Fully human glycosylation including alpha-2,6-sialylation (CHO only does alpha-2,3). ' +
      'Produces the most human-like glycan profile of any available expression system.',
    regulatoryConsiderations: [
      'Human-derived cell line: ICH Q5A requires extensive viral safety evaluation including human-specific viruses.',
      'Acceptable for therapeutic protein production but less regulatory precedent than CHO for biosimilars.',
      'May be advantageous when matching human-type glycosylation of the reference product is critical.',
    ],
  },
};

/**
 * Assess CMC development strategy for a biosimilar product including
 * expression system selection, process development, formulation matching,
 * and quality target product profile.
 *
 * Deterministic -- identical input always yields identical output.
 */
export function assessBiosimilarCMC(
  params: AssessBiosimilarCMCParams,
): CMCDevelopmentResult {
  const {
    referenceProduct,
    expressionSystem,
    productionScale,
    analyticalCapability,
  } = params;

  const expressionGuidance = EXPRESSION_SYSTEM_REGISTRY[expressionSystem];

  // ── Reverse-engineering strategy ──
  const reverseEngineeringStrategy: string[] = [
    'Step 1: Acquire multiple lots (10+ per FDA, 3+ per EMA) of the reference product from the market. Source from both US-licensed and EU-approved markets for global programs.',
    'Step 2: Comprehensive physicochemical characterization — primary structure (sequence, PTMs), higher-order structure (CD, DSC, NMR), purity (SE-HPLC, CE-SDS), charge variants (CEX, icIEF).',
    'Step 3: Glycosylation profiling — N-glycan mapping (HILIC-UPLC, LC-MS), site-specific glycopeptide analysis, monosaccharide composition, sialic acid quantification.',
    'Step 4: Biological activity fingerprint — target binding (SPR), Fc receptor binding panel (FcRn, FcgRI, FcgRIIa, FcgRIIb, FcgRIIIa 158V/F), C1q binding, cell-based potency (ADCC, CDC, anti-proliferation).',
    'Step 5: Forced degradation/stress studies — identify degradation pathways (oxidation, deamidation, aggregation, fragmentation) under thermal, oxidative, photolytic, pH stress.',
    'Step 6: Define the quality target product profile (QTPP) — establish acceptable ranges for each CQA based on reference product characterization.',
    'Step 7: Stability characterization — accelerated and real-time stability to establish shelf-life expectations and identify stability-indicating assays.',
    'Step 8: Formulation reverse-engineering — identify excipients (buffer, surfactant, tonicity agents, preservatives) in the reference product by analytical methods.',
  ];

  // ── Process development approach ──
  const cellLineDevelopment: string[] = [
    'Clone the gene encoding the reference product protein (based on publicly available sequence or LC-MS-determined sequence).',
    'Transfect the expression construct into the selected host cell line (' + expressionSystem + ').',
    'Screen and select high-producing clones using limiting dilution or single-cell cloning.',
    'Evaluate top clones for productivity (g/L), product quality (glycosylation, charge variants, aggregation), and genetic stability.',
    'Establish a tiered cell bank system: Master Cell Bank (MCB) → Working Cell Bank (WCB) per ICH Q5D.',
    'Characterize cell banks for identity (STR profiling, isozyme analysis), purity (sterility, mycoplasma, adventitious agents), and genetic stability (passage stability study).',
    productionScale === 'commercial'
      ? 'For commercial manufacturing: demonstrate cell line stability over the intended production cell culture duration + safety margin (e.g., if production is at passage 40, demonstrate stability to passage 60+).'
      : 'For ' + productionScale + ' scale: prioritize rapid clone selection with quality attribute matching as the primary criterion.',
  ];

  const upstreamProcess: string[] = [
    'Process development objective: achieve product quality attributes matching the reference product QTPP.',
    'Cell culture media optimization: use chemically defined media (CDM) to minimize lot-to-lot variability.',
    'Fed-batch strategy: optimize feed timing, volume, and composition to balance productivity with product quality.',
    'Temperature shift strategy: implement mid-culture temperature reduction (e.g., 37C → 33C) to improve product quality (reduced aggregation, improved glycosylation).',
    'pH and dissolved oxygen control: optimize setpoints and control strategies.',
    'Glycosylation tuning: adjust media additives (manganese, galactose, uridine, sodium butyrate) to match reference product glycan profile.',
    'If ADCC is MOA-critical: control afucosylation via FUT8 knockout, kifunensine supplementation, or 2-fluorofucose addition.',
    'Scale-up considerations: characterize scale-dependent parameters (kLa, mixing time, CO2 stripping) for successful transfer to production scale.',
    'Process analytical technology (PAT): implement real-time monitoring (Raman, NIR, capacitance) for cell culture control.',
  ];

  const downstreamProcess: string[] = [
    'Protein A chromatography (Capture): Industry standard for mAb/Fc-fusion purification. Optimize binding capacity, wash conditions, and elution pH.',
    'Low pH viral inactivation: Hold at pH 3.3-3.7 for >= 60 minutes. Validate inactivation of relevant model viruses per ICH Q5A.',
    'Ion exchange chromatography (Polish 1): CEX or AEX to remove charge variants, HCP, DNA, and leached Protein A.',
    'Hydrophobic interaction or mixed-mode chromatography (Polish 2): Additional polishing for aggregate removal and purity.',
    'Viral filtration: Nanofiltration (20nm Planova or Viresolve Pro) for parvovirus-class clearance.',
    'UF/DF (Ultrafiltration/Diafiltration): Concentrate and buffer-exchange into formulation buffer. Control protein concentration and buffer composition.',
    'Process validation: demonstrate consistent clearance of HCP (< 100 ppm), DNA (< 10 pg/dose), Protein A (< 10 ng/mg), and viruses (>= 4 log10 reduction per orthogonal step).',
    analyticalCapability === 'advanced'
      ? 'Advanced: Implement continuous chromatography (multi-column periodic counter-current) for improved productivity and reduced buffer consumption.'
      : 'Standard: Batch chromatography with well-characterized design space per QbD principles.',
  ];

  const formulation: string[] = [
    'Target: Match the reference product formulation as closely as possible (same buffer, pH, surfactant, tonicity agent, concentration).',
    'Buffer selection: Identify reference product buffer (histidine, phosphate, citrate, acetate) by analytical methods (IC, NMR).',
    'Surfactant matching: Polysorbate 80 or Polysorbate 20 — identify and match the type and concentration (typically 0.01-0.1% w/v).',
    'Tonicity agent: NaCl, mannitol, sucrose, trehalose — identify by osmolality measurement and HPLC/IC.',
    'pH matching: Match within +/- 0.2 pH units of the reference product.',
    'Protein concentration matching: Match within +/- 10% of the reference product labeled concentration.',
    'Stability assessment: Conduct accelerated and real-time stability studies to demonstrate comparable shelf life.',
    'If formulation differs from reference: provide scientific justification that differences do not affect product quality, safety, or efficacy.',
    'Note: Citrate-free formulations for subcutaneous products (e.g., adalimumab) are acceptable even if the reference product contains citrate — reduced injection-site pain is a patient benefit.',
  ];

  // ── Formulation matching ──
  const formulationMatchingStrategy: string[] = [
    'Preferred approach: Match all excipients qualitatively AND quantitatively to the reference product.',
    'Analytical reverse-engineering: Use LC, IC, GC, NMR, DSC, osmolality, pH measurement to identify and quantify excipients.',
    'Acceptable differences: Different excipient composition is acceptable WITH scientific justification (FDA Quality Guidance 2015).',
    'Common acceptable changes: citrate-free formulation (reduced pain), different surfactant concentration (within functional range), different tonicity agent (if iso-osmolar).',
    'Stability comparison: Different formulation must demonstrate comparable stability profile to the reference product.',
    'Forced degradation: Different formulation should show similar degradation pathways under stress conditions.',
    'Container-closure compatibility: Excipient-container interactions (e.g., polysorbate degradation from silicone oil in PFS) must be evaluated.',
  ];

  // ── Container closure ──
  const containerClosureConsiderations: string[] = [
    'Same presentation as reference (vial, PFS, autoinjector) is preferred but not required.',
    'If different presentation (e.g., vial instead of PFS): additional extractables/leachables and stability studies required.',
    'PFS considerations: syringe barrel material (glass Type I vs. COP), needle gauge, needle shield (rubber type), silicone oil level, break-loose and glide forces.',
    'Autoinjector: If reference product has an autoinjector presentation, biosimilar autoinjector must deliver the same dose reliably. Device design freedom exists.',
    'For interchangeability: device should be user-friendly and not present significant barriers to switching (different injection technique, etc.).',
    'Extractables and leachables: Study per USP <1663> / <1664>. Leachable levels must be below safety thresholds (PDE/ADE calculations).',
    'Combination product regulatory: If device is integral (PFS, autoinjector), FDA CDER/CBER and CDRH co-review applies.',
  ];

  // ── Specification setting ──
  const specificationSetting: string[] = [
    'Specifications should be set RELATIVE TO the reference product quality range, not in isolation.',
    'For CQAs assessed at Tier 1: specification limits should be within or tighter than the reference product quality range.',
    'For CQAs assessed at Tier 2: specification limits should encompass the reference product quality range.',
    'Assay methods should be qualified and validated per ICH Q2(R2) for the specific biosimilar product.',
    'Release specifications must include: identity, purity, potency, quantity, and safety tests (sterility, endotoxin, particulates).',
    'Stability specifications: tighten or maintain release limits as appropriate for shelf-life-limiting attributes.',
    'Process-related impurity specifications (HCP, DNA, Protein A): set based on process capability and safety assessment, not reference product.',
    'Product-related substance/impurity specifications (charge variants, size variants, glycosylation): align with reference product ranges.',
    'Reference standard qualification: establish in-house primary and working reference standards calibrated against the reference product.',
  ];

  // ── Manufacturing comparability ──
  const manufacturingComparability: string[] = [
    'Intra-lot and inter-lot consistency must be demonstrated (typically >= 3 consecutive commercial-scale batches).',
    'Process validation per ICH Q7 / FDA Process Validation Guidance (2011) — Stage 1 (design), Stage 2 (qualification), Stage 3 (continued verification).',
    'Analytical comparability exercise: compare product quality attributes across process changes, scale-up stages, and site transfers using the Tier 1/2/3 statistical framework.',
    'Stability comparability: demonstrate comparable stability profiles across manufacturing changes.',
    'If process changes occur post-approval: ICH Q5E comparability protocol required with pre/post-change analytical, stability, and potentially clinical bridging.',
    'Production cell culture duration (bioreactor): validate product quality consistency across the entire production window (e.g., Day 10-16 harvest window).',
    'Shipping and transportation validation: demonstrate product quality is maintained during distribution.',
  ];

  // ── QTPP ──
  const qualityTargetProductProfile: string[] = [
    'QTPP Element 1: Dosage form and route of administration — match the reference product presentation.',
    'QTPP Element 2: Protein concentration and dose — match the reference product labeled strength.',
    'QTPP Element 3: Purity profile — monomer purity, aggregate level, fragment level aligned with reference.',
    'QTPP Element 4: Charge variant profile — acidic, main peak, and basic species within reference range.',
    'QTPP Element 5: Glycosylation profile — N-glycan distribution, afucosylation, galactosylation, sialylation, high mannose within reference range.',
    'QTPP Element 6: Biological activity — potency (relative to reference standard), target binding, Fc receptor binding panel, effector functions.',
    'QTPP Element 7: Product-related impurities — deamidation, oxidation, clipping within reference range.',
    'QTPP Element 8: Process-related impurities — HCP, DNA, Protein A below safety limits and consistent with process capability.',
    'QTPP Element 9: Sterility, endotoxin, particulates — compendial limits per USP/Ph.Eur.',
    'QTPP Element 10: Stability profile — shelf life and storage conditions comparable to or better than reference.',
    'QTPP Element 11: Container closure integrity — maintain sterility and product quality throughout shelf life.',
    'QTPP Element 12: Extractables/leachables — below safety thresholds per ICH Q3D/Q3E and toxicological assessment.',
  ];

  return {
    referenceProduct,
    reverseEngineeringStrategy,
    expressionSystemGuidance: expressionGuidance,
    processDevelopmentApproach: {
      cellLineDevelopment,
      upstreamProcess,
      downstreamProcess,
      formulation,
    },
    formulationMatchingStrategy,
    containerClosureConsiderations,
    specificationSetting,
    manufacturingComparability,
    qualityTargetProductProfile,
    regulatoryCitations: [
      'FDA Guidance: Quality Considerations in Demonstrating Biosimilarity of a Therapeutic Protein Product to a Reference Product (2015)',
      'FDA Guidance: Development of Therapeutic Protein Biosimilars — Comparative Analytical Assessment and Other Quality-Related Considerations (2019)',
      'ICH Q5E — Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process',
      'ICH Q5A(R2) — Quality of Biotechnological Products: Viral Safety Evaluation',
      'ICH Q5B — Analysis of the Expression Construct in Cells Used for Production of r-DNA Derived Protein Products',
      'ICH Q5D — Derivation and Characterisation of Cell Substrates Used for Production of Biotechnological/Biological Products',
      'ICH Q6B — Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products',
      'ICH Q8(R2) — Pharmaceutical Development (QbD)',
      'ICH Q11 — Development and Manufacture of Drug Substances',
      'FDA Guidance: Process Validation: General Principles and Practices (2011)',
      'EMA/CHMP/BWP/247713/2012 — Quality of Biosimilar Products',
    ],
  };
}
