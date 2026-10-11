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

/**
 * Whether `v` reaches the backbone unaltered as XML text. The backbone writes
 * text through escapeXml, which STRIPS every character XML cannot carry (C1
 * controls, U+FFFE/U+FFFF — outside the C0 range APPLICANT_NAME_PATTERN
 * excludes). A value that changes under that strip, or strips to nothing,
 * would ship silently altered or empty while the gate reported it usable, so it
 * is refused here, with the packager's own definition, so the two cannot drift.
 */
function carriesAsXmlText(v: string): boolean {
  const stripped = v.replace(XML_ILLEGAL_CHARS, '');
  if (stripped !== v || stripped.trim().length === 0) return false;
  // A lone surrogate is outside XML's Char production and is rewritten to
  // U+FFFD on the way into the zip — an altered value. encodeURIComponent
  // throws on exactly that, which keeps this file free of escape sequences.
  try { encodeURIComponent(v); } catch { return false; }
  return true;
}

/** Validate one field's value against its contract; null when unusable. */
export function usableIdentifier(field: RegulatoryIdentifierField, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!PATTERN_FOR[field].test(v)) return null;
  // The name is backbone text (<name>, <company-name>); the other two are held
  // to a charset XML always carries.
  if (field === 'applicantName' && !carriesAsXmlText(v)) return null;
  return v;
}

