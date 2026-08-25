/**
 * FDA Recognized Consensus Standards — vendored-dataset drop-point + loader.
 *
 * A 510(k) submitter has to declare conformity to the consensus standards FDA
 * recognizes for their device. openFDA does NOT expose that list — it serves
 * classification, 510(k) clearances, MAUDE, recalls, registration/listing and
 * GUDID, and nothing else. FDA publishes the recognition database separately
 * (CDRH Recognized Consensus Standards search). So this is a vendored-asset
 * problem, exactly like the eSTAR templates (`assets/estar-templates/`) and the
 * eCTD DTDs (`assets/ectd-dtd/`), and it follows the same shape: a drop-point
 * directory, a loader that reads it, and a caller that fails closed and says so
 * when the asset is absent.
 *
 * ── The invariant this module exists to hold ────────────────────────────────
 * NEVER return a standard FDA has not published against a product code. There
 * is no seed list here, no "obviously applies" heuristic, and no partial load.
 * A dataset that fails validation is reported as ABSENT, not as partially
 * usable — a half-parsed regulatory dataset answers some product codes right
 * and others with a silent empty, and nothing distinguishes the two. Absence is
 * a state the caller can label honestly; a wrong answer is not.
 *
 * ── Not the other standards path ────────────────────────────────────────────
 * `server/services/regulatory-graph/standards-applicability.service.ts` answers
 * a different question — "for this PROGRAM, which of our catalog standards
 * apply, and where is the evidence gap" — with deterministic rules, confidence
 * scores and persisted human decisions over the internal `device_test_standards`
 * catalog. This module answers "which standards has FDA recognized for this
 * PRODUCT CODE", with zero inference, from FDA's own list. They are not
 * interchangeable and must not be merged: the first is a recommender, the
 * second is a fact.
 *
 * @module server/services/fda-recognized-standards/recognized-standards-dataset
 */

import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * The one filename the loader reads. Load-bearing — it is documented in
 * `assets/fda-recognized-standards/README.md` and mirrored by the readiness
 * probe in `scripts/ops/ga-readiness-report.mjs`.
 */
export const RECOGNIZED_STANDARDS_DATASET_FILE = 'fda-recognized-consensus-standards.json';

/** Default drop-point, relative to the repo root. */
export const RECOGNIZED_STANDARDS_DEFAULT_DIR = 'assets/fda-recognized-standards';

/**
 * Where the export came from. Required — a recognized-standards list with no
 * recorded source, publication date and retriever is indistinguishable from
 * someone's notes, and this is content a submitter will cite to FDA. It travels
 * with every lookup response so a surface can show which recognition list an
 * answer came from.
 */
export interface RecognizedStandardsProvenance {
  source: string;
  sourceUrl: string;
  /** The FDA Recognition List number this export was taken from. */
  recognitionListNumber: string;
  publishedOn: string;
  retrievedOn: string;
  retrievedBy: string;
}

/** One FDA recognition record, normalized. Text fields are verbatim from FDA. */
export interface RecognizedStandard {
  recognitionNumber: string;
  sdo: string;
  designationNumber: string;
  title: string;
  extentOfRecognition: string;
  specialtyTaskGroup?: string;
  /** FDA recognition state, e.g. recognized | transition | withdrawn. */
  recognitionStatus?: string;
  transitionEndDate?: string;
  /**
   * The product codes FDA publishes this recognition against. MAY be empty —
   * an empty list means FDA publishes no product-code association, which is a
   * true statement. It must never be filled in by inference.
   */
  productCodes: string[];
}

export interface RecognizedStandardsDataset {
  provenance: RecognizedStandardsProvenance;
  standards: RecognizedStandard[];
  /** Normalized product code → the standards FDA lists against it. */
  byProductCode: Map<string, RecognizedStandard[]>;
  /** How many distinct product codes the export covers. */
  productCodeCount: number;
}

export type RecognizedStandardsParseOutcome =
  | { ok: true; dataset: RecognizedStandardsDataset }
  | { ok: false; reason: string };

export interface RecognizedStandardsLoadResult {
  /** True only when a well-formed dataset was read. */
  available: boolean;
  /** Set when available=false — exactly why the dataset could not be used. */
  unavailableReason?: string;
  dataset?: RecognizedStandardsDataset;
  /** The absolute path the loader looked at, quoted in the honest empty state. */
  datasetPath: string;
}

