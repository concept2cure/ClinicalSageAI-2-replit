/**
 * Audit export signing-key posture — key id, rotation slot, production boot gate.
 *
 * The signed audit export (signedAuditExport.ts) is what an inspector receives
 * and re-verifies. Until P1-19b (DP-11 in docs/security/SECURITY_AUDIT_2026-09-24.md)
 * its HMAC key was whatever `AUDIT_EXPORT_SIGNING_KEY || JWT_SECRET_PROD ||
 * JWT_SECRET` resolved to at the moment of signing or verifying, with no key id
 * in the manifest and no boot gate. Three consequences:
 *
 *   1. A manifest could not say which key sealed it, so the verifier tried the
 *      key configured NOW. Rotating the key made every earlier export fail
 *      verification, which is the wrong incentive for a key that must rotate.
 *   2. A deployment that never provisioned AUDIT_EXPORT_SIGNING_KEY (Terraform
 *      wires only AUDIT_HMAC_KEY / AUDIT_HMAC_SECRET) signed every export under
 *      the JWT secret — the session-token key, reused across a trust boundary —
 *      and the manifest looked identical to one signed under a dedicated key.
 *   3. Nothing at boot required the dedicated key, so (2) was silent.
 *
 * This module is the one place the export key is read, in the shape the repo
 * already uses for the same problem:
 *
 *   - Key id and `_PREV` slot: server/services/tenant-export/attestation-report.service.ts
 *     (AUDIT_ATTESTATION_KEY_ID default 'k1', _PREV / _PREV_ID; the verifier picks
 *     current or previous BY ID and never guesses).
 *   - Production boot posture: auditSealPosture.ts (production only, minimum
 *     length, the value never echoed). Unlike the seal key there is NO accept
 *     flag: an export sealed under the JWT secret is not a degraded-but-honest
 *     posture, it is the finding.
 *
 * Environment (the `_ID` / `_PREV` / `_PREV_ID` names mirror the attestation key):
 *   AUDIT_EXPORT_SIGNING_KEY          the dedicated key (>= 32 chars; != JWT secret)
 *   AUDIT_EXPORT_SIGNING_KEY_ID       its id, stamped into every manifest ('k1' when unset)
 *   AUDIT_EXPORT_SIGNING_KEY_PREV     the rotated-out key, kept so its exports still verify
 *   AUDIT_EXPORT_SIGNING_KEY_PREV_ID  its id (both or neither; distinct from the current id)
 *
 * Outside production the JWT-secret fallback stays, because dev / CI set only
 * JWT_SECRET — but the manifest then carries the key id 'jwt-secret-fallback',
 * so an inspector (and a test) can see which exports were sealed that way.
 *
 * Manifests issued BEFORE this change carry no key id. They verify through
 * {@link resolveLegacyExportSigningKey}, which is the old chain frozen — the
 * same compatibility rule canonicalizeManifest applies to its version 1.
 *
 * assertAuditExportKeyPostureForProduction is meant to fire on import from
 * server/config/environment.ts beside assertAuditSealPostureForProduction (the
 * same fire-on-import contract). It is also applied by the signing path itself,
 * so that until that one-line call lands no production export is sealed under
 * the fallback: the refusal then happens at the first export instead of at boot,
 * which is later than it should be but never silent.
 */

import { JWT_SECRET_FALLBACK_KEY_ID } from '../../../shared/constants/audit-export-key';

/**
 * Minimum length for the export signing key. 32 matches the JWT / MFA / audit
 * seal floor used across the config layer (auditSealPosture.ts::AUDIT_HMAC_KEY_MIN_LENGTH).
 */
export const AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH = 32;

/** The key id a manifest carries when AUDIT_EXPORT_SIGNING_KEY_ID is unset (attestation-report convention). */
export const DEFAULT_AUDIT_EXPORT_SIGNING_KEY_ID = 'k1';

/**
 * The key id a manifest carries when the export was sealed under the JWT secret
 * because no dedicated key was configured. Only reachable outside production.
 * Declared in shared/ so the client's seal statement reads the same value.
 */
export { JWT_SECRET_FALLBACK_KEY_ID };

