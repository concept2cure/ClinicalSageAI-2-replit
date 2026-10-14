import { describe, expect, it } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { CRITIQUE_DOCUMENT } from '../writingQualityTools';

describe('existing document critique admits exact saved records', () => {
  it('exposes saved-record and versioned continuation inputs on the existing tool', () => {
    expect(CRITIQUE_DOCUMENT.input_schema.properties.document_id).toBeDefined();
    expect(CRITIQUE_DOCUMENT.input_schema.properties.expected_snapshot).toBeDefined();
    expect(CRITIQUE_DOCUMENT.input_schema.required).not.toContain('sections');
  });

  it('refuses saved-document review with no authorized conversation scope', async () => {
    const result = JSON.parse(await getToolHandler('critique_document')!({ document_id: '11111111-2222-4333-8444-000000000041' }));
    expect(result.error).toBeDefined();
    expect(result.documentScore).toBeUndefined();
    expect(result.verdict).toBeUndefined();
  });

  it('refuses a malformed supplied section instead of reviewing the filtered subset', async () => {
    const result = JSON.parse(await getToolHandler('critique_document')!({ sections: [
      { title: 'Methods', text: 'The protocol specified the study procedures.' },
      { title: 'Results', text: 42 },
    ] }));
    expect(result.status).toBe('needs_parameters');
    expect(result.documentScore).toBeUndefined();
  });
});
