/**
 * P1-19b (DP-11) — the signed audit export names the key that signed it.
 *
 * Before this change the manifest carried no key id: `getSigningKey()` picked
 * AUDIT_EXPORT_SIGNING_KEY, else JWT_SECRET_PROD, else JWT_SECRET, and the
 * verifier recomputed with whatever that chain resolved to *now*. So an export
 * could not say which key sealed it, a rotation made every earlier export
 * unverifiable, and an export signed under the JWT secret looked exactly like
 * one signed under a dedicated key.
 *
 * Two things must hold at once, as with the v1/v2 canonicalization: a new
 * manifest names its key and verifies after rotation through the _PREV slot;
 * and a manifest issued before this change — no key id — verifies exactly as
 * it always did. Cases marked "legacy" are regression guards for the second.
 *
 * `generateSignedAuditExport(pool, …)` takes its pool as a parameter, so a pool
 * double that answers the way a database would is injected; nothing at the
 * service boundary is mocked. The key material is process.env, read at call
 * time, so each case sets and restores the variables it depends on.
 */
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stableStringify } from '../../../../shared/canonical-json';
import {
  canonicalizeManifest,
  generateSignedAuditExport,
  verifySignedAuditExport,
  type ExportManifest,
} from '../signedAuditExport';

const KEY_A = 'a'.repeat(40);
const KEY_B = 'b'.repeat(40);
const KEY_C = 'c'.repeat(40);
const ENV_KEYS = [
  'NODE_ENV',
  'AUDIT_EXPORT_SIGNING_KEY',
  'AUDIT_EXPORT_SIGNING_KEY_ID',
  'AUDIT_EXPORT_SIGNING_KEY_PREV',
  'AUDIT_EXPORT_SIGNING_KEY_PREV_ID',
  'JWT_SECRET',
  'JWT_SECRET_PROD',
] as const;

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-min-32-chars-long';
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const isRecordInsert = (sql: string) => /INSERT INTO audit_events/i.test(sql);

/** A pool whose SELECTs answer empty and whose export INSERT returns a row id. */
function pool() {
  const calls: string[] = [];
  return {
    calls,
    query: (sql: string) => {
      calls.push(sql);
      if (isRecordInsert(sql)) return Promise.resolve({ rows: [{ id: 9 }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

const request = { organizationId: 7, format: 'json' as const, exportedBy: 'probe', exportedByRole: 'admin' };
const exportOnce = () => generateSignedAuditExport(pool() as never, request);
const hmac = (key: string, data: string) => crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');

/** A manifest shaped like the ones issued before this change: no signingKeyId. */
function legacyManifest(over: Partial<ExportManifest> = {}): ExportManifest {
  return {
    exportId: 'AUDIT-EXPORT-1-aa',
    exportedAt: '2026-08-14T00:00:00.000Z',
    exportedBy: 'u1',
    exportedByRole: 'admin',
    exportSource: 'Concept2Cure / Concept2Cure Platform',
    queryFilters: { organizationId: 7 },
    format: 'json',
    rowCount: 0,
    truncated: false,
    dataHash: crypto.createHash('sha256').update('[]', 'utf8').digest('hex'),
    hashAlgorithm: 'SHA-256',
    manifestVersion: 2,
    chainIntegrity: { status: 'unverified', totalEntries: 0, brokenLinks: 0, verifiedAt: '2026-08-14T00:00:00.000Z', reason: 'no entries' },
    compliance: { standard: '21 CFR Part 11', section: '§11.10(e)', description: 'Tamper-evident audit trail export' },
    ...over,
  };
}

describe('a new export names its signing key', () => {
  it("carries signingKeyId — AUDIT_EXPORT_SIGNING_KEY_ID, 'k1' when unset", async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_A;
    const byDefault = await exportOnce();
    expect(byDefault.manifest.signingKeyId).toBe('k1');

    process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k7';
    const named = await exportOnce();
    expect(named.manifest.signingKeyId).toBe('k7');
    const verdict = verifySignedAuditExport(named.data, named.manifest, named.signature);
    expect(verdict.valid).toBe(true);
    expect(verdict.signingKeyId).toBe('k7');
  });

  it('puts the key id under the signature: changing it invalidates the manifest', async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_A;
    const out = await exportOnce();
    const forged = { ...out.manifest, signingKeyId: 'k0' };
    expect(canonicalizeManifest(forged)).toContain('"signingKeyId":"k0"');
    expect(verifySignedAuditExport(out.data, forged, out.signature).valid).toBe(false);
  });
});

describe('rotation', () => {
  it('an export signed before the rotation verifies through the _PREV slot, and the verdict names that key', async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_A;
    process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k1';
    const before = await exportOnce();

    // The operator rotates: a fresh key under a new id, the old pair kept in _PREV.
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_B;
    process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k2';
    process.env.AUDIT_EXPORT_SIGNING_KEY_PREV = KEY_A;
    process.env.AUDIT_EXPORT_SIGNING_KEY_PREV_ID = 'k1';

    const old = verifySignedAuditExport(before.data, before.manifest, before.signature);
    expect(old.valid).toBe(true);
    expect(old.signingKeyId).toBe('k1');

    const after = await exportOnce();
    expect(after.manifest.signingKeyId).toBe('k2');
    expect(verifySignedAuditExport(after.data, after.manifest, after.signature).valid).toBe(true);
  });

  it('a wrong key fails', async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_A;
    const out = await exportOnce();
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_C; // same id, different material
    const verdict = verifySignedAuditExport(out.data, out.manifest, out.signature);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.join(' ')).toMatch(/signature invalid/i);
  });

  it('a manifest naming a key that is no longer configured is refused, and the refusal names the id', async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_A;
    process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k1';
    const out = await exportOnce();
    // Rotated without keeping the old pair: the old export cannot be vouched for
    // by *this* key, and the verifier must say so rather than try the new one.
    process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k2';
    const verdict = verifySignedAuditExport(out.data, out.manifest, out.signature);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.join(' ')).toContain("'k1'");
  });
});

