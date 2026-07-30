/**
 * Deterministic identifiers for eCTD v4.0 (RPS) objects.
 *
 * RPS objects (submissionUnit, contextOfUse, document) are identified by UUIDs.
 * For reproducible packaging — and so a later sequence's `relatedContextOfUse`
 * can reference the exact UUID a prior sequence assigned to a CoU — we derive
 * UUIDs deterministically (RFC 4122 v5) from stable business keys rather than
 * generating random v4 UUIDs. Same inputs ⇒ same package bytes ⇒ the
 * qualification harness can reopen and re-verify.
 *
 * @module server/services/ectd/ectd4/ids
 */

import { v5 as uuidv5 } from 'uuid';

/** Stable namespace for all Concept2Cure eCTD v4.0 derived UUIDs. */
export const ECTD_V4_UUID_NAMESPACE = '6ba7b814-9dad-11d1-80b4-00c04fd430c8';

/** Derive a stable UUID from a business key (e.g. `app|cou|us_1.2`). */
export function deriveUuid(key: string): string {
  return uuidv5(key, ECTD_V4_UUID_NAMESPACE);
}

/** UUID for a submission unit (one per sequence of an application). */
export function submissionUnitId(applicationNumber: string, sequenceNumber: string): string {
  return deriveUuid(`su|${applicationNumber}|${sequenceNumber}`);
}

/**
 * UUID for a Context of Use. Keyed on the application + CoU section + a stable
 * discriminator (document key or an explicit slot), NOT the sequence — so a
 * later sequence referencing the same logical CoU derives the same UUID.
 */
export function contextOfUseId(applicationNumber: string, couCode: string, discriminator: string): string {
  return deriveUuid(`cou|${applicationNumber}|${couCode}|${discriminator}`);
}

/** UUID for a reusable Document, keyed on the application + document business key. */
export function documentId(applicationNumber: string, documentKey: string): string {
  return deriveUuid(`doc|${applicationNumber}|${documentKey}`);
}

/** UUID for the RPS message envelope of a given submission unit. */
export function messageId(applicationNumber: string, sequenceNumber: string): string {
  return deriveUuid(`msg|${applicationNumber}|${sequenceNumber}`);
}

/** True when `value` is a syntactically valid RFC 4122 UUID. */
export function isUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}
