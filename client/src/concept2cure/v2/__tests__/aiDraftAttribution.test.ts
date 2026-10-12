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

type Store = {
  enabled: boolean;
  author: { id: string; name: string };
  acceptedAuthors: { id: string; name: string }[];
  /* `turnRecordId` is REQUIRED on AcceptedInsertion, not optional: a default of
     "no turn" is the shape that would quietly make every claim unverifiable,
     which is the defect this field exists to close. The local type mirrors the
     real one so this test cannot drift from it. */
  acceptedInsertions: { authorId: string; text: string; turnRecordId: string | null }[];
};
const store = (): Store => ({
  enabled: true,
  author: { id: 'u1', name: 'You' },
  acceptedAuthors: [],
  acceptedInsertions: [],
});
const ANA_TEXT = 'The primary endpoint was met at week twelve in the intent-to-treat population.';

describe('rememberAcceptedAuthor', () => {
  it('records the author of an ACCEPTED insertion', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT);
    expect(s.acceptedAuthors).toEqual([{ id: 'ana', name: 'AnA (AI draft)' }]);
  });

  it('records nothing for a REJECTED insertion — the text never entered the record', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'reject', 'ana', 'AnA (AI draft)', ANA_TEXT);
    expect(s.acceptedAuthors).toEqual([]);
  });

  it('records nothing for a deletion — accepting one removes text, it contributes none', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'deletion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT);
    rememberAcceptedAuthor(s, 'deletion', 'reject', 'ana', 'AnA (AI draft)', ANA_TEXT);
    expect(s.acceptedAuthors).toEqual([]);
  });

  it('names an author once however many of their suggestions are accepted', () => {
    const s = store();
    for (let i = 0; i < 5; i++) rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT);
    expect(s.acceptedAuthors).toHaveLength(1);
  });

  it('keeps distinct authors distinct', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT);
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'u9', 'A colleague', ANA_TEXT);
    expect(s.acceptedAuthors.map((a) => a.id)).toEqual(['ana', 'u9']);
  });

  it('ignores an unattributed span rather than inventing an author for it', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', null, null, ANA_TEXT);
    expect(s.acceptedAuthors).toEqual([]);
  });

  it('falls back to the id when only the id is known', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', null, ANA_TEXT);
    expect(s.acceptedAuthors).toEqual([{ id: 'ana', name: 'ana' }]);
  });
});

describe('rememberAcceptedAuthor keeps the accepted text', () => {
  /* The author list says WHO contributed to a save; it cannot say WHICH
     clauses. The lineage gate attributes a clause to the machine only when the
     clause is verbatim inside text that was accepted from it — so the text has
     to survive the accept, the same way the author does, or every AnA clause
     is recorded as the reviewer's own assertion. */
  it('keeps the text of an ACCEPTED insertion with its author', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT);
    expect(s.acceptedInsertions).toEqual([{ authorId: 'ana', text: ANA_TEXT, turnRecordId: null }]);
  });

  it('keeps every accepted insertion, not one per author', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', 'First clause.');
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', 'Second clause.');
    expect(s.acceptedInsertions.map((a) => a.text)).toEqual(['First clause.', 'Second clause.']);
    expect(s.acceptedAuthors).toHaveLength(1);
  });

  it('keeps no text for a rejected insertion, a deletion, or an unattributed span', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'reject', 'ana', 'AnA (AI draft)', ANA_TEXT);
    rememberAcceptedAuthor(s, 'deletion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT);
    rememberAcceptedAuthor(s, 'insertion', 'accept', null, null, ANA_TEXT);
    expect(s.acceptedInsertions).toEqual([]);
  });

  it('keeps no entry for empty text — there is nothing to attribute', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', '');
    expect(s.acceptedInsertions).toEqual([]);
  });
});

describe('the capture runs before the mark is stripped', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'editor', 'suggestions.ts'),
    'utf8',
  );

  it('both resolve paths call it, and both pass the range\'s text AND its turn', () => {
    expect((src.match(/rememberAcceptedAuthor\(this\.storage/g) || []).length).toBe(2);
    /* The turn is checked here with the text, for the same reason and in the
       same shape (round 15, SEC-A-7 door 1): a call site that drops
       `sourceRecord` records the words and loses WHICH TURN wrote them, which
       makes the server's claim unverifiable — and it would do so silently,
       because the argument is optional at the type level so that a caller with
       no turn can still record one. */
    expect(
      (src.match(/rememberAcceptedAuthor\(this\.storage, (?:range|r)\.kind, action, (?:range|r)\.authorId, (?:range|r)\.authorName, (?:range|r)\.text, (?:range|r)\.sourceRecord\)/g) || []).length,
      'a call site that drops the text or the turn records the author and loses the rest',
    ).toBe(2);
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

describe('an accepted insertion keeps the turn it came from (round 15, SEC-A-7 door 1)', () => {
  /* The save door's claim — "a machine wrote these words" — is only checkable
     against the turn record that would prove it, and the id for that is
     already on the client: AnA's suggestion mark carries it as `sourceRecord`,
     and it rides on SuggestionRange. It stopped here, because
     `AcceptedInsertion` held only {authorId, text}. So the PATCH could say
     WHICH words a machine wrote and never WHICH TURN wrote them, and
     verifyMachineText had nothing to hold the claim against. */
  const TURN = 'b2e7d9f0-1a3c-4b5d-9e8f-7a6b5c4d3e21';

  it('records the turn record the accepted mark named', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT, TURN);
    expect(s.acceptedInsertions).toEqual([{ authorId: 'ana', text: ANA_TEXT, turnRecordId: TURN }]);
  });

  it('records null when the mark named none, rather than omitting the entry', () => {
    /* A plain paste, an older bundle, or text typed by hand. The clause must
       still reach the server, where it is recorded as the person's own words
       with the reason — not dropped. */
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT);
    expect(s.acceptedInsertions).toEqual([{ authorId: 'ana', text: ANA_TEXT, turnRecordId: null }]);
  });

  it('keeps each accepted insertion’s OWN turn, not the first one’s', () => {
    /* Two AnA drafts from different turns accepted in one editing session: the
       per-clause grain is the whole point, because the models that served one
       turn say nothing about the other. */
    const OTHER = '9c4f1e22-77aa-4b31-8d55-1e2f3a4b5c6d';
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', 'First clause.', TURN);
    rememberAcceptedAuthor(s, 'insertion', 'accept', 'ana', 'AnA (AI draft)', 'Second clause.', OTHER);
    expect(s.acceptedInsertions).toEqual([
      { authorId: 'ana', text: 'First clause.', turnRecordId: TURN },
      { authorId: 'ana', text: 'Second clause.', turnRecordId: OTHER },
    ]);
    /* The author is still named once — that list answers WHO, and this one
       answers which words and from which turn. */
    expect(s.acceptedAuthors).toEqual([{ id: 'ana', name: 'AnA (AI draft)' }]);
  });

  it('records no turn for a rejected insertion or a deletion (negative controls)', () => {
    const s = store();
    rememberAcceptedAuthor(s, 'insertion', 'reject', 'ana', 'AnA (AI draft)', ANA_TEXT, TURN);
    rememberAcceptedAuthor(s, 'deletion', 'accept', 'ana', 'AnA (AI draft)', ANA_TEXT, TURN);
    expect(s.acceptedInsertions).toEqual([]);
  });
});
