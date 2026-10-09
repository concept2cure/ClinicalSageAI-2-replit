/**
 * CONCEPT2CURE_SIGNER_MODE — the signer posture, read for real.
 *
 * The variable has been documented since the first .env.example ("dev |
 * hsm_kms | hsm_vault"), exported by AGENTS.md's dev recipe and set by the e2e
 * smoke runner, and until this module NO server code read it. A production
 * deployment could carry CONCEPT2CURE_SIGNER_MODE=dev, or nothing at all, and
 * sign releases exactly as a laptop does. This module gives the variable the
 * same boot contract as RLS_ENFORCE (server/db/rlsEnforcement.ts) and
 * AUDIT_HMAC_KEY (server/services/audit/auditSealPosture.ts): resolved once,
 * refused loudly in production when it is missing or unacceptable, no-op
 * elsewhere.
 *
 * The three modes and what each one means for the release-signature seal
 * (server/services/ectd/sign-payload-seal.ts, the signer seam):
 *
 *   dev   The current behaviour: an HMAC-SHA256 seal keyed by AUDIT_HMAC_KEY
 *         when that key happens to be set, nothing otherwise. REFUSED in
 *         production — a laptop posture is not a Part 11 posture.
 *   hmac  The current sealing, on purpose: AUDIT_HMAC_KEY must be present and
 *         at least AUDIT_HMAC_KEY_MIN_LENGTH long. Allowed in production ONLY
 *         with CONCEPT2CURE_SIGNER_ACCEPT_HMAC=true, because a symmetric seal
 *         is not a signature — whoever holds the key can mint one, so it
 *         proves "the server sealed this", never "this specific key custodian
 *         did", and the accept flag records that the operator knows.
 *   kms   Asymmetric signing with an AWS KMS RSA key (@aws-sdk/client-kms,
 *         server/services/signature/kms-signer.ts). The private key never
 *         leaves the HSM boundary (docs/SOP_KEY_MANAGEMENT.md); the signature
 *         is stored BESIDE the HMAC seal with its algorithm and key id, and is
 *         verifiable by the KMS Verify API or offline with the published
 *         public key. Requires CONCEPT2CURE_SIGNER_KMS_KEY_ID and a region.
 *
 * Canonical literals only. `hsm_kms` and `hsm_vault` — the values the old
 * .env.example listed — are refused by name so a deployment that copied the
 * old example fails at boot with the right instruction instead of silently
 * resolving to something else. `hsm_vault` has no implementation; saying so is
 * the honest answer.
 *
 * Fires on import (bottom of file), the same fire-on-import contract as the
 * other production asserts, so a misconfigured production process dies at boot
 * rather than on the first release signature. The module is imported by the
 * seam itself (sign-payload-seal.ts), which every signing route loads at boot.
 */

import { AUDIT_HMAC_KEY_MIN_LENGTH } from '../audit/auditSealPosture.js';

export type SignerMode = 'dev' | 'hmac' | 'kms';

export const SIGNER_MODES: readonly SignerMode[] = ['dev', 'hmac', 'kms'];

/** Legacy literals from the pre-2026-09-20 .env.example. Refused by name. */
const LEGACY_LITERALS: Record<string, string> = {
  hsm_kms: 'use CONCEPT2CURE_SIGNER_MODE=kms (same meaning; the literal was renamed when the mode was implemented)',
  hsm_vault:
    'there is no HashiCorp Vault signer in this codebase; use kms, or hmac with CONCEPT2CURE_SIGNER_ACCEPT_HMAC=true',
};

/** Env names, in one place, so docs and code cannot drift on spelling. */
export const SIGNER_ENV = {
  MODE: 'CONCEPT2CURE_SIGNER_MODE',
  ACCEPT_HMAC: 'CONCEPT2CURE_SIGNER_ACCEPT_HMAC',
  KMS_KEY_ID: 'CONCEPT2CURE_SIGNER_KMS_KEY_ID',
  KMS_REGION: 'CONCEPT2CURE_SIGNER_KMS_REGION',
  KMS_SIGNING_ALGORITHM: 'CONCEPT2CURE_SIGNER_KMS_SIGNING_ALGORITHM',
  AWS_REGION: 'AWS_REGION',
  AUDIT_HMAC_KEY: 'AUDIT_HMAC_KEY',
} as const;

