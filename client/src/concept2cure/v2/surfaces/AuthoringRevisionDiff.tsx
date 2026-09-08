/**
 * The history rail's visual diff — what a revision changed, rendered as a
 * redline against the revision before it (or against nothing for the first).
 *
 * Until this existed the rail listed each revision as a 400-character excerpt
 * of its full content: an author reviewing history saw every prior state and
 * never what changed between any two of them.
 *
 * The diff is computed client-side from the two stored contents already in the
 * rail's state — nothing is fetched, nothing is inferred server-side, and a
 * markup-only difference (the same words re-serialized by a newer editor) is
 * reported as exactly that rather than as a wall of false changes.
 */

import React, { useState } from 'react';
import { RedlineText } from '../RedlineText';
import '../styles/redline.css';

export function AuthoringRevisionDiff({
  current,
  previous,
}: {
  /** The revision being inspected. */
  current: string;
  /** The revision immediately before it — '' when this is the first. */
  previous: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rvd">
      <button type="button" className="nda-open" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Hide changes' : 'What changed'}
      </button>
      {open && (
        <RedlineText
          previous={previous}
          current={current}
          identicalNote="The text reads identically to the previous revision — only markup or formatting moved."
          label="Changes against the previous revision"
        />
      )}
    </div>
  );
}
