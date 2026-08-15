/**
 * `extractApiError` — the client's error-envelope contract.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * apiRequest lifted its user-facing message with one expression:
 *
 *   errorPayload?.error?.message || errorPayload?.error || errorPayload?.message
 *
 * Against the shape `POST /api/c2c/projects` returns when a store is missing —
 * `{ error: 'PENDING_STORE', message: '<a real sentence>' }` — the second term
 * wins, because `error` is a non-empty string. The third is never reached. The
 * caller is handed the literal token `PENDING_STORE`.
 *
 * That token was rendered verbatim in the New Project wizard's error banner
 * during UAT. And because `apiRequest` THROWS rather than returning, the same
 * string reached every other surface too: dataConnect's `failureFrom` puts
 * `e.message` in the `error` field that every `useLiveData` consumer displays.
 * One line of precedence made an internal enum the product's user-facing copy.
 *
 * ── What these tests hold ────────────────────────────────────────────────────
 * The hard part is not "prefer message". It is preferring it WITHOUT swallowing
 * the validation messages the same API sends in the same field: `send400(res,
 * 'name is required')` answers `{ error: 'name is required' }`, and that string
 * is the only thing worth showing. So the discriminator is the SHAPE of the
 * string, and both directions are tested here — a code must never render, and a
 * sentence must always render.
 */

import { describe, it, expect } from 'vitest';
import { extractApiError, serverMessage, errorCodeOf } from '../queryClient';

describe('extractApiError — enum codes never become user copy', () => {
  it('prefers the human message over an enum-shaped error token', () => {
    // The exact 503 body that produced the UAT finding.
    const { message, code } = extractApiError(
      {
        error: 'PENDING_STORE',
        step: 'creating the project',
        message: 'This environment is not fully set up, so creating the project cannot complete.',
        correlationId: 'abc123',
      },
      503,
    );
    expect(message).toBe(
      'This environment is not fully set up, so creating the project cannot complete.',
    );
    expect(message).not.toContain('PENDING_STORE');
    // The code survives, so a consumer that must branch on it still can.
    expect(code).toBe('PENDING_STORE');
  });

  it('never renders a bare enum token even when no message is supplied', () => {
    // The older, barer shape: { error: 'PENDING_STORE' } and nothing else.
    // There is no copy to prefer, so a generic sentence must stand in — the one
    // thing that must NOT happen is the token reaching the screen.
    const { message, code } = extractApiError({ error: 'PENDING_STORE' }, 503);
    expect(message).not.toContain('PENDING_STORE');
    expect(message).toMatch(/unavailable/i);
    expect(code).toBe('PENDING_STORE');
  });

  it.each([
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['INTERNAL_ERROR', 500],
    ['QUOTA_EXCEEDED', 403],
  ])('treats %s as a code, not as copy', (token, status) => {
    const { message, code } = extractApiError({ error: token }, status);
    expect(message).not.toContain(token);
    expect(code).toBe(token);
  });
});

