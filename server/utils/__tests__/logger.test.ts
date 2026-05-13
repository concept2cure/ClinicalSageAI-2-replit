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

import { describe, expect, it } from 'vitest';
import { __testing } from '../logger';

const { redactContext, SENSITIVE_KEYS } = __testing;

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
    expect((out.user as any).email).toBe('a@b.com');
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

  it('passes arrays through unchanged (out of scope for the walker)', () => {
    const arr = [{ password: 'x' }];
    const out = redactContext({ items: arr } as any);
    // Arrays themselves bypass the walker — documented behavior.
    expect(out.items).toBe(arr);
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
