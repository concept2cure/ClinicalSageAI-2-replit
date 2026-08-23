/**
 * W3-7 — accepting an AI draft must not erase who drafted it.
 *
 * `resolveSuggestion('accept')` on an insertion calls `tr.removeMark(...)`.
 * That mark carried `authorId` / `authorName`, and it is the ONLY place the
 * author was recorded — so the instant a reviewer accepts an AnA suggestion the
 * text is indistinguishable from text they typed, and the revision the save
 * writes names them as its sole author.
 *
 * The capture therefore has to happen BEFORE the mark is stripped. These
 * assertions pin that decision and the two call sites that use it, because a
 * capture placed after the removeMark would still compile, still pass a naive
 * test, and record nothing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { rememberAcceptedAuthor } from '../editor/suggestions';

type Store = { enabled: boolean; author: { id: string; name: string }; acceptedAuthors: { id: string; name: string }[] };
const store = (): Store => ({ enabled: true, author: { id: 'u1', name: 'You' }, acceptedAuthors: [] });

describe('rememberAcceptedAuthor', () => {
  it('records the author of an ACCEPTED insertion', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)');
    expect(s.acceptedAuthors).toEqual([{ id: 'ana', name: 'AnA (AI draft)' }]);
  });

  it('records nothing for a REJECTED insertion — the text never entered the record', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'reject', 'ana', 'AnA (AI draft)');
    expect(s.acceptedAuthors).toEqual([]);
  });

  it('records nothing for a deletion — accepting one removes text, it contributes none', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'deletion', 'accept', 'ana', 'AnA (AI draft)');
    rememberAcceptedAuthor(s, 'deletion', 'reject', 'ana', 'AnA (AI draft)');
    expect(s.acceptedAuthors).toEqual([]);
  });

  it('names an author once however many of their suggestions are accepted', () => {
    const s = store();
    for (let i = 0; i < 5; i++) rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)');
    expect(s.acceptedAuthors).toHaveLength(1);
  });

  it('keeps distinct authors distinct', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)');
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'u9', 'A colleague');
    expect(s.acceptedAuthors.map((a) => a.id)).toEqual(['ana', 'u9']);
  });

  it('ignores an unattributed span rather than inventing an author for it', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', null, null);
    expect(s.acceptedAuthors).toEqual([]);
  });

  it('falls back to the id when only the id is known', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', null);
    expect(s.acceptedAuthors).toEqual([{ id: 'ana', name: 'ana' }]);
  });
});

describe('the capture runs before the mark is stripped', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'editor', 'suggestions.ts'),
    'utf8',
  );

  it('both resolve paths call it', () => {
    expect((src.match(/rememberAcceptedAuthor\(this\.storage/g) || []).length).toBe(2);
  });

  it('and each call precedes the removeMark that erases the attribution', () => {
    /* Anchored on the call sites themselves rather than on a function name,
       because the name also appears in the command type declarations above the
       implementations. For each capture: a removeMark must follow it, and none
       may sit between the start of its handler body and the capture — a capture
       placed after the strip would record nothing and still compile. */
    const HANDLER_START = '({ state, tr, dispatch }) => {';
    let from = 0;
    let sites = 0;
    for (;;) {
      const at = src.indexOf('rememberAcceptedAuthor(this.storage', from);
      if (at === -1) break;
      sites++;
      from = at + 1;

      const after = src.slice(at);
      expect(after.indexOf('removeMark'), 'no removeMark follows the capture').toBeGreaterThan(-1);

      const handlerAt = src.lastIndexOf(HANDLER_START, at);
      expect(handlerAt, 'capture is not inside a command handler').toBeGreaterThan(-1);
      const before = src.slice(handlerAt, at);
      expect(before.includes('removeMark'), 'the mark is stripped BEFORE the author is captured').toBe(false);
    }
    expect(sites).toBe(2);
  });
});
