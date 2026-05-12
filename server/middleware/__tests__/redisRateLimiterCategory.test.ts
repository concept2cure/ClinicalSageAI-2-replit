import { describe, it, expect } from 'vitest';
import { getCategory } from '../redisRateLimiter';

describe('redisRateLimiter getCategory — segment-based matching', () => {
  it('routes auth paths to the auth bucket', () => {
    expect(getCategory('/api/auth/login')).toBe('auth');
    expect(getCategory('/api/login')).toBe('auth');
    expect(getCategory('/api/register')).toBe('auth');
    expect(getCategory('/api/v1/auth/refresh')).toBe('auth');
  });

  it('does NOT route paths that merely contain the letters "auth" into the auth bucket', () => {
    // Regression: includes('/auth') would catch these and apply the strict
    // 5-per-15-minute production auth limit to ordinary endpoints.
    expect(getCategory('/api/data/authoritative-record')).toBe('api');
    expect(getCategory('/api/audit/events')).toBe('api');
    expect(getCategory('/api/oauth-clients')).toBe('api');
  });

  it('routes AI paths to the ai bucket but spares unrelated words containing "ai"', () => {
    expect(getCategory('/api/ai/draft')).toBe('ai');
    expect(getCategory('/api/v1/ai/generate')).toBe('ai');
    expect(getCategory('/api/openai/chat')).toBe('ai');
    expect(getCategory('/api/painting/list')).toBe('api');
    expect(getCategory('/api/maintenance/heartbeat')).toBe('api');
  });

  it('routes document/export/pdf segment but spares /api/documentation', () => {
    expect(getCategory('/api/document/123')).toBe('documents');
    expect(getCategory('/api/documents/list')).toBe('documents');
    expect(getCategory('/api/export/xml')).toBe('documents');
    expect(getCategory('/api/pdf/render')).toBe('documents');
    // documentation is its own segment word; not a documents-rate-limited route.
    expect(getCategory('/api/documentation/index')).toBe('api');
  });

  it('routes /api/concept2cure correctly', () => {
    expect(getCategory('/api/concept2cure/projects')).toBe('concept2cure');
  });

  it('routes /api/validate and /api/upload correctly', () => {
    expect(getCategory('/api/validate/submission')).toBe('validation');
    expect(getCategory('/api/upload/file')).toBe('upload');
    expect(getCategory('/api/validates-something')).toBe('api');
    expect(getCategory('/api/uploader-status')).toBe('api');
  });

  it('falls through to the generic api bucket otherwise', () => {
    expect(getCategory('/api/widgets')).toBe('api');
    expect(getCategory('/api/health')).toBe('api');
  });
});