/** `record[key]` when it is an object, else an empty one. */
function objectAt(record: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> {
  const value = record?.[key];
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
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
  const regulatory = objectAt(metadata, 'regulatory');
  const values = {
    applicationNumber: usableIdentifier('applicationNumber', regulatory.applicationNumber),
    applicantId: usableIdentifier('applicantId', regulatory.applicantId),
    applicantName: usableIdentifier('applicantName', regulatory.applicantName),
  };
  const missing = REGULATORY_IDENTIFIER_FIELDS.filter((f) => values[f] === null).map((f) => `regulatory.${f}`);
  return { values, missing, complete: missing.length === 0 };
}

/* recordedApplicationId — DELETED 2026-10-08 (QA j6). It answered the agency
   application number as the recorded number, else the PROGRAM CODE, else an
   UNASSIGNED handle, so the inspection copy of PLR-606 sequence 0000 carried
   <application-number>PLR-606</application-number>. Its replacement, by path:
   server/services/ectd/package-identity.ts (readRecordedPackageIdentity +
   packageIdentityRefusal) — the recorded number only, or the package is
   refused by name — used by assembleSubmissionEctd, the eCTD compile and
   transmitSequence. Pinned by export-application-identity.pglite.test.ts,
   ectd-compile-spine.test.ts and refused-step-voids-signature.pglite.test.ts. */

/* ─── The regulatory contact ──────────────────────────────────────────────
 * The person the agency calls about the application. FDA's us-regional backbone
 * names one under <applicant-info><applicant-contacts> (a name, a telephone and
 * an e-mail), and the packager writes exactly what is recorded
 * (regional-packager.ts fdaApplicantContact). Stored as
 * `metadata.regulatory.contact`. The checks are charset only, because each value
 * is backbone text: no national telephone format, no e-mail deliverability.
 * 2026-10-01 (package-spine sweep F07b): nothing recorded a contact, so no
 * package-spine bundle could name one. */

export interface RegulatoryContact {
  name: string;
  phone: string;
  email: string;
}

export type RegulatoryContactField = keyof RegulatoryContact;

/** A contact as read: each field's usable value, or null. */
export type RegulatoryContactValues = { [K in RegulatoryContactField]: string | null };

/** The contact's keys, in the order refusals and findings name them. */
export const REGULATORY_CONTACT_FIELDS: readonly RegulatoryContactField[] = ['name', 'phone', 'email'];

/** Telephone: 1–40 of digits, spaces, "+", "(", ")", ".", "-" and "x" (an
 *  extension), with at least one digit. */
export const CONTACT_PHONE_PATTERN = /^(?=\D*\d)[\d +().xX-]{1,40}$/;

/** E-mail: text, one "@", text; no whitespace; at most 254 characters. */
export const CONTACT_EMAIL_PATTERN = /^(?=.{3,254}$)[^\s@]+@[^\s@]+$/;

const CONTACT_PATTERN_FOR: Record<RegulatoryContactField, RegExp> = {
  // A person's name is held to the applicant name's contract.
  name: APPLICANT_NAME_PATTERN,
  phone: CONTACT_PHONE_PATTERN,
  email: CONTACT_EMAIL_PATTERN,
};

/** Validate one contact field against its charset; null when unusable. Every
 *  contact value is backbone text, so each must also reach it unaltered. */
export function usableContactField(field: RegulatoryContactField, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return CONTACT_PATTERN_FOR[field].test(v) && carriesAsXmlText(v) ? v : null;
}

/** Read the contact from a package's metadata (`metadata.regulatory.contact`).
 *  A malformed value reads as absent, as an identifier does. */
export function readRegulatoryContact(metadata: Record<string, unknown> | null | undefined): RegulatoryContactValues {
  const contact = objectAt(objectAt(metadata, 'regulatory'), 'contact');
  return {
    name: usableContactField('name', contact.name),
    phone: usableContactField('phone', contact.phone),
    email: usableContactField('email', contact.email),
  };
}

/** Whether two reads name the same contact, field for field. */
export function sameRegulatoryContact(a: RegulatoryContactValues, b: RegulatoryContactValues): boolean {
  return REGULATORY_CONTACT_FIELDS.every((f) => a[f] === b[f]);
}

/* ─── FDA's own forms (FDA eCTD only) ─────────────────────────────────────
 * 2026-10-01 (package-spine sweep F05): the package spine wrote the application
 * number exactly as entered, and its own example was 'IND123456'. The charset
 * contract above stays as it is: it is shared with the IND lane and the gateways,
 * and an EU or PMDA number is not FDA's. FDA's form is a SEPARATE rule, applied
 * where the package is known to be an FDA eCTD (the identifiers route and the
 * assemble gate). */

/** An FDA application number (IND, NDA, ANDA, BLA, DMF): the six digits FDA
 *  assigned, leading zeros kept, no prefix. The pathway is the backbone's
 *  application-type code, never part of the number. */
export const FDA_APPLICATION_NUMBER_PATTERN = /^\d{6}$/;

/** A D-U-N-S number: nine digits, written without dashes. */
export const DUNS_NUMBER_PATTERN = /^\d{9}$/;

/** One requirement of FDA's that the recorded identifiers do not meet. */
export interface FdaIdentifierProblem {
  /** The identifiers-route fields concerned: 'applicationNumber',
   *  'applicantId', 'contact' (none recorded) or 'contact.<field>'. */
  fields: string[];
  /** What FDA requires and what to record, as one sentence for the operator. */
  message: string;
}

const CONTACT_FIELD_LABEL: Record<RegulatoryContactField, string> = { name: 'name', phone: 'telephone', email: 'e-mail' };

/** What the contact lacks, as one problem; null when it lacks nothing. */
function fdaContactProblem(contact: Partial<RegulatoryContactValues> | null | undefined): FdaIdentifierProblem | null {
  const absent = REGULATORY_CONTACT_FIELDS.filter((f) => !contact?.[f]);
  if (absent.length === 0) return null;
  if (absent.length === REGULATORY_CONTACT_FIELDS.length) {
    return {
      fields: ['contact'],
      message: 'FDA’s us-regional backbone names a regulatory contact for the application: record the contact’s name, telephone and e-mail.',
    };
  }
  return {
    fields: absent.map((f) => `contact.${f}`),
    message: `The regulatory contact has no ${absent.map((f) => CONTACT_FIELD_LABEL[f]).join(' or ')}: FDA’s us-regional backbone names the contact with a name, telephone and e-mail.`,
  };
}

/**
 * What an FDA eCTD application's us-regional backbone needs from the recorded
 * identifiers beyond the charset contract: the ONE rule the identifiers route
 * refuses on and the assemble gate blocks on. A value is judged, never
 * rewritten: 'IND123456' is refused with what to record, never stripped to
 * '123456', because a number the operator mistyped would then be filed as if
 * they had entered it.
 *
 * An application number or applicant id that is null is not judged here: its
 * absence is the charset contract's finding (readRegulatoryIdentifiers().missing).
 * The contact is required by FDA alone, so its absence is reported here.
 */
export function fdaIdentifierProblems(input: {
  applicationNumber?: string | null;
  applicantId?: string | null;
  contact?: Partial<RegulatoryContactValues> | null;
}): FdaIdentifierProblem[] {
  const problems: FdaIdentifierProblem[] = [];
  if (input.applicationNumber != null && !FDA_APPLICATION_NUMBER_PATTERN.test(input.applicationNumber)) {
    problems.push({
      fields: ['applicationNumber'],
      message:
        'FDA application numbers are the six digits FDA assigned, with leading zeros and no IND/NDA/BLA prefix ' +
        '(application-type carries the pathway): record 123456, not IND123456.',
    });
  }
  if (input.applicantId != null && !DUNS_NUMBER_PATTERN.test(input.applicantId)) {
    problems.push({
      fields: ['applicantId'],
      message:
        'The applicant id on an FDA application is the company’s D-U-N-S number, nine digits with no dashes or prefix: ' +
        'record 123456789, not DUNS-123456789 or 12-345-6789.',
    });
  }
  const contactProblem = fdaContactProblem(input.contact);
  if (contactProblem) problems.push(contactProblem);
  return problems;
}

export default { readRegulatoryIdentifiers, usableIdentifier, REGULATORY_IDENTIFIER_FIELDS };
