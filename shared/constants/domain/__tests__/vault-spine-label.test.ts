/**
 * The Vault's header names the project's own filing, not the first filing its
 * view happens to list.
 *
 * GET /api/c2c/project-vault/:id labelled every vault with the first filing
 * type of its view: every Pharmaceutical vault read "IND · 21 CFR 312", an NDA
 * project's included (.design/filing-spine/screenshots/
 * review-vault-no-project-desktop-1280.png, ONC-221 — NDA). A filing type the
 * view does not list is not guessed: the header names the view.
 */
import { describe, expect, it } from 'vitest';
import { vaultSpineLabel } from '../vault-taxonomy';

describe("the Vault header names the project's filing", () => {
  it("an NDA project's vault reads NDA · 21 CFR 314, not IND · 21 CFR 312", () => {
    expect(vaultSpineLabel('pharma', 'NDA')).toBe('NDA · 21 CFR 314');
    expect(vaultSpineLabel('pharma', 'nda')).toBe('NDA · 21 CFR 314');
  });

  it('an IND and a BLA read as themselves', () => {
    expect(vaultSpineLabel('pharma', 'ind')).toBe('IND · 21 CFR 312');
    expect(vaultSpineLabel('biotech', 'BLA')).toBe('BLA · 42 USC 262 (PHS Act 351)');
  });

  it('a filing type the view does not list, or none, names the view and guesses no regulation', () => {
    expect(vaultSpineLabel('pharma', 'JNDA')).toBe('Pharmaceutical');
    expect(vaultSpineLabel('pharma', null)).toBe('Pharmaceutical');
    expect(vaultSpineLabel('biotech', 'nda')).toBe('Biotechnology');
  });
});
