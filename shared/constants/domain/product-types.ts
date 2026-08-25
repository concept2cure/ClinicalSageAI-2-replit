/**
 * Product Types — the canonical vocabulary for `regulatory_programs.product_type`.
 *
 * This is the class of THING a program develops. It is a different axis from
 * the filing type (`program_type`: what is being submitted) and from the client
 * segment (`ClientSegmentType`: which lane the customer works in), and it is
 * the one the platform persists on every program.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The same four-value vocabulary was written three times and agreed nowhere:
 *
 *   1. `VALID_PRODUCT_TYPES` in server/routes/c2c/projects.ts — the write-side
 *      allow-list, plus a `productTypeForProgram()` deriving a default from the
 *      filing type.
 *   2. `PRODUCT_TYPE_TO_SEGMENT` in server/services/report-os/segment.ts — the
 *      read side, which drops any value it does not recognise.
 *   3. `SEG2PRODUCT` in client/src/concept2cure/v2/surfaces/Projects.tsx — the
 *      wizard, which derived the product type from the UI SEGMENT rather than
 *      from the filing type.
 *
 * (3) is how a 510(k) came to be recorded as a biologic. The wizard opened on
 * the Pharma & Biotech tab, `SEG2PRODUCT['biotech']` is `'biologic'`, and that
 * value was sent explicitly — so the server's own correct derivation was
 * overridden by the client. The review step rendered exactly what it persisted:
 * `510K · biologic`. Three copies of a vocabulary is how one of them gets to be
 * wrong without the other two noticing.
 *
 * ── The device family, and why CDx and SaMD are listed separately ────────────
 * `cdx` and `samd` are NOT regulatory siblings of `device` and `ivd`. A
 * companion diagnostic IS an in-vitro diagnostic — in the US usually a Class III
 * PMA, under the EU IVDR usually Class D — and software as a medical device IS
 * a device. They are stored distinctly because the platform must route them
 * differently (a CDx carries a drug-pairing obligation; SaMD carries IEC 62304
 * and FD&C §524B cybersecurity), not because they sit outside the classes they
 * belong to.
 *
 * That distinction is load-bearing: any question of the form "is this a device?"
 * must include `samd`, and "is this an IVD?" must include `cdx`. Use
 * `isDeviceFamily` / `isIvdFamily` rather than comparing to `'device'` or
 * `'ivd'` directly, or a companion diagnostic will fall out of the IVD
 * pathways that govern it.
 */

import { toQuestionOptions as sharedToQuestionOptions, type DomainEntry } from './types.js';
import type { QuestionOption } from '../../types/intelligence-questions.js';

// ─── Vocabulary ─────────────────────────────────────────────────────────────

export type ProductType = 'drug' | 'biologic' | 'device' | 'ivd' | 'cdx' | 'samd';

export const PRODUCT_TYPES: DomainEntry<ProductType>[] = [
  {
    value: 'drug',
    label: 'Drug',
    description:
      'Small-molecule or otherwise chemically-defined medicinal product. Filed via NDA/ANDA (US), MAA (EU) or the regional equivalent.',
    regulatoryRefs: ['21 CFR 314', 'ICH M4'],
  },
  {
    value: 'biologic',
    label: 'Biologic',
    description:
      'Biological product — protein, cell or gene therapy, vaccine. Filed via BLA (US) or MAA (EU).',
    regulatoryRefs: ['21 CFR 601', 'ICH M4'],
  },
  {
    value: 'device',
    label: 'Medical device',
    description:
      'Medical device other than an in-vitro diagnostic. US pathways are 510(k), De Novo, PMA, HDE and IDE; the EU route is conformity assessment under the MDR with a notified body.',
    regulatoryRefs: ['21 CFR 807', '21 CFR 814', 'EU MDR 2017/745'],
  },
  {
    value: 'ivd',
    label: 'In-vitro diagnostic',
    description:
      'In-vitro diagnostic device. Same US pathways as a device, plus CLIA categorisation; the EU route is conformity assessment under the IVDR, which requires a Performance Evaluation Report rather than a CER.',
    regulatoryRefs: ['21 CFR 809', 'EU IVDR 2017/746', 'IVDR Annex XIII'],
  },
  {
    value: 'cdx',
    label: 'Companion diagnostic',
    description:
      'In-vitro diagnostic essential to the safe and effective use of a paired therapeutic product. Regulated AS an IVD — usually a Class III PMA in the US and Class D under the IVDR — with an additional co-development obligation to the paired drug.',
    regulatoryRefs: ['21 CFR 809', 'EU IVDR 2017/746', 'IVDR Annex I'],
  },
  {
    value: 'samd',
    label: 'Software as a medical device',
    description:
      'Software intended for a medical purpose that is not part of a hardware device. Regulated AS a device, with software lifecycle and premarket cybersecurity documentation obligations.',
    regulatoryRefs: ['IEC 62304', 'FD&C Act §524B', 'EU MDR 2017/745 Annex VIII Rule 11'],
  },
];

