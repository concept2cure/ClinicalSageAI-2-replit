/**
 * The integrity check must not claim more than it checked.
 *
 * WHAT IT ACTUALLY DOES. verifyIntegrityChain recomputes SHA-256 over
 * `artifact.content` and each version's `content` — both read from the database
 * — and compares each to the hash stored beside it. That is a genuine check: it
 * catches a stored row whose content was altered without its hash being
 * updated. Nothing here reads source bytes, so it establishes nothing about the
 * document the record came from.
 *
 * WHY THAT NEEDED SAYING OUT LOUD. The audit-report route emits this block under
 * `standard: '21 CFR Part 11 · ICH M8 eCTD v4.0'` and directly above a
 * `sourceLineage` section, and the export route persists that report as a
 * governed artifact an inspector reads. The verify-integrity route returned a
 * bare `verified: true` beside `algorithm: 'SHA-256'`. A reviewer reading
 * "verified, SHA-256" next to a list of source documents concludes those
 * documents were checked. They were not — no path in this file re-derives a
 * hash from an uploaded file, a vault object, or a filed leaf.
 *
 * The check is fine. The claim was broader than the check. These tests pin the
 * scope, and pin that the scope cannot quietly go missing.
 */
import { describe, it, expect } from 'vitest';
import { verifyIntegrityChain } from '../c2c/shared';
import crypto from 'node:crypto';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

describe('verifyIntegrityChain — states what it verified', () => {
  it('never reports that source-document bytes were verified', () => {
    const content = 'Module 2.5 clinical overview.';
    const r = verifyIntegrityChain(
      { content, contentHash: sha(content), version: 1 },
      [],
    );
    // The record is self-consistent...
    expect(r.chainIntact).toBe(true);
    expect(r.currentHashVerified).toBe(true);
    // ...and that is explicitly NOT a statement about the source document.
    expect(r.sourceDocumentBytesVerified).toBe(false);
  });

  it('carries a scope that says what was compared and what was not', () => {
    const content = 'x';
    const r = verifyIntegrityChain(
      { content, contentHash: sha(content), version: 1 },
      [],
    );
    expect(typeof r.scope).toBe('string');
    expect(r.scope.length).toBeGreaterThan(0);
    // The scope has to carry the negative claim, not just the positive one —
    // a scope that only describes what WAS checked reads as completeness.
    expect(r.scope).toMatch(/does not/i);
    expect(r.scope).toMatch(/source/i);
  });

  it('still detects a stored record altered without its hash — the check is real', () => {
    const r = verifyIntegrityChain(
      { content: 'tampered after the fact', contentHash: sha('the original text'), version: 2 },
      [],
    );
    expect(r.chainIntact).toBe(false);
    expect(r.currentHashVerified).toBe(false);
    expect(r.failureReason).toBe('Current artifact hash mismatch');
    // A failed check reports its scope too: the reader needs to know the
    // boundary of a negative result as much as a positive one.
    expect(r.sourceDocumentBytesVerified).toBe(false);
    expect(r.scope).toMatch(/does not/i);
  });

  it('detects a broken version in the chain and names it', () => {
    const good = 'v1 text';
    const r = verifyIntegrityChain(
      { content: good, contentHash: sha(good), version: 2 },
      [
        { version: 1, content: good, contentHash: sha(good), createdAt: null },
        { version: 2, content: 'v2 text', contentHash: sha('something else'), createdAt: null },
      ],
    );
    expect(r.chainIntact).toBe(false);
    expect(r.failureReason).toBe('Version 2 hash mismatch');
    expect(r.versionDetails.find(v => v.version === 1)?.verified).toBe(true);
    expect(r.versionDetails.find(v => v.version === 2)?.verified).toBe(false);
  });
});

describe('the routes that publish this verdict carry its scope', () => {
  const src = () =>
    require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../c2c/artifacts.ts'),
      'utf8',
    ) as string;

  it('no response emits a bare `verified:` from the integrity chain', () => {
    // The field named no subject. `storedRecordSelfConsistent` does.
    expect(src()).not.toMatch(/^\s*verified: verification\.chainIntact,/m);
    expect(src()).toMatch(/storedRecordSelfConsistent: verification\.chainIntact,/);
  });

  it('every verifyIntegrityChain consumer passes the scope through', () => {
    const text = src();
    // Three call sites: the audit report, its export, and verify-integrity.
    const callSites = text.match(/verifyIntegrityChain\(artifact, versions\)/g) ?? [];
    expect(callSites.length).toBe(3);
    // Each response that publishes the verdict must publish the scope with it,
    // otherwise the audit report's adjacency to sourceLineage misleads again.
    const scopePasses = text.match(/scope: verification\.scope,/g) ?? [];
    expect(scopePasses.length).toBe(3);
    const sourceFlags = text.match(/sourceDocumentBytesVerified: verification\.sourceDocumentBytesVerified,/g) ?? [];
    expect(sourceFlags.length).toBe(3);
  });
});
