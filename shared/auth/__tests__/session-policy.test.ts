import { describe, expect, it } from 'vitest';
import * as policy from '../session-policy';
import * as runtime from '../../../server/services/session-inactivity';

describe('one canonical session policy for runtime and UI', () => {
  it('reexports the same policy functions and platform limits from the runtime', () => {
    expect(runtime.idleWindowSecondsOf).toBe(policy.idleWindowSecondsOf);
    expect(runtime.maxConcurrentSessionsOf).toBe(policy.maxConcurrentSessionsOf);
    expect(runtime.ABSOLUTE_SESSION_HOURS).toBe(12);
    expect(runtime.DEFAULT_IDLE_MINUTES).toBe(15);
    expect(runtime.DEFAULT_MAX_CONCURRENT_SESSIONS).toBe(5);
  });
  it.each([
    [undefined, 15, 5],
    [{ security: { sessionTimeout: 30, ipWhitelist: ['127.0.0.1'] } }, 15, 5],
    [{ security: { sessionTimeoutMinutes: 45, maxConcurrentSessions: 3 } }, 45, 3],
    [{ security: { sessionTimeoutMinutes: 0, maxConcurrentSessions: 0 } }, 1, 1],
    [{ security: { sessionTimeoutMinutes: 9999, maxConcurrentSessions: 99 } }, 1440, 20],
    [{ security: { sessionTimeoutMinutes: '30', maxConcurrentSessions: '2' } }, 15, 5],
    [{ security: { sessionTimeoutMinutes: 12.9, maxConcurrentSessions: 2.8 } }, 12, 2],
  ])('preserves effective policy for settings %j', (settings, idleMinutes, concurrentSessions) => {
    expect(policy.idleWindowSecondsOf(settings)).toBe(idleMinutes * 60);
    expect(policy.maxConcurrentSessionsOf(settings)).toBe(concurrentSessions);
  });
});