/** KMS signing algorithms this signer will use. Both are RSA; both hash with SHA-256. */
export const KMS_SIGNING_ALGORITHMS = ['RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PSS_SHA_256'] as const;
export type KmsSigningAlgorithm = (typeof KMS_SIGNING_ALGORITHMS)[number];
export const DEFAULT_KMS_SIGNING_ALGORITHM: KmsSigningAlgorithm = 'RSASSA_PKCS1_V1_5_SHA_256';

/** A configuration decision that cannot improve on retry. */
export class SignerModeConfigurationError extends Error {
  constructor(message: string) {
    super(`[signer-mode] ${message}`);
    this.name = 'SignerModeConfigurationError';
  }
}

export interface SignerPosture {
  mode: SignerMode;
  production: boolean;
  /** hmac + kms: the HMAC seal key is present (the seal is always written beside a KMS signature). */
  hmacSealConfigured: boolean;
  /** hmac in production: the operator explicitly accepted a symmetric seal as the signer. */
  hmacAccepted: boolean;
  /** kms: the configured key id / ARN / alias and region. */
  kms?: { keyId: string; region: string; signingAlgorithm: KmsSigningAlgorithm };
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

function read(env: NodeJS.ProcessEnv, name: string): string {
  const raw = env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * The raw mode literal, or undefined when unset/blank. Throws on an
 * unrecognised literal in EVERY environment — a typo is a misconfiguration
 * wherever it happens, and a dev box that silently ran as `dev` under
 * `CONCEPT2CURE_SIGNER_MODE=kmss` would teach the operator nothing.
 */
export function readSignerMode(env: NodeJS.ProcessEnv = process.env): SignerMode | undefined {
  const raw = read(env, SIGNER_ENV.MODE);
  if (raw === '') return undefined;
  const lower = raw.toLowerCase();
  if ((SIGNER_MODES as readonly string[]).includes(lower)) {
    if (lower !== raw) {
      // Canonical form is required for the same reason RLS_ENFORCE demands
      // `on`: an audit of the deployed environment must be a literal grep.
      throw new SignerModeConfigurationError(
        `${SIGNER_ENV.MODE} is "${raw}"; the canonical literal is "${lower}" (case matters so a grep of the environment is unambiguous).`,
      );
    }
    return lower as SignerMode;
  }
  const legacy = LEGACY_LITERALS[lower];
  if (legacy) {
    throw new SignerModeConfigurationError(
      `${SIGNER_ENV.MODE}="${raw}" is a retired literal: ${legacy}.`,
    );
  }
  throw new SignerModeConfigurationError(
    `${SIGNER_ENV.MODE}="${raw}" is not a signer mode. Valid: ${SIGNER_MODES.join(' | ')}.`,
  );
}

function readKmsConfig(env: NodeJS.ProcessEnv): SignerPosture['kms'] | undefined {
  const keyId = read(env, SIGNER_ENV.KMS_KEY_ID);
  const region = read(env, SIGNER_ENV.KMS_REGION) || read(env, SIGNER_ENV.AWS_REGION);
  const algRaw = read(env, SIGNER_ENV.KMS_SIGNING_ALGORITHM) || DEFAULT_KMS_SIGNING_ALGORITHM;
  if (!(KMS_SIGNING_ALGORITHMS as readonly string[]).includes(algRaw)) {
    throw new SignerModeConfigurationError(
      `${SIGNER_ENV.KMS_SIGNING_ALGORITHM}="${algRaw}" is not supported. Valid: ${KMS_SIGNING_ALGORITHMS.join(' | ')}.`,
    );
  }
  if (!keyId || !region) return undefined;
  return { keyId, region, signingAlgorithm: algRaw as KmsSigningAlgorithm };
}

/**
 * Resolve the signer posture for `env`. Pure: reads the environment, never the
 * network. Throws SignerModeConfigurationError when the posture is unusable;
 * in production every gap throws, outside production only a malformed value
 * does (an unset mode is `dev`, which is what every laptop has always run).
 */
export function resolveSignerPosture(env: NodeJS.ProcessEnv = process.env): SignerPosture {
  const production = isProduction(env);
  const declared = readSignerMode(env);
  const hmacKey = read(env, SIGNER_ENV.AUDIT_HMAC_KEY);
  const base = {
    production,
    hmacSealConfigured: hmacKey.length > 0,
    hmacAccepted: read(env, SIGNER_ENV.ACCEPT_HMAC).toLowerCase() === 'true',
  };

  if (declared === undefined) return resolveUnset(base);
  if (declared === 'dev') return resolveDev(base);
  if (declared === 'hmac') return resolveHmac(base, hmacKey);
  return resolveKms(base, env);
}

type PostureBase = Pick<SignerPosture, 'production' | 'hmacSealConfigured' | 'hmacAccepted'>;

function resolveUnset(base: PostureBase): SignerPosture {
  if (base.production) {
    throw new SignerModeConfigurationError(
      `REFUSING TO BOOT: ${SIGNER_ENV.MODE} is not set in production. ` +
        `Set kms (with ${SIGNER_ENV.KMS_KEY_ID} and ${SIGNER_ENV.KMS_REGION}/${SIGNER_ENV.AWS_REGION}) ` +
        `or hmac with ${SIGNER_ENV.ACCEPT_HMAC}=true to record that a symmetric seal is the accepted signer.`,
    );
  }
  return { mode: 'dev', ...base };
}

function resolveDev(base: PostureBase): SignerPosture {
  if (base.production) {
    throw new SignerModeConfigurationError(
      `REFUSING TO BOOT: ${SIGNER_ENV.MODE}=dev is not permitted in production. ` +
        `A release signature sealed the way a laptop seals it is not 21 CFR Part 11 evidence. Use kms or hmac.`,
    );
  }
  return { mode: 'dev', ...base };
}

function resolveHmac(base: PostureBase, hmacKey: string): SignerPosture {
  if (!base.hmacSealConfigured || hmacKey.length < AUDIT_HMAC_KEY_MIN_LENGTH) {
    // hmac mode IS the seal; without a usable key it signs nothing. This
    // holds in every environment: asking for hmac and getting nothing is a
    // misconfiguration, not a degraded posture.
    throw new SignerModeConfigurationError(
      `${SIGNER_ENV.MODE}=hmac requires ${SIGNER_ENV.AUDIT_HMAC_KEY} of at least ${AUDIT_HMAC_KEY_MIN_LENGTH} characters ` +
        `(present: ${base.hmacSealConfigured ? `${hmacKey.length} characters` : 'no'}).`,
    );
  }
  if (base.production && !base.hmacAccepted) {
    throw new SignerModeConfigurationError(
      `REFUSING TO BOOT: ${SIGNER_ENV.MODE}=hmac in production requires ${SIGNER_ENV.ACCEPT_HMAC}=true. ` +
        `An HMAC seal is symmetric: anyone holding ${SIGNER_ENV.AUDIT_HMAC_KEY} can mint one, so it is server ` +
        `authenticity, not signer non-repudiation. Accept that explicitly, or use kms.`,
    );
  }
  return { mode: 'hmac', ...base };
}

function resolveKms(base: PostureBase, env: NodeJS.ProcessEnv): SignerPosture {
  const kms = readKmsConfig(env);
  if (!kms) {
    throw new SignerModeConfigurationError(
      `${base.production ? 'REFUSING TO BOOT: ' : ''}${SIGNER_ENV.MODE}=kms requires ${SIGNER_ENV.KMS_KEY_ID} ` +
        `(key id, ARN or alias) and a region in ${SIGNER_ENV.KMS_REGION} or ${SIGNER_ENV.AWS_REGION}.`,
    );
  }
  if (base.production && !base.hmacSealConfigured) {
    // The KMS signature is stored BESIDE the HMAC seal, never instead of it:
    // the seal is what every existing verifier (resume, export) still checks
    // first, and the audit-seal posture already demands the key.
    throw new SignerModeConfigurationError(
      `REFUSING TO BOOT: ${SIGNER_ENV.MODE}=kms in production also requires ${SIGNER_ENV.AUDIT_HMAC_KEY}; ` +
        `the KMS signature is written beside the HMAC seal, not in place of it.`,
    );
  }
  return { mode: 'kms', ...base, kms };
}

/**
 * Production boot gate. Non-production returns the resolved posture without
 * refusing anything a laptop could not run; production throws on every gap
 * listed at the top of the file. Same shape as assertRlsEnforcementForProduction.
 */
export function assertSignerModeForProduction(env: NodeJS.ProcessEnv = process.env): SignerPosture {
  return resolveSignerPosture(env);
}

// Fire on import — same contract as the asserts in server/config/environment.ts.
// The seam (sign-payload-seal.ts) imports this module, and every release-signing
// route loads the seam at boot, so a bad production posture dies before it can
// sign anything. There is deliberately NO skip flag: a gate with an escape
// hatch in its own file is documentation (CLAUDE.md Rule 0, "why this is Rule
// 0"). Tests exercise the refusal by calling assertSignerModeForProduction with
// an explicit env object; they never need to import this module under
// NODE_ENV=production.
assertSignerModeForProduction();
