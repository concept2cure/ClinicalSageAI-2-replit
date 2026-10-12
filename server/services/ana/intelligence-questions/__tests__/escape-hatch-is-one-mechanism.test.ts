/**
 * One mechanism for "the list does not describe my position", across every
 * flow (founder's directive, 2026-10-12).
 *
 * Before this, 64 questions across 17 flows offered a hand-written
 * `{ value: 'other', label: 'Other' }`. Choosing it recorded the string
 * "other": what the person actually meant was never captured, and a document
 * drafted from the interview carried an answer that said nothing. One of them
 * read "Other (describe in notes)" for a field with no notes. Every other
 * question had no escape at all, so an unlisted position could only be entered
 * by picking one that was wrong.
 *
 * They now declare `allowOther`, and the engine keeps the person's words apart
 * from the positions AnA offered (own-position.test.ts). This file holds the
 * line: a flow may not grow a new hand-rolled hatch, and a predicate may not
 * key on the old value, which would read as a condition that can never be met.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { OTHER_POSITION } from '@shared/types/intelligence-questions';

const FLOWS = join(__dirname, '..', 'flows');

/**
 * The one hand-rolled hatch left, with its reason.
 *
 * `cmc-specification.ts` `molecule_type` pairs its option with a bespoke
 * `molecule_type_other` field, and `server/services/cmc/interview-commit.ts`
 * maps that field id onto a CMC record
 * (`substance_classification.molecule_type_other`). Moving it onto
 * `allowOther` would change that mapping's input, which belongs to the CMC
 * lane, so it is left whole and named here instead of being quietly rewired.
 * This list may only shrink.
 */
const BASELINE: Readonly<Record<string, number>> = { 'cmc-specification.ts': 1 };

function flowFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) flowFiles(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

/** Lines that offer an escape hatch as if it were a position. A predicate is not one. */
function handRolledHatches(source: string): string[] {
  return source
    .split('\n')
    .filter(line => /value:\s*'other'/.test(line) && !/operator:/.test(line))
    .map(line => line.trim());
}

describe('the escape hatch is one mechanism', () => {
  const files = flowFiles(FLOWS);

  it('reads every flow (a scan that matches nothing proves nothing)', () => {
    expect(files.length).toBeGreaterThan(15);
    expect(files.some(f => f.endsWith('device-510k.ts'))).toBe(true);
    expect(files.some(f => f.endsWith('ind-submission.ts'))).toBe(true);
  });

  it('no flow offers a hand-rolled escape hatch, beyond the one named exception', () => {
    const found: Record<string, number> = {};
    for (const file of files) {
      const hits = handRolledHatches(readFileSync(file, 'utf8'));
      if (hits.length > 0) found[file.split('/').pop()!] = hits.length;
    }
    expect(found).toEqual(BASELINE);
  });

  it('every question that takes an unlisted position declares it', () => {
    // allowOther is how it is declared; this holds that the migration landed
    // rather than simply deleting the hatches.
    const declared = files.reduce(
      (n, f) => n + (readFileSync(f, 'utf8').match(/allowOther:/g) ?? []).length,
      0,
    );
    expect(declared).toBeGreaterThanOrEqual(60);
  });

  it('no predicate keys on the old value, which could never be met again', () => {
    const stale: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        if (/operator:/.test(line) && /value:\s*'other'/.test(line)) {
          // The baselined pair keeps its own value, so its predicate is correct.
          if (file.endsWith('cmc-specification.ts')) continue;
          stale.push(`${file.split('/').pop()}: ${line.trim()}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });

  it('no listed position may use the value the engine reserves for an unlisted one', () => {
    const clashes: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (source.includes(`value: '${OTHER_POSITION}'`)) clashes.push(file);
    }
    expect(clashes).toEqual([]);
  });
});
