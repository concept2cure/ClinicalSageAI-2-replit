/**
 * The product a sponsor says they have, as the modality the platform reasons
 * with (founder's directive, 2026-10-12).
 *
 * Two vocabularies, both governed, neither reducible to the other:
 *
 *   `MODALITIES` (modality.ts)      eleven modalities the regulatory frame
 *       reasons with: which centre reviews the product, which statutory
 *       pathways apply to it and in what order, its CMC core and how
 *       comparability is judged.
 *   `product_type` (the interview)  what a person is asked, in the words a
 *       sponsor uses: 'monoclonal_antibody', 'bispecific', 'medical_device'.
 *
 * Nothing bridged them, so the interview could not ask the frame which
 * pathways a programme may take, and `project-setup` wrote its own list of ten
 * submission types instead — FDA and EU filings mixed, no modality awareness,
 * nothing said about what any of them commits a programme to.
 *
 * This is that bridge, and both directions are gated: a modality the frame
 * holds that no product_type reaches is unaskable, and a product_type that
 * resolves to nothing would silently fall back to the whole list.
 *
 * A device or a diagnostic resolves to NOTHING on purpose: it is not a
 * medicine, the frame says nothing about it, and the device catalogue is where
 * its routes come from.
 *
 * @module shared/regulatory/product-modality
 */

import { MODALITIES, type Modality } from './modality.js';

/**
 * The interview's product types, mapped onto the frame's modalities. A
 * bispecific antibody is an antibody as the frame reasons (one licence, one
 * comparability regime); it is listed separately in the interview because a
 * sponsor distinguishes them.
 */
const PRODUCT_TYPE_MODALITY: Readonly<Record<string, Modality>> = {
  small_molecule: 'small_molecule',
  peptide: 'peptide',
  protein: 'protein',
  monoclonal_antibody: 'mab',
  bispecific: 'mab',
  adc: 'adc',
  oligonucleotide: 'oligonucleotide',
  vaccine: 'vaccine',
  cell_therapy: 'cell_therapy',
  gene_therapy: 'gene_therapy',
  biosimilar: 'biosimilar',
  combination_product: 'combination',
  /* labeling.ts's spelling of the same thing. */
  combination: 'combination',
};

/**
 * Product types that state WHICH STATUTE governs the product without saying
 * which modality it is: "Biologic (BLA)", "Other Biologic", "Prescription Drug
 * (NDA)". The modality frame has no view of them — it reasons about
 * monoclonal antibodies, not about "a biologic" — but the statute is exactly
 * what decides whether a section 505 route or a biologics licence is open, so
 * reading it is worth more than reading nothing.
 */
const PRODUCT_TYPE_STATUTE: Readonly<Record<string, 'biologic' | 'chemical'>> = {
  biologic: 'biologic',
  other_biologic: 'biologic',
  rx_drug: 'chemical',
  otc_drug: 'chemical',
};

/** The product types that are NOT medicines, and are not expected to resolve. */
export const NON_MEDICINE_PRODUCT_TYPES: readonly string[] = ['medical_device', 'diagnostic', 'ivd'];

/** Every product type this bridge knows, for the gate that checks the interview against it. */
export function bridgedProductTypes(): string[] {
  return Object.keys(PRODUCT_TYPE_MODALITY);
}

/**
 * The modality behind what the sponsor said, or null where they said something
 * that is not a medicine — or nothing at all. Null means the frame has no view,
 * which a caller must say rather than guess at.
 */
/**
 * Which statute governs the product, where the answer says that much and no
 * more. A modality always implies its statute, so this is only for the answers
 * that name none — and it returns null, not a guess, for everything else.
 */
export function statuteOf(productType: string | null | undefined): 'biologic' | 'chemical' | null {
  if (typeof productType !== 'string') return null;
  return PRODUCT_TYPE_STATUTE[productType.trim().toLowerCase()] ?? null;
}

/** Every product type that states a statute without a modality, for the gate. */
export function statuteOnlyProductTypes(): string[] {
  return Object.keys(PRODUCT_TYPE_STATUTE);
}

export function modalityOf(productType: string | null | undefined): Modality | null {
  if (typeof productType !== 'string') return null;
  const found = PRODUCT_TYPE_MODALITY[productType.trim().toLowerCase()];
  return found && MODALITIES.includes(found) ? found : null;
}