// ─── Family membership ──────────────────────────────────────────────────────

/**
 * Everything CDRH-style device regulation governs. Includes `samd` (software as
 * a medical device IS a device) and `cdx` (a companion diagnostic IS an IVD,
 * and an IVD is a device).
 */
export const DEVICE_FAMILY_PRODUCT_TYPES: readonly ProductType[] = ['device', 'ivd', 'cdx', 'samd'];

/** The IVD subset. A companion diagnostic is an IVD; software is not. */
export const IVD_FAMILY_PRODUCT_TYPES: readonly ProductType[] = ['ivd', 'cdx'];

/** Medicinal products — the pharma/biotech lanes. */
export const MEDICINAL_PRODUCT_TYPES: readonly ProductType[] = ['drug', 'biologic'];

/** Is this class governed as a medical device (including IVDs, CDx and SaMD)? */
export function isDeviceFamily(value: string | null | undefined): boolean {
  return DEVICE_FAMILY_PRODUCT_TYPES.includes(String(value ?? '').toLowerCase() as ProductType);
}

/** Is this class governed as an in-vitro diagnostic (including companion diagnostics)? */
export function isIvdFamily(value: string | null | undefined): boolean {
  return IVD_FAMILY_PRODUCT_TYPES.includes(String(value ?? '').toLowerCase() as ProductType);
}

/** Is this class a medicinal product (drug or biologic)? */
export function isMedicinalProduct(value: string | null | undefined): boolean {
  return MEDICINAL_PRODUCT_TYPES.includes(String(value ?? '').toLowerCase() as ProductType);
}

export function isProductType(value: unknown): value is ProductType {
  return (
    typeof value === 'string' &&
    PRODUCT_TYPES.some((e) => e.value === value.trim().toLowerCase())
  );
}

// ─── Derivation from the filing type ────────────────────────────────────────

/**
 * Filing types whose product class is fixed by the filing itself.
 *
 * These are regulatory facts, not defaults. A 510(k), De Novo, PMA, HDE or IDE
 * is a submission to CDRH about a device; an EU MDR technical file is about a
 * device; an EU IVDR technical file is about an IVD. None of them can be about
 * a drug or a biologic, which is precisely what the old derivation allowed:
 * `mdr` and `ivdr` were absent from every branch and fell through to `'drug'`,
 * so an EU MDR Class IIb technical file persisted as a drug programme.
 */
const FILING_TYPE_PRODUCT_CLASS: Record<string, ProductType> = {
  // ── Device, US (CDRH) ──
  '510k': 'device',
  de_novo: 'device',
  pma: 'device',
  hde: 'device',
  ide: 'device',
  device: 'device',
  // ── Device, EU ──
  // An MDR technical file and a Clinical Evaluation Report are both device
  // instruments. A CER belongs to the MDR (Art. 61 / Annex XIV); the IVDR
  // equivalent is a Performance Evaluation Report, which is a separate filing.
  mdr: 'device',
  cer: 'device',
  // ── IVD ──
  ivd: 'ivd',
  ivdr: 'ivd',
  // ── Medicinal ──
  ind: 'biologic',
  bla: 'biologic',
  biologic: 'biologic',
  nda: 'drug',
  anda: 'drug',
  jnda: 'drug',
  maa: 'drug',
  cta: 'drug',
};

/**
 * Lanes that refine a device filing to its IVD reading.
 *
 * A 510(k) is a device submission either way; whether the device is an IVD is a
 * property of the product, not of the filing. The lane the customer is working
 * in is the only signal available at creation time, and it is a good one — a
 * 510(k) started from the Diagnostics lane is an IVD 510(k).
 *
 * This may only REFINE within the device family. It can never make a device
 * filing medicinal, which is the failure this whole module exists to prevent.
 */
