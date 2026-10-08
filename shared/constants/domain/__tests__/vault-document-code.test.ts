/**
 * The document code a file is admitted under is the file name as its uploader
 * named it, extension included (QA-2026-10-08, versions).
 *
 * The Vault upload sent the raw name, and the data room stripped the extension
 * and rewrote its characters, so one file filed from each route got two codes:
 * two parallel documents, and a revised file refused at a code the Vault screen
 * did not show. One rule, in one place, used by both clients.
 */
import { describe, it, expect } from 'vitest';
import { vaultDocumentCodeForFile } from '../vault-document-code';

describe('vaultDocumentCodeForFile', () => {
  it('keeps the extension: the code is the name the file was uploaded under', () => {
    expect(vaultDocumentCodeForFile('Protocol-Stability.pdf', 'document')).toBe('Protocol-Stability.pdf');
  });

  it('keeps a name with spaces as named, rather than rewriting it', () => {
    expect(vaultDocumentCodeForFile('Protocol Stability (final).pdf', 'document')).toBe('Protocol Stability (final).pdf');
  });

  it('keeps the extension, so Protocol.pdf and Protocol.docx are different codes', () => {
    expect(vaultDocumentCodeForFile('Protocol.pdf', 'document')).not.toBe(vaultDocumentCodeForFile('Protocol.docx', 'document'));
  });

  it('falls back only when there is no name at all', () => {
    expect(vaultDocumentCodeForFile('', 'document')).toBe('document');
    expect(vaultDocumentCodeForFile('   ', 'document')).toBe('document');
  });
});
