/**
 * Word-level diff between two stored section contents, for the history rail.
 *
 * `doc_revisions` is an append-only ledger of full contents; until this
 * existed the rail showed each revision's first 400 characters, so "what
 * changed between these two saves" required reading both in full and
 * comparing by eye. The `diff` dependency sat in package.json with zero
 * importers.
 *
 * Comparison happens over the VISIBLE TEXT of each revision (HTML stripped
 * the same way for both sides) — the record's words, not its markup, are
 * what a reviewer needs to see move.
 */

import { diffWordsWithSpace } from 'diff';
import { htmlVisibleText, looksLikeHtml } from './roundTrip';

export interface DiffSegment {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

function visibleText(stored: string): string {
  const text = looksLikeHtml(stored) ? htmlVisibleText(stored) : stored;
  // Collapse runs of blank space so markup normalization (e.g. a <div>
  // becoming a <p> between generations) does not read as a change.
  return text.replace(/\s+/g, ' ').trim();
}

/** A stored section as the words a reader sees, for a card in the Versions rail: markup removed, blank
 *  space collapsed, at most `max` characters. The rail printed the stored HTML as text, tags and
 *  comment-anchor attributes included (S12's sweep, 2026-11-09). */
export function revisionPreviewText(stored: string | null | undefined, max = 400): string {
  return visibleText(stored ?? '').slice(0, max);
}

/** Segments describing how `prev` became `next`. Empty when identical. */
export function diffStoredContent(prev: string, next: string): DiffSegment[] {
  const a = visibleText(prev ?? '');
  const b = visibleText(next ?? '');
  if (a === b) return [];
  return diffWordsWithSpace(a, b).map((part) => ({
    kind: part.added ? 'added' : part.removed ? 'removed' : 'same',
    text: part.value,
  }));
}

/** True when two stored contents read identically (markup-only drift). */
export function contentsReadIdentically(prev: string, next: string): boolean {
  return visibleText(prev ?? '') === visibleText(next ?? '');
}
