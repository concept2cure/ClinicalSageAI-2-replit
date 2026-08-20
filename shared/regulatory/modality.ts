/**
 * Modality — the variable that actually determines the regulatory work.
 *
 * BP-W2-2. The biotech/pharma lane split is on the wrong axis: "biotech" and
 * "pharma" describe a COMPANY, while review centre, statutory pathway, user-fee
 * programme and CMC core are all functions of what the PRODUCT is. A company
 * that calls itself biotech files an NDA for its small molecule; a large pharma
 * files CBER BLAs for its vaccines and CDER NDAs for everything else in the
 * same year. This module puts the deciding variable on the program record and
 * derives the frame from it, so lane behaviour has one source instead of two
 * navigation entries (see docs/work-orders/BP-W2-1-biotech-pharma-recommendation.md).
 *
 * Same discipline as `vocabulary.ts`: one canonical spelling per member,
 * `normalizeModality` accepts the variants that are actually live in the tree,
 * and anything unrecognised is NULL — never a guess. In particular, `biologic`
 * deliberately does NOT normalize: it names a statutory class spanning four
 * modalities with two different review centres, and sharpening it to any one
 * of them would fabricate specificity the record never carried.
 *
 * The frames encode the FDA facts a program header should never get wrong:
 *   - Therapeutic proteins and monoclonal antibodies review in CDER — they
 *     transferred from CBER in 2003. BLA does not imply CBER.
 *   - BsUFA covers 351(k) biosimilars only; an innovator BLA pays PDUFA fees;
 *     ANDAs pay GDUFA. The fee programme follows the pathway, so it lives on
 *     the pathway option, not on the modality.
 *   - An ADC needs BOTH CMC cores: ICH Q5E comparability for the antibody and
 *     ICH Q3A/Q3B impurity control for the payload–linker chemistry.
 *   - Oligonucleotides are regulated as drugs (CDER, NDA) despite biologic-like
 *     manufacture.
 *   - A combination product has no derivable centre: the lead centre is
 *     assigned by primary mode of action under 21 CFR Part 3, so the honest
 *     value is null plus the rule, never a default.
 */

export const MODALITIES = [
  'small_molecule',
  'peptide',
  'protein',
  'mab',
  'adc',
  'oligonucleotide',
  'vaccine',
  'cell_therapy',
  'gene_therapy',
  'biosimilar',
  'combination',
] as const;

export type Modality = (typeof MODALITIES)[number];

/** Display names — UI renders these, stores the canonical member. */
export const MODALITY_LABEL: Record<Modality, string> = {
  small_molecule: 'Small molecule',
  peptide: 'Peptide (synthetic)',
  protein: 'Therapeutic protein',
  mab: 'Monoclonal antibody',
  adc: 'Antibody–drug conjugate',
  oligonucleotide: 'Oligonucleotide (ASO / siRNA)',
  vaccine: 'Vaccine',
  cell_therapy: 'Cell therapy',
  gene_therapy: 'Gene therapy',
  biosimilar: 'Biosimilar (351(k))',
  combination: 'Combination product',
};

/**
 * Variants accepted by `normalizeModality`, all lowercase. Only spellings that
 * are live in this tree or unambiguous in the domain; class words that span
 * modalities (`biologic`, `mrna`) are deliberately absent — see header.
 */
const MODALITY_ALIASES: Record<string, Modality> = {
  'small molecule': 'small_molecule',
  'small-molecule': 'small_molecule',
  nce: 'small_molecule',
  'synthetic peptide': 'peptide',
  'therapeutic protein': 'protein',
  'recombinant protein': 'protein',
  'monoclonal antibody': 'mab',
  antibody: 'mab',
  'antibody-drug conjugate': 'adc',
  'antibody drug conjugate': 'adc',
  oligo: 'oligonucleotide',
  aso: 'oligonucleotide',
  antisense: 'oligonucleotide',
  sirna: 'oligonucleotide',
  'car-t': 'cell_therapy',
  'car t': 'cell_therapy',
  'cell therapy': 'cell_therapy',
  'gene therapy': 'gene_therapy',
  aav: 'gene_therapy',
  '351(k)': 'biosimilar',
  'combination product': 'combination',
};

