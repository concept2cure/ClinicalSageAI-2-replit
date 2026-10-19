/** Existing stored digests must remain valid after removing the renderer's import cycle. */
import { describe, expect, it, vi } from 'vitest';
import { computeAuthoringSignatureDigest, sectionsDigest } from '../authoring-content-digests';

vi.mock('../draft-source-references', () => ({ verifySavedDraftSourceReferences: vi.fn() }));
vi.mock('../workflow-import-governance', () => ({ assertWorkflowImportRelease: vi.fn(), verifyWorkflowImportWorkingCopy: vi.fn() }));
import * as exportService from '../authoring-export';

describe('the recorded authoring digest recipes', () => {
  it('preserves the known empty-document SHA-256 value', () => {
    expect(sectionsDigest([])).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('preserves section codes, recorded row order and the existing null-content representation', () => {
    const rows = [{ code: '1.1', content: 'Review text' }, { code: '2.7', content: null }];
    expect(sectionsDigest(rows)).toBe('72405e8e621d52e8a22c52e77d3a43583eb46a3c157da20dbf9c4e883c6eb449');
    expect(sectionsDigest([...rows].reverse())).not.toBe(sectionsDigest(rows));
    expect(sectionsDigest([{ ...rows[0], code: '1.2' }, rows[1]])).not.toBe(sectionsDigest(rows));
  });

  it('retains exact UTF-8 content and line endings without normalization', () => {
    expect(sectionsDigest([{ code: '2.6', content: 'Δόση 5 µg\r\nSecond line' }]))
      .toBe('c874e16f53352a85e5e85f6ae1b4dcc2210a66c725e74e431d345977d06261be');
    expect(sectionsDigest([{ code: '2.6', content: 'Δόση 5 µg\nSecond line' }]))
      .not.toBe('c874e16f53352a85e5e85f6ae1b4dcc2210a66c725e74e431d345977d06261be');
  });

  it('preserves the versioned signature digest with and without covered content', () => {
    const signature = { signerEmail: 'reviewer@example.test', meaning: 'REVIEWER', contentHash: 'a'.repeat(64), coveredContentHash: null };
    expect(computeAuthoringSignatureDigest(signature)).toBe('a64c12bf438e4a359ddf2d8e25a68b6f21caee2a3b9594bc2e3d15261bb09f8b');
    expect(computeAuthoringSignatureDigest({ ...signature, coveredContentHash: 'b'.repeat(64) }))
      .toBe('bf5a860d3d733d029dc09ac9a51a6cccb64b26e68d8241ebe9a85da15e9b78cd');
  });

  it('keeps the export service’s public functions as the canonical helper exports', () => {
    expect(exportService.sectionsDigest).toBe(sectionsDigest);
    expect(exportService.computeAuthoringSignatureDigest).toBe(computeAuthoringSignatureDigest);
  });
});
