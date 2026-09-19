/**
 * `vaultStatus` — what a chip says when it does not know.
 *
 * Two defects, one function.
 *
 * ── The prototype reach ──────────────────────────────────────────────────────
 * `VAULT_STATUS[s]` on a plain object literal reaches Object.prototype, so
 * `vaultStatus('constructor')` returned a FUNCTION where a `{label, tone}` was
 * expected. The chip then renders `[object Function]`, or throws reading
 * `.label`, from a value that arrived as ordinary server data.
 *
 * This codebase has been bitten by this exact family before and fixed it the
 * same way — `externalDocumentTableReason` in leaf-document-tables.ts, whose
 * comment records a leaf whose document_table was "toString" classifying as an
 * external store and carrying a Function as its reason. The fix that worked
 * there is an own-key lookup, and it is the fix here.
 *
 * ── The dishonest fallback ───────────────────────────────────────────────────
 * The fallback was `draft`. "Draft" is an AUTHORING claim: a person started
 * writing this and has not finished. The map's own note on `uploaded` already
 * says that is never true of an ingested file. As a fallback it is worse than
 * an omission — an unrecognised value is rendered with the confidence of a
 * known one, and both likely readings are wrong: over a finished record it
 * understates it, over a file with no authoring lifecycle it invents one.
 */
import { describe, it, expect } from 'vitest';
import { vaultStatus, VAULT_STATUS, UNKNOWN_VAULT_STATUS } from '../fixtures/vault-data';

describe('a status the map covers resolves to its own chip', () => {
  it('resolves every key in the map to itself', () => {
    // The negative control: a function that returned UNKNOWN for everything
    // would satisfy every assertion below.
    for (const key of Object.keys(VAULT_STATUS)) {
      expect(vaultStatus(key), `"${key}" did not resolve to its own entry`).toBe(VAULT_STATUS[key]);
    }
  });

  it('keeps the filing vocabulary distinct from the authoring one', () => {
    // These three are placement states, not approval states. A reader must not
    // be shown approval language for a filing decision.
    expect(vaultStatus('unfiled').label).toBe('Unfiled');
    expect(vaultStatus('confirmed').label).toBe('Filed');
    expect(vaultStatus('suggested').label).toMatch(/confirm/i);
  });
});

describe('a status the map does not cover says so', () => {
  it('does not claim "Draft" for an unrecognised value', () => {
    const got = vaultStatus('some_status_nobody_mapped');
    expect(got).toBe(UNKNOWN_VAULT_STATUS);
    expect(got.label).not.toMatch(/draft/i);
  });

  it('returns a usable chip, not undefined', () => {
    // The caller renders .label and .tone without guarding, so an honest
    // fallback still has to be a chip.
    const got = vaultStatus('');
    expect(typeof got.label).toBe('string');
    expect(typeof got.tone).toBe('string');
  });
});

describe('a prototype key is not a status', () => {
  // Each of these is a real Object.prototype member. A bare index returns the
  // FUNCTION for every one of them.
  for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    it(`treats "${key}" as unknown, never as a chip`, () => {
      const got = vaultStatus(key);
      expect(typeof got).toBe('object');
      expect(typeof got.label).toBe('string');
      expect(got).toBe(UNKNOWN_VAULT_STATUS);
    });
  }
});
