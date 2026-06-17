/**
 * Advanced-therapy (ATMP / cell & gene therapy / regenerative medicine) framework
 * & classification expert — EU, FDA, JP.
 *
 * Advanced therapies — gene therapies, somatic cell therapies, tissue-engineered
 * products and their device-combined variants — sit in a distinct regulatory
 * track from conventional small molecules and biologics. Which legal category a
 * product falls into, which body assesses it, and which marketing route it must
 * travel are program-defining RA judgements taken at inception and defended at
 * pre-submission / classification meetings.
 *
 * This service returns, per region, the modeled advanced-therapy framework (the
 * regulatory category, oversight body, marketing route, expedited option and the
 * modeled sub-classes) and — given a region + modality — the resulting
 * classification, regulatory route, oversight body and citation. Deterministic.
 *
 * Regions:
 *  - EU  (ATMP under Regulation (EC) No 1394/2007)
 *  - FDA (cell & gene therapies as biologics, regulated by CBER/OTP)
 *  - JP  (regenerative medical products, PMDA)
 *
 * Pure / deterministic — no DB, no IO. Classification is an indicative reference
 * aid: the binding category depends on the product's mechanism of action, the
 * degree of manipulation, and the intended use, and must be confirmed with the
 * agency (EU CAT classification / FDA OTP / PMDA).
 *
 * References:
 *  - EU: Regulation (EC) No 1394/2007 on advanced therapy medicinal products;
 *    Directive 2001/83/EC Annex I Part IV. ATMP classes: Gene Therapy Medicinal
 *    Product (GTMP), Somatic Cell Therapy Medicinal Product (sCTMP),
 *    Tissue-Engineered Product (TEP), and combined ATMP (incorporates one or more
 *    medical devices). Marketing authorisation is via the CENTRALISED procedure
 *    (mandatory); the Committee for Advanced Therapies (CAT) prepares the
 *    classification and the assessment.
 *  - FDA: PHS Act §351 (Biologics License Application); 21 CFR Part 1271 (Human
 *    Cells, Tissues, and Cellular and Tissue-Based Products / HCT/Ps); 21st
 *    Century Cures Act §3033 (Regenerative Medicine Advanced Therapy / RMAT).
 *    Cell & gene therapies are licensed as biologics (BLA) by CBER (Office of
 *    Therapeutic Products). An HCT/P that is minimally manipulated and intended
 *    for homologous use may be regulated solely under §361 + 21 CFR 1271;
 *    otherwise it is a §351 product requiring a BLA. RMAT is an expedited
 *    designation for regenerative therapies treating serious conditions with
 *    preliminary clinical evidence of addressing an unmet need.
 *  - JP: Act on the Safety of Regenerative Medicine; Act on Securing Quality,
 *    Efficacy and Safety of Pharmaceuticals and Medical Devices (PMD Act).
 *    "Regenerative medical products" are a dedicated category with a conditional
 *    & time-limited approval pathway; Sakigake designation expedites breakthrough
 *    products.
 *
 * @module server/services/global-ri/advanced-therapies
 */

export type AdvancedTherapyRegion = 'EU' | 'FDA' | 'JP';

/** A modeled advanced-therapy modality. */
export type AtmpModality = 'gene_therapy' | 'cell_therapy' | 'tissue_engineered' | 'combined';

/** A single modeled class / product type within a region's framework. */
export interface AdvancedTherapyClassInfo {
  /** Short identifier for the class (e.g. 'GTMP', 'BLA', 'RMP'). */
  id: string;
  /** Human-readable class name. */
  name: string;
  /** Governing citation for this class. */
  citation: string;
}

export interface AdvancedTherapyFramework {
  region: AdvancedTherapyRegion;
  /** The regulatory category these products fall into in the region. */
  category: string;
  /** The body that assesses / classifies the products. */
  oversightBody: string;
  /** The marketing-authorisation / licensing route. */
  marketingRoute: string;
  /** The principal expedited option available in the region. */
  expeditedOption: string;
  /** The modeled sub-classes / product types. */
  classes: AdvancedTherapyClassInfo[];
  /** Governing citation for the framework as a whole. */
  citation: string;
  notes: string[];
}

/** Shared honest caveat appended to every result. */
function CAVEAT_NOTE(): string {
  return 'Classification depends on the product\'s mechanism of action, degree of manipulation and intended use; confirm with the agency (EU CAT classification / FDA OTP / PMDA).';
}

const EU_GTMP = 'Reg (EC) No 1394/2007; Dir 2001/83/EC Annex I Part IV (gene therapy medicinal product)';
const EU_SCTMP = 'Reg (EC) No 1394/2007; Dir 2001/83/EC Annex I Part IV (somatic cell therapy medicinal product)';
const EU_TEP = 'Reg (EC) No 1394/2007 Art 2(1)(b); Dir 2001/83/EC Annex I Part IV (tissue-engineered product)';
const EU_COMBINED = 'Reg (EC) No 1394/2007 Art 2(1)(d) (combined ATMP incorporating a medical device)';

