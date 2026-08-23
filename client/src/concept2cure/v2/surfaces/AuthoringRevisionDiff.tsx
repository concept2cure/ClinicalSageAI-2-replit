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

import React, { useMemo, useState } from 'react';
import { diffStoredContent, type DiffSegment } from '../editor/textDiff';

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
  const segments = useMemo<DiffSegment[] | null>(
    () => (open ? diffStoredContent(previous, current) : null),
    [open, previous, current],
  );

  return (
    <div className="rvd">
      <button type="button" className="nda-open" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Hide changes' : 'What changed'}
      </button>
      {open && segments != null && (
        segments.length === 0 ? (
          <p className="rvd-note">
            The text reads identically to the previous revision — only markup
            or formatting moved.
          </p>
        ) : (
          <p className="rvd-body" aria-label="Changes against the previous revision">
            {segments.map((s, i) =>
              s.kind === 'same' ? (
                <span key={i}>{s.text}</span>
              ) : s.kind === 'added' ? (
                <ins key={i} className="rvd-ins">{s.text}</ins>
              ) : (
                <del key={i} className="rvd-del">{s.text}</del>
              ),
            )}
          </p>
        )
      )}
      <style>{`
        .rvd { margin-top: 4px; }
        .rvd-note { font-size: 11px; color: var(--text-400,#667085); margin: 6px 0 0; }
        .rvd-body { font-size: 12px; line-height: 1.7; margin: 6px 0 0; max-height: 220px; overflow-y: auto; white-space: pre-wrap; }
        .rvd-ins { background: color-mix(in srgb, var(--success,#067647) 14%, transparent); text-decoration: none; color: var(--success,#067647); }
        .rvd-del { background: color-mix(in srgb, var(--error,#b42318) 12%, transparent); text-decoration: line-through; color: var(--error,#b42318); }
      `}</style>
    </div>
  );
}
