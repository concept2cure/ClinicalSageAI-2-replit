import { sanitizeAskAnaInput } from '../../routes/ask-ana-utils';

describe('sanitizeAskAnaInput', () => {
  it('returns 400 validation failure for empty query', () => {
    const result = sanitizeAskAnaInput({ query: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe('Validation error');
    }
  });

  it('normalizes defaults and truncates long inputs with warnings', () => {
    const longQuery = 'q'.repeat(8050);
    const longDoc = 'd'.repeat(13000);
    const result = sanitizeAskAnaInput({
      query: longQuery,
      documentContent: longDoc,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.query.length).toBe(8000);
      expect(result.value.sanitizedDocumentContent?.length).toBe(12000);
      expect(result.value.audience).toBe('regulatory_lead');
      expect(result.value.responseFormat).toBe('markdown');
      expect(result.value.warnings).toContain('query_truncated_to_8000_chars');
      expect(result.value.warnings).toContain('document_content_truncated_to_12000_chars');
    }
  });

  it('lowercases provided audience and response format', () => {
    const result = sanitizeAskAnaInput({
      query: 'Build an IND plan',
      audience: 'EXECUTIVE',
      responseFormat: 'JSON',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.audience).toBe('executive');
      expect(result.value.responseFormat).toBe('json');
    }
  });
});
