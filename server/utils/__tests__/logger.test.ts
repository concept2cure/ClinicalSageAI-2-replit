/**
 * Pins the log-redaction contract. Every regulated field that could
 * carry credentials, PHI, PII, or payment data MUST be scrubbed
 * before the value reaches the log stream. A future refactor that
 * silently shrinks SENSITIVE_KEYS — or that bypasses the wrapper by
 * calling pino directly — will fail one of these tests.
 *
 * The walker matches case-insensitively as a substring, so this also
 * pins that variant spellings (`userPassword`, `currentPasswordHash`,
 * `MRN`, `dob_iso`, `bearerToken`) are caught by the existing entries.
 */

import { describe, expect, it, vi } from 'vitest';
import { __testing } from '../logger';
import { logger as jsLogger, createScopedLogger as createJsScopedLogger, __testing as jsTesting } from '../logger.js';

const { redactContext, SENSITIVE_KEYS, maskPersonalData } = __testing;

// logger.ts writes through pino. The DP-39 seam is the `message` argument the
// wrapper hands to pino (`pinoLogger.<level>({ context }, message)`), so pino is
// replaced with a sink that records that call; nothing downstream of the seam
// is under test here. `vi.mock` is hoisted above the imports, and the .ts twin
// below is the only module in this file that imports pino.
const pinoSink = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock('pino', () => ({
  default: Object.assign(() => pinoSink, { stdTimeFunctions: { isoTime: () => '' } }),
}));

// Under vitest the bare specifier `../logger` resolves to logger.js (Vite tries
// `.js` before `.ts`), which is what the suites above exercise and what the 229
// explicit `logger.js` importers get. Production bundles resolve the same bare
// specifier to logger.ts. The two are hand-kept mirrors, so the DP-39 contract
// is asserted against BOTH. A STATIC `from '../logger.ts'` is TS5097 ("an
// import path can only end with '.ts' when allowImportingTsExtensions is
// enabled"), so the specifier is held in a variable: tsc cannot apply TS5097 to
// a non-literal, and Vite still resolves it at runtime.
const TS_TWIN_SPECIFIER = '../logger.ts';
type LoggerModule = typeof import('../logger.js');
const loadTsTwin = async (): Promise<LoggerModule> =>
  (await import(/* @vite-ignore */ TS_TWIN_SPECIFIER)) as unknown as LoggerModule;

describe('logger SENSITIVE_KEYS coverage', () => {
  it('includes every credential category', () => {
    for (const k of [
      'password',
      'secret',
      'token',
      'bearer',
      'jwt',
      'access_token',
      'refresh_token',
      'id_token',
      'mfa',
      'otp',
      'totp',
      'cookie',
      'set-cookie',
      'session',
      'csrf',
    ]) {
      expect(SENSITIVE_KEYS).toContain(k);
    }
  });

  it('includes API key variants', () => {
    expect(SENSITIVE_KEYS).toContain('api_key');
    expect(SENSITIVE_KEYS).toContain('apikey');
    expect(SENSITIVE_KEYS).toContain('x-api-key');
  });

  it('includes the HIPAA PHI identifiers', () => {
    for (const k of ['mrn', 'patient_id', 'subject_id', 'nih_id', 'clinical_id', 'phi']) {
      expect(SENSITIVE_KEYS).toContain(k);
    }
  });

  it('includes PII (ssn, dob)', () => {
    expect(SENSITIVE_KEYS).toContain('ssn');
    expect(SENSITIVE_KEYS).toContain('dob');
    expect(SENSITIVE_KEYS).toContain('date_of_birth');
  });

  it('includes payment fields', () => {
    expect(SENSITIVE_KEYS).toContain('card_number');
    expect(SENSITIVE_KEYS).toContain('cvv');
    expect(SENSITIVE_KEYS).toContain('payment_token');
    expect(SENSITIVE_KEYS).toContain('stripe_secret');
  });
});

