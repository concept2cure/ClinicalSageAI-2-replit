/**
 * Advanced Therapy Medicinal Product (ATMP) / Cell & Gene Therapy (CGT)
 * Knowledge Base Service
 *
 * Deterministic, encyclopaedic knowledge engine covering ATMP classification,
 * gene therapy regulatory requirements, cell therapy manufacturing, CAR-T
 * specifics, tissue engineering, and regulatory pathway selection across FDA,
 * EMA, PMDA, and Health Canada jurisdictions.
 *
 * NO LLM calls.  NO network calls.  Every function is a pure, deterministic
 * lookup/computation over the in-code knowledge corpus.  Identical input
 * always yields identical output.
 *
 * Key regulatory references embedded:
 *   - EU Regulation (EC) No 1394/2007 (ATMP Regulation)
 *   - EU Directive 2001/83/EC (medicinal products), as amended
 *   - EU GMP Annex 2A (Manufacture of biological medicinal products for human use)
 *   - EU GMP Part IV (ATMP-specific GMP, EudraLex Vol. 4 Part IV)
 *   - FDA 21 CFR Part 1271 (HCT/Ps)
 *   - FDA 21 CFR Parts 210, 211, 600, 610 (cGMP for biologics)
 *   - FDA Guidance: Chemistry, Manufacturing, and Controls (CMC) Information
 *     for Human Gene Therapy Investigational New Drug Applications (INDs) (2020)
 *   - FDA Guidance: Long Term Follow-Up After Administration of a Gene Therapy
 *     Product (2020) — 15 yr integrating / 5 yr non-integrating
 *   - FDA Guidance: Human Gene Therapy for Retinal Disorders (2020)
 *   - FDA Guidance: Human Gene Therapy for Hemophilia (2020)
 *   - FDA Guidance: Human Gene Therapy for Rare Diseases (2020)
 *   - FDA Guidance: Testing of Retroviral Vector-Based Human Gene Therapy
 *     Products for Replication Competent Retrovirus (RCR/RCL) (2020)
 *   - FDA Guidance: Considerations for the Design of Early-Phase Clinical
 *     Trials of Cellular and Gene Therapy Products (2015)
 *   - EMA Guideline on quality, non-clinical and clinical aspects of gene
 *     therapy medicinal products (EMA/CAT/80183/2014)
 *   - EMA Guideline on quality, non-clinical and clinical requirements for
 *     investigational ATMPs (EMEA/CHMP/GTWP/671639/2008 Rev. 1)
 *   - ICH Q5E Comparability of Biotechnological/Biological Products Subject
 *     to Changes in Their Manufacturing Process
 *   - ICH Q5A(R2) Viral Safety Evaluation of Biotechnology Products
 *   - ICH Q5D Derivation and Characterisation of Cell Substrates
 *   - Japan PMDA Act on the Safety of Regenerative Medicine (Act No. 85, 2013)
 *   - Japan PMD Act — conditional/time-limited approval pathway
 *
 * @module server/services/advanced-therapy/atmp-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums & Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export type ATMPCategory =
  | 'gene_therapy'
  | 'somatic_cell_therapy'
  | 'tissue_engineered'
  | 'combined_atmp';

export type FDACategory =
  | 'gene_therapy_cber'
  | 'cellular_therapy_cber'
  | 'hctp_361'
  | 'hctp_351'
  | 'combination_product';

export type Jurisdiction = 'us' | 'eu' | 'japan' | 'canada' | 'uk';

export type VectorType =
  | 'aav'
  | 'lentiviral'
  | 'retroviral_gamma'
  | 'adenoviral'
  | 'hsv'
  | 'non_viral_lipid_nanoparticle'
  | 'non_viral_polymer'
  | 'non_viral_naked_plasmid'
  | 'mrna'
  | 'crispr_rnp'
  | 'transposon';

export type ManufacturingChangeType =
  | 'process_change'
  | 'scale_up'
  | 'site_transfer'
  | 'raw_material_change'
  | 'equipment_change'
  | 'formulation_change';

export type ExpeditedProgram =
  | 'fda_breakthrough_therapy'
  | 'fda_rmat'
  | 'fda_fast_track'
  | 'fda_accelerated_approval'
  | 'fda_priority_review'
  | 'ema_prime'
  | 'ema_accelerated_assessment'
  | 'ema_conditional_marketing_authorisation'
  | 'ema_exceptional_circumstances'
  | 'pmda_sakigake'
  | 'pmda_conditional_time_limited'
  | 'hc_priority_review'
  | 'hc_noi_pathway';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'very_high';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ATMP CLASSIFICATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassifyATMPParams {
  /** What the product does at the cellular/genetic level. */
  productType: 'gene_transfer' | 'gene_editing' | 'cell_based' | 'tissue_based' | 'combined';
  /** Does the product contain or consist of cells or tissues? */
  containsCellsOrTissues: boolean;
  /** Are the cells/tissues substantially manipulated (EU) / more than minimally manipulated (US)? */
  substantiallyManipulated: boolean;
  /** Is the product intended for homologous use? (US 21 CFR 1271 criterion) */
  homologousUse?: boolean;
  /** Does the product contain a medical device as an integral part? */
  containsDeviceComponent: boolean;
  /** Autologous vs allogeneic vs gene-modified. */
  cellOrigin?: 'autologous' | 'allogeneic' | 'xenogeneic';
  /** Does the product involve genetic modification of cells? */
  geneticModification: boolean;
  /** Target jurisdictions for classification. */
  jurisdictions: Jurisdiction[];
}

export interface ClassificationResult {
  euClassification: {
    category: ATMPCategory | null;
    rationale: string;
    catOpinionRequired: boolean;
    centralizedProcedureMandatory: boolean;
    regulatoryBasis: string;
  } | null;
  usClassification: {
    category: FDACategory;
    rationale: string;
    regulatoryBasis: string;
    cfrReference: string;
    reviewDivision: string;
  } | null;
  japanClassification: {
    category: string;
    pathway: string;
    rationale: string;
  } | null;
  pathwayImplications: string[];
  warnings: string[];
}

/**
 * Classify a product under EU ATMP Regulation 1394/2007, FDA CBER/CDRH
 * frameworks, and optionally PMDA regenerative medicine categories.
 *
 * Decision logic mirrors the CAT classification flowchart and FDA's
 * 21 CFR 1271.10(a) four-criteria test for HCT/Ps.
 */
