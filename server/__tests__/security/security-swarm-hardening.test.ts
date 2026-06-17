/**
 * Regression tests for the multi-agent security swarm hardening pass
 * (see docs/SECURITY_SWARM_AUDIT_2026-06-17.md).
 *
 * Covers the two pure, deterministic security guarantees introduced:
 *   1. MFA-bypass guard — non-access JWTs (refresh / MFA challenge / MFA
 *      partial) must never be accepted on the access path.
 *   2. SQL-injection guard — GRDHE array builders validate against an
 *      allow-list / identifier pattern instead of interpolating raw input.
 */
import { describe, it, expect, vi } from 'vitest';

// Set env before any ESM imports that read it (jwtVerify -> environment.ts
// throws if JWT_SECRET < 32 chars; db runtime reads DATABASE_URL at load).
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { nonAccessTokenReason } from '../../middleware/tokenType';
import {
  buildRegionArray,
  buildEncryptionFieldArray,
} from '../../services/grdhe/sql-array-helpers';

describe('MFA-bypass guard: nonAccessTokenReason', () => {
  it('accepts a normal access token (returns null)', () => {
    expect(nonAccessTokenReason({ role: 'user' })).toBeNull();
    expect(nonAccessTokenReason({ type: 'access' })).toBeNull();
  });

  it('rejects an MFA-partial token (mfaPending claim)', () => {
    expect(nonAccessTokenReason({ mfaPending: true })).toBe('mfa_partial_token');
  });

  it('rejects an MFA-partial token (pending_mfa role)', () => {
    expect(nonAccessTokenReason({ role: 'pending_mfa' })).toBe('mfa_pending_role');
  });

  it('rejects a refresh token', () => {
    expect(nonAccessTokenReason({ type: 'refresh' })).toBe('refresh');
  });

  it('rejects an MFA challenge token', () => {
    expect(nonAccessTokenReason({ type: 'mfa_challenge' })).toBe('mfa_challenge');
  });

  it('is case-insensitive on the type claim', () => {
    expect(nonAccessTokenReason({ type: 'REFRESH' })).toBe('refresh');
  });
});

describe('SQLi guard: buildRegionArray', () => {
  it('accepts valid regions without throwing', () => {
    expect(() => buildRegionArray(['US_EAST', 'EU_WEST'])).not.toThrow();
  });

  it('defaults to US_EAST when empty/undefined', () => {
    expect(() => buildRegionArray(undefined)).not.toThrow();
    expect(() => buildRegionArray([])).not.toThrow();
  });

  it('rejects an unknown region', () => {
    expect(() => buildRegionArray(['MARS_NORTH'])).toThrow(/Invalid data region/);
  });

  it('rejects a SQL-injection payload that breaks out of the array literal', () => {
    expect(() =>
      buildRegionArray(["US_EAST'::text],(SELECT pg_sleep(10))--"]),
    ).toThrow(/Invalid data region/);
  });
});

describe('SQLi guard: buildEncryptionFieldArray', () => {
  it('accepts valid snake_case field names', () => {
    expect(() => buildEncryptionFieldArray(['ssn', 'medical_record_number'])).not.toThrow();
  });

  it('defaults to the standard PHI fields when empty/undefined', () => {
    expect(() => buildEncryptionFieldArray(undefined)).not.toThrow();
  });

  it('rejects a field name containing a quote / injection characters', () => {
    expect(() => buildEncryptionFieldArray(["ssn'); DROP TABLE x;--"])).toThrow(
      /Invalid field-level encryption field name/,
    );
  });

  it('rejects an uppercase / non-identifier field name', () => {
    expect(() => buildEncryptionFieldArray(['SSN'])).toThrow(
      /Invalid field-level encryption field name/,
    );
  });
});
