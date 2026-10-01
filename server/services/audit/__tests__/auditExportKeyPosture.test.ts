/**
 * P1-19b (DP-11) — the audit export signing key: its id, its rotation slot and
 * the production boot posture.
 *
 * The export key used to be whatever `AUDIT_EXPORT_SIGNING_KEY || JWT_SECRET_PROD
 * || JWT_SECRET` resolved to, with no key id and no boot gate — so a production
 * deployment that never provisioned the dedicated key signed every inspector-
 * facing export under the JWT secret, and nothing said so. This pins the posture
 * that makes that misconfiguration fail fast, in the shape of the audit seal
 * gate (auditSealPosture.ts): production only, no accept flag, the value never
 * echoed.
 */
import { describe, expect, it } from 'vitest';

import {
  AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH,
  DEFAULT_AUDIT_EXPORT_SIGNING_KEY_ID,
  JWT_SECRET_FALLBACK_KEY_ID,
  assertAuditExportKeyPostureForProduction,
  configuredExportKeyIds,
  resolveExportSigningKey,
  resolveLegacyExportSigningKey,
} from '../auditExportKeyPosture';

const GOOD = 'g'.repeat(AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH);
const GOOD_2 = 'h'.repeat(AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH + 4);
const SHORT = 's'.repeat(AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH - 1);
const JWT = 'j'.repeat(AUDIT_EXPORT_SIGNING_KEY_MIN_LENGTH);

/** Build a minimal env with the given overrides. */
const env = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  overrides as NodeJS.ProcessEnv;
const prod = (overrides: Record<string, string | undefined>) =>
  env({ NODE_ENV: 'production', JWT_SECRET: JWT, ...overrides });

