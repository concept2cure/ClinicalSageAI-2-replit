/**
 * Versioned digests.
 *
 * The property under test is not "the helper works" — it is that a record
 * sealed before the serializer changed still verifies afterwards. Every case
 * here is one of the ways that guarantee can be lost, and each has a matching
 * rule in the module's docstring.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import {
  CANON_VERSION_CURRENT,
  canonicalAsSealed,
  readCanonVersion,
  sealCanonical,
  verifyAsSealed,
} from '../versioned-digest';

/** A stand-in for a module's frozen v1 serializer — defects and all. */
const legacy = (v: unknown) => JSON.stringify(v, Object.keys(v as object).sort());
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('readCanonVersion — absence means old, never current', () => {
  it('treats a missing marker as version 1', () => {
    // Defaulting to the current version would declare every historical record
    // sealed by a serializer that did not exist when it was written.
    expect(readCanonVersion(undefined)).toBe(1);
    expect(readCanonVersion(null)).toBe(1);
  });

  it('accepts the marker in either the number or string form a column may hold', () => {
    expect(readCanonVersion(2)).toBe(2);
    expect(readCanonVersion('2')).toBe(2);
  });

  it('treats anything unrecognized as version 1 rather than guessing forward', () => {
    expect(readCanonVersion(99)).toBe(1);
    expect(readCanonVersion('latest')).toBe(1);
    expect(readCanonVersion({})).toBe(1);
  });
});

describe('sealing and verifying across the boundary', () => {
  const body = { b: 1, nested: { y: 2, x: 1 }, a: null };

  it('seals at the current version', () => {
    const sealed = sealCanonical(body);
    expect(sealed.canonVersion).toBe(CANON_VERSION_CURRENT);
    expect(JSON.parse(sealed.canonical)).toEqual(body);
  });

  it('verifies a record sealed BEFORE the serializer changed', () => {
    // The whole point. This digest was taken with the legacy serializer and
    // stored without a marker; it must still verify.
    const storedDigest = sha256(legacy(body));
    expect(
      verifyAsSealed({ value: body, storedVersion: undefined, storedDigest, legacy, digestOf: sha256 }),
    ).toBe(true);
  });

  it('verifies a record sealed AFTER, with the shared serializer', () => {
    const sealed = sealCanonical(body);
    expect(
      verifyAsSealed({
        value: body,
        storedVersion: sealed.canonVersion,
        storedDigest: sha256(sealed.canonical),
        legacy,
        digestOf: sha256,
      }),
    ).toBe(true);
  });

  it('would fail a v1 record if the version were ignored — which is why it is stored', () => {
    // Same content, digest taken the legacy way, verified as if it were v2.
    const storedDigest = sha256(legacy(body));
    expect(
      verifyAsSealed({ value: body, storedVersion: 2, storedDigest, legacy, digestOf: sha256 }),
    ).toBe(false);
  });

  it('still detects tampering under either version', () => {
    const tampered = { ...body, b: 999 };
    for (const version of [undefined, 2]) {
      const canonical = canonicalAsSealed(body, version, legacy);
      expect(
        verifyAsSealed({
          value: tampered,
          storedVersion: version,
          storedDigest: sha256(canonical),
          legacy,
          digestOf: sha256,
        }),
      ).toBe(false);
    }
  });

  it('routes per record, so old and new coexist in one table', () => {
    const oldRow = { body, version: undefined, digest: sha256(legacy(body)) };
    const sealed = sealCanonical(body);
    const newRow = { body, version: sealed.canonVersion, digest: sha256(sealed.canonical) };
    for (const row of [oldRow, newRow]) {
      expect(
        verifyAsSealed({
          value: row.body,
          storedVersion: row.version,
          storedDigest: row.digest,
          legacy,
          digestOf: sha256,
        }),
      ).toBe(true);
    }
    // And the two digests genuinely differ — this is not a no-op wrapper.
    expect(oldRow.digest).not.toBe(newRow.digest);
  });
});

describe('canonicalAsSealed', () => {
  it('is insensitive to key order at v2, at every depth', () => {
    const a = { outer: { y: 1, x: 2 }, z: 3 };
    const b = { z: 3, outer: { x: 2, y: 1 } };
    expect(canonicalAsSealed(a, 2, legacy)).toBe(canonicalAsSealed(b, 2, legacy));
    expect(canonicalAsSealed(a, 2, legacy)).toContain('"x":2');
  });

  it('preserves the legacy defect at v1, which is the whole reason v1 is kept', () => {
    // This stand-in is the replacer-ARRAY form — the L55 defect. It is a key
    // allow-list applied at every depth, so nested content whose key names are
    // not also top-level keys vanishes. Two records differing ONLY in nested
    // content canonicalize identically under v1.
    const intact = { header: 1, detail: { status: 'intact' } };
    const broken = { header: 1, detail: { status: 'broken' } };
    expect(canonicalAsSealed(intact, 1, legacy)).toBe(canonicalAsSealed(broken, 1, legacy));
    expect(canonicalAsSealed(intact, 1, legacy)).toContain('"detail":{}');
    // …and v2 tells them apart, which is what the migration buys.
    expect(canonicalAsSealed(intact, 2, legacy)).not.toBe(canonicalAsSealed(broken, 2, legacy));
  });
});
