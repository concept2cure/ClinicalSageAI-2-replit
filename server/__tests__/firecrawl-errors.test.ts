import { firecrawlError } from '../integrations/firecrawl/errors';

describe('firecrawl error taxonomy', () => {
  test('returns standardized error envelope', () => {
    const payload = firecrawlError('quota_exhausted');
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('quota_exhausted');
    expect(typeof payload.error.message).toBe('string');
  });
});
