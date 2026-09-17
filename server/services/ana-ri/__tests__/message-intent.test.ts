/**
 * `@app` on the intent layer: one vocabulary, any handle, anywhere in the
 * message; the enrichment map only names apps that exist.
 */
import { describe, expect, it } from 'vitest';

import { CALLABLE_APPS } from '../../../../shared/navigation/callable-apps';
import { APP_ENRICHMENT_MAP, KNOWN_APPS, detectAppMention } from '../message-intent';

describe('detectAppMention', () => {
  it('resolves an alias at the start (the pre-menu form) to the app id and strips it', () => {
    expect(detectAppMention('@biostats check the power for arm B')).toEqual({ appId: 'biostat-workbench', remainingText: 'check the power for arm B' });
  });

  it('resolves a label in the middle of a sentence (the menu form)', () => {
    expect(detectAppMention('please ask @Biostatistics workbench about the interim')).toEqual({ appId: 'biostat-workbench', remainingText: 'please ask about the interim' });
  });

  it('is null for unknown handles and plain text', () => {
    expect(detectAppMention('@nonsense do it')).toBeNull();
    expect(detectAppMention('no mention here')).toBeNull();
    expect(detectAppMention('mail ana@concept2cure.pro')).toBeNull();
  });
});

describe('vocabulary consistency', () => {
  it('KNOWN_APPS is every handle of the shared vocabulary', () => {
    for (const a of CALLABLE_APPS) {
      expect(KNOWN_APPS.has(a.id)).toBe(true);
      for (const alias of a.aliases) expect(KNOWN_APPS.has(alias)).toBe(true);
    }
    expect(KNOWN_APPS.has('biostats')).toBe(true);
  });

  it('every enrichment key is a callable app id', () => {
    const ids = new Set(CALLABLE_APPS.map((a) => a.id));
    for (const key of Object.keys(APP_ENRICHMENT_MAP)) expect(ids.has(key), key).toBe(true);
  });
});
