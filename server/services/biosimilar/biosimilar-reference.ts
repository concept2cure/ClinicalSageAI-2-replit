/**
 * Biosimilar Development Intelligence — reference tables
 * =======================================================
 *
 * The CQA registry (with its categories), the approved-biosimilar clinical
 * precedents, the endpoint selection guidance and the expression-system
 * registry of the biosimilar knowledge engine. They moved here unchanged from
 * `biosimilar-knowledge.ts` on 2026-11-09 (Rule 2 S5d), which takes the engine
 * from over the repository's 100,000-byte ceiling to under it. The engine
 * imports them; their types stay in the engine.
 *
 * @module server/services/biosimilar/biosimilar-reference
 */

import type {
  BiosimilarProductType, ExpressionSystem, ExpressionSystemGuidance, TierClassification,
} from './biosimilar-knowledge';

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
export const CQA_REGISTRY: Record<BiosimilarProductType, Array<{
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

/** Approved biosimilar precedents with clinical designs used. */
export const BIOSIMILAR_CLINICAL_PRECEDENTS: Array<{
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
export const ENDPOINT_SELECTION_GUIDANCE: Record<string, {
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

/** Expression system guidance database. */
export const EXPRESSION_SYSTEM_REGISTRY: Record<ExpressionSystem, ExpressionSystemGuidance> = {
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
