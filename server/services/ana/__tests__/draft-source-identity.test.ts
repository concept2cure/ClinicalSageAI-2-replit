import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DraftSourceSpan } from '../../../../shared/authoring/draft-source-reference.js';
import { draftSourceIdentityForText } from '../draft-source-identity.js';

const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const text = 'Header 🧬 日本語\nResult 47%';
const span = { start: text.indexOf('Result'), end: text.length, totalChars: text.length };

describe('exact selected-source extraction identity', () => {
  it('hashes the entire exact extraction and its original nonzero UTF-16 slice', () => {
    expect(draftSourceIdentityForText(text, span)).toEqual({ version: 2,
      extractedTextSha256: digest(text), spanSha256: digest('Result 47%') });
  });

  it('distinguishes same-length changes inside and outside the excerpt', () => {
    const original = draftSourceIdentityForText(text, span);
    const inside = draftSourceIdentityForText(text.replace('47%', '48%'), span);
    const outside = draftSourceIdentityForText(text.replace('Header', 'Footer'), span);
    expect(inside.extractedTextSha256).not.toBe(original.extractedTextSha256);
    expect(inside.spanSha256).not.toBe(original.spanSha256);
    expect(outside.extractedTextSha256).not.toBe(original.extractedTextSha256);
    expect(outside.spanSha256).toBe(original.spanSha256);
  });

  it('preserves Unicode spelling rather than normalizing canonically equivalent source text', () => {
    const composed = 'é';
    const decomposed = 'e\u0301';
    const a = draftSourceIdentityForText(composed, { start: 0, end: 1, totalChars: 1 });
    const b = draftSourceIdentityForText(decomposed, { start: 0, end: 2, totalChars: 2 });
    expect(a.extractedTextSha256).not.toBe(b.extractedTextSha256);
  });

  it.each([
    undefined, null, {}, { end: 1, totalChars: text.length },
    { start: '0', end: 1, totalChars: text.length }, { start: 0, end: '1', totalChars: text.length },
    { start: 0, end: 1, totalChars: String(text.length) },
    { start: -1, end: 1, totalChars: text.length }, { start: 0, end: 0, totalChars: text.length },
    { start: 1, end: 0, totalChars: text.length }, { start: 0, end: text.length + 1, totalChars: text.length },
    { start: 0.5, end: 1, totalChars: text.length }, { start: NaN, end: 1, totalChars: text.length },
    { start: 0, end: Infinity, totalChars: text.length }, { start: 0, end: 1, totalChars: text.length + 1 },
    { start: 0, end: Number.MAX_SAFE_INTEGER + 1, totalChars: text.length },
  ])('refuses malformed or coerced coordinates: %j', invalid => {
    expect(() => draftSourceIdentityForText(text, invalid as DraftSourceSpan)).toThrow();
  });

  it('enforces a relative 12,000-unit width without capping absolute coordinates', () => {
    const late = 'x'.repeat(100000);
    expect(draftSourceIdentityForText(late, { start: 80000, end: 92000, totalChars: late.length }).spanSha256)
      .toBe(digest(late.slice(80000, 92000)));
    expect(() => draftSourceIdentityForText(late, { start: 80000, end: 92001, totalChars: late.length })).toThrow();
  });

  it.each(['\ud800', '\ud801', '\udc00', '\udfff', 'valid 🧬 text \ud800'])('refuses an ill-formed full extraction %j', invalid => {
    expect(() => draftSourceIdentityForText(invalid, { start: 0, end: invalid.length, totalChars: invalid.length })).toThrow('encoding');
  });

  it.each([{ start: 0, end: 1, totalChars: 2 }, { start: 1, end: 2, totalChars: 2 }])('refuses an excerpt that splits a valid surrogate pair %j', invalid => {
    expect(() => draftSourceIdentityForText('🧬', invalid)).toThrow('encoding');
  });

  it('does not mutate input spans and permits an intact astral pair', () => {
    const original = Object.freeze({ start: 0, end: 2, totalChars: 2 });
    expect(draftSourceIdentityForText('🧬', original).spanSha256).toBe(digest('🧬'));
    expect(original).toEqual({ start: 0, end: 2, totalChars: 2 });
  });
});