/** Canonical member for a free-text value, or null — never a guess. */
export function normalizeModality(value: string | null | undefined): Modality | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if ((MODALITIES as readonly string[]).includes(v)) return v as Modality;
  const underscored = v.replace(/[ -]/g, '_');
  if ((MODALITIES as readonly string[]).includes(underscored)) return underscored as Modality;
  return MODALITY_ALIASES[v] ?? null;
}

export type ReviewCenter = 'CDER' | 'CBER';
export type FeeProgram = 'PDUFA' | 'BsUFA' | 'GDUFA';

export interface PathwayOption {
  /** Statutory pathway, named the way a filing names it. */
  pathway: string;
  /** The user-fee programme that pathway pays into. */
  feeProgram: FeeProgram;
}

export interface RegulatoryFrame {
  /** Review centre, or null when no centre is derivable from modality alone. */
  center: ReviewCenter | null;
  /** The sentence that justifies `center` — renderable, and auditable. */
  centerBasis: string;
  /** Available statutory pathways, default first. Empty when constituent-dependent. */
  pathways: PathwayOption[];
  /** The CMC guidance set this modality's quality record is built against. */
  cmcCore: string[];
  /** The comparability framework a process change is judged under. */
  comparability: string;
}

export const MODALITY_FRAME: Record<Modality, RegulatoryFrame> = {
  small_molecule: {
    center: 'CDER',
    centerBasis: 'Chemically synthesised drug — reviewed in CDER.',
    pathways: [
      { pathway: 'NDA 505(b)(1)', feeProgram: 'PDUFA' },
      { pathway: 'NDA 505(b)(2)', feeProgram: 'PDUFA' },
      { pathway: 'ANDA 505(j)', feeProgram: 'GDUFA' },
    ],
    cmcCore: ['ICH Q3A/Q3B impurities', 'ICH Q6A specifications'],
    comparability: 'Physicochemical — process change judged under ICH Q3A/Q6A.',
  },
  peptide: {
    center: 'CDER',
    centerBasis: 'Synthetic peptides (up to 40 amino acids) are drugs under the FD&C Act — CDER.',
    pathways: [
      { pathway: 'NDA 505(b)(1)', feeProgram: 'PDUFA' },
      { pathway: 'NDA 505(b)(2)', feeProgram: 'PDUFA' },
    ],
    cmcCore: ['ICH Q3A/Q3B impurities (peptide-related classes)', 'ICH Q6A specifications'],
    comparability: 'Physicochemical, with peptide-related impurity qualification.',
  },
  protein: {
    center: 'CDER',
    centerBasis:
      'Therapeutic proteins review in CDER (transferred from CBER in 2003); licensed as biologics.',
    pathways: [{ pathway: 'BLA 351(a)', feeProgram: 'PDUFA' }],
    cmcCore: ['ICH Q5 family', 'ICH Q6B specifications'],
    comparability: 'ICH Q5E comparability.',
  },
  mab: {
    center: 'CDER',
    centerBasis:
      'Monoclonal antibodies review in CDER (transferred from CBER in 2003); licensed as biologics.',
    pathways: [{ pathway: 'BLA 351(a)', feeProgram: 'PDUFA' }],
    cmcCore: ['ICH Q5 family', 'ICH Q6B specifications'],
    comparability: 'ICH Q5E comparability.',
  },
  adc: {
    center: 'CDER',
    centerBasis:
      'Antibody framework reviews in CDER; the payload–linker carries small-molecule chemistry.',
    pathways: [{ pathway: 'BLA 351(a)', feeProgram: 'PDUFA' }],
    cmcCore: [
      'ICH Q5 family / Q6B (antibody)',
      'ICH Q3A/Q3B impurities (payload–linker)',
    ],
    comparability: 'ICH Q5E for the antibody, plus payload–linker impurity qualification.',
  },
  oligonucleotide: {
    center: 'CDER',
    centerBasis:
      'Oligonucleotides are regulated as drugs — CDER, NDA — despite biologic-like manufacture.',
    pathways: [
      { pathway: 'NDA 505(b)(1)', feeProgram: 'PDUFA' },
      { pathway: 'NDA 505(b)(2)', feeProgram: 'PDUFA' },
    ],
    cmcCore: ['Oligonucleotide impurity classes (ICH Q3A-adjacent)', 'ICH Q6A specifications'],
    comparability: 'Physicochemical, with sequence- and process-related impurity qualification.',
  },
  vaccine: {
    center: 'CBER',
    centerBasis: 'Preventive vaccines review in CBER.',
    pathways: [{ pathway: 'BLA 351(a)', feeProgram: 'PDUFA' }],
    cmcCore: ['ICH Q5 family / Q6B', 'Potency and lot release (21 CFR 610)'],
    comparability: 'ICH Q5E comparability.',
  },
  cell_therapy: {
    center: 'CBER',
    centerBasis: 'Cell therapies review in CBER (Office of Therapeutic Products).',
    pathways: [{ pathway: 'BLA 351(a)', feeProgram: 'PDUFA' }],
    cmcCore: ['ICH Q5 family', 'Potency and lot release (21 CFR 610.2)'],
    comparability: 'ICH Q5E comparability.',
  },
  gene_therapy: {
    center: 'CBER',
    centerBasis: 'Gene therapies review in CBER (Office of Therapeutic Products).',
    pathways: [{ pathway: 'BLA 351(a)', feeProgram: 'PDUFA' }],
    cmcCore: ['ICH Q5 family', 'Potency and lot release (21 CFR 610.2)'],
    comparability: 'ICH Q5E comparability.',
  },
  biosimilar: {
    center: 'CDER',
    centerBasis:
      'Centre follows the reference product — CDER for today’s reference products.',
    pathways: [{ pathway: 'BLA 351(k)', feeProgram: 'BsUFA' }],
    cmcCore: ['Analytical similarity assessment', 'ICH Q5 family / Q6B'],
    comparability: 'Similarity to the reference product (351(k)) — beyond ICH Q5E.',
  },
  combination: {
    center: null,
    centerBasis:
      'Lead centre is assigned by primary mode of action under 21 CFR Part 3 (RFD when unclear).',
    pathways: [],
    cmcCore: ['Per constituent part'],
    comparability: 'Per constituent part.',
  },
};

