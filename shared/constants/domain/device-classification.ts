/**
 * Device and IVD classification — the taxonomy a 510(k) actually turns on.
 *
 * The project wizard captured a THERAPEUTIC AREA and nothing else: an oncology
 * / vaccines / anti-infectives list, defaulting to "Oncology (general)", shown
 * to someone filing a peak flow meter. There was no product code, no regulation
 * number, no device class, no review panel and no predicate anywhere in the
 * creation flow — so the fields a device reviewer opens the file to find were
 * not merely empty, they had nowhere to live.
 *
 * `regulatory_programs` already carried the columns (device_class,
 * regulatory_path, product_code, intended_use, predicate_devices). Nothing
 * wrote them. This module is the vocabulary both sides validate against, so the
 * wizard and the store cannot drift into two spellings of "Class II".
 */

/** 21 CFR 860 risk class. Class I s/m/r are NOT self-declared — see EU below. */
export const DEVICE_CLASSES = ['I', 'II', 'III'] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/** The US premarket route. Distinct from the filing type: an IVD and a
 *  non-IVD device both file a 510(k), and both are `510k` here. */
export const REGULATORY_PATHS = ['510k', 'de_novo', 'pma', 'hde', 'ide', 'exempt'] as const;
export type RegulatoryPath = (typeof REGULATORY_PATHS)[number];

/**
 * CDRH review panels (21 CFR 862–892), which is also the part number: panel
 * "Anesthesiology" is 21 CFR 868, so the regulation number a product code maps
 * to always begins with its panel's part.
 */
export const REVIEW_PANELS = [
  'Anesthesiology', 'Cardiovascular', 'Chemistry', 'Dental', 'Ear, Nose & Throat',
  'Gastroenterology & Urology', 'General & Plastic Surgery', 'General Hospital',
  'Hematology', 'Immunology', 'Microbiology', 'Neurology', 'Obstetrics & Gynecology',
  'Ophthalmic', 'Orthopedic', 'Pathology', 'Physical Medicine', 'Radiology',
  'Clinical Toxicology',
] as const;
export type ReviewPanel = (typeof REVIEW_PANELS)[number];

/**
 * The flags that DRIVE required content, which is why they are captured at
 * creation rather than asked for at assembly time. Each one adds a statutory or
 * guidance-driven section to the submission, and a submission missing one is a
 * Refuse-to-Accept ground rather than an incomplete draft.
 */
export const DEVICE_FLAGS = [
  { id: 'combinationProduct', label: 'Combination product', because: '21 CFR 3.2(e) — adds a lead-centre determination and the other centre’s content' },
  { id: 'softwareAiMl', label: 'Software / AI-ML', because: 'June 2023 device software guidance — Documentation Level, architecture, SRS/SDS, V&V, SBOM' },
  { id: 'cyberDevice', label: 'Cyber device', because: 'FD&C Act §524B — cybersecurity documentation; an RTA ground when absent' },
  { id: 'sterile', label: 'Sterile', because: 'Sterilisation validation, packaging and shelf-life data' },
  { id: 'implantable', label: 'Implantable', because: 'Long-term biocompatibility and, for some codes, clinical data' },
  { id: 'cliaWaived', label: 'CLIA-waived (IVD)', because: 'CLIA categorisation and a waiver application under 42 CFR 493' },
  { id: 'clinicalData', label: 'Clinical data submitted', because: 'FDA 3454/3455 financial certification or disclosure' },
] as const;
export type DeviceFlagId = (typeof DEVICE_FLAGS)[number]['id'];

export interface DeviceClassification {
  productCode?: string;
  regulationNumber?: string;
  deviceClass?: DeviceClass;
  reviewPanel?: string;
  predicateK?: string;
  intendedUse?: string;
  flags?: DeviceFlagId[];
}

/** Three uppercase letters, e.g. BZH. */
export const PRODUCT_CODE_RE = /^[A-Z]{3}$/;
/** 21 CFR 8xx.xxxx — the part is the review panel, the section the generic type. */
export const REGULATION_NUMBER_RE = /^8[0-9]{2}\.[0-9]{4}$/;
/** A cleared 510(k) number: K, two-digit year, four digits. */
export const K_NUMBER_RE = /^K[0-9]{6}$/i;