describe('redactContext — exact key matches', () => {
  it('redacts a top-level password field', () => {
    const out = redactContext({ password: 'hunter2', other: 'ok' });
    expect(out.password).toBe('[REDACTED]');
    expect(out.other).toBe('ok');
  });

  it('redacts a top-level mrn (HIPAA PHI)', () => {
    const out = redactContext({ mrn: 'MR-12345', name: 'Pt' });
    expect(out.mrn).toBe('[REDACTED]');
    expect(out.name).toBe('Pt');
  });

  it('redacts every variant credential field', () => {
    const out = redactContext({
      token: 'a',
      jwt: 'b',
      bearer: 'c',
      mfa: 'd',
      otp: 'e',
      cookie: 'f',
      sessionId: 'g',
      apiKey: 'h',
    });
    for (const key of Object.keys(out)) {
      expect(out[key]).toBe('[REDACTED]');
    }
  });
});

describe('redactContext — substring matches (case-insensitive)', () => {
  it('catches variant casings and camelCase', () => {
    const out = redactContext({
      userPassword: 'x',
      currentPasswordHash: 'y',
      OldPassword: 'z',
    });
    expect(out.userPassword).toBe('[REDACTED]');
    expect(out.currentPasswordHash).toBe('[REDACTED]');
    expect(out.OldPassword).toBe('[REDACTED]');
  });

  it('catches mrn, MRN, medical_record_number', () => {
    const out = redactContext({
      MRN: 'x',
      mrn_id: 'y',
      medical_record_number: 'z',
    });
    expect(out.MRN).toBe('[REDACTED]');
    expect(out.mrn_id).toBe('[REDACTED]');
    expect(out.medical_record_number).toBe('[REDACTED]');
  });

  it('catches bearerToken, accessToken, refreshToken', () => {
    const out = redactContext({
      bearerToken: 'x',
      accessToken: 'y',
      refreshToken: 'z',
    });
    expect(out.bearerToken).toBe('[REDACTED]');
    expect(out.accessToken).toBe('[REDACTED]');
    expect(out.refreshToken).toBe('[REDACTED]');
  });
});

describe('redactContext — nested objects', () => {
  it('redacts secrets inside nested user objects', () => {
    const out = redactContext({
      user: { id: 1, email: 'a@b.com', password: 'secret' },
    });
    expect((out.user as any).id).toBe(1);
    expect((out.user as any).email, 'an address is masked, not dropped (DP-26)').toBe('a***@b.com');
    expect((out.user as any).password).toBe('[REDACTED]');
  });

  it('redacts deeply nested PHI', () => {
    const out = redactContext({
      report: {
        patient: { mrn: 'MR-9', firstName: 'Pt' },
      },
    });
    expect(((out.report as any).patient as any).mrn).toBe('[REDACTED]');
    expect(((out.report as any).patient as any).firstName).toBe('Pt');
  });

  it('stops recursing past depth 6 (DoS guard)', () => {
    let nested: any = { password: 'x' };
    for (let i = 0; i < 10; i++) nested = { wrap: nested };
    // Should not throw and should not infinite-loop.
    const out = redactContext(nested);
    expect(out).toBeDefined();
  });
});

describe('redactContext — value handling', () => {
  it('leaves null and undefined alone', () => {
    const out = redactContext({ password: null as any, token: undefined as any });
    expect(out.password).toBeNull();
    expect(out.token).toBeUndefined();
  });

  it('replaces non-string sensitive values too (object credentials)', () => {
    const out = redactContext({ secret: { value: 'x' } });
    expect(out.secret).toBe('[REDACTED]');
  });

  it('walks arrays: an object element has its sensitive keys redacted (DP-39)', () => {
    const arr = [{ password: 'x', note: 'ok' }];
    const out = redactContext({ items: arr } as any);
    expect(out.items).toEqual([{ password: '[REDACTED]', note: 'ok' }]);
    expect(arr[0].password, "the caller's array is not mutated").toBe('x');
  });
});

describe('redactContext — Authorization-header common shapes', () => {
  it('redacts req.headers.authorization', () => {
    const out = redactContext({ headers: { authorization: 'Bearer eyJxxx' } });
    expect((out.headers as any).authorization).toBe('[REDACTED]');
  });

  it('redacts Set-Cookie header', () => {
    const out = redactContext({ headers: { 'set-cookie': 'session=abc' } });
    expect((out.headers as any)['set-cookie']).toBe('[REDACTED]');
  });
});

