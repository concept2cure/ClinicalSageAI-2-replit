/**
 * CONCEPT2CURE_SIGNER_MODE — resolved for real, refused in production when it
 * is missing or unacceptable. Every refusal is exercised by calling the assert
 * with an explicit env object; the import-time fire is a no-op under
 * NODE_ENV=test and is not what these tests rely on.
 */
import { describe, it, expect } from 'vitest';
import {
  assertSignerModeForProduction,
  readSignerMode,
  resolveSignerPosture,
  SignerModeConfigurationError,
} from '../signer-mode';

const KEY = 'audit-hmac-key-with-plenty-of-entropy-0123456789abcdef';
const env = (o: Record<string, string | undefined>) => o as unknown as NodeJS.ProcessEnv;
const prod = (o: Record<string, string | undefined>) => env({ NODE_ENV: 'production', ...o });

describe('readSignerMode', () => {
  it('unset/blank → undefined', () => {
    expect(readSignerMode(env({}))).toBeUndefined();
    expect(readSignerMode(env({ CONCEPT2CURE_SIGNER_MODE: '  ' }))).toBeUndefined();
  });
  it('accepts the three canonical literals', () => {
    for (const m of ['dev', 'hmac', 'kms']) expect(readSignerMode(env({ CONCEPT2CURE_SIGNER_MODE: m }))).toBe(m);
  });
  it('refuses a non-canonical case and an unknown literal, in every environment', () => {
    expect(() => readSignerMode(env({ CONCEPT2CURE_SIGNER_MODE: 'KMS' }))).toThrow(SignerModeConfigurationError);
    expect(() => readSignerMode(env({ CONCEPT2CURE_SIGNER_MODE: 'kmss' }))).toThrow(/not a signer mode/);
  });
  it('refuses the retired .env.example literals by name, with the remedy', () => {
    expect(() => readSignerMode(env({ CONCEPT2CURE_SIGNER_MODE: 'hsm_kms' }))).toThrow(/retired literal.*=kms/);
    expect(() => readSignerMode(env({ CONCEPT2CURE_SIGNER_MODE: 'hsm_vault' }))).toThrow(/no HashiCorp Vault signer/);
  });
});

describe('non-production posture', () => {
  it('unset → dev (the behaviour every laptop has always had)', () => {
    expect(resolveSignerPosture(env({ NODE_ENV: 'development' })).mode).toBe('dev');
    expect(assertSignerModeForProduction(env({ NODE_ENV: 'test' })).mode).toBe('dev');
  });
  it('hmac still needs a usable key — asking for hmac and getting nothing is a misconfiguration', () => {
    expect(() => resolveSignerPosture(env({ NODE_ENV: 'development', CONCEPT2CURE_SIGNER_MODE: 'hmac' }))).toThrow(/requires AUDIT_HMAC_KEY/);
    expect(() => resolveSignerPosture(env({ NODE_ENV: 'development', CONCEPT2CURE_SIGNER_MODE: 'hmac', AUDIT_HMAC_KEY: 'short' }))).toThrow(/at least 32/);
    expect(resolveSignerPosture(env({ NODE_ENV: 'development', CONCEPT2CURE_SIGNER_MODE: 'hmac', AUDIT_HMAC_KEY: KEY })).mode).toBe('hmac');
  });
  it('kms needs a key id and a region (either signer-specific or AWS_REGION)', () => {
    expect(() => resolveSignerPosture(env({ NODE_ENV: 'development', CONCEPT2CURE_SIGNER_MODE: 'kms' }))).toThrow(/requires CONCEPT2CURE_SIGNER_KMS_KEY_ID/);
    const p = resolveSignerPosture(env({ NODE_ENV: 'development', CONCEPT2CURE_SIGNER_MODE: 'kms', CONCEPT2CURE_SIGNER_KMS_KEY_ID: 'alias/x', AWS_REGION: 'us-east-1' }));
    expect(p.mode).toBe('kms');
    expect(p.kms).toEqual({ keyId: 'alias/x', region: 'us-east-1', signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' });
  });
  it('an unsupported KMS signing algorithm is refused', () => {
    expect(() => resolveSignerPosture(env({ CONCEPT2CURE_SIGNER_MODE: 'kms', CONCEPT2CURE_SIGNER_KMS_KEY_ID: 'k', AWS_REGION: 'r', CONCEPT2CURE_SIGNER_KMS_SIGNING_ALGORITHM: 'ECDSA_SHA_256' }))).toThrow(/not supported/);
  });
});

describe('production boot refusal (mirrors assertRlsEnforcementForProduction)', () => {
  it('unset → REFUSING TO BOOT', () => {
    expect(() => assertSignerModeForProduction(prod({}))).toThrow(/REFUSING TO BOOT.*not set in production/);
  });
  it('dev → REFUSING TO BOOT', () => {
    expect(() => assertSignerModeForProduction(prod({ CONCEPT2CURE_SIGNER_MODE: 'dev', AUDIT_HMAC_KEY: KEY }))).toThrow(/dev is not permitted in production/);
  });
  it('hmac without the explicit acceptance → REFUSING TO BOOT; with it → boots as hmac', () => {
    expect(() => assertSignerModeForProduction(prod({ CONCEPT2CURE_SIGNER_MODE: 'hmac', AUDIT_HMAC_KEY: KEY }))).toThrow(/CONCEPT2CURE_SIGNER_ACCEPT_HMAC=true/);
    // Only the literal `true` counts.
    expect(() => assertSignerModeForProduction(prod({ CONCEPT2CURE_SIGNER_MODE: 'hmac', AUDIT_HMAC_KEY: KEY, CONCEPT2CURE_SIGNER_ACCEPT_HMAC: '1' }))).toThrow(/ACCEPT_HMAC/);
    const p = assertSignerModeForProduction(prod({ CONCEPT2CURE_SIGNER_MODE: 'hmac', AUDIT_HMAC_KEY: KEY, CONCEPT2CURE_SIGNER_ACCEPT_HMAC: 'true' }));
    expect(p).toMatchObject({ mode: 'hmac', production: true, hmacAccepted: true, hmacSealConfigured: true });
  });
  it('kms without key id / region / seal key → REFUSING TO BOOT; complete → boots as kms', () => {
    expect(() => assertSignerModeForProduction(prod({ CONCEPT2CURE_SIGNER_MODE: 'kms', AUDIT_HMAC_KEY: KEY }))).toThrow(/REFUSING TO BOOT.*KMS_KEY_ID/);
    expect(() => assertSignerModeForProduction(prod({ CONCEPT2CURE_SIGNER_MODE: 'kms', CONCEPT2CURE_SIGNER_KMS_KEY_ID: 'alias/fda-signing-key-2026', CONCEPT2CURE_SIGNER_KMS_REGION: 'us-east-1' }))).toThrow(/also requires AUDIT_HMAC_KEY/);
    const p = assertSignerModeForProduction(prod({ CONCEPT2CURE_SIGNER_MODE: 'kms', CONCEPT2CURE_SIGNER_KMS_KEY_ID: 'alias/fda-signing-key-2026', CONCEPT2CURE_SIGNER_KMS_REGION: 'us-east-1', AUDIT_HMAC_KEY: KEY }));
    expect(p.mode).toBe('kms');
    expect(p.kms?.keyId).toBe('alias/fda-signing-key-2026');
  });
});
