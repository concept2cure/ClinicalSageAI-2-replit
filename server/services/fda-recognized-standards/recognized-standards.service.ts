/**
 * "Which consensus standards has FDA recognized for this product code?"
 *
 * The query half of the vendored recognized-standards dataset (see
 * `recognized-standards-dataset.ts` for the drop-point, the loader and the
 * no-fabrication rule that governs both).
 *
 * ── Three outcomes, and the middle one is the point ─────────────────────────
 *   available:false, datasetLoaded:false  the dataset is not vendored, or did
 *                                         not parse — unavailableReason says which
 *   available:true,  matched:0            the dataset IS loaded and FDA lists no
 *                                         recognized standard for this code
 *   available:true,  matched:n            FDA's list, verbatim
 *
 * "We do not have the data" and "the data says nothing here" are different
 * claims. A surface that renders both as one empty table is lying by omission,
 * so the envelope keeps them distinguishable and every caller is expected to.
 *
 * Nothing here infers, scores, ranks by relevance, or supplements FDA's list.
 * The standards a device should cite are a regulatory judgement the submitter
 * makes, informed by this list — the platform's job is to hand over the real
 * list or say plainly that it cannot.
 *
 * @module server/services/fda-recognized-standards/recognized-standards.service
 */

import {
  loadRecognizedStandardsDataset,
  normalizeProductCode,
  type RecognizedStandard,
  type RecognizedStandardsProvenance,
} from './recognized-standards-dataset';

/** Identifies the answer's origin on the wire so no surface can relabel it. */
export const RECOGNIZED_STANDARDS_SOURCE = 'fda-recognized-consensus-standards' as const;

/** One recognized standard as returned to a caller — FDA's fields, verbatim. */
export interface RecognizedStandardView {
  recognitionNumber: string;
  sdo: string;
  designationNumber: string;
  title: string;
  extentOfRecognition: string;
  specialtyTaskGroup?: string;
  recognitionStatus?: string;
  transitionEndDate?: string;
}

export interface RecognizedStandardsLookup {
  /** The normalized product code the answer is for; null when none was resolvable. */
  productCode: string | null;
  /** True when a real answer was produced — including a real, empty answer. */
  available: boolean;
  /** Set when available=false — why no answer could be produced. */
  unavailableReason?: string;
  /**
   * Whether the vendored dataset was actually loaded. Distinguishes "no data"
   * from "data says nothing"; do not collapse this into `standards.length`.
   */
  datasetLoaded: boolean;
  standards: RecognizedStandardView[];
  matched: number;
  /** Which FDA recognition list this answer came from. Absent when unloaded. */
  provenance?: RecognizedStandardsProvenance;
  source: typeof RECOGNIZED_STANDARDS_SOURCE;
}

function toView(standard: RecognizedStandard): RecognizedStandardView {
  return {
    recognitionNumber: standard.recognitionNumber,
    sdo: standard.sdo,
    designationNumber: standard.designationNumber,
    title: standard.title,
    extentOfRecognition: standard.extentOfRecognition,
    specialtyTaskGroup: standard.specialtyTaskGroup,
    recognitionStatus: standard.recognitionStatus,
    transitionEndDate: standard.transitionEndDate,
  };
}

/**
 * Look up the recognized consensus standards FDA publishes against a product
 * code. Never throws and never fabricates: an absent dataset, an unusable
 * dataset and a code with no listed standards each produce a distinct,
 * explicitly labelled result.
 *
 * @param productCode The FDA product code, or null/blank when the caller could
 *                    not resolve one (e.g. the device profile has none yet).
 */
export async function lookupRecognizedStandards(
  productCode: string | null | undefined,
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<RecognizedStandardsLookup> {
  const normalized = productCode ? normalizeProductCode(productCode) : '';

  if (normalized === '') {
    return {
      productCode: null,
      available: false,
      unavailableReason:
        'No FDA product code is set on this device profile. Look up the classification first, ' +
        'then re-run the standards lookup.',
      datasetLoaded: false,
      standards: [],
      matched: 0,
      source: RECOGNIZED_STANDARDS_SOURCE,
    };
  }

  const load = await loadRecognizedStandardsDataset({ env: opts.env });
  if (!load.available || !load.dataset) {
    return {
      productCode: normalized,
      available: false,
      unavailableReason: load.unavailableReason ?? 'The recognized-standards dataset is unavailable.',
      datasetLoaded: false,
      standards: [],
      matched: 0,
      source: RECOGNIZED_STANDARDS_SOURCE,
    };
  }

  const hits = load.dataset.byProductCode.get(normalized) ?? [];
  return {
    productCode: normalized,
    available: true,
    datasetLoaded: true,
    standards: hits.map(toView),
    matched: hits.length,
    provenance: load.dataset.provenance,
    source: RECOGNIZED_STANDARDS_SOURCE,
  };
}

export default { lookupRecognizedStandards, RECOGNIZED_STANDARDS_SOURCE };