export interface ResolvedExportSigningKey {
  /** The HMAC key material. */
  key: string;
  /** The id stamped into (or read from) the manifest. */
  keyId: string;
  /** Which slot answered. */
  source: 'current' | 'previous' | 'jwt-secret-fallback';
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

/** A variable's value, with an empty or whitespace-only value treated as absent (the posture convention). */
function readNonEmpty(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return raw;
}

/** The JWT secret as the old export chain saw it: JWT_SECRET_PROD ahead of JWT_SECRET. */
function jwtSecretFallback(env: NodeJS.ProcessEnv): string | undefined {
  return readNonEmpty(env, 'JWT_SECRET_PROD') ?? readNonEmpty(env, 'JWT_SECRET');
}

/** Every JWT secret value a key must differ from. */
function jwtSecrets(env: NodeJS.ProcessEnv): string[] {
  return [readNonEmpty(env, 'JWT_SECRET'), readNonEmpty(env, 'JWT_SECRET_PROD')].filter(
    (v): v is string => v !== undefined,
  );
}

/** The id of the current key: AUDIT_EXPORT_SIGNING_KEY_ID, trimmed, 'k1' when unset. */
function currentKeyId(env: NodeJS.ProcessEnv): string {
  return readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY_ID')?.trim() || DEFAULT_AUDIT_EXPORT_SIGNING_KEY_ID;
}

/** The ids a verifier can answer for, for the refusal that names them. `current` is null with no dedicated key. */
export function configuredExportKeyIds(env: NodeJS.ProcessEnv = process.env): {
  current: string | null;
  previous: string | null;
} {
  const current = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY') ? currentKeyId(env) : null;
  const previous =
    readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY_PREV') && readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY_PREV_ID')
      ? readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY_PREV_ID')!.trim()
      : null;
  return { current, previous };
}

/**
 * Production boot gate for the export signing key.
 *
 * Non-production is a no-op (dev / CI sign under the JWT-secret fallback, marked
 * as such in the manifest). In production:
 *   - AUDIT_EXPORT_SIGNING_KEY absent or blank        → REFUSES TO BOOT
 *   - shorter than AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH → REFUSES TO BOOT
 *   - equal to JWT_SECRET or JWT_SECRET_PROD           → REFUSES TO BOOT
 *   - a _PREV slot that is half set, weak, the JWT secret, the current key, or
 *     under the current id                            → REFUSES TO BOOT
 * There is no accept flag. The value is never echoed; log lines fan out widely.
 *
 * @returns the active key id (what new manifests will carry).
 */
export function assertAuditExportKeyPostureForProduction(env: NodeJS.ProcessEnv = process.env): string {
  const keyId = currentKeyId(env);
  if (!isProduction(env)) return keyId;

  const key = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY');
  if (key === undefined) {
    throw new Error(
      '[audit-export-key-posture] REFUSING TO BOOT: AUDIT_EXPORT_SIGNING_KEY is not configured in ' +
        'production. It signs the audit exports an inspector re-verifies (21 CFR Part 11 §11.10(e)); ' +
        'without it the export would be sealed under the JWT secret, the session-token key. Set it to a ' +
        'high-entropy secret held outside the database (KMS / secrets manager), with ' +
        'AUDIT_EXPORT_SIGNING_KEY_ID naming it. There is no accept flag for this posture.',
    );
  }
  if (key.length < AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH) {
    throw new Error(
      `[audit-export-key-posture] REFUSING TO BOOT: AUDIT_EXPORT_SIGNING_KEY is too short ` +
        `(${key.length} characters). Minimum is ${AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH}. ` +
        `Use a cryptographically random value so an export signature cannot be brute-forced.`,
    );
  }
  const jwt = jwtSecrets(env);
  if (jwt.includes(key)) {
    throw new Error(
      '[audit-export-key-posture] REFUSING TO BOOT: AUDIT_EXPORT_SIGNING_KEY must differ from the JWT secret. ' +
        'Reusing the session-token key to seal inspector-facing exports means one disclosure forges both; ' +
        'provision a distinct AUDIT_EXPORT_SIGNING_KEY.',
    );
  }

  const prev = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY_PREV');
  const prevId = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY_PREV_ID')?.trim();
  if (prev !== undefined || prevId !== undefined) {
    if (prev === undefined || prevId === undefined) {
      throw new Error(
        '[audit-export-key-posture] REFUSING TO BOOT: AUDIT_EXPORT_SIGNING_KEY_PREV and ' +
          'AUDIT_EXPORT_SIGNING_KEY_PREV_ID are set together or not at all; a previous key without its id ' +
          'can vouch for no manifest, and an id without its key names one that cannot be checked.',
      );
    }
    if (prev.length < AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH) {
      throw new Error(
        `[audit-export-key-posture] REFUSING TO BOOT: AUDIT_EXPORT_SIGNING_KEY_PREV is too short ` +
          `(${prev.length} characters). Minimum is ${AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH}; a weak previous key ` +
          `is a forgery path for every export it still vouches for.`,
      );
    }
    if (jwt.includes(prev)) {
      throw new Error(
        '[audit-export-key-posture] REFUSING TO BOOT: AUDIT_EXPORT_SIGNING_KEY_PREV must differ from the JWT ' +
          'secret; exports it vouches for would be forgeable by anyone holding the session-token key.',
      );
    }
    if (prev === key) {
      throw new Error(
        '[audit-export-key-posture] REFUSING TO BOOT: AUDIT_EXPORT_SIGNING_KEY_PREV equals ' +
          'AUDIT_EXPORT_SIGNING_KEY — a rotation that kept the key. Clear the _PREV pair or rotate.',
      );
    }
    if (prevId === keyId) {
      throw new Error(
        `[audit-export-key-posture] REFUSING TO BOOT: AUDIT_EXPORT_SIGNING_KEY_PREV_ID is the same id as the ` +
          `current key ('${keyId}'); a manifest naming it could not say which key sealed it.`,
      );
    }
  }
  return keyId;
}