const FDA_BLA_CIT = 'PHS Act §351 (42 USC 262(a)); regulated by CBER/OTP';
const FDA_HCTP_CIT = '21 CFR Part 1271 (HCT/Ps); §361 PHS Act';
const FDA_RMAT_CIT = '21st Century Cures Act §3033 (RMAT designation)';

const JP_RMP_CIT = 'PMD Act (regenerative medical products); Act on the Safety of Regenerative Medicine';
const JP_SAKIGAKE_CIT = 'PMDA Sakigake designation (breakthrough products)';

const FRAMEWORKS: Record<AdvancedTherapyRegion, AdvancedTherapyFramework> = {
  EU: {
    region: 'EU',
    category: 'Advanced Therapy Medicinal Product (ATMP)',
    oversightBody:
      'Committee for Advanced Therapies (CAT) prepares the classification and assessment; CHMP adopts the opinion. Marketing authorisation via the centralised procedure (EMA).',
    marketingRoute: 'Centralised procedure (mandatory for ATMPs)',
    expeditedOption: 'PRIME (PRIority MEdicines) scheme for eligible ATMPs',
    classes: [
      { id: 'GTMP', name: 'Gene Therapy Medicinal Product', citation: EU_GTMP },
      { id: 'sCTMP', name: 'Somatic Cell Therapy Medicinal Product', citation: EU_SCTMP },
      { id: 'TEP', name: 'Tissue-Engineered Product', citation: EU_TEP },
      { id: 'Combined ATMP', name: 'Combined ATMP (incorporates a medical device)', citation: EU_COMBINED },
    ],
    citation: 'Regulation (EC) No 1394/2007; Directive 2001/83/EC Annex I Part IV',
    notes: [
      'Marketing authorisation for an ATMP is granted via the centralised procedure and is mandatory; the Committee for Advanced Therapies (CAT) prepares the classification and the assessment.',
      'An applicant may request a scientific classification (ATMP classification) from the CAT to confirm whether and into which class a product falls.',
      CAVEAT_NOTE(),
    ],
  },
  FDA: {
    region: 'FDA',
    category: 'Biologic (cell & gene therapy), regulated by CBER',
    oversightBody: 'Center for Biologics Evaluation and Research (CBER), Office of Therapeutic Products (OTP)',
    marketingRoute: 'Biologics License Application (BLA) under PHS Act §351',
    expeditedOption: 'Regenerative Medicine Advanced Therapy (RMAT) designation',
    classes: [
      { id: 'BLA (351)', name: 'Biologic licensed under PHS Act §351 (BLA) — CBER/OTP', citation: FDA_BLA_CIT },
      { id: '361 HCT/P', name: 'HCT/P regulated solely under §361 + 21 CFR 1271 (minimal manipulation, homologous use)', citation: FDA_HCTP_CIT },
      { id: 'RMAT', name: 'Regenerative Medicine Advanced Therapy (expedited designation)', citation: FDA_RMAT_CIT },
    ],
    citation: 'PHS Act §351 (BLA); 21 CFR Part 1271 (HCT/Ps); 21st Century Cures Act §3033 (RMAT)',
    notes: [
      'Cell & gene therapies are licensed as biologics via a BLA reviewed by CBER\'s Office of Therapeutic Products (OTP).',
      'An HCT/P that is minimally manipulated and intended for homologous use (and meets the other 21 CFR 1271.10 criteria) may be regulated solely under §361 + 21 CFR Part 1271, with no BLA; otherwise it is a §351 product requiring a BLA.',
      'RMAT (Regenerative Medicine Advanced Therapy) is an expedited designation for a regenerative therapy intended to treat a serious condition where preliminary clinical evidence indicates potential to address an unmet medical need.',
      CAVEAT_NOTE(),
    ],
  },
  JP: {
    region: 'JP',
    category: 'Regenerative medical product',
    oversightBody: 'Pharmaceuticals and Medical Devices Agency (PMDA); Ministry of Health, Labour and Welfare (MHLW)',
    marketingRoute: 'Marketing approval as a regenerative medical product (conditional & time-limited approval available)',
    expeditedOption: 'Sakigake designation (breakthrough products)',
    classes: [
      { id: 'RMP', name: 'Regenerative medical product (conditional & time-limited approval available)', citation: JP_RMP_CIT },
      { id: 'Sakigake', name: 'Sakigake-designated regenerative medical product (expedited)', citation: JP_SAKIGAKE_CIT },
    ],
    citation: 'Act on the Safety of Regenerative Medicine; PMD Act (regenerative medical products)',
    notes: [
      'Japan regulates these products in a dedicated "regenerative medical products" category under the PMD Act.',
      'A conditional & time-limited approval pathway permits early approval where efficacy is probable and safety is confirmed, subject to post-marketing confirmation within a defined period.',
      'Sakigake designation expedites review of breakthrough regenerative medical products.',
      CAVEAT_NOTE(),
    ],
  },
};

