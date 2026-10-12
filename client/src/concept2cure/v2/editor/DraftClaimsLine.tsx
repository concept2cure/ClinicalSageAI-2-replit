/**
 * What the save found when it set this drafted document's figures against the figures the documents
 * it cites state for the same thing (authoring/section-claims-check.ts), under the provenance line
 * beside the figure line.
 *
 * The figure line says whether a number is in a cited source at all. This says whether it agrees:
 * a section stating an adverse reaction rate of 12.0% while the CSR it cites states 18.0% is the
 * discrepancy a reviewer finds first, and no amount of "the number is present in the source" finds
 * it.
 *
 * What it will not say: that the figures are consistent. Only pairs whose frames are identical are
 * compared, so "no disagreement among the pairs compared" is the strongest true statement, and the
 * count of what was not compared is shown beside it. Rendered only when a check was recorded: no
 * record is not "no conflicts". Nothing here changes the text.
 */
import React from 'react';
import type { ClaimsCheckSummary } from './provenance';

const SHOWN = 6;

export function DraftClaimsLine({ check }: { check: ClaimsCheckSummary }) {
  if (check.compared === 0) {
    return (
      <div className="ed-provline" data-testid="doc-claims-check">
        {check.notCompared > 0
          ? `No figure in this document could be set against a figure of the cited sources: ${check.notCompared} were read but state different things. Nothing was compared.`
          : 'No figure in this document could be set against a figure of the cited sources. Nothing was compared.'}
      </div>
    );
  }
  const tail = `${check.notCompared > 0 ? ` ${check.notCompared} figure(s) state different things and were not compared.` : ''}${
    check.truncated ? ' The record kept fewer entries than it found; more are in the saved record.' : ''
  }`;
  if (check.conflicts === 0) {
    return (
      <div className="ed-provline" data-testid="doc-claims-check">
        {`${check.compared} figure pair(s) were set against the cited sources and none disagree.${tail}`}
      </div>
    );
  }
  const items = check.conflictItems.slice(0, SHOWN);
  const more = check.conflicts - items.length;
  return (
    <div className="ed-provline" data-testid="doc-claims-check" role="note">
      {`${check.conflicts} of ${check.compared} figure pair(s) disagree with the cited sources: `}
      {items.map((c, i) => (
        <span key={`${c.section}-${c.measure}-${i}`}>
          {i > 0 ? '; ' : ''}
          <strong>{c.sectionValue}</strong>
          {' here vs '}
          <strong>{c.sourceValue}</strong>
          {' in the source'}
          {c.section ? ` (${c.section}` : ''}
          {c.section && c.arm ? `, ${c.arm}` : c.arm ? ` (${c.arm}` : ''}
          {c.section || c.arm ? ')' : ''}
        </span>
      ))}
      {more > 0 ? `; and ${more} more.` : '.'}
      {tail}
    </div>
  );
}