const IVD_LANES = new Set(['diagnostics', 'ivd', 'diagnostics_ivd']);

/**
 * The product class a filing type implies, optionally refined by the lane it
 * was created from.
 *
 * Returns null for a filing type this vocabulary does not know, so a caller can
 * decide between asking the user and refusing — never a silent `'drug'`.
 */
export function productTypeForFilingType(
  filingType: string | null | undefined,
  lane?: string | null,
): ProductType | null {
  const key = String(filingType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const base = FILING_TYPE_PRODUCT_CLASS[key];
  if (!base) return null;
  if (base === 'device' && IVD_LANES.has(String(lane ?? '').trim().toLowerCase())) return 'ivd';
  return base;
}

/** Every filing type this vocabulary can classify. */
export function listClassifiableFilingTypes(): string[] {
  return Object.keys(FILING_TYPE_PRODUCT_CLASS);
}

// ─── Workstream ─────────────────────────────────────────────────────────────

/**
 * The portfolio buckets the Projects grid filters on.
 *
 * Derived from the FILING TYPE, which is the only thing that is known and fixed
 * at creation time. Deriving it from the UI segment instead — what the wizard
 * did — means the review step can promise a workstream the server will not
 * store, which is the same class of defect as the product class it sat next to.
 */
export type Workstream = 'MDX' | 'Biotech' | 'Pharma';

export const WORKSTREAM_FILING_TYPES: Record<Workstream, readonly string[]> = {
  // Every device and IVD instrument, US and EU. `mdr` and `ivdr` were missing
  // from the server's bucketing and fell through to a title-cased echo of the
  // filing type — an EU MDR programme listed under a "Mdr" workstream, which
  // matches none of the grid's filter tabs, so it was invisible in the MDX view.
  MDX: ['510k', 'de_novo', 'pma', 'hde', 'ide', 'device', 'ivd', 'cer', 'mdr', 'ivdr'],
  Biotech: ['ind', 'bla', 'biologic'],
  Pharma: ['nda', 'maa', 'jnda', 'anda', 'cta'],
};

/** The portfolio workstream a filing type belongs to, or null if unclassified. */
export function workstreamForFilingType(filingType: string | null | undefined): Workstream | null {
  const key = String(filingType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  for (const [ws, types] of Object.entries(WORKSTREAM_FILING_TYPES) as [Workstream, readonly string[]][]) {
    if (types.includes(key)) return ws;
  }
  return null;
}

/**
 * `WORKSTREAM_FILING_TYPES` as a SQL CASE expression over a `program_type`
 * column, so the server's projection and the client's preview cannot drift.
 *
 * `lower()` because the store holds mixed casing ('510K', 'BLA', 'nda') — match
 * on the raw column and every real row falls to the ELSE and buckets nowhere.
 * The ELSE keeps the title-cased echo: a filing type this vocabulary does not
 * know is shown as itself rather than silently folded into a bucket it may not
 * belong to.
 */
export function workstreamSqlCase(column: string): string {
  const branch = (ws: Workstream) =>
    `WHEN lower(${column}) IN (${WORKSTREAM_FILING_TYPES[ws].map((t) => `'${t}'`).join(',')}) THEN '${ws}'`;
  return `CASE
         ${branch('MDX')}
         ${branch('Biotech')}
         ${branch('Pharma')}
         ELSE initcap(replace(${column}, '_', ' '))
       END`;
}

export function listProductTypes(): ProductType[] {
  return PRODUCT_TYPES.map((e) => e.value);
}

// ─── Question-option converter ──────────────────────────────────────────────

export function toQuestionOptions(): QuestionOption[] {
  return sharedToQuestionOptions(PRODUCT_TYPES);
}

export default {
  PRODUCT_TYPES,
  DEVICE_FAMILY_PRODUCT_TYPES,
  IVD_FAMILY_PRODUCT_TYPES,
  MEDICINAL_PRODUCT_TYPES,
  isDeviceFamily,
  isIvdFamily,
  isMedicinalProduct,
  isProductType,
  productTypeForFilingType,
  listProductTypes,
  listClassifiableFilingTypes,
};
