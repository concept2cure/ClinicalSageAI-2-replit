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

  it('caps the list and drops an entry whose text exceeds the cap rather than truncating it', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ authorId: 'ana', text: `clause ${i}` }));
    expect(acceptedMachineText(many).length).toBe(32);
    const huge = 'x'.repeat(MAX_ACCEPTED_MACHINE_TEXT_CHARS + 1);
    expect(acceptedMachineText([{ authorId: 'ana', text: huge }])).toEqual([]);
    const atCap = 'x'.repeat(MAX_ACCEPTED_MACHINE_TEXT_CHARS);
    expect(acceptedMachineText([{ authorId: 'ana', text: atCap }])).toHaveLength(1);
  });
});