export function frameFor(modality: Modality): RegulatoryFrame {
  return MODALITY_FRAME[modality];
}

/**
 * One line for a program header: centre, default pathway and its fee
 * programme, and the CMC core. For a combination product — where none of that
 * is derivable — the line is the rule that decides it, which is the only
 * honest summary there is.
 */
export function frameSummary(modality: Modality): string {
  const f = MODALITY_FRAME[modality];
  if (!f.center) return f.centerBasis;
  const lead = f.pathways[0];
  const pathway = lead ? ` · ${lead.pathway} (${lead.feeProgram})` : '';
  return `${f.center}${pathway} · ${f.cmcCore[0]}`;
}

// ─── Modality-driven CMC section model (BP-W2-2) ──────────────────────────────

export interface CmcSectionRequirement {
  /** CTD location the requirement lives at, where one is established. */
  section: string;
  title: string;
  /** Why THIS modality needs it — the sentence a reviewer would write. */
  rationale: string;
}

/** Module 3 sections every drug product carries regardless of modality. */
const CMC_BASE: CmcSectionRequirement[] = [
  { section: '3.2.S', title: 'Drug substance', rationale: 'Manufacture, characterisation, control and stability of the active substance.' },
  { section: '3.2.P', title: 'Drug product', rationale: 'Composition, manufacture, control and stability of the finished product.' },
  { section: '3.2.P.8', title: 'Stability', rationale: 'ICH Q1A/Q1E stability programme across conditions and timepoints.' },
];