describe('assertAuditExportKeyPostureForProduction', () => {
  describe('non-production (no-op)', () => {
    for (const nodeEnv of ['development', 'staging', 'test', undefined]) {
      it(`never throws when NODE_ENV=${nodeEnv ?? 'unset'} and no key is set`, () => {
        expect(assertAuditExportKeyPostureForProduction(env({ NODE_ENV: nodeEnv, JWT_SECRET: JWT })))
          .toBe(DEFAULT_AUDIT_EXPORT_SIGNING_KEY_ID);
      });
    }
  });

  describe('production', () => {
    it('admits a dedicated key of sufficient length that differs from the JWT secret, and names its id', () => {
      expect(assertAuditExportKeyPostureForProduction(prod({ AUDIT_EXPORT_SIGNING_KEY: GOOD }))).toBe('k1');
      expect(
        assertAuditExportKeyPostureForProduction(prod({ AUDIT_EXPORT_SIGNING_KEY: GOOD, AUDIT_EXPORT_SIGNING_KEY_ID: 'k3' })),
      ).toBe('k3');
    });

    it('refuses to boot when the key is missing', () => {
      expect(() => assertAuditExportKeyPostureForProduction(prod({}))).toThrow(/REFUSING TO BOOT.*AUDIT_EXPORT_SIGNING_KEY/s);
    });

    it('refuses to boot when the key is empty or whitespace-only', () => {
      expect(() => assertAuditExportKeyPostureForProduction(prod({ AUDIT_EXPORT_SIGNING_KEY: '   ' })))
        .toThrow(/REFUSING TO BOOT/);
    });

    it('refuses to boot when the key is too short, without echoing it', () => {
      let message = '';
      try {
        assertAuditExportKeyPostureForProduction(prod({ AUDIT_EXPORT_SIGNING_KEY: SHORT }));
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/too short/);
      expect(message).not.toContain(SHORT);
    });

    it('refuses to boot when the key equals JWT_SECRET or JWT_SECRET_PROD', () => {
      expect(() => assertAuditExportKeyPostureForProduction(prod({ AUDIT_EXPORT_SIGNING_KEY: JWT })))
        .toThrow(/must differ from the JWT secret/);
      expect(() =>
        assertAuditExportKeyPostureForProduction(prod({ JWT_SECRET_PROD: GOOD, AUDIT_EXPORT_SIGNING_KEY: GOOD })),
      ).toThrow(/must differ from the JWT secret/);
    });

    it('has no accept flag: the seal key\'s accept flag does not apply here', () => {
      expect(() =>
        assertAuditExportKeyPostureForProduction(prod({ AUDIT_SEAL_ACCEPT_UNSEALED: 'true', AUDIT_EXPORT_ACCEPT_FALLBACK: 'true' })),
      ).toThrow(/REFUSING TO BOOT/);
    });

    it('is case-insensitive on NODE_ENV', () => {
      expect(() => assertAuditExportKeyPostureForProduction(env({ NODE_ENV: 'PRODUCTION', JWT_SECRET: JWT })))
        .toThrow(/REFUSING TO BOOT/);
    });

    describe('the previous-key slot', () => {
      const withPrev = (over: Record<string, string | undefined>) =>
        prod({ AUDIT_EXPORT_SIGNING_KEY: GOOD, AUDIT_EXPORT_SIGNING_KEY_ID: 'k2', ...over });

      it('admits a complete, distinct previous pair', () => {
        expect(
          assertAuditExportKeyPostureForProduction(
            withPrev({ AUDIT_EXPORT_SIGNING_KEY_PREV: GOOD_2, AUDIT_EXPORT_SIGNING_KEY_PREV_ID: 'k1' }),
          ),
        ).toBe('k2');
      });

      it('refuses a previous key without its id, and an id without its key', () => {
        expect(() => assertAuditExportKeyPostureForProduction(withPrev({ AUDIT_EXPORT_SIGNING_KEY_PREV: GOOD_2 })))
          .toThrow(/_PREV_ID/);
        expect(() => assertAuditExportKeyPostureForProduction(withPrev({ AUDIT_EXPORT_SIGNING_KEY_PREV_ID: 'k1' })))
          .toThrow(/_PREV/);
      });

      it('refuses a previous key that is too short, equals the JWT secret, or equals the current key', () => {
        expect(() =>
          assertAuditExportKeyPostureForProduction(
            withPrev({ AUDIT_EXPORT_SIGNING_KEY_PREV: SHORT, AUDIT_EXPORT_SIGNING_KEY_PREV_ID: 'k1' }),
          ),
        ).toThrow(/too short/);
        expect(() =>
          assertAuditExportKeyPostureForProduction(
            withPrev({ AUDIT_EXPORT_SIGNING_KEY_PREV: JWT, AUDIT_EXPORT_SIGNING_KEY_PREV_ID: 'k1' }),
          ),
        ).toThrow(/must differ from the JWT secret/);
        expect(() =>
          assertAuditExportKeyPostureForProduction(
            withPrev({ AUDIT_EXPORT_SIGNING_KEY_PREV: GOOD, AUDIT_EXPORT_SIGNING_KEY_PREV_ID: 'k1' }),
          ),
        ).toThrow(/rotation/);
      });

      it('refuses a previous id equal to the current id', () => {
        expect(() =>
          assertAuditExportKeyPostureForProduction(
            withPrev({ AUDIT_EXPORT_SIGNING_KEY_PREV: GOOD_2, AUDIT_EXPORT_SIGNING_KEY_PREV_ID: 'k2' }),
          ),
        ).toThrow(/same id/);
      });
    });
  });
});