describe('maskPersonalData — e-mail and IP addresses in log values (DP-26)', () => {
  it('keeps the first character and the domain of an address', () => {
    expect(maskPersonalData('ada.lovelace@example.test')).toBe('a***@example.test');
    expect(maskPersonalData('Sign-in for ada@example.test refused')).toBe('Sign-in for a***@example.test refused');
    expect(maskPersonalData('a@b.co, c@d.org')).toBe('a***@b.co, c***@d.org');
  });

  it('keeps the network part of an IP address', () => {
    expect(maskPersonalData('203.0.113.42')).toBe('203.0.113.xxx');
    expect(maskPersonalData('from 198.51.100.7:443')).toBe('from 198.51.100.xxx:443');
    expect(maskPersonalData('2001:db8:85a3:0:0:8a2e:370:7334')).toBe('2001:db8:85a3::xxxx');
  });

  it('leaves other strings alone, including long ones', () => {
    expect(maskPersonalData('order 42 shipped')).toBe('order 42 shipped');
    expect(maskPersonalData('at 12:30:05')).toBe('at 12:30:05');
    const long = `${'x'.repeat(3000)} ada@example.test`;
    expect(maskPersonalData(long)).toBe(long);
  });
});

describe('redactContext — masks personal data under ordinary keys, redacts sensitive keys entirely', () => {
  it('masks an address or an IP wherever it is a string value, at any depth', () => {
    const out = redactContext({
      email: 'ada.lovelace@example.test',
      ip: '203.0.113.42',
      nested: { to: 'bob@example.test', note: 'ok' },
      count: 3,
      flag: true,
    });
    expect(out).toEqual({
      email: 'a***@example.test',
      ip: '203.0.113.xxx',
      nested: { to: 'b***@example.test', note: 'ok' },
      count: 3,
      flag: true,
    });
  });

  it('a sensitive key is still redacted whole, never merely masked', () => {
    expect(redactContext({ password: 'ada@example.test' })).toEqual({ password: '[REDACTED]' });
    expect(redactContext({ authorization: 'Bearer 203.0.113.42' })).toEqual({ authorization: '[REDACTED]' });
  });
});

// ── DP-39 (security review 2026-09-26 §3): the message string and array elements ─────────────
//
// P1-27 masked personal data in string values under context keys. The primary
// `message` argument was handed to the sink as written, and arrays inside the
// context were passed through unscanned, so `log.warn(`refused for ${email}`)`
// and `log.info('mailed', { to: [email] })` both reached the log store in clear.

const RAW_MESSAGE = 'Sign-in refused for ada.lovelace@example.test from 203.0.113.42';
const MASKED_MESSAGE = 'Sign-in refused for a***@example.test from 203.0.113.xxx';

describe('DP-39 — the log message string is masked (logger.js mirror)', () => {
  const capture = (fn: () => void): { message: unknown; context: unknown } => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      fn();
      expect(spy).toHaveBeenCalledTimes(1);
      return JSON.parse(String(spy.mock.calls[0][0])) as { message: unknown; context: unknown };
    } finally {
      spy.mockRestore();
    }
  };

  it('a message-only warn masks the address and the IPv4 in the message field', () => {
    const line = capture(() => jsLogger.warn(RAW_MESSAGE));
    expect(line.message).toBe(MASKED_MESSAGE);
    expect(line.context).toEqual({});
  });

  it('a scoped logger masks the message after prefixing the scope', () => {
    const line = capture(() => createJsScopedLogger('auth').warn(RAW_MESSAGE));
    expect(line.message).toBe(`[auth] ${MASKED_MESSAGE}`);
  });

  it('a message over the scan limit is left alone (MASK_SCAN_LIMIT), the context still masked', () => {
    const long = `${'x'.repeat(3000)} ${RAW_MESSAGE}`;
    const line = capture(() => jsLogger.warn(long, { to: 'bob@example.test' }));
    expect(line.message).toBe(long);
    expect(line.context).toEqual({ to: 'b***@example.test' });
  });
});