const BIOLOGIC_CORE: CmcSectionRequirement[] = [
  { section: '3.2.S.2.3', title: 'Cell banks / control of materials', rationale: 'Master and working cell bank characterisation (ICH Q5B/Q5D).' },
  { section: '3.2.S.4', title: 'Potency / bioassay', rationale: 'A biologic is defined by its activity — potency and lot release under 21 CFR 610.' },
  { section: '3.2.S.2.6', title: 'Comparability (ICH Q5E)', rationale: 'Every process change is judged by comparability, not identity.' },
  { section: '3.2.S.3.2', title: 'Impurities — HCP and aggregates', rationale: 'Host-cell protein and aggregate control drive immunogenicity risk.' },
];

const MODALITY_CMC_EXTRA: Record<Modality, CmcSectionRequirement[]> = {
  small_molecule: [
    { section: '3.2.S.3.2', title: 'Impurities (ICH Q3A/Q3B, ICH M7)', rationale: 'Organic, inorganic and mutagenic impurity qualification.' },
    { section: '3.2.S.1.3', title: 'Polymorphism', rationale: 'Solid-state form controls bioavailability and stability.' },
    { section: '3.2.P.2', title: 'Dissolution', rationale: 'Dissolution links the formulation to in-vivo performance.' },
  ],
  peptide: [
    { section: '3.2.S.3.2', title: 'Peptide-related impurities', rationale: 'Sequence variants and truncations require class-specific qualification.' },
  ],
  protein: BIOLOGIC_CORE,
  mab: BIOLOGIC_CORE,
  adc: [
    ...BIOLOGIC_CORE,
    { section: '3.2.S (payload–linker)', title: 'Payload–linker chemistry', rationale: 'The conjugate carries small-molecule impurity chemistry (ICH Q3A/Q3B) alongside the antibody.' },
    { section: '3.2.S.4', title: 'Drug–antibody ratio', rationale: 'DAR distribution is a defining quality attribute of a conjugate.' },
  ],
  oligonucleotide: [
    { section: '3.2.S.3.2', title: 'Oligonucleotide impurity classes', rationale: 'Sequence- and process-related impurities (ICH Q3A-adjacent).' },
  ],
  vaccine: [
    ...BIOLOGIC_CORE,
    { section: '3.2.P (adjuvant)', title: 'Adjuvant control', rationale: 'Adjuvanted presentations control the adjuvant as a drug-product component.' },
  ],
  cell_therapy: [
    ...BIOLOGIC_CORE,
    { section: '3.2.S.2.1', title: 'Donor eligibility / starting material', rationale: 'Cellular starting material carries donor and sourcing controls (21 CFR 1271).' },
  ],
  gene_therapy: [
    ...BIOLOGIC_CORE,
    { section: '3.2.S.2', title: 'Vector characterisation', rationale: 'Vector identity, infectious titre and replication-competence control.' },
  ],
  biosimilar: [
    ...BIOLOGIC_CORE,
    { section: '3.2.R', title: 'Analytical similarity', rationale: 'The 351(k) case is the similarity exercise against the reference product.' },
  ],
  combination: [
    { section: 'Per constituent', title: 'Constituent-part CMC', rationale: 'Each constituent part carries the CMC model of its own modality (21 CFR Part 3).' },
  ],
};

/**
 * The Module 3 section model a program of this modality carries: the common
 * base plus the modality-specific requirements. This is the derivation the
 * work order says the modality field exists to power — a lane cannot
 * differentiate biotech from pharma CMC without it.
 */
export function cmcSectionModelFor(modality: Modality): CmcSectionRequirement[] {
  return [...CMC_BASE, ...MODALITY_CMC_EXTRA[modality]];
}
