import { describe, it, expect, vi } from 'vitest';

// auditLogger.js imports the heavy auditService at module load; stub it out
// so this unit test stays free of DB / drizzle initialization.
vi.mock('../../services/auditService', () => ({ auditLog: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const auditLogger = require('../auditLogger.js');
const { scrubSensitive, isSensitiveKey } = auditLogger;

describe('isSensitiveKey', () => {
  it('matches common sensitive field names case-insensitively', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('Password')).toBe(true);
    expect(isSensitiveKey('userPassword')).toBe(true);
    expect(isSensitiveKey('accessToken')).toBe(true);
    expect(isSensitiveKey('refreshToken')).toBe(true);
    expect(isSensitiveKey('Authorization')).toBe(true);
    expect(isSensitiveKey('clientSecret')).toBe(true);
    expect(isSensitiveKey('ssn')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
  });

  it('leaves benign fields alone', () => {
    expect(isSensitiveKey('email')).toBe(false);
    expect(isSensitiveKey('name')).toBe(false);
    expect(isSensitiveKey('count')).toBe(false);
  });
});

describe('scrubSensitive', () => {
  it('redacts top-level sensitive keys', () => {
    const out = scrubSensitive({ name: 'Alice', password: 'hunter2' });
    expect(out).toEqual({ name: 'Alice', password: '[REDACTED]' });
  });

  it('redacts sensitive keys nested in objects and arrays', () => {
    const out = scrubSensitive({
      user: { name: 'Alice', accessToken: 'abc' },
      payments: [{ amount: 10, creditCard: '4111-1111-1111-1111' }],
    });
    expect(out.user.accessToken).toBe('[REDACTED]');
    expect(out.payments[0].creditCard).toBe('[REDACTED]');
    expect(out.payments[0].amount).toBe(10);
  });

  it('drops prototype-pollution keys without copying them through', () => {
    const out = scrubSensitive({ __proto__: { polluted: true }, name: 'ok' } as any);
    expect(out.polluted).toBeUndefined();
    expect(out.name).toBe('ok');
  });

  it('passes through non-objects unchanged', () => {
    expect(scrubSensitive('hello')).toBe('hello');
    expect(scrubSensitive(42)).toBe(42);
    expect(scrubSensitive(null)).toBeNull();
  });
});
