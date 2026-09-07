/**
 * The decoder's own contract. The pipeline-level guarantees it exists to serve
 * are pinned in entity-comparators-survive-export.test.ts; this file covers the
 * rules that are only visible on the helper itself.
 */
import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities } from '../decode-html-entities';

describe('decodeHtmlEntities', () => {
  it('decodes each entity exactly once', () => {
    // The whole point: `&amp;lt;` is an author-typed literal "&lt;", not a "<".
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeHtmlEntities('&lt;')).toBe('<');
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;');
  });

  it('decodes the comparators specifications are written with', () => {
    expect(decodeHtmlEntities('&lt; 0.05%')).toBe('< 0.05%');
    expect(decodeHtmlEntities('&gt; 98.0%')).toBe('> 98.0%');
    expect(decodeHtmlEntities('&le; 2.0%')).toBe('≤ 2.0%');
    expect(decodeHtmlEntities('&ge; 95%')).toBe('≥ 95%');
    expect(decodeHtmlEntities('5.0 &plusmn; 0.5')).toBe('5.0 ± 0.5');
  });

  it('decodes numeric references, decimal and hex', () => {
    expect(decodeHtmlEntities('&#8804; 2.0%')).toBe('≤ 2.0%');
    expect(decodeHtmlEntities('&#x2264; 2.0%')).toBe('≤ 2.0%');
    expect(decodeHtmlEntities('&#956;g/mL')).toBe('μg/mL');
  });

  it('leaves an unrecognised entity written out rather than dropping it', () => {
    /* A filed document is better off reading `&zzz;` literally than silently
       losing the characters. Deletion is the failure mode this whole module
       exists to stop. */
    expect(decodeHtmlEntities('dose &zzz; limit')).toBe('dose &zzz; limit');
    expect(decodeHtmlEntities('&#x110000;')).toBe('&#x110000;'); // beyond Unicode
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;'); // lone surrogate
  });

  it('leaves a bare ampersand alone', () => {
    expect(decodeHtmlEntities('Smith & Nephew')).toBe('Smith & Nephew');
    expect(decodeHtmlEntities('R&D')).toBe('R&D');
  });

  it('does not touch markup — it runs after the strip, never before', () => {
    expect(decodeHtmlEntities('<p>a</p>')).toBe('<p>a</p>');
  });
});
