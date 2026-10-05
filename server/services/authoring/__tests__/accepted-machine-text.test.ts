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
    expect(acceptedMachineText([{ authorId: 'ana', text: 'The primary endpoint was met.' }])).toEqual([
      { authorId: 'ana', text: 'The primary endpoint was met.' },
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