/** FDA product codes are case-insensitive short codes; compare them normalized. */
export function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Resolve the drop-point directory (FDA_RECOGNIZED_STANDARDS_DIR or the default). */
export function resolveRecognizedStandardsDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.FDA_RECOGNIZED_STANDARDS_DIR ||
    path.resolve(process.cwd(), RECOGNIZED_STANDARDS_DEFAULT_DIR)
  );
}

/** Absolute path of the dataset file for a given directory. */
export function resolveRecognizedStandardsPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveRecognizedStandardsDir(env), RECOGNIZED_STANDARDS_DATASET_FILE);
}

/* ── validation ──────────────────────────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A required, non-blank string field; null when absent or the wrong type. */
function requiredString(source: Record<string, unknown>, key: string): string | null {
  const v = source[key];
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

/** An optional string field; undefined when absent, blank or the wrong type. */
function optionalString(source: Record<string, unknown>, key: string): string | undefined {
  const v = source[key];
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

const PROVENANCE_FIELDS: Array<keyof RecognizedStandardsProvenance> = [
  'source',
  'sourceUrl',
  'recognitionListNumber',
  'publishedOn',
  'retrievedOn',
  'retrievedBy',
];

const STANDARD_FIELDS: Array<'recognitionNumber' | 'sdo' | 'designationNumber' | 'title' | 'extentOfRecognition'> = [
  'recognitionNumber',
  'sdo',
  'designationNumber',
  'title',
  'extentOfRecognition',
];

/** Validate the provenance block. Required — see the interface doc. */
function parseProvenance(
  raw: unknown,
): { ok: true; provenance: RecognizedStandardsProvenance } | { ok: false; reason: string } {
  if (!isRecord(raw)) {
    return {
      ok: false,
      reason:
        'dataset has no "provenance" object — an unprovenanced recognition list cannot be cited to FDA',
    };
  }
  const provenance = {} as RecognizedStandardsProvenance;
  for (const field of PROVENANCE_FIELDS) {
    const value = requiredString(raw, field);
    if (value === null) return { ok: false, reason: `provenance.${field} is missing or blank` };
    provenance[field] = value;
  }
  return { ok: true, provenance };
}

/** Validate one recognition record. `at` is the path prefix used in reasons. */
function parseStandard(
  raw: unknown,
  at: string,
): { ok: true; standard: RecognizedStandard } | { ok: false; reason: string } {
  if (!isRecord(raw)) return { ok: false, reason: `${at} is not an object` };

  const standard = { productCodes: [] as string[] } as RecognizedStandard;
  for (const field of STANDARD_FIELDS) {
    const value = requiredString(raw, field);
    if (value === null) return { ok: false, reason: `${at}.${field} is missing or blank` };
    standard[field] = value;
  }
  standard.specialtyTaskGroup = optionalString(raw, 'specialtyTaskGroup');
  standard.recognitionStatus = optionalString(raw, 'recognitionStatus');
  standard.transitionEndDate = optionalString(raw, 'transitionEndDate');

  const codesRaw = raw.productCodes;
  if (!Array.isArray(codesRaw)) {
    return {
      ok: false,
      reason:
        `${at}.productCodes is missing or not an array — use [] when FDA publishes no ` +
        'product-code association; never infer one',
    };
  }
  for (let c = 0; c < codesRaw.length; c++) {
    const codeRaw = codesRaw[c];
    if (typeof codeRaw !== 'string' || codeRaw.trim() === '') {
      return { ok: false, reason: `${at}.productCodes[${c}] is not a non-blank string` };
    }
    const code = normalizeProductCode(codeRaw);
    if (!standard.productCodes.includes(code)) standard.productCodes.push(code);
  }
  return { ok: true, standard };
}

/**
 * Validate + index a parsed dataset. Pure, so the contract is unit-testable
 * without touching disk.
 *
 * Rejection is whole-file and deliberate: the first malformed record fails the
 * dataset. Dropping the bad record instead would silently narrow FDA's list,
 * and a narrowed list looks exactly like a correct one.
 */
export function parseRecognizedStandardsDataset(raw: unknown): RecognizedStandardsParseOutcome {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'dataset root is not a JSON object' };
  }

  const provenanceOutcome = parseProvenance(raw.provenance);
  if (!provenanceOutcome.ok) return provenanceOutcome;

  const standardsRaw = raw.standards;
  if (!Array.isArray(standardsRaw)) {
    return { ok: false, reason: 'dataset "standards" is not an array' };
  }
  if (standardsRaw.length === 0) {
    return { ok: false, reason: 'dataset "standards" is empty' };
  }

  const standards: RecognizedStandard[] = [];
  const byProductCode = new Map<string, RecognizedStandard[]>();

  for (let i = 0; i < standardsRaw.length; i++) {
    const outcome = parseStandard(standardsRaw[i], `standards[${i}]`);
    if (!outcome.ok) return outcome;

    standards.push(outcome.standard);
    for (const code of outcome.standard.productCodes) {
      const bucket = byProductCode.get(code);
      if (bucket) bucket.push(outcome.standard);
      else byProductCode.set(code, [outcome.standard]);
    }
  }

  // Deterministic order so two callers with the same dataset get the same
  // answer in the same sequence.
  for (const bucket of byProductCode.values()) {
    bucket.sort(
      (a, b) =>
        a.designationNumber.localeCompare(b.designationNumber) ||
        a.recognitionNumber.localeCompare(b.recognitionNumber),
    );
  }

  return {
    ok: true,
    dataset: {
      provenance: provenanceOutcome.provenance,
      standards,
      byProductCode,
      productCodeCount: byProductCode.size,
    },
  };
}