/** The key for a NEW export: the dedicated key, or, outside production only, the marked JWT-secret fallback. */
function keyForNewExport(env: NodeJS.ProcessEnv): ResolvedExportSigningKey {
  // In production this is the boot posture applied again at the point of use
  // (see the header): no fallback, no weak or reused key, whether or not the
  // boot call has landed.
  assertAuditExportKeyPostureForProduction(env);
  const key = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY');
  if (key !== undefined) return { key, keyId: currentKeyId(env), source: 'current' };
  const fallback = jwtSecretFallback(env);
  if (fallback !== undefined) return { key: fallback, keyId: JWT_SECRET_FALLBACK_KEY_ID, source: 'jwt-secret-fallback' };
  throw noKeyConfigured();
}

/** The refusal the old chain raised when none of its three variables was set — same sentence. */
function noKeyConfigured(): Error {
  return new Error(
    'No signing key configured. Set AUDIT_EXPORT_SIGNING_KEY, JWT_SECRET_PROD, or JWT_SECRET. ' +
      'Refusing to sign with a default key per 21 CFR Part 11 §11.10(e).',
  );
}

/** The key a manifest NAMES, by id: current, previous, or the fallback; null when nothing is configured under that id. */
function keyForId(keyId: string, env: NodeJS.ProcessEnv): ResolvedExportSigningKey | null {
  const current = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY');
  if (current !== undefined && keyId === currentKeyId(env)) return { key: current, keyId, source: 'current' };

  const prev = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY_PREV');
  const prevId = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY_PREV_ID')?.trim();
  if (prev !== undefined && prevId !== undefined && keyId === prevId) return { key: prev, keyId, source: 'previous' };

  if (keyId === JWT_SECRET_FALLBACK_KEY_ID) {
    const fallback = jwtSecretFallback(env);
    if (fallback !== undefined) return { key: fallback, keyId, source: 'jwt-secret-fallback' };
  }
  return null;
}

/**
 * Resolve the export signing key.
 *
 * - With no `keyId`: the key for a NEW export (throws rather than fall back in
 *   production; throws when no key of any kind is configured).
 * - With a `keyId`: the key a manifest names, or `null` when nothing is
 *   configured under that id. The verifier must then refuse, not try another.
 */
export function resolveExportSigningKey<K extends string | undefined = undefined>(
  keyId?: K,
  env: NodeJS.ProcessEnv = process.env,
): K extends string ? ResolvedExportSigningKey | null : ResolvedExportSigningKey {
  // One declaration rather than two overloads (the repo lints overload pairs
  // as `no-redeclare`); the conditional type carries the same contract.
  type Result = K extends string ? ResolvedExportSigningKey | null : ResolvedExportSigningKey;
  return (keyId === undefined ? keyForNewExport(env) : keyForId(keyId, env)) as Result;
}

/**
 * The resolution every export issued BEFORE the key id was signed and verified
 * under: AUDIT_EXPORT_SIGNING_KEY, else JWT_SECRET_PROD, else JWT_SECRET. Kept,
 * frozen, for manifests that carry no `signingKeyId` — changing it would not
 * fix their signatures, it would make them unverifiable. Never call it on a
 * write path.
 */
export function resolveLegacyExportSigningKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = readNonEmpty(env, 'AUDIT_EXPORT_SIGNING_KEY') ?? jwtSecretFallback(env);
  if (key === undefined) throw noKeyConfigured();
  return key;
}