export function classifyATMP(params: ClassifyATMPParams): ClassificationResult {
  const warnings: string[] = [];
  const pathwayImplications: string[] = [];

  // ── EU Classification (Regulation 1394/2007 Art 2) ─────────────────────
  let euClassification: ClassificationResult['euClassification'] = null;
  if (params.jurisdictions.includes('eu')) {
    let category: ATMPCategory | null = null;
    let rationale = '';
    let regulatoryBasis = '';

    if (params.productType === 'gene_transfer' || params.productType === 'gene_editing') {
      category = 'gene_therapy';
      rationale =
        'Product contains/consists of a recombinant nucleic acid or uses gene-editing ' +
        'technology administered to human subjects with a view to regulating, repairing, ' +
        'replacing, adding or deleting a genetic sequence. Meets definition under ' +
        'Directive 2001/83/EC Annex I Part IV as amended by Regulation 1394/2007 Art 2(1)(a).';
      regulatoryBasis = 'Regulation (EC) No 1394/2007 Art 2(1)(a); Directive 2001/83/EC Annex I Part IV';
    } else if (params.productType === 'cell_based' && params.geneticModification) {
      category = 'gene_therapy';
      rationale =
        'Product consists of cells that have been subject to genetic modification. ' +
        'Gene-modified cells fall under the gene therapy medicinal product definition ' +
        'per Regulation 1394/2007 Art 2(1)(a) when the genetic modification is the ' +
        'principal mode of action.';
      regulatoryBasis = 'Regulation (EC) No 1394/2007 Art 2(1)(a)';
      pathwayImplications.push(
        'CAT will assess whether the principal mechanism of action is the genetic ' +
        'modification itself or the cellular component — this determines GTMP vs SCTMP classification.'
      );
    } else if (params.productType === 'cell_based' && params.substantiallyManipulated) {
      category = 'somatic_cell_therapy';
      rationale =
        'Product contains or consists of cells or tissues that have been subject to ' +
        'substantial manipulation (not listed in Annex I to Regulation 1394/2007) so ' +
        'that biological characteristics, physiological functions or structural properties ' +
        'relevant for the intended clinical use have been altered, OR the cells/tissues are ' +
        'not intended to be used for the same essential function(s) in the recipient as in ' +
        'the donor (non-homologous use). Meets SCTMP definition per Art 2(1)(b).';
      regulatoryBasis = 'Regulation (EC) No 1394/2007 Art 2(1)(b)';
    } else if (params.productType === 'tissue_based') {
      if (params.substantiallyManipulated) {
        category = 'tissue_engineered';
        rationale =
          'Product contains or consists of engineered cells or tissues, and is presented as ' +
          'having properties for, or is used in or administered to, human beings with a view to ' +
          'regenerating, repairing or replacing a human tissue. The cells/tissues have been subject ' +
          'to substantial manipulation. Meets TEP definition per Regulation 1394/2007 Art 2(1)(b).';
        regulatoryBasis = 'Regulation (EC) No 1394/2007 Art 2(1)(b)';
      } else {
        category = null;
        rationale =
          'Tissue-based product without substantial manipulation may fall outside ATMP scope. ' +
          'May be regulated under the Tissues and Cells Directives (2004/23/EC) instead.';
        regulatoryBasis = 'Directive 2004/23/EC (Tissues and Cells)';
        warnings.push(
          'Product may not qualify as an ATMP. Consider whether it falls under the Tissues ' +
          'and Cells Directives (2004/23/EC, 2006/17/EC, 2006/86/EC) instead. A formal CAT ' +
          'classification recommendation may be advisable.'
        );
      }
    } else if (params.productType === 'combined' || params.containsDeviceComponent) {
      category = 'combined_atmp';
      rationale =
        'Product incorporates, as an integral part, one or more medical devices within the ' +
        'meaning of Directive 93/42/EEC (now Regulation (EU) 2017/745 MDR) and its cellular ' +
        'or tissue part must contain viable cells or tissues, OR the cellular/tissue part must ' +
        'contain non-viable cells/tissues that are liable to act on the human body with action ' +
        'that can be considered as primary to that of the device. Meets combined ATMP definition ' +
        'per Regulation 1394/2007 Art 2(1)(d).';
      regulatoryBasis = 'Regulation (EC) No 1394/2007 Art 2(1)(d); Regulation (EU) 2017/745 (MDR)';
    } else if (params.productType === 'cell_based' && !params.substantiallyManipulated) {
      category = null;
      rationale =
        'Cell-based product without substantial manipulation and intended for homologous ' +
        'use may fall outside ATMP scope under EU regulation. May be regulated under the ' +
        'Tissues and Cells Directives.';
      regulatoryBasis = 'Directive 2004/23/EC';
      warnings.push(
        'Product may not meet ATMP criteria. Formal CAT classification recommendation advised.'
      );
    }

    euClassification = {
      category,
      rationale,
      catOpinionRequired: category !== null,
      centralizedProcedureMandatory: category !== null,
      regulatoryBasis,
    };

    if (category !== null) {
      pathwayImplications.push(
        'EU: Centralized procedure via EMA is mandatory for all ATMPs (Regulation 1394/2007 Art 14). ' +
        'The Committee for Advanced Therapies (CAT) provides a draft assessment report ' +
        'before CHMP adopts the final opinion.'
      );
      pathwayImplications.push(
        'Sponsors may request a CAT classification recommendation (Article 17) before ' +
        'filing — non-binding but strongly recommended to avoid classification disputes.'
      );
    }
  }

  // ── US Classification (21 CFR 1271 / BLA under CBER) ───────────────────
  let usClassification: ClassificationResult['usClassification'] = null;
  if (params.jurisdictions.includes('us')) {
    let category: FDACategory;
    let rationale: string;
    let cfrReference: string;
    let reviewDivision: string;

    if (params.productType === 'gene_transfer' || params.productType === 'gene_editing' || params.geneticModification) {
      category = 'gene_therapy_cber';
      rationale =
        'Product involves introduction of genetic material (recombinant DNA, RNA, gene editing ' +
        'components) into human cells. Regulated as a biological product under PHS Act Section 351, ' +
        'requiring a BLA. Reviewed by CBER Office of Therapeutic Products (OTP, formerly OTAT). ' +
        'Gene therapy products are NOT eligible for the 21 CFR 1271 HCT/P exemption because genetic ' +
        'modification exceeds minimal manipulation.';
      cfrReference = 'PHS Act 351(a); 21 CFR Parts 600, 610, 211; FDA Gene Therapy Guidance (2020)';
      reviewDivision = 'CBER — Office of Therapeutic Products (OTP)';
    } else if (params.productType === 'cell_based') {
      // Apply FDA 21 CFR 1271.10(a) four-criteria test
      const meetsAllFour =
        !params.substantiallyManipulated &&    // Criterion 2: minimal manipulation
        (params.homologousUse ?? false) &&      // Criterion 3: homologous use
        params.cellOrigin !== 'xenogeneic';     // Must be human cells/tissues

      if (meetsAllFour) {
        category = 'hctp_361';
        rationale =
          'Product meets all four criteria of 21 CFR 1271.10(a) for regulation solely under ' +
          'Section 361 of the PHS Act and 21 CFR Part 1271: (1) minimally manipulated, ' +
          '(2) intended for homologous use, (3) not combined with another article (except ' +
          'water, crystalloids, sterilizing/preserving/storage agents), and (4) either has no ' +
          'systemic effect / is not dependent on metabolic activity of living cells OR is for ' +
          'autologous/first/second-degree blood relative/reproductive use. Section 361 HCT/Ps ' +
          'require establishment registration and listing but do NOT require BLA or IND.';
        cfrReference = '21 CFR 1271.10(a); PHS Act Section 361';
        reviewDivision = 'CBER — Office of Tissues and Advanced Therapies (registration only)';
      } else {
        category = 'hctp_351';
        rationale =
          'Cell-based product does NOT meet all four criteria of 21 CFR 1271.10(a). ' +
          (params.substantiallyManipulated
            ? 'Cells are more than minimally manipulated (fails Criterion 2). '
            : '') +
          (!(params.homologousUse ?? true)
            ? 'Product is intended for non-homologous use (fails Criterion 3). '
            : '') +
          'Regulated as a biological product under PHS Act Section 351, requiring a BLA ' +
          '(or IND for clinical trials). Must comply with 21 CFR Parts 210, 211, and 600/610.';
        cfrReference = 'PHS Act 351(a); 21 CFR Parts 600, 610, 211, 1271';
        reviewDivision = 'CBER — Office of Therapeutic Products (OTP)';
      }
    } else if (params.productType === 'tissue_based') {
      const meetsMinimalManipulation = !params.substantiallyManipulated;
      const meetsHomologous = params.homologousUse ?? false;

      if (meetsMinimalManipulation && meetsHomologous) {
        category = 'hctp_361';
        rationale =
          'Tissue-based product meets 21 CFR 1271.10(a) minimal manipulation and homologous ' +
          'use criteria. Regulated solely under Section 361 of the PHS Act as an HCT/P.';
        cfrReference = '21 CFR 1271.10(a); PHS Act Section 361';
        reviewDivision = 'CBER — establishment registration and listing only';
      } else {
        category = 'hctp_351';
        rationale =
          'Tissue-based product fails one or more 21 CFR 1271.10(a) criteria. Requires BLA ' +
          'under PHS Act Section 351 and must meet cGMP (21 CFR 210/211, 600/610).';
        cfrReference = 'PHS Act 351(a); 21 CFR Parts 600, 610, 211, 1271';
        reviewDivision = 'CBER — Office of Therapeutic Products (OTP)';
      }
    } else if (params.containsDeviceComponent) {
      category = 'combination_product';
      rationale =
        'Product consists of a biologic and device component. Classified as a combination ' +
        'product under 21 CFR Part 3. Primary mode of action determines the lead center ' +
        '(CBER if biologic PMOA, CDRH if device PMOA). Requires a Request for Designation ' +
        '(RFD) to FDA Office of Combination Products (OCP).';
      cfrReference = '21 CFR Part 3; FD&C Act 503(g); PHS Act 351';
      reviewDivision = 'OCP designation; typically CBER-lead for ATMP combination products';
    } else {
      category = 'gene_therapy_cber';
      rationale = 'Default classification for advanced therapy products reviewed by CBER.';
      cfrReference = 'PHS Act 351(a); 21 CFR Parts 600, 610';
      reviewDivision = 'CBER — Office of Therapeutic Products (OTP)';
    }

    usClassification = {
      category,
      rationale,
      regulatoryBasis: cfrReference,
      cfrReference,
      reviewDivision,
    };
  }

  // ── Japan Classification ───────────────────────────────────────────────
  let japanClassification: ClassificationResult['japanClassification'] = null;
  if (params.jurisdictions.includes('japan')) {
    let category: string;
    let pathway: string;

    if (params.productType === 'gene_transfer' || params.productType === 'gene_editing' || params.geneticModification) {
      category = 'Regenerative Medicine Product (Gene Therapy)';
      pathway =
        'Regulated under the PMD Act (Pharmaceutical and Medical Devices Act). ' +
        'Eligible for conditional/time-limited approval under Article 23-26 of the PMD Act ' +
        '(7-year conditional approval with post-marketing data collection). ' +
        'May also be eligible for SAKIGAKE designation (priority review for innovative products).';
    } else if (params.productType === 'cell_based' || params.productType === 'tissue_based') {
      category = 'Regenerative Medicine Product (Cell/Tissue-based)';
      pathway =
        'Regulated under the PMD Act. Cell processing must comply with the Act on the Safety ' +
        'of Regenerative Medicine (Act No. 85, 2013) for cell processing facilities. ' +
        'Eligible for conditional/time-limited approval pathway (Art 23-26 PMD Act). ' +
        'Clinical use at medical institutions may additionally require approval under the ' +
        'Regenerative Medicine Safety Act (class I-III risk classification).';
    } else {
      category = 'Regenerative Medicine Product (Combined)';
      pathway = 'PMD Act — combined regenerative medicine product pathway with device component assessment.';
    }

    japanClassification = {
      category,
      pathway,
      rationale:
        'Japan classifies gene therapy and cell-based products as Regenerative Medicine ' +
        'Products under the PMD Act. The unique conditional/time-limited approval pathway ' +
        'allows marketing authorization based on results of a clinical trial that are ' +
        '"likely to predict efficacy" with a mandatory post-marketing study.',
    };
  }

  return { euClassification, usClassification, japanClassification, pathwayImplications, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GENE THERAPY REGULATORY REQUIREMENTS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneTherapyAssessmentParams {
  vectorType: VectorType;
  /** Is the vector integrating into the host genome? */
  integrating: boolean;
  /** Target disease area. */
  indication: string;
  /** In vivo delivery vs ex vivo cell modification. */
  deliveryMode: 'in_vivo' | 'ex_vivo';
  /** Route of administration. */
  routeOfAdministration?: string;
  /** Target jurisdictions. */
  jurisdictions: Jurisdiction[];
  /** Is this a first-in-human study? */
  firstInHuman?: boolean;
  /** Pediatric population included? */
  pediatric?: boolean;
}

interface VectorKnowledge {
  displayName: string;
  integrating: boolean;
  maxPayloadKb: string;
  immunogenicityRisk: RiskLevel;
  insertionalMutagenesisRisk: RiskLevel;
  preExistingImmunity: boolean;
  commonSerotypes?: string[];
  keyManufacturingConsiderations: string[];
  specificGuidance: string[];
  rcr_rcl_testing: string;
}

const VECTOR_KNOWLEDGE: Record<VectorType, VectorKnowledge> = {
  aav: {
    displayName: 'Adeno-Associated Virus (AAV)',
    integrating: false,
    maxPayloadKb: '~4.7 kb (single-stranded); ~2.4 kb (self-complementary)',
    immunogenicityRisk: 'moderate',
    insertionalMutagenesisRisk: 'low',
    preExistingImmunity: true,
    commonSerotypes: ['AAV1', 'AAV2', 'AAV5', 'AAV8', 'AAV9', 'AAVrh10', 'engineered capsids'],
    keyManufacturingConsiderations: [
      'Triple-transfection vs baculovirus/Sf9 vs stable producer cell line production systems',
      'Full/empty capsid ratio — analytical challenge, CQA (target >80% full capsids)',
      'Capsid serotype identity and potency assays must be serotype-specific',
      'High-dose manufacturing at scale (>1E14 vg/kg doses require very large batch sizes)',
      'Residual host cell DNA and protein limits per FDA/EMA guidance',
      'Replication-competent AAV (rcAAV) testing per FDA guidance',
    ],
    specificGuidance: [
      'Pre-existing anti-AAV neutralizing antibodies may exclude patients — screening assays required',
      'Dorsal root ganglia (DRG) toxicity observed in NHP studies for several serotypes — include DRG in nonclinical toxicology',
      'Hepatotoxicity monitoring required, especially for liver-tropic serotypes (AAV8, AAV5)',
      'FDA expects biodistribution study in relevant animal model with qPCR for vector DNA in >10 tissues',
      'Long-term follow-up: 5 years minimum per FDA guidance for non-integrating vectors',
      'Re-dosing challenges due to anti-capsid immune response — address in development plan',
    ],
    rcr_rcl_testing: 'Replication-competent AAV (rcAAV) testing on final product and in-process samples per FDA/EMA guidance',
  },
  lentiviral: {
    displayName: 'Lentiviral Vector (LV)',
    integrating: true,
    maxPayloadKb: '~8-10 kb',
    immunogenicityRisk: 'low',
    insertionalMutagenesisRisk: 'moderate',
    preExistingImmunity: false,
    keyManufacturingConsiderations: [
      'Self-inactivating (SIN) design mandatory — deletion in 3\' LTR U3 region',
      'Replication-competent lentivirus (RCL) testing required per FDA guidance (2020)',
      'Multi-plasmid (3rd or 4th generation) system to minimize recombination risk',
      'Transduction efficiency and vector copy number (VCN) per cell as CQAs',
      'Typically produced by transient transfection of HEK293T cells',
      'Purification must remove residual plasmid DNA and host cell impurities',
    ],
    specificGuidance: [
      'FDA requires RCL testing: co-culture assay on product, end-of-production cells, and patient samples',
      'Integration site analysis (ISA) strongly recommended — LMPCR or similar',
      'Long-term follow-up: 15 years per FDA Guidance (2020) for integrating vectors',
      'Vector copy number (VCN) upper limit to mitigate insertional mutagenesis risk (typically ≤5 copies/cell)',
      'Insertional mutagenesis risk assessment: in vitro immortalization assay (IVIM) or similar',
      'Clonality assessment if feasible to detect oligoclonal expansion',
    ],
    rcr_rcl_testing:
      'Replication-Competent Lentivirus (RCL) testing: cell-based co-culture assay per FDA Guidance for Testing of Retroviral Vector-Based Gene Therapy Products (2020). Test vector lot, end-of-production cells, and patient PBMC samples at 3, 6, 12 months post-treatment, then annually for integrating vectors.',
  },
  retroviral_gamma: {
    displayName: 'Gamma-Retroviral Vector (γRV)',
    integrating: true,
    maxPayloadKb: '~7-8 kb',
    immunogenicityRisk: 'low',
    insertionalMutagenesisRisk: 'high',
    preExistingImmunity: false,
    keyManufacturingConsiderations: [
      'SIN design strongly preferred to reduce insertional mutagenesis risk',
      'Replication-competent retrovirus (RCR) testing — gold standard S+L- focus assay',
      'Stable producer cell lines (e.g., PG13) preferred for consistency',
      'Transduction requires actively dividing target cells',
    ],
    specificGuidance: [
      'Historical insertional mutagenesis events in X-SCID trials (Hacein-Bey-Abina et al., 2003) — FDA/EMA heightened scrutiny',
      'Long-term follow-up: 15 years per FDA guidance for integrating vectors',
      'RCR testing per FDA Guidance for Testing of Retroviral Vector-Based Gene Therapy Products (2020)',
      'Integration site analysis mandatory for all clinical subjects',
      'IVIM assay recommended for genotoxicity assessment',
      'Preference by regulators for lentiviral (SIN) over gamma-retroviral vectors when feasible',
    ],
    rcr_rcl_testing:
      'RCR testing: Extended S+L- focus assay on vector supernatant, end-of-production cells, and patient samples per FDA/EMA guidance. Annual RCR monitoring of patient samples for 15 years.',
  },
  adenoviral: {
    displayName: 'Adenoviral Vector (Ad)',
    integrating: false,
    maxPayloadKb: '~7.5 kb (E1/E3-deleted); ~36 kb (gutless/helper-dependent)',
    immunogenicityRisk: 'high',
    insertionalMutagenesisRisk: 'low',
    preExistingImmunity: true,
    commonSerotypes: ['Ad5', 'Ad26', 'Ad35', 'chimpanzee adenoviruses (ChAd)'],
    keyManufacturingConsiderations: [
      'Replication-competent adenovirus (RCA) testing — limit ≤1 RCA per 3×10^10 VP (FDA)',
      'E1-deleted vectors require complementing cell line (HEK293)',
      'Strong pre-existing immunity to Ad5 in human population (40-90% seroprevalence)',
      'Dose-dependent immune response may limit therapeutic window',
    ],
    specificGuidance: [
      'High immunogenicity is a significant safety concern — Jesse Gelsinger case (1999) remains a landmark',
      'Dose-limiting hepatotoxicity and systemic inflammatory response are key risks',
      'Consider rare serotypes or chimp adenoviruses to mitigate pre-existing immunity',
      'Typically used for vaccination or oncolytic applications rather than gene replacement',
      'Long-term follow-up: 5 years for non-integrating vectors per FDA guidance',
      'Biodistribution study with focus on liver, spleen, lymph nodes',
    ],
    rcr_rcl_testing: 'RCA testing: A549 cell-based assay, limit ≤1 RCA per 3×10^10 VP per FDA guidance',
  },
  hsv: {
    displayName: 'Herpes Simplex Virus (HSV) Vector',
    integrating: false,
    maxPayloadKb: '~30-40 kb (amplicon); ~150 kb (full genome)',
    immunogenicityRisk: 'moderate',
    insertionalMutagenesisRisk: 'low',
    preExistingImmunity: true,
    keyManufacturingConsiderations: [
      'Large payload capacity but complex genome engineering',
      'Replication-competent HSV testing required',
      'Neurotropism can be advantage (neurological targets) or safety concern',
      'Helper virus-free amplicon systems preferred for safety',
    ],
    specificGuidance: [
      'Neurotropism: FDA expects nonclinical assessment of vector spread to CNS/PNS',
      'Latency potential in sensory ganglia — address in risk assessment',
      'Used primarily for oncolytic virotherapy (e.g., T-VEC/Imlygic) and neurological targets',
      'Long-term follow-up: 5 years per FDA guidance for non-integrating vectors',
    ],
    rcr_rcl_testing: 'Replication-competent HSV testing on final product per FDA/EMA guidance',
  },
  non_viral_lipid_nanoparticle: {
    displayName: 'Lipid Nanoparticle (LNP)',
    integrating: false,
    maxPayloadKb: 'Variable (mRNA 1-10 kb; plasmid up to ~15 kb)',
    immunogenicityRisk: 'low',
    insertionalMutagenesisRisk: 'low',
    preExistingImmunity: false,
    keyManufacturingConsiderations: [
      'LNP composition (ionizable lipid, PEGylated lipid, cholesterol, helper lipid) as CQAs',
      'Particle size distribution (DLS/NTA), polydispersity index (PDI)',
      'Encapsulation efficiency (%EE) — critical quality attribute',
      'Anti-PEG antibody potential with repeated dosing',
      'Scalable manufacturing via microfluidic or T-junction mixing',
      'Storage stability (typically -20C or -80C; improving with formulation advances)',
    ],
    specificGuidance: [
      'No vector-specific FDA gene therapy guidance yet — follow general CMC guidance',
      'Biodistribution study required — LNPs typically accumulate in liver',
      'Complement activation-related pseudoallergy (CARPA) risk assessment',
      'Anti-PEG antibodies may reduce efficacy on repeat dosing',
      'Long-term follow-up: 5 years for non-integrating delivery systems',
    ],
    rcr_rcl_testing: 'Not applicable — non-viral delivery system. Assess residual plasmid DNA, host-cell DNA, endotoxin.',
  },
  non_viral_polymer: {
    displayName: 'Polymeric Nanoparticle',
    integrating: false,
    maxPayloadKb: 'Variable',
    immunogenicityRisk: 'low',
    insertionalMutagenesisRisk: 'low',
    preExistingImmunity: false,
    keyManufacturingConsiderations: [
      'Polymer characterization: molecular weight, polydispersity, charge density',
      'Particle size and zeta potential as CQAs',
      'Encapsulation/complexation efficiency',
      'Polymer biocompatibility and degradation products',
    ],
    specificGuidance: [
      'Limited regulatory precedent — follow general CMC and nonclinical guidance',
      'Biodistribution study required',
      'Polymer degradation product toxicity assessment',
      'Long-term follow-up: 5 years for non-integrating delivery systems',
    ],
    rcr_rcl_testing: 'Not applicable — non-viral delivery system.',
  },
  non_viral_naked_plasmid: {
    displayName: 'Naked Plasmid DNA',
    integrating: false,
    maxPayloadKb: 'Up to ~15 kb practical limit',
    immunogenicityRisk: 'low',
    insertionalMutagenesisRisk: 'low',
    preExistingImmunity: false,
    keyManufacturingConsiderations: [
      'Plasmid quality: supercoiled fraction (>80%), kanamycin resistance preferred over ampicillin',
      'Endotoxin levels — stringent limits for injectable products',
      'Residual host-cell DNA and RNA',
      'Scalable fermentation and purification (alkaline lysis, chromatography)',
    ],
    specificGuidance: [
      'Low transfection efficiency in vivo — often requires electroporation or physical delivery',
      'FDA Guidance on Plasmid DNA Vaccines (2007) provides relevant CMC framework',
      'Antibiotic resistance gene selection: avoid beta-lactam (ampicillin) resistance markers',
      'Long-term follow-up: 5 years for non-integrating vectors',
    ],
    rcr_rcl_testing: 'Not applicable — non-viral delivery system.',
  },
  mrna: {
    displayName: 'Messenger RNA (mRNA)',
    integrating: false,
    maxPayloadKb: '~1-10 kb (typical therapeutic mRNAs)',
    immunogenicityRisk: 'low',
    insertionalMutagenesisRisk: 'low',
    preExistingImmunity: false,
    keyManufacturingConsiderations: [
      'In vitro transcription (IVT) from linearized plasmid DNA template',
      'Capping efficiency (Cap1 structure preferred) — critical for translation and immunogenicity',
      'Poly(A) tail length as CQA',
      'Nucleoside modification (e.g., N1-methylpseudouridine) for reduced innate immune activation',
      'dsRNA impurity removal (cellulose/HPLC purification) — dsRNA triggers innate immunity',
      'Integrity assessment by capillary electrophoresis or gel electrophoresis',
      'Typically formulated in LNP — LNP CQAs apply (see LNP entry)',
    ],
    specificGuidance: [
      'Rapid regulatory development post-COVID-19 vaccines — FDA/EMA experience base growing',
      'Transient expression profile is a safety advantage but may require repeated dosing',
      'Biodistribution studies required (primarily driven by LNP carrier)',
      'No integration risk — long-term follow-up typically 5 years',
      'Anti-drug antibody (ADA) assessment for the expressed protein',
    ],
    rcr_rcl_testing: 'Not applicable — non-viral, non-DNA delivery system. No integration risk.',
  },
  crispr_rnp: {
    displayName: 'CRISPR/Cas Ribonucleoprotein (RNP)',
    integrating: false,
    maxPayloadKb: 'N/A (ribonucleoprotein complex)',
    immunogenicityRisk: 'moderate',
    insertionalMutagenesisRisk: 'low',
    preExistingImmunity: false,
    keyManufacturingConsiderations: [
      'Cas protein purity and characterization (Cas9/Cas12a)',
      'Guide RNA (sgRNA/crRNA) synthesis quality — chemical synthesis vs IVT',
      'RNP complex formation and stability',
      'Off-target editing assessment (GUIDE-seq, CIRCLE-seq, DISCOVER-seq)',
      'On-target editing efficiency (indel frequency, HDR efficiency if applicable)',
    ],
    specificGuidance: [
      'FDA has no CRISPR-specific guidance yet — follow general gene therapy CMC guidance',
      'Off-target analysis is CRITICAL — use unbiased genome-wide methods',
      'On-target characterization: desired edit vs undesired outcomes (large deletions, translocations)',
      'Mosaicism assessment in edited cell populations',
      'Pre-existing anti-Cas9 immunity in human population — assess impact on safety and efficacy',
      'Long-term follow-up: 15 years if edits are permanent/integrating in nature; 5 years if transient',
    ],
    rcr_rcl_testing: 'Not applicable — protein/RNA complex, no viral components.',
  },
  transposon: {
    displayName: 'Transposon System (e.g., Sleeping Beauty, PiggyBac)',
    integrating: true,
    maxPayloadKb: '~6-10 kb (Sleeping Beauty); ~9-14 kb (PiggyBac)',
    immunogenicityRisk: 'low',
    insertionalMutagenesisRisk: 'moderate',
    preExistingImmunity: false,
    keyManufacturingConsiderations: [
      'Transposon/transposase ratio optimization',
      'Non-viral delivery (electroporation) of plasmid or mRNA transposase',
      'Integration site profiling (similar requirements to retroviral/lentiviral vectors)',
      'Vector copy number per cell as CQA',
    ],
    specificGuidance: [
      'Treated as integrating vector by FDA — 15-year long-term follow-up applies',
      'Integration site analysis required (near-random but not completely unbiased)',
      'Insertional mutagenesis risk lower than gamma-retroviral but higher than AAV',
      'Emerging regulatory experience — limited approved products as precedent',
    ],
    rcr_rcl_testing: 'Not applicable — non-viral integrating system. Assess transposase clearance.',
  },
};

export interface GeneTherapyRequirements {
  vectorProfile: {
    displayName: string;
    integrating: boolean;
    maxPayload: string;
    immunogenicityRisk: RiskLevel;
    insertionalMutagenesisRisk: RiskLevel;
    preExistingImmunity: boolean;
  };
  cmcRequirements: string[];
  nonclinicalRequirements: string[];
  clinicalRequirements: string[];
  vectorSpecificGuidance: string[];
  longTermFollowUp: {
    durationYears: number;
    rationale: string;
    monitoringRequirements: string[];
  };
  rcr_rcl_testing: string;
  regulatoryReferences: string[];
}

/**
 * Assess gene therapy regulatory requirements based on vector type,
 * delivery mode, and target jurisdictions.
 */
export function assessGeneTherapyRequirements(
  params: GeneTherapyAssessmentParams,
): GeneTherapyRequirements {
  const vectorInfo = VECTOR_KNOWLEDGE[params.vectorType];
  const isIntegrating = params.integrating || vectorInfo.integrating;

  // ── CMC Requirements ───────────────────────────────────────────────────
  const cmcRequirements: string[] = [
    'Product characterization: identity, purity, potency, safety (sterility, endotoxin, mycoplasma)',
    'Manufacturing process description with in-process controls and critical process parameters (CPPs)',
    'Specification setting: critical quality attributes (CQAs) with justified acceptance criteria',
    'Reference standard/material establishment and qualification',
    'Stability program: real-time and accelerated studies per ICH Q5C',
    'Container closure system suitability and extractables/leachables assessment',
    ...vectorInfo.keyManufacturingConsiderations,
  ];

  if (params.deliveryMode === 'ex_vivo') {
    cmcRequirements.push(
      'Starting material (cells) qualification: donor eligibility, cell source characterization',
      'Cell processing: transduction/electroporation conditions, culture media, expansion protocol',
      'Final cell product characterization: viability, identity (immunophenotype), transduction efficiency',
      'Vector copy number (VCN) per cell — critical quality attribute with acceptance criterion',
      'Cryopreservation validation (if applicable): controlled-rate freezing, thaw recovery',
    );
  }

  if (params.deliveryMode === 'in_vivo') {
    cmcRequirements.push(
      'Vector titer determination by orthogonal methods (e.g., qPCR + TCID50 or ddPCR)',
      'Potency assay: functional assay measuring biological activity of the transgene product',
      'Particle-to-infectivity ratio (for viral vectors) — indicator of product quality',
      'Formulation development: buffer composition, excipients, cryoprotectants',
    );
  }

  // ── Nonclinical Requirements ───────────────────────────────────────────
  const nonclinicalRequirements: string[] = [
    'Proof-of-concept efficacy study in relevant animal model (disease model preferred)',
    'Biodistribution study: qPCR-based detection of vector DNA in ≥10 tissues including gonads, ' +
      'brain, heart, liver, kidney, lung, spleen, lymph nodes, bone marrow, injection site',
  ];

  if (params.deliveryMode === 'in_vivo') {
    nonclinicalRequirements.push(
      'GLP-compliant toxicology study in relevant species (typically NHP for human-tropic vectors)',
      'Dose-range finding with clinical candidate vector — assess dose-response and maximum tolerated dose',
      'Immunogenicity assessment: anti-vector antibodies, anti-transgene antibodies, T-cell responses',
      'Shedding study: assess vector shedding in body fluids (required per FDA Environmental Assessment)',
      'Local tolerance assessment at the injection/infusion site',
    );
  }

  if (params.deliveryMode === 'ex_vivo') {
    nonclinicalRequirements.push(
      'GLP toxicology study of transduced cells in relevant model — NSG mouse or other immunodeficient model',
      'Tumorigenicity/oncogenicity assessment if integrating vector is used',
      'Biodistribution of administered cells — assess engraftment, migration, persistence',
    );
  }

  if (isIntegrating) {
    nonclinicalRequirements.push(
      'Insertional mutagenesis risk assessment: in vitro immortalization assay (IVIM) per EMA guideline',
      'Integration site analysis (ISA): unbiased genome-wide profiling (LAM-PCR, nrLAM-PCR, or LMPCR)',
      'Genotoxicity consideration: proximity to proto-oncogenes, tumor suppressors, fragile sites',
    );
  }

  if (params.vectorType === 'aav') {
    nonclinicalRequirements.push(
      'Dorsal root ganglia (DRG) toxicity assessment in NHP — standard requirement post-2020 FDA feedback',
      'Hepatotoxicity assessment for liver-tropic serotypes',
    );
  }

  if (params.pediatric) {
    nonclinicalRequirements.push(
      'Juvenile animal toxicology study may be required per FDA/EMA pediatric guidance',
      'Consider impact of growth/development on vector persistence and transgene expression',
    );
  }

  // ── Clinical Requirements ──────────────────────────────────────────────
  const clinicalRequirements: string[] = [
    'IND (US) / CTA (EU) / CTA (Japan) application with full CMC, nonclinical, and clinical protocol',
  ];

  if (params.firstInHuman) {
    clinicalRequirements.push(
      'First-in-human dose selection: pharmacologically active dose (PAD) approach ' +
        'based on nonclinical efficacy/safety data — traditional NOAEL/safety-factor approach less applicable',
      'Dose-escalation design: consider modified 3+3 or Bayesian-adaptive (BOIN/CRM) designs',
      'Sentinel dosing with staggered enrollment for the first cohort',
      'Data Safety Monitoring Board (DSMB) or equivalent independent oversight required',
      'Pre-treatment screening: anti-vector antibodies, baseline organ function, viral serology',
    );
  }

  clinicalRequirements.push(
    'Immunogenicity monitoring: anti-vector antibodies and anti-transgene antibodies at scheduled intervals',
    'Efficacy endpoints: functional and biomarker-based; consider surrogate endpoints for rare diseases per FDA guidance',
    'Safety monitoring: AEs/SAEs with special attention to delayed adverse events',
  );

  if (isIntegrating) {
    clinicalRequirements.push(
      'Long-term monitoring for hematologic malignancy: CBC with differential at regular intervals',
      'RCR/RCL testing of patient samples: archival sample at baseline, then per FDA guidance schedule',
      'Integration site analysis of patient samples when feasible',
    );
  }

  if (params.deliveryMode === 'in_vivo') {
    clinicalRequirements.push(
      'Vector shedding assessment in patient body fluids per FDA Guidance on Shedding Studies',
      'Immunosuppression/steroid prophylaxis protocol if applicable (especially for AAV)',
    );
  }

  // ── Long-term Follow-up ────────────────────────────────────────────────
  const durationYears = isIntegrating ? 15 : 5;
  const longTermFollowUp = {
    durationYears,
    rationale: isIntegrating
      ? 'FDA Guidance: Long Term Follow-Up After Administration of a Gene Therapy Product (2020) ' +
        'requires 15 years of follow-up for products with integrating vectors to monitor for ' +
        'delayed adverse events including insertional oncogenesis and hematologic malignancies.'
      : 'FDA Guidance: Long Term Follow-Up After Administration of a Gene Therapy Product (2020) ' +
        'requires minimum 5 years of follow-up for non-integrating vectors to monitor for ' +
        'delayed adverse events and durability of transgene expression.',
    monitoringRequirements: [
      'Annual physical examination and medical history',
      'Annual laboratory assessments: CBC with differential, comprehensive metabolic panel',
      isIntegrating ? 'Annual RCR/RCL testing of archived patient samples' : 'Annual assessment of transgene expression durability',
      'Monitoring for new malignancies, autoimmune disorders, and neurological events',
      'Adverse event reporting for any new clinical events potentially related to gene therapy',
      isIntegrating ? 'Integration site analysis if clonal expansion is detected' : 'Vector persistence assessment if clinically indicated',
    ],
  };

  // ── Regulatory References ──────────────────────────────────────────────
  const regulatoryReferences: string[] = [
    'FDA Guidance: Chemistry, Manufacturing, and Controls (CMC) Information for Human Gene Therapy INDs (January 2020)',
    'FDA Guidance: Long Term Follow-Up After Administration of a Gene Therapy Product (January 2020)',
    'FDA Guidance: Considerations for the Design of Early-Phase Clinical Trials of Cellular and Gene Therapy Products (June 2015)',
  ];

  if (params.jurisdictions.includes('eu')) {
    regulatoryReferences.push(
      'EMA Guideline on quality, non-clinical and clinical aspects of gene therapy medicinal products (EMA/CAT/80183/2014)',
      'EMA Guideline on non-clinical studies required before first clinical use of gene therapy medicinal products (EMEA/CHMP/GTWP/125459/2006)',
      'EMA Guideline on the quality, non-clinical and clinical aspects of gene therapy medicinal products (CHMP/GTWP/671639/2008 Rev. 1)',
    );
  }

  if (isIntegrating) {
    regulatoryReferences.push(
      'FDA Guidance: Testing of Retroviral Vector-Based Human Gene Therapy Products for Replication Competent Retrovirus During Product Manufacture and Patient Follow-up (2020)',
    );
  }

  if (params.indication.toLowerCase().includes('hemo')) {
    regulatoryReferences.push(
      'FDA Guidance: Human Gene Therapy for Hemophilia (January 2020)',
    );
  }
  if (params.indication.toLowerCase().includes('retin') || params.indication.toLowerCase().includes('eye') || params.indication.toLowerCase().includes('ocular')) {
    regulatoryReferences.push(
      'FDA Guidance: Human Gene Therapy for Retinal Disorders (January 2020)',
    );
  }
  if (params.indication.toLowerCase().includes('rare') || params.indication.toLowerCase().includes('orphan')) {
    regulatoryReferences.push(
      'FDA Guidance: Human Gene Therapy for Rare Diseases (January 2020)',
    );
  }

  return {
    vectorProfile: {
      displayName: vectorInfo.displayName,
      integrating: isIntegrating,
      maxPayload: vectorInfo.maxPayloadKb,
      immunogenicityRisk: vectorInfo.immunogenicityRisk,
      insertionalMutagenesisRisk: vectorInfo.insertionalMutagenesisRisk,
      preExistingImmunity: vectorInfo.preExistingImmunity,
    },
    cmcRequirements,
    nonclinicalRequirements,
    clinicalRequirements,
    vectorSpecificGuidance: vectorInfo.specificGuidance,
    longTermFollowUp,
    rcr_rcl_testing: vectorInfo.rcr_rcl_testing,
    regulatoryReferences,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CELL THERAPY MANUFACTURING ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface CellTherapyManufacturingParams {
  cellType: string;
  cellOrigin: 'autologous' | 'allogeneic' | 'xenogeneic';
  geneticallyModified: boolean;
  cryopreserved: boolean;
  /** Culture duration in days. */
  cultureDurationDays?: number;
  jurisdictions: Jurisdiction[];
}

export interface CellTherapyManufacturingResult {
  gmpRequirements: {
    framework: string;
    keyRequirements: string[];
    facilityRequirements: string[];
    references: string[];
  };
  startingMaterialQualification: string[];
  releaseTestingPanel: string[];
  potencyAssayRequirements: string[];
  coldChainAndLogistics: string[];
  comparabilityFramework: string[];
}

/**
 * Assess cell therapy manufacturing requirements based on cell type,
 * origin, and target jurisdictions.
 */
export function assessCellTherapyManufacturing(
  params: CellTherapyManufacturingParams,
): CellTherapyManufacturingResult {
  // ── GMP Framework ──────────────────────────────────────────────────────
  const keyRequirements: string[] = [
    'Personnel qualification: training in aseptic technique, cell culture, and ATMP-specific procedures',
    'Environmental monitoring: viable and non-viable particulate monitoring in cleanrooms',
    'Qualification/validation: IQ/OQ/PQ for critical equipment; process validation',
    'Batch records and documentation: electronic or paper batch records with full traceability',
    'Change control and deviation management per quality management system (QMS)',
    'Annual product quality review (APQR) / product quality review (PQR)',
    'Supplier qualification for critical raw materials and reagents',
  ];

  const facilityRequirements: string[] = [
    'Cleanroom classification: ISO 5 (Grade A) for open processing; ISO 7 (Grade B) background',
    'Unidirectional material and personnel flow to prevent cross-contamination',
    'HEPA-filtered air handling with appropriate pressure cascades',
    'Dedicated or segregated areas for each patient batch (autologous) — concurrent processing controls',
    'Environmental monitoring program: settle plates, active air sampling, surface monitoring',
  ];

  const references: string[] = [];

  if (params.jurisdictions.includes('eu')) {
    keyRequirements.push(
      'EU GMP Part IV (EudraLex Volume 4 Part IV): ATMP-specific GMP provisions',
      'Risk-based approach: GMP requirements may be adapted based on a documented risk assessment (EU GMP Part IV Section 4)',
      'Qualified Person (QP) certification of each batch per Directive 2001/83/EC Art 51',
      'Hospital Exemption (Article 28 of Regulation 1394/2007) applies only under specific conditions — not a GMP waiver',
    );
    facilityRequirements.push(
      'EU GMP Annex 1 (2022 revision): Manufacture of Sterile Medicinal Products applies to ATMP processing',
      'Closed system processing may allow reduced environmental classification per risk assessment (EU GMP Part IV)',
    );
    references.push(
      'EudraLex Volume 4 Part IV — Guidelines on GMP specific to ATMPs',
      'EMA Guideline on GMP for ATMPs (EMA/CAT/600280/2010 Rev. 2)',
      'EU GMP Annex 1: Manufacture of Sterile Medicinal Products (2022)',
      'Regulation (EC) No 1394/2007 (ATMP Regulation)',
    );
  }

  if (params.jurisdictions.includes('us')) {
    keyRequirements.push(
      '21 CFR Part 211: Current Good Manufacturing Practice for pharmaceuticals — baseline GMP',
      '21 CFR Part 600/610: Additional requirements for biological products',
      '21 CFR Part 1271 Subpart D: cGTP (current Good Tissue Practice) for HCT/Ps',
      'FDA Guidance: Considerations for the Design of Early-Phase Clinical Trials of Cellular and Gene Therapy Products (2015)',
    );
    references.push(
      '21 CFR Parts 210, 211: cGMP for pharmaceutical manufacturing',
      '21 CFR Parts 600, 610: Biologics-specific requirements',
      '21 CFR Part 1271 Subpart D: Current Good Tissue Practice',
      'FDA Guidance: CGMP for Phase 1 Investigational Drugs (2008) — risk-based approach for early phase',
    );
  }

  if (params.jurisdictions.includes('japan')) {
    keyRequirements.push(
      'PMDA GMP for Regenerative Medicine Products (MHLW Ministerial Ordinance No. 93)',
      'Cell processing facilities must comply with the Act on the Safety of Regenerative Medicine (Act No. 85, 2013)',
      'GCTP (Good Cell/Tissue Processing Practice) — Japan-specific standard',
    );
    references.push(
      'PMDA Ministerial Ordinance No. 93: GMP for Regenerative Medicine Products',
      'Act on the Safety of Regenerative Medicine (Act No. 85, 2013)',
    );
  }

  if (params.cellOrigin === 'autologous') {
    keyRequirements.push(
      'Chain of identity (CoI): critical systems to ensure each patient receives their own product',
      'Lot segregation: physical or temporal separation of patient-specific batches',
      'Decentralized or vein-to-vein logistics: leukapheresis site → manufacturing → treatment site',
      'Label reconciliation and verification at every transfer point',
    );
    facilityRequirements.push(
      'Concurrent manufacturing controls: ability to segregate multiple patient batches',
      'Dedicated single-use consumables per patient batch where feasible',
    );
  }

  if (params.cellOrigin === 'allogeneic') {
    keyRequirements.push(
      'Donor screening and testing per 21 CFR 1271 Subpart C (US) or EU Tissues and Cells Directives',
      'Master Cell Bank (MCB) and Working Cell Bank (WCB) establishment per ICH Q5D',
      'Cell bank characterization: identity, viability, sterility, mycoplasma, viral safety (ICH Q5A)',
      'Population doubling limit (PDL) and passage number controls',
      'Scale-out manufacturing potential — same process for multiple patients from one donor lot',
    );
  }

  // ── Starting Material Qualification ────────────────────────────────────
  const startingMaterialQualification: string[] = [
    'Donor eligibility determination per jurisdictional requirements (21 CFR 1271.50-80 in US; Directive 2006/17/EC in EU)',
    'Donor screening: medical history, risk factors, communicable disease testing',
    'Infectious disease testing panel: HIV-1/2, HBV, HCV, HTLV-I/II, syphilis, CMV, WNV (per jurisdiction)',
  ];

  if (params.cellOrigin === 'autologous') {
    startingMaterialQualification.push(
      'Apheresis product characterization: WBC count, viability, CD3+/CD4+/CD8+ composition (if T cells)',
      'Patient medical history review for impact on cell quality (prior therapies, disease status)',
      'Out-of-specification (OOS) starting material procedures: decision tree for manufacturing with suboptimal input',
      'Transport conditions from collection site to manufacturing facility: temperature, time limits, media',
    );
  }

  if (params.cellOrigin === 'allogeneic') {
    startingMaterialQualification.push(
      'Cell bank qualification per ICH Q5D: identity, viability, purity, genetic stability',
      'Viral safety evaluation per ICH Q5A(R2): in vitro and in vivo adventitious agent testing',
      'Karyotype analysis and genetic stability assessment at defined passage intervals',
      'HLA typing (if relevant for immunological compatibility)',
    );
  }

  // ── Release Testing Panel ──────────────────────────────────────────────
  const releaseTestingPanel: string[] = [
    'Sterility (21 CFR 610.12 / Ph. Eur. 2.6.1): 14-day sterility test or validated rapid microbiology method',
    'Mycoplasma (21 CFR 610.30 / Ph. Eur. 2.6.7): culture-based (28-day) or validated NAT/PCR-based method',
    'Endotoxin (LAL / Ph. Eur. 2.6.14): <5 EU/kg/hr for parenteral products',
    'Cell viability: ≥70% viable cells (typical minimum acceptance criterion)',
    'Cell identity: immunophenotyping by flow cytometry (CD markers appropriate to cell type)',
    'Cell dose: total viable cell count per unit/kg body weight',
    'Potency assay: functional biological assay measuring mechanism of action-related activity',
    'Purity: percentage of target cell population vs contaminant cells',
    'Appearance / visual inspection of the final product',
    'Volume / fill volume verification',
  ];

  if (params.geneticallyModified) {
    releaseTestingPanel.push(
      'Vector copy number (VCN) per cell by qPCR or ddPCR — critical safety attribute for integrating vectors',
      'Transgene expression: protein expression or functional assay',
      'Residual vector/plasmid testing',
      'RCR/RCL testing: per vector type-specific requirements',
    );
  }

  if (params.cryopreserved) {
    releaseTestingPanel.push(
      'Post-thaw viability and recovery: ≥70% post-thaw viability (typical)',
      'Post-thaw functional assessment: potency assay or functional surrogate',
      'Dimethyl sulfoxide (DMSO) residual level (if DMSO-based cryopreservation)',
    );
  }

  // ── Potency Assay Requirements ─────────────────────────────────────────
  const potencyAssayRequirements: string[] = [
    'Potency assay must measure biological activity relevant to the mechanism of action (MOA)',
    'FDA expects a quantitative potency assay: dose-response curve with defined units or reference standard',
    'A matrix/panel of potency-indicating assays is acceptable when a single assay is insufficient',
    'Potency assay development timeline: qualitative → semi-quantitative → fully validated (Phase 1 → BLA)',
    'Phase 1: surrogate potency assay acceptable if justified; must demonstrate activity related to MOA',
    'BLA filing: validated potency assay with documented accuracy, precision, linearity, range, specificity',
    'Reference standard: in-house reference material established and characterized for potency trending',
    'Stability-indicating potency: demonstrate the assay detects potency loss upon degradation/stress',
    'FDA Guidance: Potency Tests for Cellular and Gene Therapy Products (2011) — primary reference',
  ];

  // ── Cold Chain & Logistics ─────────────────────────────────────────────
  const coldChainAndLogistics: string[] = [
    'Shipping validation: temperature excursion studies for the validated shipping configuration',
    'Temperature monitoring: continuous data loggers in shipping containers with alarm thresholds',
    'Chain of custody documentation from manufacturing site to treatment site',
    'Shelf life / hold time limitations: fresh products typically 24-72 hours; cryopreserved up to years',
    'Receiving procedures at treatment site: incoming inspection, temperature verification, identity confirmation',
  ];

  if (params.cryopreserved) {
    coldChainAndLogistics.push(
      'Controlled-rate freezing protocol validation (-1C/min typical)',
      'Liquid nitrogen or vapor-phase nitrogen storage (-150C to -196C)',
      'Cryogenic shipping container qualification (dry shipper validation)',
      'Thaw protocol standardization: water bath or dry thaw device at 37C',
      'Post-thaw hold time limits: typically ≤4 hours from thaw to infusion',
    );
  } else {
    coldChainAndLogistics.push(
      'Fresh product: 2-8C or ambient transport depending on product stability',
      'Maximum hold time from end of manufacturing to administration: typically ≤24-48 hours',
      'Contingency procedures for shipping delays or temperature excursions',
    );
  }

  if (params.cellOrigin === 'autologous') {
    coldChainAndLogistics.push(
      'Vein-to-vein chain of identity (CoI) — label must unambiguously link product to the specific patient',
      'Two-person verification at every hand-off point (collection, manufacturing receipt, shipping, administration)',
      'GPS or equivalent tracking for high-value autologous shipments',
    );
  }

  // ── Comparability Framework ────────────────────────────────────────────
  const comparabilityFramework: string[] = [
    'ICH Q5E: Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process',
    'Comparability exercise triggered by any significant manufacturing change (process, scale, site, equipment, raw materials)',
    'Analytical comparability: side-by-side testing of pre-change and post-change product using the full release panel',
    'Extended characterization: additional analytical methods beyond release testing (e.g., higher-order structure, post-translational modifications for expressed proteins)',
    'Functional comparability: potency assay(s) comparing pre- and post-change product',
    'Stability comparability: parallel stability studies on pre- and post-change material',
    'Statistical approach: equivalence testing preferred; difference testing (t-test, F-test) as supplementary',
    'If analytical comparability is inconclusive, nonclinical bridging studies may be required',
    'If nonclinical bridging is inconclusive, clinical bridging study (PK/PD or efficacy) may be required',
    'FDA expects comparability protocols submitted as CMC amendments (CBE-30 or Prior Approval supplement)',
    'Risk-based approach per ICH Q5E: magnitude of change → extent of comparability data required',
  ];

  return {
    gmpRequirements: {
      framework: params.jurisdictions.includes('eu')
        ? 'EU GMP Part IV (ATMP-specific) + EU GMP Annex 1 (Sterile Products, 2022 revision)'
        : params.jurisdictions.includes('us')
          ? '21 CFR 210/211 (cGMP) + 21 CFR 600/610 (Biologics) + 21 CFR 1271 Subpart D (cGTP)'
          : '21 CFR 210/211 equivalent (jurisdictionally adapted)',
      keyRequirements,
      facilityRequirements,
      references,
    },
    startingMaterialQualification,
    releaseTestingPanel,
    potencyAssayRequirements,
    coldChainAndLogistics,
    comparabilityFramework,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CAR-T / ENGINEERED CELL THERAPY REQUIREMENTS
// ─────────────────────────────────────────────────────────────────────────────

export interface CARTAssessmentParams {
  /** CAR target antigen. */
  targetAntigen: string;
  /** CAR construct generation. */
  carGeneration: '1st' | '2nd' | '3rd' | '4th_armored';
  /** Co-stimulatory domain(s). */
  costimDomains: ('CD28' | '4-1BB' | 'OX40' | 'ICOS' | 'other')[];
  /** Target indication. */
  indication: string;
  /** Vector used for genetic modification. */
  vectorType: VectorType;
  cellOrigin: 'autologous' | 'allogeneic';
  jurisdictions: Jurisdiction[];
}

export interface CARTRequirements {
  manufacturingRequirements: string[];
  safetyMonitoring: {
    crs: { description: string; gradingScale: string; monitoring: string[]; management: string[] };
    icans: { description: string; gradingScale: string; monitoring: string[]; management: string[] };
    otherRisks: string[];
  };
  remsRequirements: {
    applicable: boolean;
    elements: string[];
    approvedPrecedents: string[];
  };
  bridgingStrategies: string[];
  regulatoryConsiderations: string[];
}

/**
 * Assess CAR-T specific regulatory requirements including manufacturing,
 * safety monitoring (CRS/ICANS), and REMS.
 */
export function assessCARTRequirements(params: CARTAssessmentParams): CARTRequirements {
  // ── Manufacturing Requirements ─────────────────────────────────────────
  const manufacturingRequirements: string[] = [
    'Leukapheresis collection: standardized collection protocol, minimum cell requirements',
    'T-cell enrichment/selection: CD3+ or CD4+/CD8+ selection strategy with defined purity criteria',
    'T-cell activation: anti-CD3/CD28 beads, anti-CD3/CD28 antibodies, or artificial APCs',
    'Gene transfer: transduction (lentiviral/retroviral) or electroporation (mRNA/transposon) per vector type',
    'Ex vivo expansion: IL-2 and/or IL-7/IL-15 supplemented culture; defined culture duration',
    'Harvest and formulation: wash, concentrate, formulate in infusion-compatible medium',
    'Cryopreservation (if applicable): controlled-rate freezing in DMSO-based cryoprotectant',
  ];

  if (params.cellOrigin === 'autologous') {
    manufacturingRequirements.push(
      'Vein-to-vein turnaround time target: typically 3-4 weeks (manufacturing cycle)',
      'Patient-specific lot segregation and chain of identity (CoI) throughout manufacturing',
      'Manufacturing failure/out-of-specification procedures: re-collection strategy, bridging therapy options',
      'Decentralized logistics: qualified courier network from apheresis sites to manufacturing facility',
    );
  }

  if (params.cellOrigin === 'allogeneic') {
    manufacturingRequirements.push(
      'TRAC/TRBC knockout (or equivalent) to prevent graft-versus-host disease (GvHD)',
      'HLA matching strategy or universal donor approach (e.g., beta-2-microglobulin knockout)',
      'Off-the-shelf scalability: master cell bank approach with defined passage limits',
      'Anti-rejection strategy: lymphodepletion intensity, HLA-silencing approach',
    );
  }

  manufacturingRequirements.push(
    'Release testing panel: CAR expression (% CAR+ by flow cytometry), viability (≥70%), total viable cells, ' +
      'T-cell purity (CD3+), T-cell subsets (CD4/CD8 ratio), sterility, mycoplasma, endotoxin, ' +
      'vector copy number (VCN), residual beads/reagents, potency assay (cytokine release or cytotoxicity)',
    'Critical quality attributes (CQAs): CAR transduction efficiency, VCN, total viable CAR+ T cells, ' +
      'potency (target cell lysis or cytokine secretion), T-cell memory phenotype distribution',
    'Potency assay: functional assay demonstrating antigen-specific killing or cytokine release ' +
      '(e.g., co-culture with antigen-expressing target cells, measure IFN-gamma or specific lysis)',
  );

  // ── Safety Monitoring ──────────────────────────────────────────────────
  const safetyMonitoring = {
    crs: {
      description:
        'Cytokine Release Syndrome (CRS): systemic inflammatory response triggered by in vivo ' +
        'activation and proliferation of CAR-T cells. Mediated by IL-6, IFN-gamma, IL-1, and ' +
        'other pro-inflammatory cytokines. Onset typically 1-14 days post-infusion, with peak ' +
        'severity correlated with tumor burden and CAR-T expansion.',
      gradingScale:
        'ASTCT Consensus Grading (Lee et al., 2019): Grade 1 (fever only, T≥38C); Grade 2 (fever + ' +
        'hypotension not requiring vasopressors and/or hypoxia requiring low-flow O2); Grade 3 ' +
        '(fever + hypotension requiring vasopressor ± vasopressin and/or hypoxia requiring high-flow ' +
        'O2 or non-rebreather); Grade 4 (fever + hypotension requiring multiple vasopressors and/or ' +
        'hypoxia requiring positive pressure ventilation).',
      monitoring: [
        'Vital signs every 4 hours minimum during CRS risk window (Day 0 to Day 28)',
        'Daily cytokine panel: IL-6, IFN-gamma, CRP, ferritin during acute monitoring period',
        'CBC with differential daily during inpatient monitoring',
        'Comprehensive metabolic panel, coagulation studies, fibrinogen, D-dimer',
        'Echocardiography and troponin if cardiac involvement suspected',
        'Tumor lysis syndrome (TLS) labs if high tumor burden',
      ],
      management: [
        'Tocilizumab (anti-IL-6R): first-line for Grade ≥2 CRS — FDA-approved for CAR-T-associated CRS',
        'Corticosteroids (dexamethasone 10mg IV): second-line or for steroid-responsive CRS',
        'Siltuximab (anti-IL-6) for tocilizumab-refractory cases',
        'ICU transfer for Grade ≥3 CRS: vasopressor support, mechanical ventilation as needed',
        'Anakinra (IL-1RA) for refractory CRS (emerging evidence, off-label)',
      ],
    },
    icans: {
      description:
        'Immune Effector Cell-Associated Neurotoxicity Syndrome (ICANS): neurotoxicity associated with ' +
        'CAR-T cell therapy. Characterized by toxic encephalopathy with symptoms ranging from word-finding ' +
        'difficulty, confusion, and tremor to seizures, cerebral edema, and coma. Often co-occurs with or ' +
        'follows CRS. Mediated by BBB disruption, endothelial activation, and elevated cytokines in CSF.',
      gradingScale:
        'ASTCT ICE (Immune Effector Cell-Associated Encephalopathy) Assessment: 10-point cognitive assessment. ' +
        'ICANS Grade 1 (ICE 7-9, awakens spontaneously); Grade 2 (ICE 3-6, awakens to voice); ' +
        'Grade 3 (ICE 0-2, awakens only to tactile stimulus, any seizure that resolves, focal/local cerebral edema); ' +
        'Grade 4 (patient unable to perform ICE, unresponsive or requires vigorous stimulation, ' +
        'prolonged/repetitive seizures, diffuse cerebral edema, decerebrate/decorticate posturing).',
      monitoring: [
        'ICE assessment every 8-12 hours during ICANS risk window (Day 0 to Day 28)',
        'Neurological examination daily during inpatient monitoring',
        'Brain MRI if Grade ≥2 ICANS to assess cerebral edema',
        'EEG if seizure activity suspected',
        'Lumbar puncture for CSF analysis if Grade ≥3 or atypical presentation',
        'Fundoscopic examination for papilledema (raised intracranial pressure)',
      ],
      management: [
        'Corticosteroids: first-line treatment for ICANS (dexamethasone 10mg IV Q6H)',
        'Tocilizumab: if concurrent CRS present, but may not cross BBB — limited efficacy for isolated ICANS',
        'Levetiracetam: seizure prophylaxis for patients at high ICANS risk (some protocols)',
        'Anti-epileptic drugs for breakthrough seizures',
        'ICU transfer and intubation for airway protection if Grade ≥3',
        'Mannitol/hypertonic saline for cerebral edema management',
      ],
    },
    otherRisks: [
      'On-target/off-tumor toxicity: CAR-T cells may attack normal tissues expressing the target antigen ' +
        '(e.g., B-cell aplasia with anti-CD19 CAR-T — expected, managed with IVIG replacement)',
      'Prolonged cytopenias: neutropenia, thrombocytopenia, anemia lasting >28 days post-infusion',
      'Hypogammaglobulinemia / B-cell aplasia: requires immunoglobulin replacement therapy (for B-cell-targeting CARs)',
      'Infections: increased risk during lymphodepletion and cytopenic period — prophylaxis per institutional guidelines',
      'Tumor lysis syndrome (TLS): risk proportional to tumor burden — allopurinol/rasburicase prophylaxis',
      'Secondary malignancies: theoretical risk with integrating vectors — long-term monitoring per LTFU guidance',
      'Hemophagocytic lymphohistiocytosis / macrophage activation syndrome (HLH/MAS): overlap with severe CRS',
      'Graft-versus-host disease (GvHD): specific to allogeneic CAR-T products',
      'CAR-T cell-related malignancy: FDA investigating T-cell lymphoma reports (November 2023 safety communication)',
    ],
  };

  // ── REMS Requirements ──────────────────────────────────────────────────
  const remsRequirements = {
    applicable: params.jurisdictions.includes('us'),
    elements: [
      'REMS with Elements to Assure Safe Use (ETASU) — required for all FDA-approved CAR-T products to date',
      'Certified Healthcare Facility: treatment centers must complete training and certification',
      'Trained Healthcare Provider: prescribing physicians must complete REMS training program',
      'Tocilizumab availability: certified treatment centers must have tocilizumab on-site prior to infusion',
      'Patient enrollment in REMS program prior to treatment',
      'Post-treatment monitoring: minimum 7-day inpatient or proximity monitoring post-infusion',
      'REMS-mandated adverse event reporting: CRS and ICANS events reported to REMS program',
    ],
    approvedPrecedents: [
      'Kymriah (tisagenlecleucel) — REMS: certified treatment centers, trained prescribers, tocilizumab access',
      'Yescarta (axicabtagene ciloleucel) — REMS: certified centers, prescriber training, CRS/ICANS management',
      'Tecartus (brexucabtagene autoleucel) — REMS: shared REMS with Yescarta',
      'Breyanzi (lisocabtagene maraleucel) — REMS: certified centers, prescriber certification',
      'Abecma (idecabtagene vicleucel) — REMS: certified centers for BCMA-targeting CAR-T',
      'Carvykti (ciltacabtagene autoleucel) — REMS: certified centers, BCMA-targeting CAR-T',
    ],
  };

  // ── Bridging Strategies ────────────────────────────────────────────────
  const bridgingStrategies: string[] = [
    'Manufacturing process changes in CAR-T require comparability assessment per ICH Q5E',
    'Analytical comparability: full release panel + extended characterization of pre- and post-change product',
    'Functional comparability: potency assay (cytotoxicity and/or cytokine release) must demonstrate equivalence',
    'T-cell phenotype comparability: memory phenotype distribution (Tscm, Tcm, Tem, Teff) should be comparable',
    'In vivo bridging: if analytical comparability inconclusive, in vivo study in NSG mouse xenograft model',
    'Clinical bridging: if nonclinical bridging inconclusive, clinical bridging study (PK/PD and/or efficacy)',
    'Scale-up bridging: process transfer from lab-scale to clinical/commercial scale requires comparability',
    'Site transfer: manufacturing site change requires full comparability exercise including stability',
    'Note: ATMPs/CAR-T products are unique biological products — biosimilar/interchangeable pathways under ' +
      'BPCIA (351(k)) are generally NOT applicable. Each CAR-T product requires its own BLA.',
  ];

  // ── Regulatory Considerations ──────────────────────────────────────────
  const regulatoryConsiderations: string[] = [
    'FDA Guidance: Considerations for the Design of Early-Phase Clinical Trials of Cellular and Gene Therapy Products (2015)',
    'FDA Guidance: Expedited Programs for Regenerative Medicine Therapies for Serious Conditions (2019) — RMAT designation',
    'FDA RMAT (Regenerative Medicine Advanced Therapy) designation: available for cell therapies intended to treat serious conditions',
    'Lymphodepleting chemotherapy regimen (e.g., fludarabine + cyclophosphamide) is part of the CAR-T treatment — addressed in labeling',
    'Real-world evidence (RWE): FDA has accepted post-marketing RWE for label expansions (emerging precedent)',
    'FDA November 2023 safety communication: investigating risk of T-cell malignancies in patients treated with BCMA- and CD19-targeting CAR-T — class-wide labeling update',
  ];

  if (params.cellOrigin === 'allogeneic') {
    regulatoryConsiderations.push(
      'Allogeneic CAR-T: no approved precedent as of 2025 — regulatory pathway less established',
      'Gene editing safety: off-target editing assessment critical for regulators (CRISPR/TALEN-edited allogeneic)',
      'GvHD risk mitigation: TCR knockout validation is a key regulatory expectation',
      'Immunological rejection: assess duration of persistence and impact on efficacy',
    );
  }

  return {
    manufacturingRequirements,
    safetyMonitoring,
    remsRequirements,
    bridgingStrategies,
    regulatoryConsiderations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. REGULATORY PATHWAY SELECTION
// ─────────────────────────────────────────────────────────────────────────────

export interface PathwaySelectionParams {
  productType: 'gene_therapy' | 'cell_therapy' | 'tissue_engineered' | 'combined_atmp';
  indication: string;
  seriousCondition: boolean;
  unmetMedicalNeed: boolean;
  /** Preliminary clinical evidence of substantial improvement? */
  substantialImprovement: boolean;
  /** Surrogate or intermediate endpoint available? */
  surrogateEndpointAvailable: boolean;
  targetJurisdictions: Jurisdiction[];
  cellOrigin?: 'autologous' | 'allogeneic';
  pediatric?: boolean;
  orphanDiseaseEligible?: boolean;
}

export interface PathwaySelectionResult {
  jurisdictions: Record<Jurisdiction, {
    primaryPathway: string;
    pathwayDescription: string;
    mandatoryRequirements: string[];
    eligibleExpeditedPrograms: Array<{
      program: ExpeditedProgram;
      name: string;
      eligible: boolean;
      rationale: string;
      benefits: string[];
    }>;
    estimatedTimelineMonths: { min: number; max: number; notes: string };
    keyConsiderations: string[];
  }>;
  globalStrategy: string[];
}

/**
 * Select recommended regulatory pathway per jurisdiction and assess
 * eligibility for expedited programs.
 */
export function selectATMPPathway(params: PathwaySelectionParams): PathwaySelectionResult {
  const jurisdictions: PathwaySelectionResult['jurisdictions'] = {} as any;
  const globalStrategy: string[] = [];

  // ── US (FDA) ───────────────────────────────────────────────────────────
  if (params.targetJurisdictions.includes('us')) {
    const expeditedPrograms: PathwaySelectionResult['jurisdictions']['us']['eligibleExpeditedPrograms'] = [];

    // RMAT
    expeditedPrograms.push({
      program: 'fda_rmat',
      name: 'Regenerative Medicine Advanced Therapy (RMAT)',
      eligible: params.seriousCondition && params.substantialImprovement,
      rationale: params.seriousCondition && params.substantialImprovement
        ? 'Product addresses a serious condition with preliminary clinical evidence suggesting substantial improvement over existing therapies. Meets RMAT criteria under 21st Century Cures Act Section 3033.'
        : 'RMAT requires: (1) regenerative medicine therapy (cell therapy, gene therapy, tissue engineering, or combination) for a serious condition, AND (2) preliminary clinical evidence indicating substantial improvement. One or more criteria not met.',
      benefits: [
        'All benefits of Breakthrough Therapy and Fast Track designations',
        'Eligibility for priority review and accelerated approval',
        'Early interactions with FDA (pre-BLA meeting)',
        'Potential to rely on post-approval requirements (confirmatory trial) rather than pre-approval for full evidence',
      ],
    });

    // Breakthrough Therapy
    expeditedPrograms.push({
      program: 'fda_breakthrough_therapy',
      name: 'Breakthrough Therapy Designation (BTD)',
      eligible: params.seriousCondition && params.substantialImprovement,
      rationale: params.seriousCondition && params.substantialImprovement
        ? 'Preliminary clinical evidence indicates substantial improvement over existing therapies for a serious condition.'
        : 'BTD requires: serious condition + preliminary clinical evidence of substantial improvement. Not all criteria met.',
      benefits: [
        'Intensive FDA guidance on efficient drug development',
        'Organizational commitment from FDA senior management',
        'Rolling review eligibility',
        'May qualify for priority review and accelerated approval',
      ],
    });

    // Fast Track
    expeditedPrograms.push({
      program: 'fda_fast_track',
      name: 'Fast Track Designation',
      eligible: params.seriousCondition && params.unmetMedicalNeed,
      rationale: params.seriousCondition && params.unmetMedicalNeed
        ? 'Product treats a serious condition and addresses an unmet medical need.'
        : 'Fast Track requires: serious condition + unmet medical need. Not all criteria met.',
      benefits: [
        'More frequent meetings and communication with FDA',
        'Rolling review (submission of completed sections before full application)',
        'Eligibility for priority review and accelerated approval if relevant criteria met',
      ],
    });

    // Accelerated Approval
    expeditedPrograms.push({
      program: 'fda_accelerated_approval',
      name: 'Accelerated Approval (Subpart H/I)',
      eligible: params.seriousCondition && params.unmetMedicalNeed && params.surrogateEndpointAvailable,
      rationale: params.surrogateEndpointAvailable
        ? 'Surrogate or intermediate clinical endpoint available that is reasonably likely to predict clinical benefit.'
        : 'Accelerated approval requires a surrogate or intermediate endpoint reasonably likely to predict clinical benefit. No suitable endpoint identified.',
      benefits: [
        'Approval based on surrogate endpoint rather than clinical outcome',
        'Confirmatory trial required post-approval (Accelerated Approval Integrity Act of 2023 strengthens withdrawal authority)',
        'Faster time to market for patients with serious conditions',
      ],
    });

    // Priority Review
    expeditedPrograms.push({
      program: 'fda_priority_review',
      name: 'Priority Review',
      eligible: params.seriousCondition,
      rationale: params.seriousCondition
        ? 'Product treats a serious condition and, if approved, would provide a significant improvement in safety or effectiveness.'
        : 'Priority review is generally granted for products treating serious conditions with significant improvement.',
      benefits: [
        'FDA action date: 6 months (vs. 10 months for standard review)',
        'Applied to the BLA at the time of submission',
      ],
    });

    // Orphan Drug
    if (params.orphanDiseaseEligible) {
      globalStrategy.push(
        'US: Orphan Drug Designation (ODD) eligible — provides 7-year market exclusivity, tax credits ' +
        'for clinical trial costs, and fee waivers. Apply to FDA Office of Orphan Products Development.'
      );
    }

    jurisdictions.us = {
      primaryPathway: 'BLA via CBER (Biologics License Application under PHS Act Section 351(a))',
      pathwayDescription:
        'All gene therapy and cell therapy products require a BLA submitted to CBER. ' +
        'IND (Investigational New Drug) application required before clinical trials. ' +
        'Pre-IND meeting with CBER OTP strongly recommended for novel products.',
      mandatoryRequirements: [
        'IND application (21 CFR 312) before initiating clinical trials',
        'BLA application (21 CFR 601) for marketing authorization',
        'CMC (chemistry, manufacturing, and controls) data per FDA Gene Therapy CMC Guidance (2020)',
        'Nonclinical pharmacology/toxicology per FDA gene therapy nonclinical guidance',
        'Clinical trial data (Phase 1/2 or pivotal) demonstrating safety and efficacy',
        'cGMP compliance (21 CFR 210/211/600/610)',
        'Long-term follow-up plan per FDA LTFU Guidance (2020)',
        'Environmental assessment or claim of categorical exclusion (21 CFR 25)',
      ],
      eligibleExpeditedPrograms: expeditedPrograms,
      estimatedTimelineMonths: {
        min: 6, max: 10,
        notes: 'BLA review: 6 months (priority) to 10 months (standard) from submission acceptance. ' +
          'Pre-submission: IND-to-BLA typically 5-10 years for gene/cell therapy (indication-dependent). ' +
          'RMAT/BTD may accelerate development timeline through rolling review and FDA engagement.',
      },
      keyConsiderations: [
        'Pre-IND meeting: FDA offers Type B pre-IND meetings — submit meeting request ≥90 days before desired date',
        'IND safety reporting: 15-day and 7-day expedited safety reports per 21 CFR 312.32',
        'Annual IND reports: progress report due within 60 days of IND anniversary',
        'Pediatric: PREA (Pediatric Research Equity Act) applies unless orphan-designated; discuss with FDA early',
      ],
    };
  }

  // ── EU (EMA) ───────────────────────────────────────────────────────────
  if (params.targetJurisdictions.includes('eu')) {
    const euExpedited: PathwaySelectionResult['jurisdictions']['eu']['eligibleExpeditedPrograms'] = [];

    euExpedited.push({
      program: 'ema_prime',
      name: 'PRIME (PRIority MEdicines)',
      eligible: params.unmetMedicalNeed && params.substantialImprovement,
      rationale: params.unmetMedicalNeed && params.substantialImprovement
        ? 'Product targets an unmet medical need with preliminary clinical evidence of substantial improvement. PRIME offers enhanced EMA interaction.'
        : 'PRIME requires: unmet medical need + preliminary evidence of major therapeutic advantage. Not all criteria met.',
      benefits: [
        'Early appointment of CHMP/CAT rapporteur',
        'Enhanced early dialogue and scientific advice',
        'Accelerated assessment eligibility at time of MAA submission',
        'Fee reductions for scientific advice (SMEs)',
      ],
    });

    euExpedited.push({
      program: 'ema_accelerated_assessment',
      name: 'Accelerated Assessment',
      eligible: params.seriousCondition && params.unmetMedicalNeed,
      rationale: 'Accelerated assessment reduces the review timeline from 210 to 150 active days. Requires major public health interest.',
      benefits: [
        'Review timeline: 150 active days (vs. 210 standard)',
        'Can be combined with PRIME designation',
        'Must be requested at time of MAA submission',
      ],
    });

    euExpedited.push({
      program: 'ema_conditional_marketing_authorisation',
      name: 'Conditional Marketing Authorisation (CMA)',
      eligible: params.seriousCondition && params.unmetMedicalNeed,
      rationale: params.seriousCondition && params.unmetMedicalNeed
        ? 'CMA possible for products addressing unmet medical need in serious conditions when benefit-risk is positive but comprehensive data not yet available.'
        : 'CMA requires: serious condition, unmet medical need, positive benefit-risk, and ability to provide comprehensive data post-authorization.',
      benefits: [
        'Marketing authorization before comprehensive clinical data available',
        'Annual renewal with specific obligations (post-authorization studies)',
        'Converts to standard MA when comprehensive data submitted',
        'Valid for 1 year, renewable',
      ],
    });

    if (params.orphanDiseaseEligible) {
      globalStrategy.push(
        'EU: Orphan Medicinal Product Designation eligible — provides 10-year market exclusivity, ' +
        'protocol assistance, fee reductions. Apply to EMA Committee for Orphan Medicinal Products (COMP).'
      );
    }

    jurisdictions.eu = {
      primaryPathway: 'Centralized Procedure via EMA (mandatory for ATMPs per Regulation 1394/2007 Art 14)',
      pathwayDescription:
        'All ATMPs must use the centralized procedure (CP) — no national or decentralized procedure allowed. ' +
        'The Committee for Advanced Therapies (CAT) provides the primary scientific assessment; CHMP adopts ' +
        'the final opinion. Marketing Authorization Application (MAA) submitted directly to EMA.',
      mandatoryRequirements: [
        'Clinical Trial Application (CTA) per Clinical Trials Regulation (EU) No 536/2014 via CTIS',
        'Marketing Authorization Application (MAA) via centralized procedure',
        'CAT classification recommendation (Article 17) — recommended before MAA',
        'EU GMP Part IV compliance for ATMP manufacturing',
        'Qualified Person (QP) certification of each batch',
        'Pharmacovigilance system and Risk Management Plan (RMP)',
        'PSUR (Periodic Safety Update Reports) — every 6 months for first 2 years',
        'Post-authorization efficacy studies (PAES) and safety studies (PASS) as conditions of MA',
      ],
      eligibleExpeditedPrograms: euExpedited,
      estimatedTimelineMonths: {
        min: 7, max: 13,
        notes: 'Standard assessment: 210 active days (~12-13 months with clock stops). ' +
          'Accelerated assessment: 150 active days (~7-9 months with clock stops). ' +
          'Pre-submission: scientific advice meeting recommended ≥12 months before MAA.',
      },
      keyConsiderations: [
        'CAT assessment: CAT provides a draft opinion to CHMP — specific ATMP expertise',
        'Scientific advice: available from EMA, fee reductions for SMEs and PRIME products',
        'Hospital Exemption (Article 28): national-level exemption for non-routine ATMPs prepared on a non-industrial basis — NOT a substitute for MA',
        'ATMP-specific incentives: market exclusivity, data exclusivity per standard EU rules (8+2+1)',
        'Post-authorization monitoring: ATMP-specific follow-up for efficacy and safety per CAT recommendation',
      ],
    };
  }

  // ── Japan (PMDA) ───────────────────────────────────────────────────────
  if (params.targetJurisdictions.includes('japan')) {
    const jpExpedited: PathwaySelectionResult['jurisdictions']['japan']['eligibleExpeditedPrograms'] = [];

    jpExpedited.push({
      program: 'pmda_sakigake',
      name: 'SAKIGAKE Designation',
      eligible: params.seriousCondition && params.unmetMedicalNeed,
      rationale: 'SAKIGAKE for innovative regenerative medicine products with potential for substantial improvement. Priority given to products developed first in Japan.',
      benefits: [
        'Priority consultation with PMDA during development',
        'Pre-application consultation',
        'Priority review (6-month target review period)',
        'Extension of re-examination period',
      ],
    });

    jpExpedited.push({
      program: 'pmda_conditional_time_limited',
      name: 'Conditional/Time-Limited Approval',
      eligible: params.seriousCondition,
      rationale: 'Unique Japanese pathway for regenerative medicine products: conditional approval for up to 7 years based on results "likely to predict efficacy" from a clinical trial, with mandatory post-marketing data collection.',
      benefits: [
        'Approval based on limited clinical data (efficacy data "likely to predict" clinical benefit)',
        'Up to 7-year conditional period for confirmatory post-marketing data collection',
        'National Health Insurance (NHI) coverage during conditional period',
        'Converts to full approval or is withdrawn based on post-marketing study results',
      ],
    });

    jurisdictions.japan = {
      primaryPathway: 'Regenerative Medicine Product Application via PMDA (PMD Act)',
      pathwayDescription:
        'Regenerative medicine products (gene therapy, cell therapy, tissue engineering) follow the ' +
        'PMD Act pathway. Unique conditional/time-limited approval allows marketing based on limited ' +
        'clinical data with mandatory post-marketing studies. PMDA review with expert committee consultation.',
      mandatoryRequirements: [
        'Clinical trial notification (CTN) to PMDA before clinical trials',
        'Manufacturing facility compliance with Regenerative Medicine Safety Act (cell processing facilities)',
        'PMDA pre-application consultation (strongly recommended)',
        'Application for marketing approval under PMD Act (regenerative medicine product category)',
        'GMP compliance per MHLW Ministerial Ordinance No. 93',
        'Post-marketing surveillance plan (mandatory for conditional approval)',
      ],
      eligibleExpeditedPrograms: jpExpedited,
      estimatedTimelineMonths: {
        min: 6, max: 12,
        notes: 'Standard PMDA review: ~12 months. SAKIGAKE priority: ~6 months target. ' +
          'Conditional approval: can be faster as limited efficacy data required. ' +
          'Post-conditional period: up to 7 years for confirmatory data collection.',
      },
      keyConsiderations: [
        'Japan is the first country to implement conditional/time-limited approval specifically for regenerative medicine',
        'Dual regulatory framework: PMD Act (product approval) + Regenerative Medicine Safety Act (clinical use at institutions)',
        'PMDA R&D consultation: extensive pre-submission interaction available',
        'Foreign clinical data: PMDA accepts foreign clinical data with bridging assessment per ICH E5',
      ],
    };
  }

  // ── Global Strategy ────────────────────────────────────────────────────
  if (params.targetJurisdictions.length > 1) {
    globalStrategy.push(
      'Multi-jurisdictional development: align CMC, nonclinical, and clinical strategies to satisfy requirements across all target jurisdictions simultaneously',
      'Harmonized clinical protocol: ICH E6(R2) GCP compliance accepted by FDA, EMA, and PMDA',
      'CMC harmonization: ICH Q-series guidelines (Q5A, Q5B, Q5C, Q5D, Q5E) provide common framework for biologics',
      'Regulatory interaction strategy: schedule pre-IND (FDA), scientific advice (EMA), and PMDA consultation in sequence to incorporate feedback iteratively',
    );
  }

  if (params.orphanDiseaseEligible) {
    globalStrategy.push(
      'Orphan designation: apply in each jurisdiction independently — criteria differ (US: <200,000 prevalence; EU: <5 in 10,000 prevalence; Japan: <50,000 patients)',
    );
  }

  if (params.pediatric) {
    globalStrategy.push(
      'Pediatric development: prepare Pediatric Study Plan (PSP) for FDA, agree Paediatric Investigation Plan (PIP) with EMA Paediatric Committee (PDCO), ' +
      'and consider PMDA pediatric consultation. Extrapolation strategies may be applicable for well-understood diseases.',
    );
  }

  return { jurisdictions, globalStrategy };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ATMP COMPARABILITY ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface ATMPComparabilityParams {
  changeType: ManufacturingChangeType;
  changeDescription: string;
  productType: 'gene_therapy_vector' | 'cell_therapy' | 'gene_modified_cell' | 'tissue_engineered';
  /** Phase of development at time of change. */
  developmentPhase: 'preclinical' | 'phase1' | 'phase2' | 'phase3' | 'post_approval';
  /** Does the change affect a critical process parameter (CPP)? */
  affectsCPP: boolean;
  /** Does the change affect a critical quality attribute (CQA)? */
  affectsCQA: boolean;
  jurisdictions: Jurisdiction[];
}

export interface ATMPComparabilityResult {
  riskLevel: RiskLevel;
  riskRationale: string;
  comparabilityStudyDesign: {
    analyticalComparability: string[];
    functionalComparability: string[];
    stabilityComparability: string[];
    nonclinicalBridging: { required: boolean; studies: string[] };
    clinicalBridging: { required: boolean; studies: string[] };
  };
  regulatorySubmission: {
    submissionType: string;
    timingConsiderations: string;
    regulatoryInteraction: string;
  };
  references: string[];
}

/**
 * Assess comparability study design for an ATMP manufacturing change,
 * following ICH Q5E principles with ATMP-specific considerations.
 */
export function assessATMPComparability(
  params: ATMPComparabilityParams,
): ATMPComparabilityResult {
  // ── Risk Assessment ────────────────────────────────────────────────────
  let riskLevel: RiskLevel;
  let riskRationale: string;

  const isLateStage = params.developmentPhase === 'phase3' || params.developmentPhase === 'post_approval';
  const isHighImpactChange =
    params.changeType === 'site_transfer' ||
    params.changeType === 'process_change' ||
    params.changeType === 'formulation_change';

  if (params.affectsCQA && isHighImpactChange && isLateStage) {
    riskLevel = 'very_high';
    riskRationale =
      'Manufacturing change affects critical quality attributes (CQAs), involves a high-impact ' +
      'change type (site transfer, process change, or formulation change), and occurs in late-stage ' +
      'development or post-approval. Extensive comparability data including potential clinical bridging required.';
  } else if (params.affectsCQA || (isHighImpactChange && isLateStage)) {
    riskLevel = 'high';
    riskRationale =
      'Manufacturing change has significant potential to impact product quality. ' +
      (params.affectsCQA ? 'Affects critical quality attributes (CQAs). ' : '') +
      (isHighImpactChange && isLateStage ? 'High-impact change in late development/post-approval. ' : '') +
      'Comprehensive analytical and functional comparability required; nonclinical bridging likely.';
  } else if (params.affectsCPP || isHighImpactChange) {
    riskLevel = 'moderate';
    riskRationale =
      'Manufacturing change involves a critical process parameter (CPP) change or a significant ' +
      'process modification. Analytical and functional comparability studies required; nonclinical ' +
      'bridging may be needed depending on results.';
  } else {
    riskLevel = 'low';
    riskRationale =
      'Manufacturing change is minor and does not affect CPPs or CQAs. Standard analytical ' +
      'comparability with abbreviated functional testing should be sufficient.';
  }

  // ── Analytical Comparability ───────────────────────────────────────────
  const analyticalComparability: string[] = [
    'Side-by-side analytical testing of ≥3 pre-change and ≥3 post-change batches using the full release panel',
    'Identity testing: cell identity (immunophenotype) or vector identity (restriction mapping, sequencing)',
    'Purity: contaminant profiles (host cell protein, residual DNA, process-related impurities)',
    'Potency: mechanism-of-action-based potency assay(s)',
  ];

  if (params.productType === 'gene_therapy_vector') {
    analyticalComparability.push(
      'Vector titer: comparison by orthogonal methods (qPCR, ddPCR, TCID50)',
      'Full/empty capsid ratio (for AAV vectors): AUC or cryoEM',
      'Capsid protein ratio and post-translational modifications: SDS-PAGE, mass spectrometry',
      'Aggregation: SEC-MALS, DLS',
      'Residual host cell DNA and protein: qPCR and ELISA',
      'Endotoxin and sterility: standard compendial methods',
    );
  }

  if (params.productType === 'cell_therapy' || params.productType === 'gene_modified_cell') {
    analyticalComparability.push(
      'Cell viability and recovery: trypan blue or automated cell counter',
      'Immunophenotype: multi-parameter flow cytometry panel',
      'T-cell subset distribution: CD4/CD8 ratio, memory phenotype (Tscm, Tcm, Tem, Teff)',
      'Cell size and morphology: automated image analysis',
    );
  }

  if (params.productType === 'gene_modified_cell') {
    analyticalComparability.push(
      'Transduction efficiency: %CAR+ or %transgene+ by flow cytometry',
      'Vector copy number (VCN): qPCR or ddPCR',
      'Transgene expression level: MFI by flow cytometry or protein quantification',
    );
  }

  if (params.productType === 'tissue_engineered') {
    analyticalComparability.push(
      'Scaffold integrity: mechanical testing, porosity, degradation rate',
      'Cell distribution within scaffold: histology, confocal imaging',
      'Tissue architecture: H&E staining, immunohistochemistry',
    );
  }

  // ── Extended Characterization (beyond release testing) ─────────────────
  if (riskLevel === 'high' || riskLevel === 'very_high') {
    analyticalComparability.push(
      'Extended characterization: assays beyond routine release testing to detect subtle quality differences',
      'Process-related impurity profiling: quantitative comparison of impurity spectrum',
      'Product-related impurity/variant profiling: degradation products, aggregates, fragments',
    );
  }

  // ── Functional Comparability ───────────────────────────────────────────
  const functionalComparability: string[] = [
    'Primary potency assay: statistical comparison (equivalence or non-inferiority) of pre- and post-change lots',
    'Pre-define equivalence margins based on historical batch data and clinical relevance',
  ];

  if (params.productType === 'gene_modified_cell' || params.productType === 'cell_therapy') {
    functionalComparability.push(
      'Cytotoxicity assay: antigen-specific target cell killing (for CAR-T / TCR-T products)',
      'Cytokine secretion assay: IFN-gamma, TNF-alpha, IL-2 upon antigen stimulation',
      'Proliferation assay: expansion capacity upon re-stimulation',
      'Exhaustion marker assessment: PD-1, TIM-3, LAG-3 expression comparison',
    );
  }

  if (params.productType === 'gene_therapy_vector') {
    functionalComparability.push(
      'Transduction efficiency: in vitro transduction of relevant target cells',
      'Transgene expression: protein expression level and duration in transduced cells',
      'Bioactivity assay: functional assay for the expressed protein (enzyme activity, binding affinity, etc.)',
    );
  }

  // ── Stability Comparability ────────────────────────────────────────────
  const stabilityComparability: string[] = [
    'Parallel stability studies: post-change material placed on stability alongside retained pre-change reference samples',
    'Real-time stability: primary storage condition, sampling at 0, 3, 6, 9, 12 months minimum',
    'Accelerated/stress stability: elevated temperature and other stress conditions per ICH Q5C',
    'Stability-indicating assays: potency, purity, identity, and appearance over shelf life',
    'Compare degradation kinetics and pathways between pre- and post-change material',
  ];

  if (params.changeType === 'formulation_change') {
    stabilityComparability.push(
      'Formulation change-specific: extended stability with focus on aggregation, activity loss, and container-closure interactions',
      'Freeze-thaw cycling study if cryopreserved product (≥3 freeze-thaw cycles)',
    );
  }

  // ── Nonclinical Bridging ───────────────────────────────────────────────
  const nonclinicalRequired = riskLevel === 'high' || riskLevel === 'very_high';
  const nonclinicalStudies: string[] = [];
  if (nonclinicalRequired) {
    nonclinicalStudies.push(
      'In vivo bridging study in relevant animal model: compare efficacy/biodistribution of pre- and post-change product',
    );
    if (params.productType === 'gene_modified_cell' || params.productType === 'cell_therapy') {
      nonclinicalStudies.push(
        'NSG mouse engraftment study: compare persistence, expansion, and anti-tumor activity',
        'In vivo toxicology assessment with post-change product if analytical comparability shows differences',
      );
    }
    if (params.productType === 'gene_therapy_vector') {
      nonclinicalStudies.push(
        'Biodistribution comparison: qPCR in key tissues',
        'Efficacy bridging: in vivo pharmacodynamic study in disease model',
      );
    }
  }

  // ── Clinical Bridging ──────────────────────────────────────────────────
  const clinicalRequired = riskLevel === 'very_high' && isLateStage;
  const clinicalStudies: string[] = [];
  if (clinicalRequired) {
    clinicalStudies.push(
      'Clinical bridging study: PK/PD comparison or efficacy endpoint comparison with pre-change and post-change product',
      'May be designed as within-patient crossover (if feasible) or parallel-group comparison',
      'Sample size justification based on pre-defined equivalence margins',
      'Discuss clinical bridging strategy with regulators before initiation (Pre-IND/Scientific Advice)',
    );
  }

  // ── Regulatory Submission ──────────────────────────────────────────────
  let submissionType: string;
  let timingConsiderations: string;
  let regulatoryInteraction: string;

  if (params.developmentPhase === 'post_approval') {
    if (riskLevel === 'high' || riskLevel === 'very_high') {
      submissionType = 'Prior Approval Supplement (PAS) / Type II Variation (EU)';
      timingConsiderations = 'Submit and receive approval BEFORE implementing the change in commercial manufacturing.';
      regulatoryInteraction = 'Pre-submission meeting with FDA/EMA to align on comparability strategy and acceptance criteria.';
    } else if (riskLevel === 'moderate') {
      submissionType = 'CBE-30 Supplement (US) / Type IB Variation (EU)';
      timingConsiderations = 'Submit at least 30 days before implementing the change. FDA may request additional data.';
      regulatoryInteraction = 'Notification with supporting comparability data. Pre-submission meeting optional but recommended.';
    } else {
      submissionType = 'Annual Report (US) / Type IA Variation (EU)';
      timingConsiderations = 'Report the change in the next Annual Report (US) or submit within 12 months (EU Type IA).';
      regulatoryInteraction = 'Notification only — no pre-approval required.';
    }
  } else {
    submissionType = 'IND Amendment (US) / CTA Substantial Modification (EU)';
    timingConsiderations =
      'Submit IND amendment or CTA substantial modification before using post-change material in clinical trials. ' +
      'FDA: information amendment to IND. EU: substantial modification per Regulation 536/2014.';
    regulatoryInteraction =
      'Discuss comparability strategy at next scheduled FDA/EMA interaction. For significant changes, ' +
      'a dedicated comparability meeting may be warranted.';
  }

  // ── References ─────────────────────────────────────────────────────────
  const references: string[] = [
    'ICH Q5E: Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process',
    'ICH Q5C: Quality of Biotechnological Products — Stability Testing of Biotechnological/Biological Products',
  ];

  if (params.jurisdictions.includes('us')) {
    references.push(
      'FDA Guidance: CMC Information for Human Gene Therapy INDs (2020)',
      'FDA Guidance: Changes to an Approved Application for Specified Biotechnology and Specified Synthetic Biological Products (1997)',
      'FDA Guidance: Comparability Protocols for Human Drugs and Biologics — Chemistry, Manufacturing, and Controls Information (2016)',
    );
  }

  if (params.jurisdictions.includes('eu')) {
    references.push(
      'EMA Guideline on comparability of biotechnology-derived medicinal products after a change in the manufacturing process (EMEA/CHMP/BWP/3207/00/Rev1)',
      'EMA Reflection paper on quality aspects of ATMPs (EMA/CAT/600280/2010 Rev. 2)',
      'EudraLex Volume 4 Part IV: Guidelines on GMP specific to ATMPs',
    );
  }

  return {
    riskLevel,
    riskRationale,
    comparabilityStudyDesign: {
      analyticalComparability,
      functionalComparability,
      stabilityComparability,
      nonclinicalBridging: { required: nonclinicalRequired, studies: nonclinicalStudies },
      clinicalBridging: { required: clinicalRequired, studies: clinicalStudies },
    },
    regulatorySubmission: {
      submissionType,
      timingConsiderations,
      regulatoryInteraction,
    },
    references,
  };
}
