/**
 * §11.70 version-binding digest — the content-linking hash both document-signing
 * paths store in electronic_signatures.bound_payload_digest.
 *
 * Locks: deterministic + content-sensitive (a byte change moves the digest);
 * id-only changes also move it; and it FAILS CLOSED on empty/absent content so a
 * signature can never be applied to content that isn't there.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { buildVersionBindingDigest } from '../version-binding';

const base = { documentId: 42, versionId: 7, versionNumber: '0.7', content: '<p>Clinical Overview draft</p>' };

describe('buildVersionBindingDigest', () => {
  it('is a stable, re-derivable sha256 over the canonical version tuple', () => {
    const digest = buildVersionBindingDigest(base);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // An auditor can re-derive it from the stored row (sorted keys).
    const expected = createHash('sha256')
      .update(JSON.stringify({ content: base.content, documentId: 42, versionId: 7, versionNumber: '0.7' }))
      .digest('hex');
    expect(digest).toBe(expected);
    // Deterministic across calls.
    expect(buildVersionBindingDigest(base)).toBe(digest);
  });

  it('changes when the signed content changes (the whole point of §11.70)', () => {
    const original = buildVersionBindingDigest(base);
    const tampered = buildVersionBindingDigest({ ...base, content: '<p>Clinical Overview draft.</p>' });
    expect(tampered).not.toBe(original);
  });

  it('changes when the version identity changes', () => {
    const a = buildVersionBindingDigest(base);
    expect(buildVersionBindingDigest({ ...base, versionId: 8 })).not.toBe(a);
    expect(buildVersionBindingDigest({ ...base, documentId: 43 })).not.toBe(a);
    expect(buildVersionBindingDigest({ ...base, versionNumber: '0.8' })).not.toBe(a);
  });

  it('treats a null versionNumber as null (unversioned) deterministically', () => {
    const a = buildVersionBindingDigest({ ...base, versionNumber: null });
    const b = buildVersionBindingDigest({ ...base, versionNumber: undefined });
    expect(a).toBe(b);
  });

  it('fails closed on empty or absent content — never sign nothing', () => {
    expect(() => buildVersionBindingDigest({ ...base, content: '' })).toThrow(/§11\.70/);
    expect(() => buildVersionBindingDigest({ ...base, content: null })).toThrow(/§11\.70/);
    expect(() => buildVersionBindingDigest({ ...base, content: undefined })).toThrow(/§11\.70/);
  });
});
