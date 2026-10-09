/**
 * A refused request reaches the page with the server's own sentence, whichever
 * way the route wrote it (IAM-18 (8) / P1-3 follow-up, 2026-09-26): the auth
 * routes nest `{ error: { code, message } }`, others write `{ code, message }`
 * at the top level, a few `{ error: '<text>' }`.
 */
import { describe, expect, it } from 'vitest';
import { apiErrorOfResponse } from '../authService';

describe('apiErrorOfResponse', () => {
  it('reads a refusal nested under error, as /mfa/resend writes it', () => {
    const e = apiErrorOfResponse(429, 'Too Many Requests', {
      error: { code: 'MFA_RESEND_LIMIT', message: 'This sign-in has already received its limit of emailed codes. Sign in again to request a new one.' },
    });
    expect(e.code).toBe('MFA_RESEND_LIMIT');
    expect(e.message).toMatch(/limit of emailed codes/);
  });

  it('still reads a top-level { code, message }', () => {
    const e = apiErrorOfResponse(403, 'Forbidden', { code: 'AUTH_EMAIL_UNVERIFIED', message: 'Verify your address first.' });
    expect(e).toMatchObject({ code: 'AUTH_EMAIL_UNVERIFIED', message: 'Verify your address first.' });
  });

  it('reads a bare error string, and falls back to the status when the body says nothing', () => {
    expect(apiErrorOfResponse(400, 'Bad Request', { error: 'Reason required' })).toMatchObject({ code: 'HTTP_400', message: 'Reason required' });
    expect(apiErrorOfResponse(502, '', {})).toMatchObject({ code: 'HTTP_502', message: 'Request failed (502)' });
    expect(apiErrorOfResponse(500, 'Internal Server Error', null)).toMatchObject({ code: 'HTTP_500', message: 'Internal Server Error' });
  });
});
