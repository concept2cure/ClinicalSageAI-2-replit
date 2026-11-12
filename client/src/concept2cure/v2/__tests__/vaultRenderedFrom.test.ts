/**
 * The Vault version line says where its file was rendered from (LX-10).
 * 2026-11-12, the document path walked in the running app: the record showed
 * "Review signed in Authoring by …" and nothing of the sealed version, which
 * the filing has recorded since 2026-11-10.
 */
import { describe, expect, it } from 'vitest';
import { renderedFromText } from '../surfaces/VaultVersions';

describe('renderedFromText', () => {
  it('a sealed filing names the sealed version and the start of its hash', () => {
    expect(renderedFromText({ authoringDocumentId: 'a', sealVersion: 'approved', sealContentHash: '1a98777beb8f' + '0'.repeat(52) }))
      .toBe(' · rendered from the Authoring document’s sealed version “approved” (seal 1a98777beb8f)');
  });

  it('a seal that did not hold is said in words, never as its stored code', () => {
    const text = renderedFromText({ authoringDocumentId: 'a', sealUnverified: 'SOURCE_ALTERED_SINCE_SEAL' });
    expect(text).toBe(' · filed from Authoring; the sealed record was of other text than the text filed');
    expect(renderedFromText({ authoringDocumentId: 'a', sealUnverified: 'SOMETHING_NEW' })).not.toMatch(/SOMETHING_NEW/);
  });

  it('a working draft or an older filing says only that it was filed from Authoring', () => {
    expect(renderedFromText({ authoringDocumentId: 'a' })).toBe(' · filed from Authoring');
  });

  it('a native upload says nothing; an unverified or unread record says so', () => {
    expect(renderedFromText(null)).toBe('');
    expect(renderedFromText(undefined)).toBe('');
    expect(renderedFromText({ notEstablished: 'unverified' })).toMatch(/did not verify/);
    expect(renderedFromText({ notEstablished: 'unread' })).toMatch(/could not be read/);
  });
});
