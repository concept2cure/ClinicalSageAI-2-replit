/**
 * Audit HMAC-seal posture — production boot gate for the tamper-evident audit.
 *
 * The audit ledger has two integrity layers:
 *   1. A public SHA-256 hash chain (server/services/audit/chain.ts →
 *      audit_logs.sha256_chain). Makes tampering DETECTABLE.
 *   2. A secret-keyed HMAC-SHA256 SEAL over each link
 *      (server/services/audit/audit-hmac-seal.ts → audit_logs.hmac_seal).
 *      Because the hash algorithm is public, an attacker who can rewrite the
 *      whole table could recompute a self-consistent SHA-256 chain; the keyed
 *      seal is what makes forgery infeasible. This is the "record authenticity"
 *      guarantee expected for 21 CFR Part 11 §11.10(e)/§11.70.
 *
 * THE HOLE THIS CLOSES: sealing is opt-in on the presence of AUDIT_HMAC_KEY.
 * chain.ts::computeSeal returns `null` when the key is unset, so audit rows are
 * written with a NULL hmac_seal — i.e. UNSEALED — and the verifier skips them
 * ("integrity unverifiable"; see audit-integrity-service.ts). Nothing at boot
 * required the key, so a production deploy that simply never set AUDIT_HMAC_KEY
 * would SILENTLY run with the tamper-evident guarantee disabled. Every other
 * prod-critical secret (JWT, refresh, MFA, RLS posture) already fails closed at
 * config load; the audit seal key was the one gap. This module closes it.
 *
 * Production boot matrix (non-production is always a no-op):
 *   - AUDIT_HMAC_KEY present, >= AUDIT_HMAC_KEY_MIN_LENGTH  → boots, seals active.
 *   - AUDIT_HMAC_KEY present but too short                  → REFUSES TO BOOT
 *     (a weak key is a misconfiguration, not a decision — mirrors the JWT/MFA
 *     minimum-length gates; the accept-unsealed escape hatch does NOT apply).
 *   - AUDIT_HMAC_KEY absent, AUDIT_SEAL_ACCEPT_UNSEALED=true → boots, but logs a
 *     prominent structured warning naming the accepted risk (deliberate,
 *     operator-owned degraded posture — mirrors RLS_ENFORCE=off/shadow).
 *   - AUDIT_HMAC_KEY absent, no accept flag                 → REFUSES TO BOOT.
 *     Silently-unsealed audit is not an acceptable GA posture; the operator must
 *     either provision the key or explicitly accept running unsealed.
 *
 * Fired on import from server/config/environment.ts (same fire-on-import
 * contract as assertMfaKeyPosture / assertRlsEnforcementForProduction), so a
 * misconfigured production deployment fails fast at boot rather than discovering
 * the problem on the first audit write (or, worse, never — writing unsealed).
 */

import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('audit-seal-posture');

/**
 * Minimum entropy for the audit HMAC key. 32 bytes matches the HS256 / JWT /
 * MFA floor used elsewhere in the config layer — a shorter key weakens the seal
 * a DB-only attacker would need to forge.
 */
export const AUDIT_HMAC_KEY_MIN_LENGTH = 32;

/** Resolved production audit-seal posture. */
export type AuditSealPosture = 'active' | 'unsealed-accepted';

/** True when AUDIT_SEAL_ACCEPT_UNSEALED carries the explicit accept value. */
function acceptsUnsealed(env: NodeJS.ProcessEnv): boolean {
  return (env.AUDIT_SEAL_ACCEPT_UNSEALED ?? '').trim().toLowerCase() === 'true';
}

/**
 * Read the configured audit HMAC key, treating an empty/whitespace-only value
 * as absent (matching audit-hmac-seal.ts::resolveKey, which rejects '' as a
 * usable key). Returns undefined when no usable key is configured.
 */
function readAuditHmacKey(env: NodeJS.ProcessEnv): string | undefined {
  const raw = env.AUDIT_HMAC_KEY;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return raw;
}

/**
 * Production safety assertion for the audit HMAC seal.
 *
 * Non-production is a no-op (dev/test/CI seal opportunistically when a key
 * happens to be set, and skip otherwise — no real records are at risk). In
 * production this enforces the boot matrix documented at the top of the file.
 *
 * @returns the resolved posture ('active' when sealing, 'unsealed-accepted'
 *          when the operator explicitly accepted running without a key).
 */
export function assertAuditSealPostureForProduction(
  env: NodeJS.ProcessEnv = process.env,
): AuditSealPosture {
  const isProduction = (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  if (!isProduction) return 'active';

  const key = readAuditHmacKey(env);

  if (key !== undefined) {
    if (key.length < AUDIT_HMAC_KEY_MIN_LENGTH) {
      // A present-but-weak key is a misconfiguration, not a deliberate choice
      // to run unsealed — fail closed regardless of AUDIT_SEAL_ACCEPT_UNSEALED.
      // Do not echo the value or its source; log messages fan out widely.
      throw new Error(
        `[audit-seal-posture] REFUSING TO BOOT: AUDIT_HMAC_KEY is too short ` +
          `(${key.length} characters). Minimum is ${AUDIT_HMAC_KEY_MIN_LENGTH}. ` +
          `Use a cryptographically random value so the tamper-evident audit seal ` +
          `cannot be brute-forced.`,
      );
    }
    return 'active';
  }

  // No usable key configured.
  const message =
    'AUDIT_HMAC_KEY is not configured in production — the audit ledger is written ' +
    'WITHOUT HMAC seals. The public SHA-256 hash chain still makes tampering ' +
    'detectable, but without the secret-keyed seal a full-table rewrite can forge ' +
    'a self-consistent ledger (21 CFR Part 11 record-authenticity guarantee ' +
    'disabled). Set AUDIT_HMAC_KEY to a high-entropy secret held outside the ' +
    'database (KMS / secrets manager).';

  if (!acceptsUnsealed(env)) {
    throw new Error(
      `[audit-seal-posture] REFUSING TO BOOT: ${message} To boot intentionally ` +
        `without a seal (e.g. before the key is provisioned), set ` +
        `AUDIT_SEAL_ACCEPT_UNSEALED=true to record the accepted risk explicitly.`,
    );
  }

  // Explicit accepted-risk decision: permitted, but the degraded posture must
  // be visible — one prominent structured warning at boot (mirrors the RLS
  // explicit-off path).
  logger.warn(`⚠️  ${message}`, {
    controlledBy: 'AUDIT_HMAC_KEY',
    acceptedVia: 'AUDIT_SEAL_ACCEPT_UNSEALED=true',
    acceptedRisk:
      'audit records are written unsealed; HMAC tamper-evidence is disabled and ' +
      'integrity checks report seals as unverifiable',
    remediation: 'provision AUDIT_HMAC_KEY and clear AUDIT_SEAL_ACCEPT_UNSEALED',
  });
  return 'unsealed-accepted';
}

export default { assertAuditSealPostureForProduction, AUDIT_HMAC_KEY_MIN_LENGTH };