/**
 * Return the modeled advanced-therapy framework for a region.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getAdvancedTherapyFramework(region: AdvancedTherapyRegion): AdvancedTherapyFramework {
  const framework = FRAMEWORKS[region];
  if (!framework) throw new Error(`No advanced-therapy framework modeled for region "${region}".`);
  return framework;
}

export interface AdvancedTherapyClassificationInput {
  region: AdvancedTherapyRegion;
  modality: AtmpModality;
}

export interface AdvancedTherapyClassification {
  region: AdvancedTherapyRegion;
  modality: AtmpModality;
  /** The resulting product classification. */
  classification: string;
  /** The regulatory / marketing route that follows. */
  regulatoryRoute: string;
  /** The body that assesses the product. */
  oversightBody: string;
  citation: string;
  notes: string[];
}

const EU_MODALITY_MAP: Record<AtmpModality, { classification: string; citation: string }> = {
  gene_therapy: { classification: 'Gene Therapy Medicinal Product (GTMP)', citation: EU_GTMP },
  cell_therapy: { classification: 'Somatic Cell Therapy Medicinal Product (sCTMP)', citation: EU_SCTMP },
  tissue_engineered: { classification: 'Tissue-Engineered Product (TEP)', citation: EU_TEP },
  combined: { classification: 'Combined ATMP (incorporates a medical device)', citation: EU_COMBINED },
};

function classifyEu(modality: AtmpModality): AdvancedTherapyClassification {
  const m = EU_MODALITY_MAP[modality];
  if (!m) throw new Error(`Unknown advanced-therapy modality "${modality}".`);
  return {
    region: 'EU',
    modality,
    classification: m.classification,
    regulatoryRoute: 'Centralised marketing-authorisation procedure (mandatory); CAT classification & assessment',
    oversightBody: 'Committee for Advanced Therapies (CAT) / CHMP (EMA)',
    citation: m.citation,
    notes: [
      'Classified as an Advanced Therapy Medicinal Product (ATMP); marketing authorisation is via the centralised procedure and is mandatory, with the CAT preparing the classification and assessment.',
      CAVEAT_NOTE(),
    ],
  };
}

function classifyFda(modality: AtmpModality): AdvancedTherapyClassification {
  const notes = [
    'Cell & gene therapies are licensed as biologics via a BLA reviewed by CBER\'s Office of Therapeutic Products (OTP).',
  ];
  if (modality === 'cell_therapy' || modality === 'tissue_engineered') {
    notes.push(
      'A minimally-manipulated cell/tissue product intended for homologous use may instead qualify as a §361 HCT/P regulated solely under 21 CFR Part 1271 (no BLA).',
    );
  }
  notes.push('Expedited review is available via RMAT (Regenerative Medicine Advanced Therapy) designation.');
  notes.push(CAVEAT_NOTE());
  return {
    region: 'FDA',
    modality,
    classification: 'Biologic (BLA) regulated by CBER (351)',
    regulatoryRoute: 'Biologics License Application (BLA) under PHS Act §351; RMAT designation available',
    oversightBody: 'Center for Biologics Evaluation and Research (CBER), Office of Therapeutic Products (OTP)',
    citation: FDA_BLA_CIT,
    notes,
  };
}

function classifyJp(modality: AtmpModality): AdvancedTherapyClassification {
  return {
    region: 'JP',
    modality,
    classification: 'Regenerative medical product (conditional & time-limited approval available)',
    regulatoryRoute: 'Marketing approval as a regenerative medical product (conditional & time-limited approval pathway available); Sakigake designation available',
    oversightBody: 'Pharmaceuticals and Medical Devices Agency (PMDA) / MHLW',
    citation: JP_RMP_CIT,
    notes: [
      'Regulated as a regenerative medical product under the PMD Act; a conditional & time-limited approval pathway permits early approval subject to post-marketing confirmation.',
      CAVEAT_NOTE(),
    ],
  };
}

/**
 * Classify an advanced therapy given its region and modality.
 * Pure / deterministic. Throws for an unmodeled region or unknown modality.
 */
export function classifyAdvancedTherapy(
  input: AdvancedTherapyClassificationInput,
): AdvancedTherapyClassification {
  if (!ATMP_MODALITIES.includes(input.modality)) {
    throw new Error(
      `Unknown advanced-therapy modality "${input.modality}"; modeled modalities are ${ATMP_MODALITIES.join(', ')}.`,
    );
  }
  if (input.region === 'EU') return classifyEu(input.modality);
  if (input.region === 'FDA') return classifyFda(input.modality);
  if (input.region === 'JP') return classifyJp(input.modality);
  throw new Error(`No advanced-therapy classification modeled for region "${input.region}".`);
}

/** The set of modeled advanced-therapy regions. */
export const ADVANCED_THERAPY_REGIONS: AdvancedTherapyRegion[] = ['EU', 'FDA', 'JP'];

/** The set of modeled advanced-therapy modalities. */
export const ATMP_MODALITIES: AtmpModality[] = [
  'gene_therapy',
  'cell_therapy',
  'tissue_engineered',
  'combined',
];
