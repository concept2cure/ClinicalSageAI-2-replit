/**
 * Advanced Therapy (ATMP / Cell & Gene Therapy) tool definitions for AnA.
 *
 * Exposes six deterministic knowledge-base engines covering ATMP classification,
 * gene therapy regulatory requirements, cell therapy manufacturing, CAR-T
 * specifics, regulatory pathway selection, and manufacturing comparability.
 *
 * Definitions only — handlers live in AnaToolExecutor.ts (registerToolHandler).
 *
 * @module server/services/ana/advancedTherapyTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned values verbatim. Do NOT recompute or soften them.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLASSIFY ATMP
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_ATMP: AnaTool = {
  name: 'classify_atmp',
  description:
    'Classify a product under the EU ATMP Regulation (EC) No 1394/2007 (gene therapy, somatic cell therapy, ' +
    'tissue-engineered product, combined ATMP) and/or FDA CBER/CDRH frameworks (BLA under PHS Act 351, ' +
    '21 CFR 1271 HCT/P 361 vs 351, combination product). Applies the CAT classification flowchart (EU) ' +
    'and the FDA four-criteria test for HCT/Ps (minimal manipulation, homologous use, no combination, ' +
    'no systemic effect). Also provides Japan PMDA regenerative medicine product classification. Returns ' +
    'the regulatory category, rationale with cited regulatory basis, whether centralized procedure is mandatory (EU), ' +
    'the FDA review division, and pathway implications. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: ['gene_transfer', 'gene_editing', 'cell_based', 'tissue_based', 'combined'],
        description:
          'Primary product type. "gene_transfer": introduces exogenous genetic material; ' +
          '"gene_editing": modifies endogenous genome (CRISPR, TALEN, ZFN); ' +
          '"cell_based": therapeutic cells without gene modification; ' +
          '"tissue_based": engineered tissue construct; ' +
          '"combined": biologic + device combination.',
      },
      containsCellsOrTissues: {
        type: 'boolean',
        description: 'Does the product contain or consist of cells or tissues?',
      },
      substantiallyManipulated: {
        type: 'boolean',
        description:
          'EU: are cells/tissues "substantially manipulated" per Annex I to Regulation 1394/2007 ' +
          '(i.e., biological characteristics, physiological functions, or structural properties ' +
          'relevant for the intended clinical use have been altered)? ' +
          'US: "more than minimally manipulated" per 21 CFR 1271.10(a)(1)?',
      },
      homologousUse: {
        type: 'boolean',
        description:
          'US-specific: is the product intended for homologous use (same essential function in ' +
          'recipient as in donor) per 21 CFR 1271.10(a)(2)?',
      },
      containsDeviceComponent: {
        type: 'boolean',
        description: 'Does the product incorporate a medical device as an integral part?',
      },
      cellOrigin: {
        type: 'string',
        enum: ['autologous', 'allogeneic', 'xenogeneic'],
        description: 'Origin of the cellular component.',
      },
      geneticModification: {
        type: 'boolean',
        description: 'Does the product involve genetic modification of cells?',
      },
      jurisdictions: {
        type: 'array',
        items: { type: 'string', enum: ['us', 'eu', 'japan', 'canada', 'uk'] },
        description: 'Target jurisdictions for classification assessment.',
      },
    },
    required: ['productType', 'containsCellsOrTissues', 'substantiallyManipulated', 'containsDeviceComponent', 'geneticModification', 'jurisdictions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ASSESS GENE THERAPY REQUIREMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_GENE_THERAPY_REQUIREMENTS: AnaTool = {
  name: 'assess_gene_therapy_requirements',
  description:
    'Assess regulatory requirements for a gene therapy product based on vector type, delivery mode, ' +
    'and target jurisdictions. Returns: (1) vector profile (integrating status, immunogenicity risk, ' +
    'insertional mutagenesis risk, pre-existing immunity, payload capacity); (2) CMC requirements ' +
    'per FDA Gene Therapy CMC Guidance (2020) and EMA CAT guidelines; (3) nonclinical requirements ' +
    '(biodistribution, toxicology, shedding, RCR/RCL testing); (4) clinical requirements (IND/CTA, ' +
    'dose escalation, immunogenicity monitoring); (5) vector-specific guidance (AAV, lentiviral, ' +
    'adenoviral, mRNA/LNP, CRISPR RNP, etc.); (6) long-term follow-up duration (15 years for ' +
    'integrating vectors, 5 years for non-integrating per FDA LTFU Guidance 2020); ' +
    '(7) regulatory references with specific FDA/EMA guidance citations. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      vectorType: {
        type: 'string',
        enum: [
          'aav', 'lentiviral', 'retroviral_gamma', 'adenoviral', 'hsv',
          'non_viral_lipid_nanoparticle', 'non_viral_polymer', 'non_viral_naked_plasmid',
          'mrna', 'crispr_rnp', 'transposon',
        ],
        description: 'Vector/delivery system type.',
      },
      integrating: {
        type: 'boolean',
        description:
          'Does the vector integrate into the host genome? For known vectors this is pre-populated ' +
          'from the knowledge base, but the caller can override (e.g., AAV with rare integration events).',
      },
      indication: {
        type: 'string',
        description:
          'Target disease/indication. Used to select indication-specific FDA guidance ' +
          '(e.g., hemophilia, retinal disorders, rare diseases).',
      },
      deliveryMode: {
        type: 'string',
        enum: ['in_vivo', 'ex_vivo'],
        description: '"in_vivo": vector administered directly to patient. "ex_vivo": cells modified outside the body and re-infused.',
      },
      routeOfAdministration: {
        type: 'string',
        description: 'Route of administration (e.g., intravenous, subretinal, intrathecal, intramuscular).',
      },
      jurisdictions: {
        type: 'array',
        items: { type: 'string', enum: ['us', 'eu', 'japan', 'canada', 'uk'] },
        description: 'Target jurisdictions.',
      },
      firstInHuman: {
        type: 'boolean',
        description: 'Is this a first-in-human study? Affects clinical trial design recommendations.',
      },
      pediatric: {
        type: 'boolean',
        description: 'Does the target population include pediatric patients?',
      },
    },
    required: ['vectorType', 'integrating', 'indication', 'deliveryMode', 'jurisdictions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ASSESS CELL THERAPY MANUFACTURING
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_CELL_THERAPY_MANUFACTURING: AnaTool = {
  name: 'assess_cell_therapy_manufacturing',
  description:
    'Assess manufacturing requirements for a cell therapy product. Returns: (1) GMP framework and ' +
    'requirements per EU GMP Part IV (ATMP-specific), FDA 21 CFR 210/211/600/610, or PMDA GCTP; ' +
    '(2) facility requirements (cleanroom classification, environmental monitoring); (3) starting ' +
    'material qualification (donor eligibility, infectious disease testing, cell bank qualification ' +
    'per ICH Q5D); (4) release testing panel (sterility, mycoplasma, endotoxin, viability, identity, ' +
    'potency, purity, VCN); (5) potency assay development requirements per FDA Guidance (2011); ' +
    '(6) cold chain and logistics (shipping validation, chain of custody/identity); ' +
    '(7) comparability framework per ICH Q5E for manufacturing changes. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      cellType: {
        type: 'string',
        description:
          'Cell type (e.g., T cells, NK cells, MSCs, iPSC-derived, dendritic cells, HSCs, chondrocytes).',
      },
      cellOrigin: {
        type: 'string',
        enum: ['autologous', 'allogeneic', 'xenogeneic'],
        description: 'Cell origin. Affects donor qualification, chain of identity, and manufacturing model.',
      },
      geneticallyModified: {
        type: 'boolean',
        description: 'Are the cells genetically modified? Affects release testing (VCN, RCR/RCL, transgene expression).',
      },
      cryopreserved: {
        type: 'boolean',
        description: 'Is the final product cryopreserved? Affects release testing, logistics, and stability.',
      },
      cultureDurationDays: {
        type: 'number',
        description: 'Approximate ex vivo culture/expansion duration in days. Affects contamination risk and testing.',
      },
      jurisdictions: {
        type: 'array',
        items: { type: 'string', enum: ['us', 'eu', 'japan', 'canada', 'uk'] },
        description: 'Target jurisdictions for GMP framework selection.',
      },
    },
    required: ['cellType', 'cellOrigin', 'geneticallyModified', 'cryopreserved', 'jurisdictions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. ASSESS CAR-T REQUIREMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_CART_REQUIREMENTS: AnaTool = {
  name: 'assess_cart_requirements',
  description:
    'Assess CAR-T and engineered cell therapy-specific regulatory requirements. Returns: ' +
    '(1) manufacturing requirements (leukapheresis, activation, transduction, expansion, formulation, ' +
    'release testing panel with CAR expression, VCN, potency); (2) safety monitoring for CRS (Cytokine ' +
    'Release Syndrome) and ICANS (Immune Effector Cell-Associated Neurotoxicity Syndrome) with ASTCT ' +
    'consensus grading scales, monitoring schedules, and management algorithms (tocilizumab, corticosteroids); ' +
    '(3) REMS requirements for FDA-approved CAR-T products (certified centers, trained prescribers, ' +
    'tocilizumab availability) with approved precedents (Kymriah, Yescarta, Tecartus, Breyanzi, Abecma, ' +
    'Carvykti); (4) bridging strategies for manufacturing changes per ICH Q5E; (5) regulatory considerations ' +
    'including RMAT designation, allogeneic-specific issues, and FDA T-cell malignancy safety communication ' +
    '(November 2023). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      targetAntigen: {
        type: 'string',
        description: 'CAR target antigen (e.g., CD19, BCMA, CD22, GD2, HER2, mesothelin, GPC3).',
      },
      carGeneration: {
        type: 'string',
        enum: ['1st', '2nd', '3rd', '4th_armored'],
        description:
          'CAR construct generation. 1st: CD3-zeta only; 2nd: one co-stim domain; ' +
          '3rd: two co-stim domains; 4th/armored: additional engineered features (cytokine secretion, safety switches).',
      },
      costimDomains: {
        type: 'array',
        items: { type: 'string', enum: ['CD28', '4-1BB', 'OX40', 'ICOS', 'other'] },
        description: 'Co-stimulatory domain(s) in the CAR construct.',
      },
      indication: {
        type: 'string',
        description: 'Target indication (e.g., r/r DLBCL, r/r ALL, multiple myeloma, solid tumors).',
      },
      vectorType: {
        type: 'string',
        enum: [
          'aav', 'lentiviral', 'retroviral_gamma', 'adenoviral', 'hsv',
          'non_viral_lipid_nanoparticle', 'non_viral_polymer', 'non_viral_naked_plasmid',
          'mrna', 'crispr_rnp', 'transposon',
        ],
        description: 'Vector/delivery system used for genetic modification of T cells.',
      },
      cellOrigin: {
        type: 'string',
        enum: ['autologous', 'allogeneic'],
        description: 'Autologous (patient-derived) or allogeneic (donor/off-the-shelf).',
      },
      jurisdictions: {
        type: 'array',
        items: { type: 'string', enum: ['us', 'eu', 'japan', 'canada', 'uk'] },
        description: 'Target jurisdictions.',
      },
    },
    required: ['targetAntigen', 'carGeneration', 'costimDomains', 'indication', 'vectorType', 'cellOrigin', 'jurisdictions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. SELECT ATMP PATHWAY
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_ATMP_PATHWAY: AnaTool = {
  name: 'select_atmp_pathway',
  description:
    'Select the recommended regulatory pathway and assess eligibility for expedited programs across ' +
    'jurisdictions for an ATMP/cell & gene therapy product. Returns per jurisdiction: (1) primary pathway ' +
    '(FDA: BLA via CBER; EMA: centralized procedure mandatory per Regulation 1394/2007; PMDA: PMD Act ' +
    'regenerative medicine pathway); (2) mandatory requirements (IND/CTA, BLA/MAA, GMP, LTFU); ' +
    '(3) eligible expedited programs with rationale — FDA: RMAT, Breakthrough Therapy, Fast Track, ' +
    'Accelerated Approval, Priority Review; EMA: PRIME, Accelerated Assessment, Conditional MA; ' +
    'PMDA: SAKIGAKE, Conditional/Time-Limited Approval; (4) estimated review timelines; ' +
    '(5) key considerations and global harmonization strategy; (6) orphan designation eligibility. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: ['gene_therapy', 'cell_therapy', 'tissue_engineered', 'combined_atmp'],
        description: 'ATMP product type.',
      },
      indication: {
        type: 'string',
        description: 'Target therapeutic indication.',
      },
      seriousCondition: {
        type: 'boolean',
        description: 'Does the product target a serious or life-threatening condition?',
      },
      unmetMedicalNeed: {
        type: 'boolean',
        description: 'Does the product address an unmet medical need (no adequate approved therapy)?',
      },
      substantialImprovement: {
        type: 'boolean',
        description:
          'Is there preliminary clinical evidence indicating the product may offer substantial ' +
          'improvement over existing therapies?',
      },
      surrogateEndpointAvailable: {
        type: 'boolean',
        description:
          'Is a surrogate or intermediate clinical endpoint available that is reasonably likely ' +
          'to predict clinical benefit?',
      },
      targetJurisdictions: {
        type: 'array',
        items: { type: 'string', enum: ['us', 'eu', 'japan', 'canada', 'uk'] },
        description: 'Target jurisdictions for pathway selection.',
      },
      cellOrigin: {
        type: 'string',
        enum: ['autologous', 'allogeneic'],
        description: 'Cell origin (autologous or allogeneic), if applicable.',
      },
      pediatric: {
        type: 'boolean',
        description: 'Does the target population include pediatric patients?',
      },
      orphanDiseaseEligible: {
        type: 'boolean',
        description:
          'Is the product potentially eligible for orphan designation? ' +
          '(US: <200,000 prevalence; EU: <5/10,000 prevalence; Japan: <50,000 patients)',
      },
    },
    required: ['productType', 'indication', 'seriousCondition', 'unmetMedicalNeed', 'substantialImprovement', 'surrogateEndpointAvailable', 'targetJurisdictions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. ASSESS ATMP COMPARABILITY
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ATMP_COMPARABILITY: AnaTool = {
  name: 'assess_atmp_comparability',
  description:
    'Assess comparability study design for an ATMP manufacturing change following ICH Q5E principles ' +
    'with ATMP-specific considerations. Returns: (1) risk level (low/moderate/high/very_high) with ' +
    'rationale based on change type, CPP/CQA impact, and development phase; (2) comparability study ' +
    'design — analytical comparability (release panel + extended characterization), functional comparability ' +
    '(potency, cytotoxicity, cytokine secretion), stability comparability, nonclinical bridging ' +
    '(if analytical inconclusive), and clinical bridging (if nonclinical inconclusive for high-risk ' +
    'post-approval changes); (3) regulatory submission type — PAS vs CBE-30 vs Annual Report (FDA), ' +
    'Type II vs IB vs IA Variation (EU); (4) timing and regulatory interaction recommendations; ' +
    '(5) regulatory references (ICH Q5E, FDA CMC Guidance, EMA comparability guidelines). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      changeType: {
        type: 'string',
        enum: ['process_change', 'scale_up', 'site_transfer', 'raw_material_change', 'equipment_change', 'formulation_change'],
        description: 'Type of manufacturing change.',
      },
      changeDescription: {
        type: 'string',
        description: 'Brief description of the specific manufacturing change (e.g., "scale-up from 10L to 50L bioreactor", "transfer from Site A to Site B").',
      },
      productType: {
        type: 'string',
        enum: ['gene_therapy_vector', 'cell_therapy', 'gene_modified_cell', 'tissue_engineered'],
        description:
          'Product type. "gene_therapy_vector": viral/non-viral vector product; "cell_therapy": unmodified cell product; ' +
          '"gene_modified_cell": genetically modified cells (e.g., CAR-T); "tissue_engineered": tissue-engineered product.',
      },
      developmentPhase: {
        type: 'string',
        enum: ['preclinical', 'phase1', 'phase2', 'phase3', 'post_approval'],
        description: 'Current development phase when the change is being implemented.',
      },
      affectsCPP: {
        type: 'boolean',
        description: 'Does the change affect a Critical Process Parameter (CPP)?',
      },
      affectsCQA: {
        type: 'boolean',
        description: 'Does the change affect a Critical Quality Attribute (CQA)?',
      },
      jurisdictions: {
        type: 'array',
        items: { type: 'string', enum: ['us', 'eu', 'japan', 'canada', 'uk'] },
        description: 'Target jurisdictions for regulatory submission.',
      },
    },
    required: ['changeType', 'changeDescription', 'productType', 'developmentPhase', 'affectsCPP', 'affectsCQA', 'jurisdictions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Tool Array
// ─────────────────────────────────────────────────────────────────────────────

/** Advanced Therapy (ATMP / Cell & Gene Therapy) tools, spread into ALL_ANA_TOOLS. */
export const ADVANCED_THERAPY_TOOLS: AnaTool[] = [
  CLASSIFY_ATMP,
  ASSESS_GENE_THERAPY_REQUIREMENTS,
  ASSESS_CELL_THERAPY_MANUFACTURING,
  ASSESS_CART_REQUIREMENTS,
  SELECT_ATMP_PATHWAY,
  ASSESS_ATMP_COMPARABILITY,
];
