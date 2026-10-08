/**
 * What the save found of a drafted document's figures in the sources it
 * cites (S5a; authoring/draft-figure-check.ts), under the provenance line.
 * A figure no cited source states is named with its section; it is the
 * author's to verify or remove, and nothing here changes the text. Rendered
 * only when a check was recorded: no record is not "all found".
 */
import React from 'react';
import type { FigureCheckSummary } from './provenance';

const SHOWN = 8;

export function DraftFigureLine({ check }: { check: FigureCheckSummary }) {
  if (check.checked === 0) {
    return <div className="ed-provline" data-testid="doc-figure-check">No figures to check against the cited sources.</div>;
  }
  if (check.unverified === 0) {
    return (
      <div className="ed-provline" data-testid="doc-figure-check">
        {`All ${check.found} figure(s) were found in the cited sources when the draft was saved.`}
      </div>
    );
  }
  const items = check.unverifiedItems.slice(0, SHOWN);
  const more = check.unverified - items.length;
  return (
    <div className="ed-provline" data-testid="doc-figure-check" role="note">
      {`${check.unverified} of ${check.checked} figure(s) are not stated in the cited sources; verify or remove them: `}
      {items.map((f, i) => (
        <span key={`${f.section}-${i}`}>
          {i > 0 ? '; ' : ''}
          <strong>{f.text}</strong>{f.section ? ` (${f.section})` : ''}
        </span>
      ))}
      {more > 0 ? `; and ${more} more.` : '.'}
    </div>
  );
}
