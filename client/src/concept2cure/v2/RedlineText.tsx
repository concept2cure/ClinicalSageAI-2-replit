/**
 * A redline — two texts rendered as one, with what was removed struck through
 * and what replaced it marked as inserted.
 *
 * The diff itself belongs to `editor/textDiff` (`diffStoredContent`, word-level
 * over visible text). What lives here is the RENDERING, because more than one
 * surface needs it and they must not disagree about it: a reviewer comparing an
 * authoring revision and a reviewer comparing the agency's proposed label
 * wording are doing the same reading, and a redline whose colours or semantics
 * shift between the two is a redline you have to re-learn per screen.
 *
 * `<ins>`/`<del>` rather than styled spans on purpose — the change is carried
 * in the markup, so it survives copy-paste into an email and is announced by a
 * screen reader without depending on colour. Colour is never the only signal
 * (strike-through and underline carry it too).
 *
 * @module client/src/concept2cure/v2/RedlineText
 */

import React, { useMemo } from 'react';
import { diffStoredContent, type DiffSegment } from './editor/textDiff';
import './styles/redline.css';

export function RedlineText({
  previous,
  current,
  identicalNote = 'The two texts read identically — only markup or formatting differs.',
  label = 'Redline',
}: {
  /** The earlier text — what is being changed FROM. */
  previous: string;
  /** The later text — what is being changed TO. */
  current: string;
  /** Shown when the two read the same after markup normalisation. */
  identicalNote?: string;
  /** Accessible name for the redline body. */
  label?: string;
}) {
  const segments = useMemo<DiffSegment[]>(
    () => diffStoredContent(previous ?? '', current ?? ''),
    [previous, current],
  );

  if (segments.length === 0) {
    return <p className="rdl-note">{identicalNote}</p>;
  }

  return (
    <>
      <p className="rdl-body" aria-label={label}>
        {segments.map((s, i) =>
          s.kind === 'same' ? (
            <span key={i}>{s.text}</span>
          ) : s.kind === 'added' ? (
            <ins key={i} className="rdl-ins">{s.text}</ins>
          ) : (
            <del key={i} className="rdl-del">{s.text}</del>
          ),
        )}
      </p>
    </>
  );
}
