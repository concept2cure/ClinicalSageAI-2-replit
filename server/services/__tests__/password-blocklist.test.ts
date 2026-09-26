/**
 * The common-password and context checks (IAM-17, P1-2; NIST SP 800-63B
 * §5.1.1.2). The list is the bundled one, so these run against what ships.
 */
import { describe, expect, it } from 'vitest';

import { contextWordIn, contextWordsOf, isCommonPassword, passwordCores } from '../password-blocklist';
import { validatePasswordPolicy } from '../auth-security-service';

describe('isCommonPassword', () => {
  it('finds a common password as typed and behind its decorations', () => {
    expect(isCommonPassword('password')).toBe(true);
    expect(isCommonPassword('Password1234!')).toBe(true);
    expect(isCommonPassword('!!Administrator2026')).toBe(true);
    expect(isCommonPassword('qwertyuiop12')).toBe(true);
    expect(isCommonPassword('Trustno1!!!!')).toBe(true);
  });

  it('does not flag a passphrase that is not on the list', () => {
    expect(isCommonPassword('Correct-Horse-Battery-Staple-42')).toBe(false);
    expect(isCommonPassword('gW7#pL0q!zR2vN9m')).toBe(false);
  });

  it('never compares a core shorter than four characters', () => {
    const cores = passwordCores('!!ab!!');
    expect(cores).not.toContain('ab');
    expect(cores.every(c => c.length >= 4)).toBe(true);
  });
});

describe('context words', () => {
  it('are the address local part, the name and the organisation, four characters and up, and the product', () => {
    const words = contextWordsOf({ email: 'ada.lovelace@acme.test', name: 'Ada Lovelace', organizationName: 'Acme Bio Ltd' });
    expect(words).toEqual(expect.arrayContaining(['concept2cure', 'lovelace', 'acme']));
    expect(words).not.toContain('ada');
    expect(words).not.toContain('bio');
    expect(words).not.toContain('ltd');
  });

  it('are found inside a password, decorated or not', () => {
    const ctx = { email: 'ada.lovelace@acme.test', organizationName: 'Acme Bio' };
    expect(contextWordIn('LoveLace-2026!', ctx)).toBe('lovelace');
    expect(contextWordIn('A.c.m.e-Rocks-2026!', ctx)).toBe('acme');
    expect(contextWordIn('Concept2Cure!2026', {})).toBe('concept2cure');
    expect(contextWordIn('Correct-Horse-Battery-Staple-42', ctx)).toBeNull();
  });
});

describe('validatePasswordPolicy with the list and the context', () => {
  it('refuses a common password however decorated, and says so', () => {
    const r = validatePasswordPolicy('Administrator2026!');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/too common/i);
  });

  it('refuses a password built from the account holder or the organisation', () => {
    const r = validatePasswordPolicy('LoveLace-2026!x', { email: 'ada.lovelace@acme.test' });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/name, e-mail address or organisation/i);
    expect(validatePasswordPolicy('AcmeBio-2026!x', { organizationName: 'Acme Bio' }).valid).toBe(false);
  });

  it('accepts a strong passphrase with context present', () => {
    expect(validatePasswordPolicy('Correct-Horse-Battery-Staple-42', { email: 'ada.lovelace@acme.test', organizationName: 'Acme Bio' })).toEqual({ valid: true, errors: [] });
  });
});
