/**
 * The rate-limit bucket a path lands in (security audit 2026-09-24, IAM-18
 * item 9; plan P1-17 follow-up).
 *
 * getCategory routed a path to the `ai` bucket only when it carried a bare
 * `ai`, `generate`, `openai` or `anthropic` segment. The AI surfaces this
 * platform actually mounts — /api/ai-assistance, /api/ai-gateway, /api/ana,
 * /api/ana-ri, /api/claude, /api/cortex — carried none of those, so the model
 * calls that cost the most were metered as ordinary API traffic.
 */
import { describe, expect, it } from 'vitest';
import { getCategory } from '../redisRateLimiter';

describe('getCategory: the AI surfaces are metered as AI', () => {
  it.each([
    '/api/ai-assistance/generate-section',
    '/api/ai-gateway/complete',
    '/api/ana/chat',
    '/api/ana-ri/command',
    '/api/claude/models',
    '/api/cortex/query',
    '/api/ai/claims',
  ])('%s → ai', (path) => {
    expect(getCategory(path)).toBe('ai');
  });

  it('the other buckets are unchanged', () => {
    expect(getCategory('/api/auth/login')).toBe('auth');
    expect(getCategory('/api/concept2cure/projects')).toBe('concept2cure');
    expect(getCategory('/api/documents/1/export')).toBe('documents');
    expect(getCategory('/api/vault/upload')).toBe('upload');
    expect(getCategory('/api/projects')).toBe('api');
  });

  it('an AnA request that reaches no model is ordinary API traffic, not AI', () => {
    // The rail's polls and a demonstration's move confirmations used up the
    // 30-a-minute AI bucket, so the screen's confirmations were refused and
    // the person's next question was answered "too many AI requests".
    expect(getCategory('/api/ana-ri/agent-activity', 'GET')).toBe('api');
    expect(getCategory('/api/ana-ri/live-drive/state', 'GET')).toBe('api');
    expect(getCategory('/ana-ri/turn-records', 'GET')).toBe('api');
    expect(getCategory('/api/ana-ri/stream/run_9f89/control', 'POST')).toBe('api');
    expect(getCategory('/ana-ri/stream/run_9f89/control', 'POST')).toBe('api');
  });

  it('what can reach a model under /api/ana-ri stays AI, and the other prefixes are unchanged', () => {
    expect(getCategory('/api/ana-ri/stream', 'POST')).toBe('ai');
    expect(getCategory('/api/ana-ri/governed-action', 'POST')).toBe('ai');
    expect(getCategory('/api/ana-ri/stream/run_9f89/control/extra', 'POST')).toBe('ai');
    expect(getCategory('/api/ai-gateway/models', 'GET')).toBe('ai');
    expect(getCategory('/api/claude/models', 'GET')).toBe('ai');
  });

  it('a segment that merely contains the letters is not the bucket (no substring matches)', () => {
    expect(getCategory('/api/trials')).toBe('api');
    expect(getCategory('/api/analytics')).toBe('api');
  });
});
