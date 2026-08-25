/**
 * Versioned digests — seal with the current serializer, verify with the one
 * that sealed it.
 *
 * ── The problem this exists for ─────────────────────────────────────────────
 * A digest is only comparable to another digest produced by the same
 * serializer. Fifteen modules canonicalized JSON their own way (ledger L46),
 * and six of them recompute a digest from stored content and compare it to a
 * stored digest. Re-pointing one of those at `shared/canonical-json.ts`
 * invalidates every record it has written — and for a signed artifact,
 * "re-derive the hashes" is not available at all: the signature IS the record,
 * and re-signing it retroactively is the thing tamper-evidence exists to
 * prevent.
 *
 * The way through is not to migrate the digests. It is to record which
 * serializer produced each one and verify with that.
 *
 * ── The shape, proven once before being generalized ─────────────────────────
 * `server/services/audit/signedAuditExport.ts` (ledger L55) is this mechanism
 * at its smallest: the manifest carries `manifestVersion`, new exports are
 * sealed at version 2 with the shared canonicalizer, and an export with no
 * marker resolves to version 1 and is canonicalized by the original expression
 * reproduced byte for byte. Old signatures verify; new ones cover the whole
 * document. This module is that pattern with the per-site part — the legacy
 * serializer — passed in, because every site's legacy differs and each is the
 * only thing that can reproduce its own history.
 *
 * ── Two rules that are easy to get wrong ────────────────────────────────────
 * 1. **The legacy serializer keeps its defects.** Its job is to reproduce what
 *    was signed, not to be correct. "Fixing" a legacy serializer orphans every
 *    signature it was preserving, which is strictly worse than the defect.
 *    Freeze it, name it, and route to it only from a verify path.
 * 2. **A record with no version is version 1, never the current one.** Absence
 *    means "written before versioning existed". Defaulting it to the current
 *    version would silently declare every historical record to have been sealed
 *    by a serializer that did not exist yet, and they would all fail to verify.
 * 3. **Do not pass a stored marker into a default parameter.** A JavaScript
 *    default fires on `undefined`, which is exactly what a legacy record's
 *    missing marker is — so `canonicalize(value, record.canonVersion)` against a
 *    signature `(value, version = CURRENT)` verifies every historical record
 *    with the current serializer, silently, which is the failure this whole
 *    module exists to prevent. This bit `report-os/sealing/seal.ts` during its
 *    migration and was caught only because a test sealed a record the old way
 *    first. Call `readCanonVersion` before the call, not inside it.
 *
 * @module shared/versioned-digest
 */

import { stableStringify } from './canonical-json.js';

/**
 * Canonicalization generation.
 *
 * 1 — the module's own legacy serializer, whatever it was. Frozen, verify-only.
 * 2 — `shared/canonical-json.ts`. What every new digest is sealed with.
 */
export type CanonVersion = 1 | 2;

/** The version new digests are sealed at. */
export const CANON_VERSION_CURRENT: CanonVersion = 2;

/**
 * Normalize a stored version marker.
 *
 * Anything absent, null, or unrecognized is version 1 — see rule 2 above. This
 * is the one place that decision is made, so it cannot be made differently at
 * six call sites.
 */
export function readCanonVersion(stored: unknown): CanonVersion {
  return stored === 2 || stored === '2' ? 2 : 1;
}

/**
 * A record's sealed digest and the generation that produced it. Persist both —
 * the version costs one small column and is what makes the digest verifiable
 * once the serializer moves on.
 */
export interface SealedDigest {
  canonVersion: CanonVersion;
  canonical: string;
}

/**
 * Seal a value at the current version.
 *
 * Returns the canonical string rather than a hash, because sites differ in what
 * they do with it — SHA-256, HMAC, or straight into a manifest — and this
 * module should not have an opinion about which.
 */
export function sealCanonical(value: unknown): SealedDigest {
  return { canonVersion: CANON_VERSION_CURRENT, canonical: stableStringify(value) };
}

/**
 * Canonicalize a stored value the way its own record says it was sealed.
 *
 * `legacy` is the module's frozen serializer. It is required rather than
 * optional: a site with stored digests always has one, and a site without
 * stored digests does not need this module at all — it should call
 * `stableStringify` directly.
 *
 * @param value        the content to canonicalize
 * @param storedVersion the version marker read off the record
 * @param legacy       the module's own version-1 serializer, frozen
 */
export function canonicalAsSealed(
  value: unknown,
  storedVersion: unknown,
  legacy: (value: unknown) => string,
): string {
  return readCanonVersion(storedVersion) === 2 ? stableStringify(value) : legacy(value);
}

/**
 * Whether a stored digest still matches its content.
 *
 * `digestOf` is the site's hash or signature function — SHA-256, HMAC, whatever
 * sealed the record — applied to the canonical string. Comparison is a plain
 * string equality on hex digests; if a site needs constant-time comparison for
 * a secret-keyed signature, it should compare itself rather than pass its
 * signing function through here.
 */
export function verifyAsSealed(args: {
  value: unknown;
  storedVersion: unknown;
  storedDigest: string;
  legacy: (value: unknown) => string;
  digestOf: (canonical: string) => string;
}): boolean {
  const canonical = canonicalAsSealed(args.value, args.storedVersion, args.legacy);
  return args.digestOf(canonical) === args.storedDigest;
}
