/**
 * acceptedMachineText — the request-boundary parser for the text a reviewer
 * accepted from a machine author in one editing session.
 *
 * The lineage gate attributes a clause to a machine author only when the clause
 * is verbatim inside text the client says was accepted from that author. The
 * client is untrusted, so the parser is where the claim is bounded: the author
 * id must be one the server itself names (MACHINE_AUTHOR_IDS — the same closed
 * vocabulary machineContributors validates against), the text must be a real
 * string, and the list and each entry are capped. What the parser cannot bound
 * — whether the text is actually in the saved content — the gate checks itself.
 */

import { describe, it, expect } from 'vitest';
import {
  acceptedMachineText,
  machineContributors,
  MAX_ACCEPTED_MACHINE_TEXT_CHARS,
  MACHINE_AUTHOR_IDS,
} from '../revision-ledger';

describe('acceptedMachineText', () => {
  it('keeps an entry whose author is a known machine author and whose text is non-empty', () => {
    /* `turnRecordId` is part of every entry since round 15 — null here, because
       this caller names no turn. The field is what makes the claim checkable;
       see the describe at the foot of this file. */
    expect(acceptedMachineText([{ authorId: 'ana', text: 'The primary endpoint was met.' }])).toEqual([
      { authorId: 'ana', text: 'The primary endpoint was met.', turnRecordId: null },
    ]);
    expect(Object.keys(MACHINE_AUTHOR_IDS)).toContain('ana');
  });

  it('drops an author id the server does not name, rather than letting a caller attribute text to anyone', () => {
    expect(acceptedMachineText([{ authorId: 'gpt-x', text: 'words' }])).toEqual([]);
    expect(acceptedMachineText([{ authorId: '', text: 'words' }])).toEqual([]);
    expect(acceptedMachineText([{ authorId: 42, text: 'words' }])).toEqual([]);
  });

  it('drops empty, whitespace-only and non-string text', () => {
    expect(acceptedMachineText([{ authorId: 'ana', text: '' }])).toEqual([]);
    expect(acceptedMachineText([{ authorId: 'ana', text: '   \n ' }])).toEqual([]);
    expect(acceptedMachineText([{ authorId: 'ana', text: 7 }])).toEqual([]);
    expect(acceptedMachineText([{ authorId: 'ana' }])).toEqual([]);
  });

  it('returns nothing for anything that is not an array', () => {
    for (const raw of [undefined, null, 'ana', 1, {}, { authorId: 'ana', text: 'x' }]) {
      expect(acceptedMachineText(raw)).toEqual([]);
    }
  });

  /* AUTH, periodic review 2026-09-28, editor family, the batch-draft accept,
     round 4: the check read MACHINE_AUTHOR_IDS[authorId] by truthiness, and
     every object inherits "constructor", "toString" and the rest. So
     "constructor" passed, verified, and was written to the lineage as the
     machine that drafted the words. */
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'])(
    'drops %j, a name every object inherits',
    (authorId) => {
      expect(acceptedMachineText([{ authorId, text: 'The primary endpoint was met.' }])).toEqual([]);
    },
  );

  it('the vocabulary inherits nothing, so no reader of it can be handed a name it does not hold', () => {
    expect(Object.getPrototypeOf(MACHINE_AUTHOR_IDS)).toBeNull();
    expect(Object.isFrozen(MACHINE_AUTHOR_IDS)).toBe(true);
    expect(MACHINE_AUTHOR_IDS.constructor).toBeUndefined();
    expect(machineContributors([{ id: 'constructor' }, { id: 'toString' }])).toEqual([]);
    expect(machineContributors([{ id: 'ana' }])).toEqual([{ id: 'ana', name: 'AnA (AI draft)' }]);
  });

  it('caps the list and drops an entry whose text exceeds the cap rather than truncating it', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ authorId: 'ana', text: `clause ${i}` }));
    expect(acceptedMachineText(many).length).toBe(32);
    const huge = 'x'.repeat(MAX_ACCEPTED_MACHINE_TEXT_CHARS + 1);
    expect(acceptedMachineText([{ authorId: 'ana', text: huge }])).toEqual([]);
    const atCap = 'x'.repeat(MAX_ACCEPTED_MACHINE_TEXT_CHARS);
    expect(acceptedMachineText([{ authorId: 'ana', text: atCap }])).toHaveLength(1);
  });
});

describe('acceptedMachineText carries the turn record the claim names (round 15, SEC-A-7 door 1)', () => {
  /* Why the id has to travel at all: the save door's whole governance problem
     is that `acceptedMachineText` is a CLAIM from the request — "a machine
     wrote these words" — and nothing checks it against the turn record that
     would prove it. `verifyMachineText` exists and does exactly that check,
     and it needs a turn record id per claim. Without one every claim is
     unverifiable by construction, so the save door could only ever strip; the
     verdict that REFUSES a verified claim from an unqualified model could
     never fire.
     The id is available on the client: AnA's suggestion mark carries it as
     `sourceRecord`, and it rides on SuggestionRange. This parser is the server
     boundary it has to cross. */
  const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('keeps a turn record id that is a uuid', () => {
    expect(acceptedMachineText([{ authorId: 'ana', text: 'A drafted clause.', turnRecordId: ID }])).toEqual([
      { authorId: 'ana', text: 'A drafted clause.', turnRecordId: ID },
    ]);
  });

  it('carries null when the claim names no turn, rather than dropping the entry', () => {
    /* An entry with no turn is not a forgery — it is an older bundle, a plain
       paste, or text typed by hand. It must still reach the gate, where it is
       recorded as the person's own words with its reason; dropping it here
       would silently lose the clause instead of attributing it honestly. */
    expect(acceptedMachineText([{ authorId: 'ana', text: 'A drafted clause.' }])).toEqual([
      { authorId: 'ana', text: 'A drafted clause.', turnRecordId: null },
    ]);
  });

  it('drops a malformed id to null instead of passing it to a uuid column', () => {
    /* ana_turn_records.id is uuid: a malformed value raises 22P02 and would
       abort the transaction the save is being written in. The same hazard
       `resolveTurnRecordSources` and `servedModelsForTurn` both guard. */
    for (const bad of ['turn_7', '', '   ', 'not-a-uuid', 123, null, {}, ID + 'x']) {
      const [entry] = acceptedMachineText([{ authorId: 'ana', text: 'A drafted clause.', turnRecordId: bad }]);
      expect(entry, JSON.stringify(bad)).toEqual({ authorId: 'ana', text: 'A drafted clause.', turnRecordId: null });
    }
  });

  it('bounds the id before it is believed, so a long string cannot ride in on it', () => {
    const [entry] = acceptedMachineText([{ authorId: 'ana', text: 'A drafted clause.', turnRecordId: 'x'.repeat(5000) }]);
    expect(entry.turnRecordId).toBeNull();
  });
});