describe('resolveExportSigningKey — the key for a new export (no id asked)', () => {
  it("returns the dedicated key under AUDIT_EXPORT_SIGNING_KEY_ID, 'k1' by default", () => {
    expect(resolveExportSigningKey(undefined, env({ AUDIT_EXPORT_SIGNING_KEY: GOOD })))
      .toEqual({ key: GOOD, keyId: 'k1', source: 'current' });
    expect(resolveExportSigningKey(undefined, env({ AUDIT_EXPORT_SIGNING_KEY: GOOD, AUDIT_EXPORT_SIGNING_KEY_ID: ' k9 ' })).keyId)
      .toBe('k9');
  });

  it('falls back to the JWT secret outside production, and says so in the key id', () => {
    expect(resolveExportSigningKey(undefined, env({ NODE_ENV: 'test', JWT_SECRET: JWT })))
      .toEqual({ key: JWT, keyId: JWT_SECRET_FALLBACK_KEY_ID, source: 'jwt-secret-fallback' });
    expect(resolveExportSigningKey(undefined, env({ NODE_ENV: 'development', JWT_SECRET: JWT, JWT_SECRET_PROD: GOOD })).key)
      .toBe(GOOD); // JWT_SECRET_PROD ahead of JWT_SECRET, as the old chain had it
  });

  it('refuses the fallback in production — the boot posture applies at the point of signing too', () => {
    expect(() => resolveExportSigningKey(undefined, prod({}))).toThrow(/REFUSING TO BOOT/);
    expect(() => resolveExportSigningKey(undefined, prod({ AUDIT_EXPORT_SIGNING_KEY: SHORT }))).toThrow(/too short/);
    expect(resolveExportSigningKey(undefined, prod({ AUDIT_EXPORT_SIGNING_KEY: GOOD })).keyId).toBe('k1');
  });

  it('refuses to sign when no key of any kind is configured', () => {
    expect(() => resolveExportSigningKey(undefined, env({ NODE_ENV: 'test' }))).toThrow(/AUDIT_EXPORT_SIGNING_KEY/);
  });
});

describe('resolveExportSigningKey — the key a manifest names', () => {
  const rotated = env({
    AUDIT_EXPORT_SIGNING_KEY: GOOD,
    AUDIT_EXPORT_SIGNING_KEY_ID: 'k2',
    AUDIT_EXPORT_SIGNING_KEY_PREV: GOOD_2,
    AUDIT_EXPORT_SIGNING_KEY_PREV_ID: 'k1',
    JWT_SECRET: JWT,
  });

  it('resolves the current id, the previous id, and the fallback id', () => {
    expect(resolveExportSigningKey('k2', rotated)).toEqual({ key: GOOD, keyId: 'k2', source: 'current' });
    expect(resolveExportSigningKey('k1', rotated)).toEqual({ key: GOOD_2, keyId: 'k1', source: 'previous' });
    expect(resolveExportSigningKey(JWT_SECRET_FALLBACK_KEY_ID, rotated))
      .toEqual({ key: JWT, keyId: JWT_SECRET_FALLBACK_KEY_ID, source: 'jwt-secret-fallback' });
  });

  it('returns null for an id nothing is configured under — never a guess', () => {
    expect(resolveExportSigningKey('k0', rotated)).toBeNull();
    expect(resolveExportSigningKey('k1', env({ AUDIT_EXPORT_SIGNING_KEY: GOOD, AUDIT_EXPORT_SIGNING_KEY_ID: 'k2' }))).toBeNull();
    expect(resolveExportSigningKey(JWT_SECRET_FALLBACK_KEY_ID, env({ AUDIT_EXPORT_SIGNING_KEY: GOOD }))).toBeNull();
  });

  it('names the configured ids for the verifier\'s refusal', () => {
    expect(configuredExportKeyIds(rotated)).toEqual({ current: 'k2', previous: 'k1' });
    expect(configuredExportKeyIds(env({ AUDIT_EXPORT_SIGNING_KEY: GOOD }))).toEqual({ current: 'k1', previous: null });
    expect(configuredExportKeyIds(env({ JWT_SECRET: JWT }))).toEqual({ current: null, previous: null });
  });
});

describe('resolveLegacyExportSigningKey — the pre-key-id chain, frozen for manifests with no id', () => {
  it('is AUDIT_EXPORT_SIGNING_KEY, else JWT_SECRET_PROD, else JWT_SECRET', () => {
    expect(resolveLegacyExportSigningKey(env({ AUDIT_EXPORT_SIGNING_KEY: GOOD, JWT_SECRET_PROD: GOOD_2, JWT_SECRET: JWT }))).toBe(GOOD);
    expect(resolveLegacyExportSigningKey(env({ JWT_SECRET_PROD: GOOD_2, JWT_SECRET: JWT }))).toBe(GOOD_2);
    expect(resolveLegacyExportSigningKey(env({ JWT_SECRET: JWT }))).toBe(JWT);
  });

  it('throws when none of the three is set, as it always did', () => {
    expect(() => resolveLegacyExportSigningKey(env({}))).toThrow(/No signing key configured/);
  });
});
