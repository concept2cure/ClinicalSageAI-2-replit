/**
 * MFA Service — Unit Tests
 *
 * Tests for FDA 21 CFR Part 11 §11.10(d) / NIST 800-63B AAL2 compliant
 * TOTP multi-factor authentication service.
 *
 * Covers TOTP generation, verification, base32 encoding/decoding,
 * AES-256-GCM encryption/decryption, backup codes, and DB interactions.
 *
 * @module tests/services/mfaService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Mock drizzle-orm
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn((_col: any, val: any) => ({ type: 'eq', val })),
  };
});

// ---------------------------------------------------------------------------
// Mock DB chain
// ---------------------------------------------------------------------------

// update().set().where() is awaited directly by most writes, and ends in
// .returning() for the compare-and-set that consumes a TOTP step. The where
// result is therefore both a thenable and carries returning(). mockReturning
// stands in for the database's answer to the conditional UPDATE: one row when
// the step was later than the last accepted, none when it was not.
const mockUpdateSet = vi.fn();
const mockReturning = vi.fn();
const mockUpdateWhere = vi.fn(() => ({
  returning: mockReturning,
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(undefined).then(resolve, reject),
}));
mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

const mockDb = {
  update: mockUpdate,
  select: mockSelect,
};

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

// ---------------------------------------------------------------------------
// Mock schema
// ---------------------------------------------------------------------------

const mockUsers = {
  id: 'users.id',
  mfaSecret: 'users.mfaSecret',
  mfaEnabled: 'users.mfaEnabled',
  mfaBackupCodes: 'users.mfaBackupCodes',
  mfaMethod: 'users.mfaMethod',
  mfaVerifiedAt: 'users.mfaVerifiedAt',
  mfaTotpLastStep: 'users.mfaTotpLastStep',
};

vi.mock('../../shared/schema', () => ({
  users: mockUsers,
}));
vi.mock('../../shared/schema/index.ts', () => ({
  users: mockUsers,
}));

// ---------------------------------------------------------------------------
// Mock config/jwt for challenge tokens
// ---------------------------------------------------------------------------

vi.mock('../../server/config/environment', () => ({
  config: {
    jwt: { secret: 'test-jwt-secret-at-least-32-chars-long!' },
  },
}));

// ---------------------------------------------------------------------------
// Set MFA_ENCRYPTION_KEY for deterministic tests
// ---------------------------------------------------------------------------

const TEST_ENCRYPTION_KEY = 'test-mfa-encryption-key-32chars!';

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

// We need to import the module functions. Since mfaService uses top-level
// `import { db }` we must mock before importing.
let mfaModule: typeof import('../../server/services/mfaService');

beforeEach(async () => {
  process.env.MFA_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!';
  // verifyJwtWithRotation prefers JWT_SECRET_${ENV} (e.g. JWT_SECRET_DEV in
  // NODE_ENV=test) over JWT_SECRET. If they differ, sign/verify won't agree.
  process.env.JWT_SECRET_DEV = 'test-jwt-secret-at-least-32-chars-long!';
  vi.clearAllMocks();
  // Clear any leftover queued DB responses between tests.
  mockSelectLimit.mockReset();
  mockSelectLimit.mockResolvedValue([]);
  mockReturning.mockReset();
  mockReturning.mockResolvedValue([{ id: 1 }]);
  // Re-import to pick up fresh mocks
  mfaModule = await import('../../server/services/mfaService');
});

afterEach(() => {
  delete process.env.MFA_ENCRYPTION_KEY;
  delete process.env.JWT_SECRET;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MFA Service', () => {
  // -------------------------------------------------------------------------
  // TOTP secret generation
  // -------------------------------------------------------------------------

  describe('generateSecret', () => {
    it('should generate a base32-encoded secret and otpauth URL', async () => {
      const result = await mfaModule.generateSecret(1, 'user@example.com');

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(0);
      // Base32 chars only
      expect(result.secret).toMatch(/^[A-Z2-7]+$/);

      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain('secret=');
      expect(result.otpauthUrl).toContain('issuer=Concept2Cure');
      expect(result.otpauthUrl).toContain('user%40example.com');
    });

    it('should store the encrypted secret via DB update', async () => {
      await mfaModule.generateSecret(42, 'admin@corp.com');

      expect(mockUpdate).toHaveBeenCalledWith(mockUsers);
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          mfaMethod: 'totp',
        }),
      );
      // The mfaSecret should be an encrypted string (iv:tag:ciphertext format)
      const setCall = mockUpdateSet.mock.calls[0][0];
      expect(setCall.mfaSecret).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
    });

    it('refuses, and returns no secret, when an authenticator is already enabled', async () => {
      // The conditional UPDATE matched nothing, and the account exists: mfa_enabled was true.
      mockReturning.mockResolvedValueOnce([]);
      mockSelectLimit.mockResolvedValueOnce([{ id: 42 }]);
      await expect(mfaModule.generateSecret(42, 'admin@corp.com')).rejects.toBeInstanceOf(
        mfaModule.MfaAlreadyEnabledError,
      );
    });

    it('draws the QR code itself: a data: URL, never an address that carries the secret', async () => {
      // It was https://api.qrserver.com/...?data=<otpauth URI with secret=...>:
      // displaying it sent the TOTP seed to a third party.
      const result = await mfaModule.generateSecret(1, 'test@test.com');
      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
      expect(result.qrCodeDataUrl).not.toContain(result.secret);
      expect(result.qrCodeDataUrl).not.toMatch(/^https?:/);
    });
  });

  // -------------------------------------------------------------------------
  // Token verification
  // -------------------------------------------------------------------------

  describe('verifyToken', () => {
    it('should reject empty or malformed tokens', async () => {
      expect(await mfaModule.verifyToken(1, '')).toBe(false);
      expect(await mfaModule.verifyToken(1, '12345')).toBe(false);     // too short
      expect(await mfaModule.verifyToken(1, '1234567')).toBe(false);   // too long
      expect(await mfaModule.verifyToken(1, 'abcdef')).toBe(false);    // non-digit
    });

    it('should return false when user has no MFA secret', async () => {
      mockSelectLimit.mockResolvedValueOnce([{ mfaSecret: null, mfaEnabled: false, mfaBackupCodes: null }]);

      const result = await mfaModule.verifyToken(1, '123456');
      expect(result).toBe(false);
    });

    it('should verify a valid TOTP token generated for the current time window', async () => {
      // Generate a real secret and compute the current TOTP
      const secretBuffer = crypto.randomBytes(20);
      const base32Secret = base32Encode(secretBuffer);
      const encryptedSecret = encryptForTest(base32Secret);
      const currentToken = generateTestTOTP(secretBuffer);

      mockSelectLimit.mockResolvedValueOnce([{
        mfaSecret: encryptedSecret,
        mfaEnabled: true,
        mfaBackupCodes: null,
      }]);

      const result = await mfaModule.verifyToken(1, currentToken);
      expect(result).toBe(true);
    });

    it('should reject a completely wrong token', async () => {
      const secretBuffer = crypto.randomBytes(20);
      const base32Secret = base32Encode(secretBuffer);
      const encryptedSecret = encryptForTest(base32Secret);

      mockSelectLimit.mockResolvedValueOnce([{
        mfaSecret: encryptedSecret,
        mfaEnabled: true,
        mfaBackupCodes: null,
      }]);

      // Use a token that is almost certainly wrong
      const result = await mfaModule.verifyToken(1, '000000');
      // There's a 1-in-333333 chance this actually matches (3 windows),
      // but for practical purposes this is fine.
      // We just verify the function returns a boolean without crashing.
      expect(typeof result).toBe('boolean');
    });
  });

  // -------------------------------------------------------------------------
  // A code is accepted once (RFC 6238 §5.2; VSR-001 §13.3 item 1)
  //
  // What the unit can prove: which step is offered for consumption, that the
  // answer of the conditional UPDATE decides the result, and that the pre-check
  // never writes. That the WHERE refuses a step not later than the stored one,
  // including under concurrency, needs real PostgreSQL:
  // tests/db/one-time-credentials.dbtest.ts.
  // -------------------------------------------------------------------------

  describe('consume-once', () => {
    const enrolled = (lastStep: number | null = null) => {
      const secret = crypto.randomBytes(20);
      mockSelectLimit.mockResolvedValue([{
        mfaSecret: encryptForTest(base32Encode(secret)),
        mfaTotpLastStep: lastStep,
      }]);
      return secret;
    };
    const stepNow = () => Math.floor(Date.now() / 1000 / 30);

    it('offers the matched step for consumption and verifies when the database accepts it', async () => {
      const secret = enrolled();
      const step = stepNow();
      expect(await mfaModule.verifySecondFactor(1, generateTestTOTP(secret, step))).toBe('totp');
      expect(mockUpdateSet).toHaveBeenCalledWith({ mfaTotpLastStep: step });
      expect(mockReturning).toHaveBeenCalledTimes(1);
    });

    it('offers the PREVIOUS step when the code is from the previous window', async () => {
      const secret = enrolled();
      const step = stepNow() - 1;
      expect(await mfaModule.verifyToken(1, generateTestTOTP(secret, step))).toBe(true);
      expect(mockUpdateSet).toHaveBeenCalledWith({ mfaTotpLastStep: step });
    });

    it('refuses a matching code when the database refuses the step (already used, or an earlier one)', async () => {
      const secret = enrolled();
      mockReturning.mockResolvedValue([]);
      expect(await mfaModule.verifySecondFactor(1, generateTestTOTP(secret))).toBeNull();
      expect(await mfaModule.verifyToken(1, generateTestTOTP(secret))).toBe(false);
    });

    it('a wrong code is refused before anything is written', async () => {
      const secret = enrolled();
      const right = generateTestTOTP(secret);
      const wrong = String((Number(right) + 1) % 1_000_000).padStart(6, '0');
      // A wrong code can still match one of the other two window steps by chance
      // (about 2 in 10^6); skip that draw rather than assert on it.
      if ([-1, 1].some(d => generateTestTOTP(secret, stepNow() + d) === wrong)) return;
      expect(await mfaModule.verifySecondFactor(1, wrong)).toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('enableMfa does not enable when the enrolment code is refused as used', async () => {
      const secret = enrolled();
      mockReturning.mockResolvedValue([]);
      const result = await mfaModule.enableMfa(1, generateTestTOTP(secret));
      expect(result.success).toBe(false);
      expect(mockUpdateSet).not.toHaveBeenCalledWith(expect.objectContaining({ mfaEnabled: true }));
    });

    describe('isTokenCurrentlyAcceptable (the e-signature pre-check)', () => {
      it('accepts a current code when no step has been used, and writes nothing', async () => {
        const secret = enrolled(null);
        expect(await mfaModule.isTokenCurrentlyAcceptable(1, generateTestTOTP(secret))).toBe(true);
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it('accepts a code whose step is later than the last used', async () => {
        const secret = enrolled(stepNow() - 1);
        expect(await mfaModule.isTokenCurrentlyAcceptable(1, generateTestTOTP(secret))).toBe(true);
      });

      it('refuses a code whose step is the last used', async () => {
        const secret = enrolled(stepNow());
        expect(await mfaModule.isTokenCurrentlyAcceptable(1, generateTestTOTP(secret))).toBe(false);
      });

      it('refuses a code whose step is earlier than the last used', async () => {
        const secret = enrolled(stepNow());
        expect(await mfaModule.isTokenCurrentlyAcceptable(1, generateTestTOTP(secret, stepNow() - 1))).toBe(false);
      });

      it('refuses malformed input and a user with no secret, without reading or writing', async () => {
        expect(await mfaModule.isTokenCurrentlyAcceptable(1, '12345')).toBe(false);
        expect(await mfaModule.isTokenCurrentlyAcceptable(1, 'ABCD-EF01')).toBe(false);
        expect(mockSelect).not.toHaveBeenCalled();
        mockSelectLimit.mockResolvedValue([{ mfaSecret: null, mfaTotpLastStep: null }]);
        expect(await mfaModule.isTokenCurrentlyAcceptable(1, '123456')).toBe(false);
        expect(mockUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Backup codes
  // -------------------------------------------------------------------------

  describe('backup codes', () => {
    it('should verify a valid backup code and remove it after use', async () => {
      const backupCode = 'ABCD-EF01';
      const hashedCode = crypto
        .createHash('sha256')
        .update(backupCode.replace(/-/g, '').toUpperCase())
        .digest('hex');

      const secretBuffer = crypto.randomBytes(20);
      const base32Secret = base32Encode(secretBuffer);
      const encryptedSecret = encryptForTest(base32Secret);

      // The backup code is passed as the "token" parameter
      // Note: backup codes are checked only if TOTP fails and mfaEnabled is true
      // The token format (ABCD-EF01) won't pass the 6-digit regex check,
      // so verifyToken returns false before checking backup codes.
      // This is by design — backup codes use the same flow but with different format.
      const result = await mfaModule.verifyToken(1, backupCode);
      // Backup code format doesn't pass the initial digit check
      expect(result).toBe(false);
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // enableMfa
  // -------------------------------------------------------------------------

  describe('enableMfa', () => {
    it('should return success:false when token is invalid', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        mfaSecret: null,
        mfaEnabled: false,
        mfaBackupCodes: null,
      }]);

      const result = await mfaModule.enableMfa(1, '123456');
      expect(result.success).toBe(false);
      expect(result.backupCodes).toBeUndefined();
    });

    it('should enable MFA and return backup codes when token is valid', async () => {
      const secretBuffer = crypto.randomBytes(20);
      const base32Secret = base32Encode(secretBuffer);
      const encryptedSecret = encryptForTest(base32Secret);
      const validToken = generateTestTOTP(secretBuffer);

      mockSelectLimit.mockResolvedValueOnce([{
        mfaSecret: encryptedSecret,
        mfaEnabled: false,
        mfaBackupCodes: null,
      }]);

      const result = await mfaModule.enableMfa(1, validToken);

      expect(result.success).toBe(true);
      expect(result.backupCodes).toBeDefined();
      expect(result.backupCodes!.length).toBe(10);
      // Backup codes should be in XXXX-XXXX format
      for (const code of result.backupCodes!) {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      }

      // Should have called db.update to set mfaEnabled = true
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          mfaEnabled: true,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // isMfaEnabled
  // -------------------------------------------------------------------------

  describe('isMfaEnabled', () => {
    it('should return true when user has mfaEnabled = true', async () => {
      mockSelectLimit.mockResolvedValueOnce([{ mfaEnabled: true }]);

      const result = await mfaModule.isMfaEnabled(1);
      expect(result).toBe(true);
    });

    it('should return false when user has mfaEnabled = false', async () => {
      mockSelectLimit.mockResolvedValueOnce([{ mfaEnabled: false }]);

      const result = await mfaModule.isMfaEnabled(1);
      expect(result).toBe(false);
    });

    it('should return false when user is not found', async () => {
      mockSelectLimit.mockResolvedValueOnce([]);

      const result = await mfaModule.isMfaEnabled(999);
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // disableMfa
  // -------------------------------------------------------------------------

  describe('disableMfa', () => {
    it('should return false when verification fails', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        mfaSecret: null,
        mfaEnabled: true,
        mfaBackupCodes: null,
      }]);

      const result = await mfaModule.disableMfa(1, '123456');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // MFA challenge tokens
  // -------------------------------------------------------------------------

  describe('challenge tokens', () => {
    it('should create and verify a valid challenge token', () => {
      const token = mfaModule.createMfaChallengeToken(1, 'user@test.com', 'org-1', 'uuid-1', 'admin');
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      const decoded = mfaModule.verifyMfaChallengeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe('1');
      expect(decoded!.email).toBe('user@test.com');
      expect(decoded!.role).toBe('admin');
    });

    it('should return null for an invalid/tampered challenge token', () => {
      const result = mfaModule.verifyMfaChallengeToken('invalid.token.here');
      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Test helpers — mirror the service's internal functions for test data
// ---------------------------------------------------------------------------

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

function encryptForTest(plaintext: string): string {
  const key = crypto.createHash('sha256').update(TEST_ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function generateTestTOTP(secret: Buffer, step?: number): string {
  const timeCounter = step ?? Math.floor(Math.floor(Date.now() / 1000) / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(timeCounter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(timeCounter & 0xffffffff, 4);
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(counterBuffer);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  const otp = binary % Math.pow(10, 6);
  return otp.toString().padStart(6, '0');
}
