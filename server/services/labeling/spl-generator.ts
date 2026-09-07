/**
 * SPL (Structured Product Labeling) assembly + validation.
 *
 * FDA ingests labeling as SPL — HL7 v3 XML (codeSystem 2.16.840.1.113883.6.1 =
 * LOINC). This builds a well-formed, conformant SPL document skeleton from a
 * structured spec and validates the spec against SPL's structural requirements
 * (document/section LOINC codes, set-id GUID, integer version, organization,
 * and per-section code+title+text). It is deterministic and honest about scope:
 * it produces a structurally-valid SPL and flags missing/ill-formed elements —
 * it does NOT run FDA's full schematron business-rule set (call FDA's validator
 * for final acceptance).
 *
 * Pure: no DB, no network. Identical spec → identical XML.
 *
 * @module server/services/labeling/spl-generator
 */

import { createHash } from 'crypto';

const LOINC_CODE_SYSTEM = '2.16.840.1.113883.6.1';
const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LOINC_RE = /^\d{3,5}-\d$/;
/** NDC product (labeler-product) or package (labeler-product-package) code. */
const NDC_RE = /^\d{4,5}-\d{3,4}(-\d{1,2})?$/;
/** FDA's NDC code system OID, as SPL requires on a manufacturedProduct code. */
const NDC_CODE_SYSTEM = '2.16.840.1.113883.6.69';

export interface SplSection {
  /** LOINC section code, e.g. "34067-9" (Indications). */
  code: string;
  title: string;
  /** Narrative text for the section. */
  text: string;
  /** Section GUID; synthesized deterministically (with a warning) if omitted. */
  id?: string;
  displayName?: string;
}

/**
 * The product the labeling is ABOUT.
 *
 * SPL carries this as document/subject/manufacturedProduct. It was not modelled
 * here at all, and the convenience layer that feeds this generator collected an
 * NDC from the user and then dropped it — the downloaded file named the product
 * only in a prose DESCRIPTION sentence. A drug label document without its
 * product element is not a drug label.
 */
export interface SplProduct {
  name: string;
  /** NDC as supplied — product (labeler-product) or package code. */
  ndcCode?: string;
  ingredients: Array<{ name: string; strength?: string }>;
  /** Route of administration, free text as recorded. */
  route?: string;
}

export interface SplSpec {
  /** LOINC document-type code, e.g. "34391-3" (Human Prescription Drug Label). */
  documentTypeCode: string;
  documentTypeDisplayName?: string;
  title: string;
  /** SPL set id (stable across versions of the same labeling) — a GUID. */
  setId: string;
  /** Integer version number (≥1). */
  versionNumber: number;
  /** Effective date as YYYYMMDD. */
  effectiveDate: string;
  /** Labeler / author organization name. */
  organizationName: string;
  /** Document GUID for this version; synthesized deterministically if omitted. */
  documentId?: string;
  /** The product this labeling describes. Omitted only by callers that have none. */
  product?: SplProduct;
  sections: SplSection[];
}

export interface SplValidationIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface SplValidationResult {
  valid: boolean;
  errors: SplValidationIssue[];
  warnings: SplValidationIssue[];
}

