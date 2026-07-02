/**
 * Tests for the reusable field-level PII/PHI encryption utility.
 *
 * A dedicated PII_ENCRYPTION_KEY is set BEFORE importing the module so the
 * production fail-closed path is not exercised and encrypt/decrypt use a
 * stable, deterministic key across the suite.
 */
import { describe, it, expect } from 'vitest';

// Set the key before the module under test is imported (mirrors how the app
// would provision PII_ENCRYPTION_KEY at boot).
process.env.PII_ENCRYPTION_KEY =
  process.env.PII_ENCRYPTION_KEY || 'test-pii-encryption-key-min-32-chars-长-abcdef';

import {
  encryptField,
  decryptField,
  isEncrypted,
} from '../../server/services/security/field-encryption';

describe('field-encryption', () => {
  describe('round-trip', () => {
    const cases: Array<[string, string]> = [
      ['ascii', 'John Q. Patient'],
      ['diagnosis code', 'E11.65'],
      ['ssn', '123-45-6789'],
      ['unicode', 'Zoë Müller — 日本語 — 🧬 émoji'],
      ['long string', 'x'.repeat(10_000)],
      ['whitespace/newlines', 'line1\nline2\t tab  '],
      ['json blob', JSON.stringify({ age: 47, sex: 'F', race: 'Asian' })],
    ];

    it.each(cases)('encrypt→decrypt is identity for %s', (_label, original) => {
      const encrypted = encryptField(original) as string;
      expect(isEncrypted(encrypted)).toBe(true);
      expect(encrypted).not.toContain(original);
      expect(decryptField(encrypted)).toBe(original);
    });
  });

  describe('random IV / non-determinism', () => {
    it('two encryptions of the same plaintext differ but both decrypt', () => {
      const plaintext = 'MRN-00998877';
      const a = encryptField(plaintext) as string;
      const b = encryptField(plaintext) as string;
      expect(a).not.toBe(b);
      expect(decryptField(a)).toBe(plaintext);
      expect(decryptField(b)).toBe(plaintext);
    });
  });

  describe('serialization format', () => {
    it('produces enc:v1:<iv>:<tag>:<ciphertext> with 5 segments', () => {
      const encrypted = encryptField('1975-03-14') as string;
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(5);
      expect(parts[0]).toBe('enc');
      expect(parts[1]).toBe('v1');
    });
  });

  describe('tamper detection (GCM auth)', () => {
    it('rejects a flipped ciphertext byte', () => {
      const encrypted = encryptField('sensitive-value') as string;
      const parts = encrypted.split(':');
      const data = Buffer.from(parts[4], 'base64');
      data[0] = data[0] ^ 0xff;
      parts[4] = data.toString('base64');
      expect(() => decryptField(parts.join(':'))).toThrow(/decryption failed/i);
    });

    it('rejects a tampered auth tag', () => {
      const encrypted = encryptField('sensitive-value') as string;
      const parts = encrypted.split(':');
      const tag = Buffer.from(parts[3], 'base64');
      tag[0] = tag[0] ^ 0xff;
      parts[3] = tag.toString('base64');
      expect(() => decryptField(parts.join(':'))).toThrow(/decryption failed/i);
    });

    it('rejects a tampered IV', () => {
      const encrypted = encryptField('sensitive-value') as string;
      const parts = encrypted.split(':');
      const iv = Buffer.from(parts[2], 'base64');
      iv[0] = iv[0] ^ 0xff;
      parts[2] = iv.toString('base64');
      expect(() => decryptField(parts.join(':'))).toThrow(/decryption failed/i);
    });

    it('does not leak plaintext in the thrown error', () => {
      const secret = 'super-secret-phi-value';
      const encrypted = encryptField(secret) as string;
      const parts = encrypted.split(':');
      const data = Buffer.from(parts[4], 'base64');
      data[0] = data[0] ^ 0xff;
      parts[4] = data.toString('base64');
      try {
        decryptField(parts.join(':'));
        throw new Error('expected decrypt to throw');
      } catch (err) {
        expect((err as Error).message).not.toContain(secret);
      }
    });
  });

  describe('isEncrypted', () => {
    it('is true for encrypted payloads', () => {
      expect(isEncrypted(encryptField('x') as string)).toBe(true);
      expect(isEncrypted('enc:v1:aaa:bbb:ccc')).toBe(true);
    });

    it('is false for plaintext and non-strings', () => {
      expect(isEncrypted('E11.65')).toBe(false);
      expect(isEncrypted('')).toBe(false);
      expect(isEncrypted('enc:v0:x')).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
      expect(isEncrypted(42)).toBe(false);
    });
  });

  describe('decrypt of a non-encrypted value throws clearly', () => {
    it('throws with a helpful message pointing at isEncrypted', () => {
      expect(() => decryptField('plain diagnosis text')).toThrow(/not an encrypted field payload/i);
    });

    it('throws on a malformed enc payload with too few segments', () => {
      expect(() => decryptField('enc:v1:onlyone')).toThrow(/malformed|segment/i);
    });
  });

  describe('empty / null / undefined handling', () => {
    it('passes empty string through both ways', () => {
      expect(encryptField('')).toBe('');
      expect(decryptField('')).toBe('');
    });

    it('passes null and undefined through unchanged', () => {
      expect(encryptField(null)).toBeNull();
      expect(encryptField(undefined)).toBeUndefined();
      expect(decryptField(null)).toBeNull();
      expect(decryptField(undefined)).toBeUndefined();
    });
  });

  describe('mixed-data migration pattern', () => {
    it('dual-read via isEncrypted round-trips both plaintext and ciphertext', () => {
      const read = (v: string) => (isEncrypted(v) ? (decryptField(v) as string) : v);
      const legacyPlaintext = 'C92.11';
      const migrated = encryptField('C92.11') as string;
      expect(read(legacyPlaintext)).toBe('C92.11');
      expect(read(migrated)).toBe('C92.11');
    });
  });
});
