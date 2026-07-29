/**
 * Guards the latency protection on AnA's optional context prefetch: withTimeout
 * must yield the real value when the work is fast, and the fallback when it is
 * slow — so a slow DB can never stall AnA's time-to-first-token.
 */

import { describe, it, expect } from 'vitest';
import { withTimeout } from '../ana-ri/chat-context-builder.js';

describe('withTimeout (prefetch latency guard)', () => {
  it('returns the resolved value when it settles before the timeout', async () => {
    const fast = Promise.resolve('value');
    await expect(withTimeout(fast, 1000, 'fallback')).resolves.toBe('value');
  });

  it('returns the fallback when the work exceeds the timeout', async () => {
    const slow = new Promise<string>(resolve => setTimeout(() => resolve('value'), 50));
    await expect(withTimeout(slow, 5, 'fallback')).resolves.toBe('fallback');
  });

  it('propagates the fallback shape for the proactive-block union', async () => {
    const slow = new Promise<{ kind: string; block: string }>(r =>
      setTimeout(() => r({ kind: 'deadline', block: 'x' }), 50)
    );
    const out = await withTimeout(slow, 5, { kind: 'none', block: '' });
    expect(out).toEqual({ kind: 'none', block: '' });
  });
});