export interface SplGenerationResult {
  xml: string;
  warnings: SplValidationIssue[];
  /** Whether the spec passed structural validation (errors block a clean build). */
  structurallyValid: boolean;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Deterministic UUID (v5-style, namespaced) from a seed — for reproducible ids.
 *
 * Exported because the SPL convenience layer had its own: a 32-bit string hash
 * smeared into UUID shape. Two unrelated products in two unrelated tenants could
 * land on the same setId, which to FDA means "a new version of that other
 * company's label". One derivation, sha1-wide, for both entry points.
 */
export function splDeterministicGuid(seed: string): string {
  return deterministicGuid(seed);
}

function deterministicGuid(seed: string): string {
  const h = createHash('sha1').update(`spl:${seed}`).digest('hex');
  // Format as 8-4-4-4-12 and stamp version 5 / RFC-variant nibbles.
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return v;
}

/** The subject/manufacturedProduct half of the spec, checked on its own. */
function validateProduct(
  product: SplProduct | undefined,
  errors: SplValidationIssue[],
  warnings: SplValidationIssue[],
): void {
  if (product === undefined) {
    warnings.push({
      severity: 'warning',
      path: '/product',
      message: 'no product supplied — the document will carry no subject/manufacturedProduct element.',
    });
    return;
  }
  if (!product.name?.trim()) {
    errors.push({ severity: 'error', path: '/product/name', message: 'product name is required.' });
  }
  if (product.ndcCode !== undefined && !NDC_RE.test(product.ndcCode)) {
    errors.push({
      severity: 'error',
      path: '/product/ndcCode',
      message: 'ndcCode must be an NDC product or package code (e.g. "0002-1433" or "0002-1433-80").',
    });
  }
  if (!Array.isArray(product.ingredients) || product.ingredients.length === 0) {
    errors.push({ severity: 'error', path: '/product/ingredients', message: 'at least one active ingredient is required.' });
    return;
  }
  product.ingredients.forEach((ing, i) => {
    if (!ing?.name?.trim()) {
      errors.push({ severity: 'error', path: `/product/ingredients/${i}/name`, message: 'ingredient name is required.' });
    }
  });
}

/** Validate an SPL spec against SPL's structural requirements. */
export function validateSplSpec(spec: SplSpec): SplValidationResult {
  const errors: SplValidationIssue[] = [];
  const warnings: SplValidationIssue[] = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: [{ severity: 'error', path: '/', message: 'spec is required' }], warnings };
  }
  if (!LOINC_RE.test(spec.documentTypeCode ?? '')) {
    errors.push({ severity: 'error', path: '/documentTypeCode', message: 'documentTypeCode must be a LOINC code like "34391-3".' });
  }
  if (!spec.title?.trim()) errors.push({ severity: 'error', path: '/title', message: 'title is required.' });
  if (!GUID_RE.test(spec.setId ?? '')) {
    errors.push({ severity: 'error', path: '/setId', message: 'setId must be a GUID (8-4-4-4-12 hex).' });
  }
  if (!Number.isInteger(spec.versionNumber) || spec.versionNumber < 1) {
    errors.push({ severity: 'error', path: '/versionNumber', message: 'versionNumber must be an integer ≥ 1.' });
  }
  if (!/^\d{8}$/.test(spec.effectiveDate ?? '')) {
    errors.push({ severity: 'error', path: '/effectiveDate', message: 'effectiveDate must be YYYYMMDD.' });
  }
  if (!spec.organizationName?.trim()) {
    errors.push({ severity: 'error', path: '/organizationName', message: 'organizationName is required.' });
  }
  if (spec.documentId !== undefined && !GUID_RE.test(spec.documentId)) {
    errors.push({ severity: 'error', path: '/documentId', message: 'documentId, if supplied, must be a GUID.' });
  } else if (spec.documentId === undefined) {
    warnings.push({ severity: 'warning', path: '/documentId', message: 'documentId omitted — a deterministic GUID will be synthesized from setId+version.' });
  }

  validateProduct(spec.product, errors, warnings);

  if (!Array.isArray(spec.sections) || spec.sections.length === 0) {
    errors.push({ severity: 'error', path: '/sections', message: 'at least one section is required.' });
  } else {
    spec.sections.forEach((s, i) => {
      if (!LOINC_RE.test(s.code ?? '')) errors.push({ severity: 'error', path: `/sections/${i}/code`, message: 'section code must be a LOINC code.' });
      if (!s.title?.trim()) errors.push({ severity: 'error', path: `/sections/${i}/title`, message: 'section title is required.' });
      if (!s.text?.trim()) errors.push({ severity: 'error', path: `/sections/${i}/text`, message: 'section text is required.' });
      if (s.id !== undefined && !GUID_RE.test(s.id)) errors.push({ severity: 'error', path: `/sections/${i}/id`, message: 'section id, if supplied, must be a GUID.' });
      else if (s.id === undefined) warnings.push({ severity: 'warning', path: `/sections/${i}/id`, message: 'section id omitted — a deterministic GUID will be synthesized.' });
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Generate an SPL XML document from a spec. Validates first; when the spec has
 * structural errors, returns the partial XML it can build plus the issues — it
 * never silently emits a malformed-but-clean-looking document.
 */
export function generateSpl(spec: SplSpec): SplGenerationResult {
  const validation = validateSplSpec(spec);
  const warnings = [...validation.warnings];

  const documentId = spec.documentId ?? deterministicGuid(`${spec.setId}:${spec.versionNumber}`);
  const docTypeDisplay = spec.documentTypeDisplayName ?? 'Labeling';

  const sectionsXml = (spec.sections ?? [])
    .map((s, i) => {
      const sid = s.id ?? deterministicGuid(`${spec.setId}:${spec.versionNumber}:section:${i}:${s.code}`);
      const display = s.displayName ? ` displayName="${xmlEscape(s.displayName)}"` : '';
      return [
        '      <component>',
        '        <section>',
        `          <id root="${sid}"/>`,
        `          <code code="${xmlEscape(s.code ?? '')}" codeSystem="${LOINC_CODE_SYSTEM}"${display}/>`,
        `          <title>${xmlEscape(s.title ?? '')}</title>`,
        `          <text>${xmlEscape(s.text ?? '')}</text>`,
        '        </section>',
        '      </component>',
      ].join('\n');
    })
    .join('\n');

  /* document/subject/manufacturedProduct — the product the labeling is about,
     carrying the NDC the caller supplied instead of discarding it. */
  const subjectXml = spec.product
    ? [
        '  <subject>',
        '    <manufacturedProduct>',
        `      <name>${xmlEscape(spec.product.name ?? '')}</name>`,
        ...(spec.product.ndcCode
          ? [`      <code code="${xmlEscape(spec.product.ndcCode)}" codeSystem="${NDC_CODE_SYSTEM}"/>`]
          : []),
        ...(spec.product.route
          ? [`      <formCode displayName="${xmlEscape(spec.product.route)}"/>`]
          : []),
        ...(spec.product.ingredients ?? []).flatMap((ing) => [
          '      <ingredient classCode="ACTIB">',
          ...(ing.strength ? [`        <quantity>${xmlEscape(ing.strength)}</quantity>`] : []),
          '        <ingredientSubstance>',
          `          <name>${xmlEscape(ing.name ?? '')}</name>`,
          '        </ingredientSubstance>',
          '      </ingredient>',
        ]),
        '    </manufacturedProduct>',
        '  </subject>',
      ]
    : [];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<document xmlns="urn:hl7-org:v3">',
    `  <id root="${documentId}"/>`,
    `  <code code="${xmlEscape(spec.documentTypeCode ?? '')}" codeSystem="${LOINC_CODE_SYSTEM}" displayName="${xmlEscape(docTypeDisplay)}"/>`,
    `  <title>${xmlEscape(spec.title ?? '')}</title>`,
    `  <effectiveTime value="${xmlEscape(spec.effectiveDate ?? '')}"/>`,
    `  <setId root="${xmlEscape(spec.setId ?? '')}"/>`,
    `  <versionNumber value="${Number.isInteger(spec.versionNumber) ? spec.versionNumber : 1}"/>`,
    '  <author>',
    '    <assignedEntity>',
    '      <representedOrganization>',
    `        <name>${xmlEscape(spec.organizationName ?? '')}</name>`,
    '      </representedOrganization>',
    '    </assignedEntity>',
    '  </author>',
    ...subjectXml,
    '  <component>',
    '    <structuredBody>',
    sectionsXml,
    '    </structuredBody>',
    '  </component>',
    '</document>',
    '',
  ].join('\n');

  return { xml, warnings, structurallyValid: validation.valid };
}
