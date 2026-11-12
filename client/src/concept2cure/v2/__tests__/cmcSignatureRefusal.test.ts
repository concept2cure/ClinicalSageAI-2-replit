/**
 * A refused CMC signature says why, once (2026-11-12).
 *
 * Walked in the running app: a signer whose authenticator code was not accepted
 * read "Couldn’t approve section 3.2.S.4 — The server did not accept the change
 * (HTTP 401).. Nothing was persisted." The route sent the code alone, and the
 * screen appended a full stop to a sentence that already had one. The routes
 * now send the signer's sentence beside the code; these are the screen's half.
 */
import { describe, expect, it } from 'vitest';
import { cmcRefusal, cmcWriteFailed } from '../surfaces/cmcShared';

const TOTP_REFUSED = {
  success: false,
  error: 'REAUTH_TOTP_INVALID',
  message: 'The authenticator code was not accepted. Nothing was signed.',
};

describe('a refused signature on a CMC register', () => {
  it('reads the server’s sentence, not the status, and ends each sentence once', () => {
    const text = cmcWriteFailed('close-out', TOTP_REFUSED, 401);
    expect(text).toBe('Couldn’t save the close-out — The authenticator code was not accepted. Nothing was signed.');
    expect(text).not.toMatch(/HTTP 401|\.\./);
  });

  it('never shows the code when the server sent no sentence', () => {
    const text = cmcWriteFailed('close-out', { error: 'REAUTH_TOTP_INVALID' }, 401);
    expect(text).not.toMatch(/REAUTH_/);
    expect(text).not.toMatch(/\.\./);
  });

  it('control: a refusal that saved nothing still says so', () => {
    expect(cmcWriteFailed('specification', { error: 'Invalid payload', details: [{ path: ['name'], message: 'Required' }] }, 400))
      .toBe('Couldn’t save the specification — name: Required. Nothing was persisted.');
  });
});

describe('a refused section approval on the Overview', () => {
  it('is the server’s sentence after the lead, with no second "nothing" sentence', () => {
    expect(cmcRefusal('Couldn’t approve section 3.2.S.4 — ', TOTP_REFUSED.message))
      .toBe('Couldn’t approve section 3.2.S.4 — The authenticator code was not accepted. Nothing was signed.');
  });

  it('control: a refusal for another reason still says nothing was persisted', () => {
    expect(cmcRefusal('Couldn’t approve section 3.2.S.4 — ', 'The section changed since you read it'))
      .toBe('Couldn’t approve section 3.2.S.4 — The section changed since you read it. Nothing was persisted.');
  });
});
