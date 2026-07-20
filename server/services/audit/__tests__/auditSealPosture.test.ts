/**
 * Pins the production audit HMAC-seal boot posture. The tamper-evident audit
 * seal is opt-in on AUDIT_HMAC_KEY (chain.ts writes a NULL seal when the key is
 * unset), so without a boot gate a production deploy could silently run with an
 * unsealed — and therefore forgeable — audit ledger. This asserts the gate that
 * makes that misconfiguration fail fast, mirroring the JWT/MFA/RLS posture gates.
 */

import { describe, expect, it } from 'vitest';

import {
  assertAuditSealPostureForProduction,
  AUDIT_HMAC_KEY_MIN_LENGTH,
} from '../auditSealPosture';

const VALID_KEY = 'h'.repeat(AUDIT_HMAC_KEY_MIN_LENGTH);
const SHORT_KEY = 'h'.repeat(AUDIT_HMAC_KEY_MIN_LENGTH - 1);

/** Build a minimal env with the given overrides. */
const env = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  overrides as NodeJS.ProcessEnv;

describe('assertAuditSealPostureForProduction', () => {
  describe('non-production (no-op)', () => {
    for (const nodeEnv of ['development', 'staging', 'test', undefined]) {
      it(`returns 'active' and never throws when NODE_ENV=${nodeEnv ?? 'unset'}`, () => {
        // No AUDIT_HMAC_KEY at all — must still be a no-op outside production.
        expect(assertAuditSealPostureForProduction(env({ NODE_ENV: nodeEnv }))).toBe('active');
      });
    }
  });

  describe('production', () => {
    it("returns 'active' with a sufficiently long key", () => {
      expect(
        assertAuditSealPostureForProduction(env({ NODE_ENV: 'production', AUDIT_HMAC_KEY: VALID_KEY })),
      ).toBe('active');
    });

    it('refuses to boot when the key is unset', () => {
      expect(() =>
        assertAuditSealPostureForProduction(env({ NODE_ENV: 'production' })),
      ).toThrow(/REFUSING TO BOOT/);
    });

    it('refuses to boot when the key is empty or whitespace-only', () => {
      expect(() =>
        assertAuditSealPostureForProduction(env({ NODE_ENV: 'production', AUDIT_HMAC_KEY: '   ' })),
      ).toThrow(/REFUSING TO BOOT/);
    });

    it('refuses to boot when the key is too short', () => {
      expect(() =>
        assertAuditSealPostureForProduction(env({ NODE_ENV: 'production', AUDIT_HMAC_KEY: SHORT_KEY })),
      ).toThrow(/too short/);
    });

    it('rejects a too-short key even when unsealed is accepted (weak key is a misconfig)', () => {
      expect(() =>
        assertAuditSealPostureForProduction(
          env({ NODE_ENV: 'production', AUDIT_HMAC_KEY: SHORT_KEY, AUDIT_SEAL_ACCEPT_UNSEALED: 'true' }),
        ),
      ).toThrow(/too short/);
    });

    it("returns 'unsealed-accepted' when the operator explicitly accepts an unsealed ledger", () => {
      expect(
        assertAuditSealPostureForProduction(
          env({ NODE_ENV: 'production', AUDIT_SEAL_ACCEPT_UNSEALED: 'true' }),
        ),
      ).toBe('unsealed-accepted');
    });

    it('treats a non-"true" accept value as no decision and refuses to boot', () => {
      expect(() =>
        assertAuditSealPostureForProduction(
          env({ NODE_ENV: 'production', AUDIT_SEAL_ACCEPT_UNSEALED: '1' }),
        ),
      ).toThrow(/REFUSING TO BOOT/);
    });

    it('does not echo the key value in the too-short error', () => {
      try {
        assertAuditSealPostureForProduction(
          env({ NODE_ENV: 'production', AUDIT_HMAC_KEY: SHORT_KEY }),
        );
        throw new Error('expected throw');
      } catch (e) {
        expect((e as Error).message).not.toContain(SHORT_KEY);
      }
    });

    it('is case-insensitive on NODE_ENV and the accept flag', () => {
      expect(
        assertAuditSealPostureForProduction(
          env({ NODE_ENV: 'PRODUCTION', AUDIT_SEAL_ACCEPT_UNSEALED: 'TRUE' }),
        ),
      ).toBe('unsealed-accepted');
    });
  });
});