/* ── loading ─────────────────────────────────────────────────────────────── */

interface CacheEntry {
  datasetPath: string;
  mtimeMs: number;
  size: number;
  result: RecognizedStandardsLoadResult;
}

let cache: CacheEntry | null = null;

/** Drop the in-process dataset cache. Used by tests and after a re-drop. */
export function resetRecognizedStandardsCache(): void {
  cache = null;
}

/**
 * Read + validate the vendored dataset. NEVER throws: an absent directory, an
 * absent file, unreadable bytes, invalid JSON and a schema violation all return
 * `available:false` with the reason, which is what the caller labels.
 *
 * Cached on (path, mtime, size) so a maintainer dropping a new export in is
 * picked up without a restart, while a hot lookup path does not re-parse a
 * multi-megabyte file per request.
 */
export async function loadRecognizedStandardsDataset(opts: {
  env?: NodeJS.ProcessEnv;
  /** Bypass the cache — used by tests and by the readiness probe. */
  fresh?: boolean;
} = {}): Promise<RecognizedStandardsLoadResult> {
  const env = opts.env ?? process.env;
  const datasetPath = resolveRecognizedStandardsPath(env);

  let stat: { mtimeMs: number; size: number };
  try {
    const s = await fs.stat(datasetPath);
    if (!s.isFile()) {
      return {
        available: false,
        datasetPath,
        unavailableReason: `${datasetPath} is not a file`,
      };
    }
    stat = { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return {
      available: false,
      datasetPath,
      unavailableReason:
        `The FDA recognized-consensus-standards dataset has not been vendored — ` +
        `expected ${datasetPath}. See assets/fda-recognized-standards/README.md ` +
        `(procurement blocker B21).`,
    };
  }

  if (
    !opts.fresh &&
    cache &&
    cache.datasetPath === datasetPath &&
    cache.mtimeMs === stat.mtimeMs &&
    cache.size === stat.size
  ) {
    return cache.result;
  }

  let text: string;
  try {
    text = await fs.readFile(datasetPath, 'utf8');
  } catch (err) {
    return {
      available: false,
      datasetPath,
      unavailableReason: `${datasetPath} could not be read: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      available: false,
      datasetPath,
      unavailableReason: `${datasetPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const outcome = parseRecognizedStandardsDataset(raw);
  const result: RecognizedStandardsLoadResult = outcome.ok
    ? { available: true, datasetPath, dataset: outcome.dataset }
    : {
        available: false,
        datasetPath,
        // Rejected whole-file on purpose: a partially-loaded regulatory dataset
        // is reported as absent rather than silently narrowed.
        unavailableReason: `${datasetPath} is not a valid recognized-standards dataset: ${outcome.reason}`,
      };

  cache = { datasetPath, mtimeMs: stat.mtimeMs, size: stat.size, result };
  return result;
}

export default {
  RECOGNIZED_STANDARDS_DATASET_FILE,
  RECOGNIZED_STANDARDS_DEFAULT_DIR,
  normalizeProductCode,
  resolveRecognizedStandardsDir,
  resolveRecognizedStandardsPath,
  parseRecognizedStandardsDataset,
  loadRecognizedStandardsDataset,
  resetRecognizedStandardsCache,
};