describe('extractApiError — real sentences still reach the user', () => {
  it('renders a validation message sent in the error field', () => {
    // server/routes/c2c/projects.ts send400() answers exactly this shape. If
    // the guard were "any string in `error` is a code", this message — the only
    // thing telling the user what to fix — would be replaced by boilerplate.
    const { message, code } = extractApiError({ error: 'name is required' }, 400);
    expect(message).toBe('name is required');
    expect(code).toBeUndefined();
  });

  it('renders a multi-word sentence that happens to start capitalised', () => {
    const { message } = extractApiError({ error: 'Name is required.' }, 400);
    expect(message).toBe('Name is required.');
  });

  it('reads the reason out of the { error: CODE, detail } governed-action envelope', () => {
    // The c2c actions route refuses a governed action with a code plus a
    // `detail` sentence. Dropping `detail` would turn "you may not sign your own
    // work" into a generic permission denial — a materially different, and
    // wrong, thing to tell a Part 11 reviewer.
    const { message, code } = extractApiError(
      {
        error: 'SEPARATION_OF_DUTIES',
        detail: 'The signer must not be the author of the target.',
      },
      403,
    );
    expect(message).toBe('The signer must not be the author of the target.');
    expect(message).not.toContain('SEPARATION_OF_DUTIES');
    expect(code).toBe('SEPARATION_OF_DUTIES');
  });

  it('reads the nested { error: { code, message } } envelope', () => {
    const { message, code } = extractApiError(
      { error: { code: 'PENDING_STORE', message: 'The human-factors store is not ready.' } },
      503,
    );
    expect(message).toBe('The human-factors store is not ready.');
    expect(code).toBe('PENDING_STORE');
  });

  it('falls back to a status-appropriate sentence for an empty body', () => {
    expect(extractApiError({}, 403).message).toMatch(/permission/i);
    expect(extractApiError({}, 404).message).toMatch(/couldn't find/i);
    expect(extractApiError({}, 500).message).toMatch(/could not complete/i);
    expect(extractApiError(undefined, 503).message).toMatch(/unavailable/i);
  });
});

describe('serverMessage — the shared primitive the surfaces call', () => {
  /**
   * `serverMessage` exists because the two consumers need opposite endings.
   * A surface with no domain context wants a generic status sentence
   * (`extractApiError`); one that has its own — "Approval failed. The
   * assessment was not activated." — must keep it, because that sentence says
   * what did NOT happen and a generic one loses it. Returning null lets each
   * choose while keeping ONE implementation of the hard part: deciding whether
   * a given string is user copy at all.
   */
  it('returns null when the server sent nothing worth showing', () => {
    expect(serverMessage({})).toBeNull();
    expect(serverMessage(null)).toBeNull();
    expect(serverMessage({ error: 'PENDING_STORE' })).toBeNull();
    expect(serverMessage({ error: 'relation "x" does not exist' })).toBeNull();
    expect(serverMessage({ error: '   ' })).toBeNull();
  });

  it('returns the sentence when there is one', () => {
    expect(serverMessage({ error: 'PENDING_STORE', message: 'The store is not ready.' })).toBe(
      'The store is not ready.',
    );
    expect(serverMessage({ error: 'name is required' })).toBe('name is required');
    expect(serverMessage({ error: 'X', detail: 'You may not sign your own work.' })).toBe(
      'You may not sign your own work.',
    );
  });

  it('lets a caller keep its own domain fallback', () => {
    // The idiom every migrated surface now uses.
    const body = { error: 'FORBIDDEN' };
    const shown = serverMessage(body) ?? 'Approval failed. The assessment was not activated.';
    expect(shown).toBe('Approval failed. The assessment was not activated.');
  });
});

describe('errorCodeOf — branching stays possible', () => {
  it('reads the code from every envelope shape', () => {
    expect(errorCodeOf({ error: 'ESIGN_REQUIRED' })).toBe('ESIGN_REQUIRED');
    expect(errorCodeOf({ error: { code: 'CONFLICT_STALE', message: 'Reload.' } })).toBe('CONFLICT_STALE');
    expect(errorCodeOf({ code: 'NOT_ENTITLED' })).toBe('NOT_ENTITLED');
    // A sentence is not a code.
    expect(errorCodeOf({ error: 'name is required' })).toBeUndefined();
  });
});

describe('extractApiError — nothing internal leaks through', () => {
  /**
   * Guardrail 2 of the remediation programme: no SQL, table name, file path,
   * env var or API route may appear in client-facing copy. The server should
   * not be sending these at all, but this layer is the last place to catch one
   * that does — and the payload shapes below are all real ones observed during
   * UAT.
   */
  const INTERNALS = /relation "|Failed query|select "|\/api\/|DATABASE_URL|ESTAR_TEMPLATE_DIR/i;

  it('does not surface a raw driver message left in the error field', () => {
    // Observed: the device-workstream surface rendered a full Drizzle
    // "Failed query: select ..." string as its page body.
    const { message } = extractApiError(
      { error: 'Failed query: select "id", "organization_id" from "device_programs"' },
      500,
    );
    expect(message).not.toMatch(INTERNALS);
  });

  it('does not surface a missing-relation message left in the error field', () => {
    const { message } = extractApiError(
      { error: 'relation "software_lifecycle_items" does not exist' },
      500,
    );
    expect(message).not.toMatch(INTERNALS);
    expect(message).not.toContain('software_lifecycle_items');
  });
});
