/**
 * Product class → CMC requirements, quality standards, and regulatory expectations.
 * @module shared/constants/domain/mappings/product-class-requirements
 */

export type ProductClassKey =
  | 'small_molecule' | 'biologic' | 'biosimilar' | 'vaccine'
  | 'gene_therapy' | 'cell_therapy' | 'adc'
  | 'peptide' | 'oligonucleotide' | 'generic';

export interface CmcRequirementSet {
  productClass: ProductClassKey;
  label: string;
  /** ICH/regulatory guidelines that govern CMC for this class. */
  primaryGuidelines: string[];
  /** Required CMC study types. */
  requiredStudies: string[];
  /** Additional characterization studies expected by regulators. */
  characterizationStudies: string[];
  /** Key quality attributes regulators focus on. */
  criticalQualityAttributes: string[];
  /** Common regulatory deficiency areas (from FDA CRL analysis). */
  commonDeficiencies: string[];
}

export const PRODUCT_CLASS_REQUIREMENTS: CmcRequirementSet[] = [
  {
    productClass: 'small_molecule',
    label: 'Small Molecule (NME)',
    primaryGuidelines: ['ICH Q1A-F (Stability)', 'ICH Q2(R2) (Analytical Validation)', 'ICH Q3A-D (Impurities)', 'ICH Q6A (Specifications)', 'ICH Q7 (GMP for APIs)', 'ICH Q8(R2) (Pharmaceutical Development)', 'ICH Q11 (Drug Substance)', 'ICH M7(R2) (Mutagenic Impurities)'],
    requiredStudies: ['Forced degradation', 'Stability (ICH conditions)', 'Impurity profiling', 'Polymorphism screening', 'Residual solvents (Q3C)', 'Elemental impurities (Q3D)', 'Mutagenic impurity assessment (M7)', 'Process validation', 'Analytical method validation'],
    characterizationStudies: ['Salt/polymorph selection', 'Particle size distribution', 'Solubility profile', 'pKa determination', 'LogP/LogD', 'Hygroscopicity'],
    criticalQualityAttributes: ['Assay/purity', 'Related substances', 'Residual solvents', 'Water content', 'Polymorphic form', 'Particle size', 'Dissolution'],
    commonDeficiencies: ['Incomplete impurity qualification', 'Missing M7 assessment', 'Inadequate method validation', 'Insufficient stability data at commercial scale', 'Missing container closure extractables/leachables'],
  },
  {
    productClass: 'biologic',
    label: 'Biologic (mAb, Recombinant Protein)',
    primaryGuidelines: ['ICH Q5A (Viral Safety)', 'ICH Q5B (Expression Construct)', 'ICH Q5C (Stability of Biologics)', 'ICH Q5D (Cell Substrates)', 'ICH Q5E (Comparability)', 'ICH Q6B (Specifications for Biologics)', 'ICH Q8(R2)', 'ICH Q11'],
    requiredStudies: ['Cell bank characterization (MCB/WCB)', 'Viral clearance validation', 'Adventitious agent testing', 'Process characterization', 'Glycan analysis', 'Charge variant analysis', 'Aggregation assessment', 'Potency assay development', 'Forced degradation', 'Photostability', 'Stability under ICH conditions', 'Extractables/leachables', 'Container closure integrity'],
    characterizationStudies: ['Higher-order structure (HDX-MS, NMR)', 'Disulfide bond mapping', 'Post-translational modifications', 'Host cell protein analysis', 'Residual DNA', 'Fc receptor binding', 'FcRn binding'],
    criticalQualityAttributes: ['Potency', 'Purity (SEC, CE-SDS)', 'Charge variants (IEF/cIEF)', 'Glycosylation profile', 'Aggregation', 'Subvisible particles', 'Endotoxin', 'Sterility', 'HCP', 'Residual DNA'],
    commonDeficiencies: ['Insufficient comparability data after process changes', 'Incomplete viral clearance validation', 'Inadequate potency assay qualification', 'Missing glycan characterization', 'Container closure compatibility gaps'],
  },
  {
    productClass: 'biosimilar',
    label: 'Biosimilar',
    primaryGuidelines: ['FDA Biosimilarity Guidance (2015)', 'ICH Q5E (Comparability)', 'WHO Biosimilar Guidelines', 'EMA Biosimilar Overarching Guideline'],
    requiredStudies: ['Analytical similarity assessment (tier 1-3)', 'Functional similarity', 'PK similarity (human)', 'PK/PD equivalence', 'Clinical immunogenicity comparison', 'Switching study (if interchangeability)'],
    characterizationStudies: ['Orthogonal analytical methods (30+ per FDA)', 'Forced degradation comparison', 'Receptor binding kinetics', 'ADCC/CDC activity', 'Fc effector function'],
    criticalQualityAttributes: ['Fingerprint-like similarity in primary structure', 'Glycan pattern equivalence', 'Potency equivalence', 'Charge variant similarity', 'Aggregation profile match'],
    commonDeficiencies: ['Insufficient analytical similarity characterization', 'Inadequate justification for residual differences', 'Missing immunogenicity comparison', 'Switching study design deficiencies'],
  },
  {
    productClass: 'vaccine',
    label: 'Vaccine',
    primaryGuidelines: ['21 CFR 610 (General Biological Products Standards)', 'ICH Q5A', 'ICH Q5C', 'WHO TRS Annex (Vaccine-specific)', 'FDA Guidance on Clinical Considerations for Vaccines'],
    requiredStudies: ['Potency assay development', 'Identity testing', 'Adjuvant characterization', 'Antigen quantification', 'Stability program', 'Adventitious agent testing', 'Sterility/endotoxin', 'Preservative content (if multi-dose)'],
    characterizationStudies: ['Antigen structure/conformation', 'Adjuvant-antigen interaction', 'Immunogenicity in animal models', 'Lot-to-lot consistency'],
    criticalQualityAttributes: ['Potency', 'Identity', 'Purity', 'Sterility', 'Endotoxin', 'Adjuvant content', 'Preservative content', 'pH', 'Osmolality'],
    commonDeficiencies: ['Potency assay variability', 'Insufficient lot consistency data', 'Incomplete adjuvant characterization'],
  },
  {
    productClass: 'gene_therapy',
    label: 'Gene Therapy (AAV, Lentiviral)',
    primaryGuidelines: ['FDA Chemistry, Manufacturing, and Control Information for Human Gene Therapy INDs (2020)', 'ICH Q5A', 'FDA Long Term Follow-up Guidance (2020)', 'EMA Guideline on Quality of Gene Therapy Products'],
    requiredStudies: ['Vector characterization', 'Potency assay (transgene expression)', 'Identity (transgene sequencing, NGS)', 'Replication-competent virus testing', 'Adventitious agent testing', 'Vector genome titer', 'Empty/full capsid ratio', 'Process-related impurities', 'Stability program'],
    characterizationStudies: ['Capsid identity (mass spec)', 'Genome integrity (NGS)', 'Infectivity ratio', 'Transduction efficiency', 'Biodistribution (preclinical)'],
    criticalQualityAttributes: ['Vector genome titer', 'Potency (transgene expression)', 'Purity (empty capsid ratio)', 'Identity (transgene sequence)', 'Sterility', 'Endotoxin', 'Residual host cell DNA/protein', 'Replication competence'],
    commonDeficiencies: ['Inadequate potency assay for lot release', 'Insufficient empty capsid characterization', 'Missing long-term stability data', 'Incomplete comparability after manufacturing changes'],
  },
  {
    productClass: 'cell_therapy',
    label: 'Cell Therapy (CAR-T, MSC)',
    primaryGuidelines: ['FDA Chemistry, Manufacturing, and Control Information for Human Somatic Cell Therapy INDs (2008)', 'ICH Q5A', 'FDA Considerations for Manufacturing of CAR-T (2022)', 'EMA Guideline on ATMP Quality'],
    requiredStudies: ['Cell identity and purity testing', 'Potency assay', 'Viability testing', 'Sterility (rapid methods)', 'Mycoplasma testing', 'Endotoxin', 'Adventitious agent testing', 'Residual reagent testing (beads, cytokines)', 'Stability (shelf-life)'],
    characterizationStudies: ['T-cell subset analysis (CAR-T)', 'Transduction efficiency', 'Vector copy number', 'Replication-competent lentivirus', 'Exhaustion markers', 'Cytokine release profile'],
    criticalQualityAttributes: ['Cell viability', 'Cell dose', 'Identity (CD3+, CAR+)', 'Potency', 'Purity (non-target cells)', 'Sterility', 'Endotoxin', 'Mycoplasma', 'Residual beads'],
    commonDeficiencies: ['Potency assay not bridged to clinical outcome', 'Insufficient starting material qualification', 'Short shelf-life without adequate justification', 'Missing comparability for manufacturing changes'],
  },
  {
    productClass: 'adc',
    label: 'Antibody-Drug Conjugate (ADC)',
    primaryGuidelines: ['ICH Q6B', 'ICH Q5A', 'ICH Q5E', 'ICH M7(R2) (for payload)', 'FDA ADC Guidance (development)'],
    requiredStudies: ['DAR analysis', 'Conjugation site characterization', 'Free drug/linker quantification', 'Potency (cytotoxicity)', 'Aggregation', 'Stability', 'Viral clearance', 'Unconjugated antibody quantification'],
    characterizationStudies: ['Drug distribution (DAR profile)', 'Linker stability in plasma', 'Bystander killing assessment', 'PK of conjugated vs free payload'],
    criticalQualityAttributes: ['Drug-antibody ratio (DAR)', 'Potency', 'Purity (unconjugated Ab, free drug)', 'Aggregation', 'Charge variants', 'Glycosylation', 'Endotoxin', 'Sterility'],
    commonDeficiencies: ['Incomplete DAR characterization', 'Missing free drug specification', 'Insufficient linker stability data', 'Inadequate comparability after conjugation process changes'],
  },
  {
    productClass: 'peptide',
    label: 'Peptide Therapeutic',
    primaryGuidelines: ['ICH Q6A/Q6B (depends on MW)', 'ICH Q3A-D (synthetic peptides)', 'ICH Q1A-F', 'ICH Q11'],
    requiredStudies: ['Amino acid analysis', 'Sequence confirmation (MS/MS)', 'Disulfide bond mapping', 'Impurity profiling', 'Stability program', 'Method validation'],
    characterizationStudies: ['Counter-ion identification', 'Conformational analysis (CD, NMR)', 'Aggregation propensity', 'Fibrillation assessment'],
    criticalQualityAttributes: ['Identity (sequence)', 'Purity', 'Related substances', 'Residual solvents', 'Counter-ion content', 'Water content', 'Sterility (if injectable)'],
    commonDeficiencies: ['Inadequate control of synthetic impurities', 'Missing aggregation data', 'Insufficient stability at proposed storage conditions'],
  },
  {
    productClass: 'oligonucleotide',
    label: 'Oligonucleotide (ASO, siRNA, mRNA)',
    primaryGuidelines: ['FDA Guidance on Chemistry of Oligonucleotide Products', 'ICH Q6A/Q6B', 'ICH Q3A-D adapted', 'ICH Q5C (for mRNA)'],
    requiredStudies: ['Full-length product quantification', 'Sequence identity (MS, sequencing)', 'Truncated/deletion sequence impurities', 'Phosphorothioate content (ASO)', 'Lipid nanoparticle characterization (mRNA)', 'Encapsulation efficiency (mRNA)', 'Cap structure analysis (mRNA)', 'Stability program', 'Sterility/endotoxin'],
    characterizationStudies: ['Modification site confirmation', 'Secondary structure analysis', 'Complement activation (ASO)', 'Particle size (LNP)'],
    criticalQualityAttributes: ['Identity (sequence)', 'Purity (full-length)', 'Related substances (n-1, etc.)', 'Endotoxin', 'Sterility', 'dsRNA content (mRNA)', 'Particle size (LNP)', 'Encapsulation efficiency'],
    commonDeficiencies: ['Insufficient impurity characterization for modified nucleotides', 'Missing LNP stability data', 'Inadequate dsRNA control strategy (mRNA)'],
  },
  {
    productClass: 'generic',
    label: 'Generic Drug (ANDA)',
    primaryGuidelines: ['21 CFR 320 (Bioequivalence)', 'FDA ANDA Guidance', 'ICH Q6A', 'FDA Product-Specific Guidances (PSGs)'],
    requiredStudies: ['Bioequivalence study (PK)', 'Dissolution profile comparison (f2)', 'Impurity profiling', 'Stability program', 'Method validation'],
    characterizationStudies: ['Polymorphic form comparison', 'Excipient compatibility', 'Dissolution in multiple media'],
    criticalQualityAttributes: ['Assay', 'Dissolution', 'Related substances', 'Content uniformity', 'Polymorphic form'],
    commonDeficiencies: ['BE study design deficiencies', 'Incomplete dissolution method development', 'Missing product-specific guidance compliance'],
  },
];

export function getRequirements(productClass: ProductClassKey): CmcRequirementSet | undefined {
  return PRODUCT_CLASS_REQUIREMENTS.find(r => r.productClass === productClass);
}