describe('legacy: manifests issued before the key id still verify', () => {
  it('a v2 manifest with no signingKeyId verifies under AUDIT_EXPORT_SIGNING_KEY, as before', () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_A;
    const manifest = legacyManifest();
    expect(manifest.signingKeyId).toBeUndefined();
    const signature = hmac(KEY_A, stableStringify(manifest));
    expect(verifySignedAuditExport('[]', manifest, signature).valid).toBe(true);
  });

  it('a v1 manifest signed under the JWT secret alone verifies, as before', () => {
    // No dedicated key was ever set on that deployment; the chain fell through to JWT_SECRET.
    const manifest = legacyManifest({ manifestVersion: undefined });
    const signature = hmac(process.env.JWT_SECRET!, JSON.stringify(manifest, Object.keys(manifest).sort()));
    expect(verifySignedAuditExport('[]', manifest, signature).valid).toBe(true);
  });

  it('a legacy manifest signed under the JWT secret does not verify once a dedicated key is set — the chain is unchanged', () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_A;
    const manifest = legacyManifest();
    const signature = hmac(process.env.JWT_SECRET!, stableStringify(manifest));
    expect(verifySignedAuditExport('[]', manifest, signature).valid).toBe(false);
  });
});

describe('the JWT_SECRET fallback', () => {
  it('is visible in the manifest outside production, and verifies by that name', async () => {
    // No AUDIT_EXPORT_SIGNING_KEY; JWT_SECRET set by the test setup.
    const out = await exportOnce();
    expect(out.manifest.signingKeyId).toBe('jwt-secret-fallback');
    const verdict = verifySignedAuditExport(out.data, out.manifest, out.signature);
    expect(verdict.valid).toBe(true);
    expect(verdict.signingKeyId).toBe('jwt-secret-fallback');
  });

  it('is refused in production before the export is recorded', async () => {
    process.env.NODE_ENV = 'production';
    const p = pool();
    await expect(generateSignedAuditExport(p as never, request)).rejects.toThrow(/AUDIT_EXPORT_SIGNING_KEY/);
    expect(p.calls.some(isRecordInsert)).toBe(false);
  });
});

describe('the comparison', () => {
  it('refuses a signature of the wrong length or shape without throwing', async () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = KEY_A;
    const out = await exportOnce();
    expect(verifySignedAuditExport(out.data, out.manifest, 'abc').valid).toBe(false);
    expect(verifySignedAuditExport(out.data, out.manifest, `${out.signature}00`).valid).toBe(false);
    expect(verifySignedAuditExport(out.data, out.manifest, 42 as unknown as string).valid).toBe(false);
  });
});