const FLAG_IDS = new Set<string>(DEVICE_FLAGS.map((f) => f.id));

/**
 * Validate and normalise a classification submitted by a caller.
 *
 * Returns the accepted fields and the rejected ones separately rather than
 * throwing on the first problem: a wizard that reports one error per submit is
 * how a nine-field form takes nine round trips. Unknown or malformed values are
 * DROPPED and named, never coerced — a product code stored as "bzh " or a class
 * stored as "2" is the kind of value that reads as data until someone tries to
 * search on it.
 */
export function normalizeDeviceClassification(raw: unknown): {
  value: DeviceClassification;
  rejected: string[];
} {
  const rejected: string[] = [];
  const out: DeviceClassification = {};
  if (!raw || typeof raw !== 'object') return { value: out, rejected };
  const r = raw as Record<string, unknown>;

  const str = (k: string): string | undefined => {
    const v = r[k];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  const productCode = str('productCode')?.toUpperCase();
  if (productCode) {
    if (PRODUCT_CODE_RE.test(productCode)) out.productCode = productCode;
    else rejected.push('productCode must be three letters, e.g. BZH');
  }

  const regulationNumber = str('regulationNumber')?.replace(/^21\s*CFR\s*/i, '');
  if (regulationNumber) {
    if (REGULATION_NUMBER_RE.test(regulationNumber)) out.regulationNumber = regulationNumber;
    else rejected.push('regulationNumber must look like 868.1860');
  }

  const deviceClass = str('deviceClass')?.toUpperCase();
  if (deviceClass) {
    if ((DEVICE_CLASSES as readonly string[]).includes(deviceClass)) out.deviceClass = deviceClass as DeviceClass;
    else rejected.push('deviceClass must be I, II or III');
  }

  const reviewPanel = str('reviewPanel');
  if (reviewPanel) {
    if ((REVIEW_PANELS as readonly string[]).includes(reviewPanel)) out.reviewPanel = reviewPanel;
    else rejected.push('reviewPanel is not a CDRH panel');
  }

  const predicateK = str('predicateK')?.toUpperCase();
  if (predicateK) {
    if (K_NUMBER_RE.test(predicateK)) out.predicateK = predicateK;
    else rejected.push('predicate must be a K number, e.g. K181234');
  }

  const intendedUse = str('intendedUse');
  if (intendedUse) out.intendedUse = intendedUse.slice(0, 4000);

  if (Array.isArray(r.flags)) {
    // An empty list is an ANSWER — the questions were asked and none apply —
    // and it is kept as one. Dropping it made "none apply" indistinguishable
    // from "never asked", and the eSTAR mapper treats the latter as sections of
    // undetermined applicability that block filing readiness.
    out.flags = [...new Set(r.flags.filter((f): f is DeviceFlagId => typeof f === 'string' && FLAG_IDS.has(f)))];
  }

  return { value: out, rejected };
}

/** Does this filing type want a device taxonomy rather than a therapeutic area? */
export function usesDeviceClassification(productType: string | null | undefined): boolean {
  return productType === 'device' || productType === 'ivd' || productType === 'cdx' || productType === 'samd';
}

/**
 * The US premarket route implied by a filing type.
 *
 * Derived rather than asked for: the wizard already made the user pick a filing
 * type, and asking again for the route is both a second chance to disagree with
 * it and a field nobody fills in correctly twice. Returns null for a filing type
 * with no US device route, so a pharma programme stores nothing here rather
 * than a default that would later read as a device claim.
 */
export function devicePathFor(filingType: string | null | undefined): RegulatoryPath | null {
  const k = String(filingType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const map: Record<string, RegulatoryPath> = {
    '510k': '510k', k510: '510k', fda_510k: '510k', special_510k: '510k', abbreviated_510k: '510k',
    de_novo: 'de_novo', denovo: 'de_novo',
    pma: 'pma', fda_pma: 'pma', ivd_pma: 'pma', cdx_pma: 'pma', pma_suppl: 'pma',
    hde: 'hde', fda_hde: 'hde',
    ide: 'ide',
    exempt: 'exempt', class_i_exempt: 'exempt',
  };
  return map[k] ?? null;
}