describe('DP-39 — the log message string is masked (logger.ts, pino)', () => {
  it('a message-only warn hands pino the masked message', async () => {
    const { logger: tsLogger } = await loadTsTwin();
    pinoSink.warn.mockClear();
    tsLogger.warn(RAW_MESSAGE);
    expect(pinoSink.warn).toHaveBeenCalledTimes(1);
    const [bindings, message] = pinoSink.warn.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(message).toBe(MASKED_MESSAGE);
    expect(bindings).toEqual({ context: {} });
  });

  it('every level masks the message, and a scoped logger masks after the scope prefix', async () => {
    const { logger: tsLogger, createScopedLogger } = await loadTsTwin();
    for (const level of ['info', 'error', 'debug'] as const) {
      pinoSink[level].mockClear();
      tsLogger[level](RAW_MESSAGE);
      expect(pinoSink[level].mock.calls[0][1], level).toBe(MASKED_MESSAGE);
    }
    pinoSink.warn.mockClear();
    createScopedLogger('auth').warn(RAW_MESSAGE);
    expect(pinoSink.warn.mock.calls[0][1]).toBe(`[auth] ${MASKED_MESSAGE}`);
  });

  it('a message over the scan limit is left alone (MASK_SCAN_LIMIT)', async () => {
    const { logger: tsLogger } = await loadTsTwin();
    const long = `${'x'.repeat(3000)} ${RAW_MESSAGE}`;
    pinoSink.info.mockClear();
    tsLogger.info(long);
    expect(pinoSink.info.mock.calls[0][1]).toBe(long);
  });
});

describe.each([
  ['logger.js', async () => jsTesting],
  ['logger.ts', async () => (await loadTsTwin()).__testing],
])('DP-39 — redactContext walks arrays (%s)', (_mirror, load) => {
  it('masks strings inside arrays and redacts sensitive keys of objects inside arrays', async () => {
    const { redactContext: walk } = await load();
    const out = walk({
      recipients: ['ada.lovelace@example.test', 'bob@example.test'],
      hops: ['203.0.113.42', '2001:db8:85a3:0:0:8a2e:370:7334'],
      attempts: [{ password: 'hunter2', outcome: 'refused', from: '198.51.100.7' }],
      matrix: [['carol@example.test']],
      counts: [1, null, true, undefined],
    });
    expect(out).toEqual({
      recipients: ['a***@example.test', 'b***@example.test'],
      hops: ['203.0.113.xxx', '2001:db8:85a3::xxxx'],
      attempts: [{ password: '[REDACTED]', outcome: 'refused', from: '198.51.100.xxx' }],
      matrix: [['c***@example.test']],
      counts: [1, null, true, undefined],
    });
  });

  it('an array under a sensitive key is still redacted whole, never walked', async () => {
    const { redactContext: walk } = await load();
    expect(walk({ tokens: ['a', 'b'] })).toEqual({ tokens: '[REDACTED]' });
  });

  it('keeps the per-string scan limit for array elements and does not mutate the input', async () => {
    const { redactContext: walk } = await load();
    const long = `${'x'.repeat(3000)} ada@example.test`;
    const input = { items: [long, 'ada@example.test'] };
    const out = walk(input);
    expect(out).toEqual({ items: [long, 'a***@example.test'] });
    expect(input.items[1]).toBe('ada@example.test');
  });
});

describe('DP-39 — an array passed as the whole context reaches neither sink in clear', () => {
  // normalizeContext in logger.ts wraps a non-object as { value }; logger.js
  // hands the array to redactContext directly. Either way the strings inside
  // must not reach the sink as written.
  const ADDRESSES = ['ada@example.test', '203.0.113.42'];

  it('logger.js', () => {
    // baseLogger.info in logger.js writes through console.log, not console.info.
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      jsLogger.info('mailed', ADDRESSES);
      const line = JSON.parse(String(spy.mock.calls[0][0])) as { context: unknown };
      expect(line.context).toEqual(['a***@example.test', '203.0.113.xxx']);
    } finally {
      spy.mockRestore();
    }
  });

  it('logger.ts', async () => {
    const { logger: tsLogger } = await loadTsTwin();
    pinoSink.info.mockClear();
    tsLogger.info('mailed', ADDRESSES);
    const [bindings] = pinoSink.info.mock.calls[0] as [Record<string, unknown>];
    expect(bindings).toEqual({ context: { value: ['a***@example.test', '203.0.113.xxx'] } });
  });
});
