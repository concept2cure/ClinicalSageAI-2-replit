/**
 * eCTD controlled-vocabulary service (v3.2.2 coded attributes + v4.0 genericode).
 *
 * A single, dependency-free lookup/validation surface used by both publishing
 * engines:
 *   - the v3.2.2 FDA us-regional backbone builder (attribute codes fdaat/…),
 *   - the v4.0 HL7 RPS message builder + validator (genericode `us_*` codes,
 *     code-system OIDs),
 *   - the v3.2.2 → v4.0 forward-compatibility mapper (the crosswalk).
 *
 * All functions are PURE (no I/O). This is the authority for "is this code
 * valid?" and "what OID governs this code system?" so no other module hard-codes
 * a code or an OID.
 *
 * @module server/services/ectd/controlled-vocab
 */

import {
  V4_CODE_LISTS,
  type CvCodeList,
  type CvCodeRow,
  FDA_REGIONAL_IG_OID,
  FDA_APPLICATION_ID_OID,
  ICH_ECTD_V4_IG_OID,
} from './cv-v4-data';
import {
  V3_CODE_LISTS,
  FDA_APPLICATION_PREFIX,
  applicationTypeToFdaCode,
  type V3Code,
  type V3ListId,
} from './cv-v3-data';

export * from './cv-v4-data';
export * from './cv-v3-data';
export {
  usRegionalSectionElement,
  isKnownUsRegionalSection,
} from './fda-regional-sections';

/** Semantic id of a v4.0 genericode list. */
export type V4ListId = keyof typeof V4_CODE_LISTS;

/** An OID is a dotted sequence of non-negative integers (RFC 3061 / X.660). */
const OID_PATTERN = /^([0-2])(\.(0|[1-9]\d*))+$/;

/**
 * True when `value` is a syntactically valid ISO/HL7 object identifier.
 * (Structural check only — does not assert the OID is registered with FDA.)
 */
export function isValidOid(value: string | undefined | null): boolean {
  if (!value) return false;
  return OID_PATTERN.test(value.trim());
}

/* ─── v4.0 genericode lookups ─────────────────────────────────────── */

/** Fetch a v4.0 code list by semantic id (applicationType, contextOfUse, …). */
export function getV4List(id: V4ListId): CvCodeList {
  return V4_CODE_LISTS[id];
}

/** True when `code` is an active member of the named v4.0 code list. */
export function isValidV4Code(id: V4ListId, code: string): boolean {
  return V4_CODE_LISTS[id]?.codes.some((c) => c.code === code) ?? false;
}

/** Resolve a v4.0 code to its row (code + description), or null. */
export function resolveV4Code(id: V4ListId, code: string): CvCodeRow | null {
  return V4_CODE_LISTS[id]?.codes.find((c) => c.code === code) ?? null;
}

/** The code-system OID that governs a v4.0 code list ('na' if not OID-governed). */
export function oidForV4List(id: V4ListId): string {
  return V4_CODE_LISTS[id]?.oid ?? 'na';
}

/**
 * True when `oid` is the registered code-system OID for the named v4.0 list.
 * Used by the RPS validator's "code system is a valid OID for …" criteria.
 */
export function isCodeSystemOidValid(id: V4ListId, oid: string): boolean {
  const expected = oidForV4List(id);
  if (expected === 'na') return isValidOid(oid); // status/telecom lists: syntactic only
  return oid === expected;
}

/* ─── v3.2.2 coded-attribute lookups ──────────────────────────────── */

/** Fetch a v3.2.2 coded-attribute list by id. */
export function getV3List(id: V3ListId): V3Code[] {
  return V3_CODE_LISTS[id];
}

/** True when `code` is a member of the named v3.2.2 coded-attribute list. */
export function isValidV3Code(id: V3ListId, code: string): boolean {
  return V3_CODE_LISTS[id]?.some((c) => c.code === code) ?? false;
}

/** Resolve a v3.2.2 attribute code to its entry, or null. */
export function resolveV3Code(id: V3ListId, code: string): V3Code | null {
  return V3_CODE_LISTS[id]?.find((c) => c.code === code) ?? null;
}

/* ─── v3.2.2 → v4.0 crosswalk (forward compatibility) ─────────────── */

/**
 * Map a v3.2.2 attribute code to its equivalent v4.0 genericode code.
 * Returns null when the v3.2.2 code is unknown or has no 1:1 v4.0 equivalent —
 * callers converting a 3.2.2 application to 4.0 must handle the gap explicitly
 * rather than silently emit an invalid code.
 */
export function v3CodeToV4(id: V3ListId, v3Code: string): string | null {
  return resolveV3Code(id, v3Code)?.v4Code ?? null;
}

/** The FDA server path prefix (nda/ind/anda/mf/bla) for an application-type
 *  code, used to build lifecycle `modified-file` references in grouped
 *  submissions (Module 1 Backbone Spec Addendum 1). */
export function fdaApplicationPrefix(applicationTypeCode: string): string | null {
  return FDA_APPLICATION_PREFIX[applicationTypeCode] ?? null;
}

/* ─── v3.2.2 attribute-code resolvers (accept a code OR a canonical label) ─ */

/** Resolve a value to a v3.2.2 attribute code for the given list: if it is
 *  already a valid `fdaXX` code it passes through; otherwise it is matched
 *  case-insensitively against the list's descriptions/canonical labels.
 *  Returns null when nothing matches. */
function resolveV3(id: V3ListId, value: string): string | null {
  if (!value) return null;
  const list = V3_CODE_LISTS[id];
  const raw = value.trim();
  if (list.some((c) => c.code === raw)) return raw;
  const norm = raw.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  const hit = list.find((c) => c.description.toLowerCase().includes(norm) || norm.includes(c.description.toLowerCase().split(' (')[0]));
  return hit?.code ?? null;
}

/** Resolve an application-type value to its us-regional `fdaatN` code. */
export function resolveApplicationTypeCode(value: string): string | null {
  return applicationTypeToFdaCode(value) ?? resolveV3('applicationType', value);
}
/** Resolve a submission-type value to its us-regional `fdastN` code. */
export function resolveSubmissionTypeCode(value: string): string | null {
  return resolveV3('submissionType', value);
}
/** Resolve a submission-sub-type value to its us-regional `fdasstN` code. */
export function resolveSubmissionSubTypeCode(value: string): string | null {
  return resolveV3('submissionSubType', value);
}
/** Resolve a form-type value to its us-regional `fdaftN` code. */
export function resolveFormTypeCode(value: string): string | null {
  return resolveV3('formType', value);
}
/** Resolve an applicant-contact-type value to its us-regional `fdaactN` code. */
export function resolveContactTypeCode(value: string): string | null {
  return resolveV3('applicantContactType', value);
}

/* ─── re-exported constants for convenience ───────────────────────── */
export {
  FDA_REGIONAL_IG_OID,
  FDA_APPLICATION_ID_OID,
  ICH_ECTD_V4_IG_OID,
  applicationTypeToFdaCode,
};
