import React from 'react';
import { filingLifecycleReferenceFor, filingReferenceFactsFor, type RecordedFilingContext } from '@shared/regulatory/filing-lifecycle-reference';
import { filingAskPrompt } from '@shared/regulatory/filing-catalog';

/** The one authored reference projection shared by intake and recorded Plan.
 * Reference stages never describe this project's progress, deadline or gates. */
export function FilingLifecycleReference({ filingId, recorded, label = 'Filing lifecycle reference' }: {
  filingId: string | null | undefined; recorded?: RecordedFilingContext; label?: string;
}) {
  const reference = filingLifecycleReferenceFor(filingId, recorded);
  return <section className="filing-lifecycle-reference" aria-label={label}
    data-testid={reference ? 'filing-lifecycle-reference' : undefined}>
    {!reference ? <p>No filing lifecycle guide is available for this recorded filing.</p> : <details>
      <summary>Reference guide</summary>
      <p><strong>Authored filing-family guidance.</strong> {reference.loop.label}.</p>
      <p>This is general catalog reference, not this project’s status, deadline or agency commitment. Applicable requirements and timelines need to be checked for the filing and jurisdiction.</p>
      <p>Use recorded agency requirements and correspondence for the steps and dates of your filing. Platform support is stated separately in the filing offer.</p>
      <p><strong>Timing examples:</strong> {reference.loop.clock}</p>
      <ol>{reference.loop.stages.map(stage => <li key={stage}>{stage}</li>)}</ol>
      <p><strong>If it comes back: {reference.loop.ret.label}.</strong> {reference.loop.ret.desc}</p>
    </details>}
  </section>;
}

/** Canonical catalogue metadata remains inspectable even when no guide or
 * platform offer applies. This component has no selection or writer action. */
export function FilingReferenceDetails({ filingId, onAsk, label }: {
  filingId: string; onAsk?: (question: string) => void; label?: string;
}) {
  const reference = filingReferenceFactsFor(filingId);
  if (!reference) return null;
  const { entry, workflowLabel } = reference;
  return <>
    <dl className="filing-reference-facts" data-testid="filing-reference-metadata">
      <div><dt>Authority / region</dt><dd>{entry.agency} · {entry.region}</dd></div>
      <div><dt>Submission format</dt><dd>{entry.submissionFormat && entry.submissionFormat !== '—' ? entry.submissionFormat : 'No standard transmission format'}</dd></div>
      <div><dt>CTD module</dt><dd>{entry.ctdModule && entry.ctdModule !== '—' ? entry.ctdModule : 'Not CTD-structured'}</dd></div>
      <div><dt>Reference workflow family</dt><dd>{workflowLabel || 'No catalogue workflow family recorded'}</dd></div>
    </dl>
    <FilingLifecycleReference filingId={filingId} label={label} />
    {onAsk && <button type="button" className="btn ghost sm" onClick={() => onAsk(filingAskPrompt(entry.displayName))}>Ask AnA</button>}
  </>;
}
