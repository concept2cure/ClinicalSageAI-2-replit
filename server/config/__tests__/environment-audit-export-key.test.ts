/**
 * P1-19b (DP-11): config import applies the audit export key posture, so a
 * production deployment without a dedicated export key refuses at boot rather
 * than at its first export. The posture itself has its own suite
 * (server/services/audit/__tests__/auditExportKeyPosture.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_SECRET = 'a'.repeat(32);

// P1-19b (DP-11): the signed audit export has its own key. Before this, a
// production deployment that never set AUDIT_EXPORT_SIGNING_KEY sealed every
// inspector-facing export under the JWT secret, silently. The posture lives in
// server/services/audit/auditExportKeyPosture.ts and has its own suite; these
// cases pin that config import applies it, so a mis-provisioned deployment
// refuses at boot rather than at its first export.
describe('production audit export key posture (fires on config import)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    // A valid PRODUCTION posture now also requires the AI sensitive-data
    // placement policy to be enforcing. That check fires on config import, so
    // without it every production test here throws
    // "[ai-sensitive-placement] production requires AI_SENSITIVE_DATA_POLICY_MODE=enforce"
    // BEFORE reaching the secret/MFA/RLS/audit assertion it exists to make.
    // Set here so each test exercises its own subject; the placement gate has
    // its own tests.
    process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
    // Production must also name a durable vault store (storage-posture.ts),
    // which has its own tests.
    process.env.STORAGE_PROVIDER = 's3';
    process.env.AWS_S3_BUCKET = 'c2c-vault-test';
    // Production requires at least ONE approval entry, not merely a parseable
    // value — an empty map is exactly the "nobody decided" state the gate
    // exists to refuse. One minimal, well-formed entry is enough here.
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
      anthropic: {
        region: 'us',
        zeroRetentionApproved: true,
        approvedDataClasses: ['pii'],
        approvedIntendedUses: ['drafting'],
      },
    });
    process.env.NODE_ENV = 'production';
    process.env.RLS_ENFORCE = 'on';
    delete process.env.AUDIT_EXPORT_SIGNING_KEY;
    delete process.env.AUDIT_EXPORT_SIGNING_KEY_ID;
    delete process.env.AUDIT_EXPORT_SIGNING_KEY_PREV;
    delete process.env.AUDIT_EXPORT_SIGNING_KEY_PREV_ID;
    // Satisfy every other production gate so these tests isolate the export-key one.
    process.env.JWT_SECRET = VALID_SECRET;
    process.env.JWT_SECRET_PROD = VALID_SECRET;
    process.env.REFRESH_TOKEN_SECRET = 'b'.repeat(40);
    process.env.MFA_ENCRYPTION_KEY = 'm'.repeat(32);
    process.env.AUDIT_HMAC_SECRET = 's'.repeat(32);
    process.env.AUDIT_HMAC_KEY = 'h'.repeat(32);
    process.env.DATABASE_URL = 'postgres://test';
    process.env.DATABASE_URL_DEV = 'postgres://test';
    process.env.DATABASE_URL_PROD = 'postgres://test';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('refuses to load in production without a dedicated export key', async () => {
    await expect(import('../environment')).rejects.toThrow(/AUDIT_EXPORT_SIGNING_KEY/);
  });

  it('refuses to load in production when the export key is the JWT secret', async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = VALID_SECRET;
    await expect(import('../environment')).rejects.toThrow(/AUDIT_EXPORT_SIGNING_KEY/);
  });

  it('refuses to load in production on a short export key, without echoing it', async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = 'short-export-key';
    const err = await import('../environment').then(() => null, (e: Error) => e);
    expect(err?.message).toMatch(/AUDIT_EXPORT_SIGNING_KEY/);
    expect(err?.message).not.toContain('short-export-key');
  });

  it('loads in production with a dedicated export key', async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = 'x'.repeat(32);
    await expect(import('../environment')).resolves.toBeDefined();
  });

  it('does not require an export key in development', async () => {
    process.env.NODE_ENV = 'development';
    await expect(import('../environment')).resolves.toBeDefined();
  });
});
