/**
 * Regulatory identifiers a submission package must carry before an agency
 * transmit — the ONE contract shared by the route that records them and the
 * assemble gate that requires them.
 *
 * The regional Module 1 backbone carries the agency application number
 * (FDA <application-number>, EMA <procedure-number>, PMDA <application-number>)
 * and the applicant identity. The c2c package model has no columns for them,
 * so they live in `c2c_submission_packages.metadata.regulatory`. Two rules:
 *
 *   1. Never fabricate. An internal package id is not an application number.
 *      When identifiers are missing or malformed the assemble gate records a
 *      blocking finding and builds with values that SAY they are unassigned.
 *   2. Charset-enforced. The application number and applicant id become
 *      filename components in the canonical packager and XML text in the
 *      backbone; the applicant name becomes XML text. A free-form string here
 *      was a path-traversal / ill-formed-backbone vector.
 *
 * @module server/services/ectd/regulatory-identifiers
 */

import { XML_ILLEGAL_CHARS } from '../submission-gateways/ectd-packager/paths';

/** Agency application / applicant identifiers: alphanumeric start, then up to
 *  63 of [A-Za-z0-9._-]. Covers IND/NDA/BLA numbers, EU procedure numbers
 *  (EMEA/H/C/001234 is NOT accepted — slashes are path separators; record the
 *  agency's dash form), DUNS and PMDA applicant ids. */
export const REGULATORY_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Applicant name: 1–200 characters, no C0 control characters or DEL (which
 *  would make the XML backbone ill-formed). Spaces and punctuation are fine. */
export const APPLICANT_NAME_PATTERN = /^[^\x00-\x1f\x7f]{1,200}$/;

export interface RegulatoryIdentifiers {
  applicationNumber: string;
  applicantId: string;
  applicantName: string;
}

export type RegulatoryIdentifierField = keyof RegulatoryIdentifiers;

/** The metadata keys, in the order findings name them. */
export const REGULATORY_IDENTIFIER_FIELDS: readonly RegulatoryIdentifierField[] = [
  'applicationNumber',
  'applicantId',
  'applicantName',
];

const PATTERN_FOR: Record<RegulatoryIdentifierField, RegExp> = {
  applicationNumber: REGULATORY_IDENTIFIER_PATTERN,
  applicantId: REGULATORY_IDENTIFIER_PATTERN,
  applicantName: APPLICANT_NAME_PATTERN,
};

/** Validate one field's value against its contract; null when unusable. */
export function usableIdentifier(field: RegulatoryIdentifierField, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!PATTERN_FOR[field].test(v)) return null;
  if (field === 'applicantName') {
    // The backbone writes the name through escapeXml, which STRIPS every
    // character XML cannot carry (C1 controls, U+FFFE/U+FFFF — outside the C0
    // range the pattern above excludes). A name that changes under that strip,
    // or strips to nothing, would ship as a silently altered or empty <name>
    // while the gate reported it usable. Refuse it here, with the packager's
    // own definition, so the two cannot drift.
    const stripped = v.replace(XML_ILLEGAL_CHARS, '');
    if (stripped !== v || stripped.trim().length === 0) return null;
  }
  return v;
}

export interface ReadRegulatoryIdentifiersResult {
  /** Each field's usable value, or null when missing/malformed. */
  values: { [K in RegulatoryIdentifierField]: string | null };
  /** Metadata paths that are missing or malformed (empty ⇒ complete). */
  missing: string[];
  /** All three present and usable. */
  complete: boolean;
}

/**
 * Read the identifiers from a package's metadata (`metadata.regulatory`).
 * Malformed values count as missing — a value the backbone/filesystem cannot
 * safely carry is not an identifier the transmit may use.
 */
export function readRegulatoryIdentifiers(
  metadata: Record<string, unknown> | null | undefined,
): ReadRegulatoryIdentifiersResult {
  const regulatory =
    metadata && typeof metadata.regulatory === 'object' && metadata.regulatory !== null
      ? (metadata.regulatory as Record<string, unknown>)
      : {};
  const values = {
    applicationNumber: usableIdentifier('applicationNumber', regulatory.applicationNumber),
    applicantId: usableIdentifier('applicantId', regulatory.applicantId),
    applicantName: usableIdentifier('applicantName', regulatory.applicantName),
  };
  const missing = REGULATORY_IDENTIFIER_FIELDS.filter((f) => values[f] === null).map((f) => `regulatory.${f}`);
  return { values, missing, complete: missing.length === 0 };
}

export default { readRegulatoryIdentifiers, usableIdentifier, REGULATORY_IDENTIFIER_FIELDS };
