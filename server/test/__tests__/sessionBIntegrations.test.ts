import { describe, expect, it } from 'vitest';
import { shouldUseGrobid } from '../../services/literature/grobidLiteratureService';
import { OpenSearchAdapter } from '../../services/search/opensearchAdapter';

describe('Session B integration guards', () => {
  it('selects grobid for scholarly pdf-like content', () => {
    expect(
      shouldUseGrobid({
        filename: 'paper.pdf',
        mimeType: 'application/pdf',
        text: 'Abstract\nThis study...\nReferences\nPMID: 1234567',
      })
    ).toBe(true);
  });

  it('returns no-op when OpenSearch is disabled', async () => {
    const adapter = new OpenSearchAdapter();
    const result = await adapter.indexDocument({
      id: 'doc1',
      organizationId: 1,
      docType: 'document',
      title: 'Doc',
      text: 'Example',
      source: 'test',
    });

    expect(result.indexed).toBe(false);
  });
});
