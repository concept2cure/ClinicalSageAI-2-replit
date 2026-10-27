import React from 'react';
import { filingLifecycleReferenceFor, type RecordedFilingContext } from '@shared/regulatory/filing-lifecycle-reference';

/** The catalogue's existing authored guide, reached beside the selected filing. */
export function FilingLifecycleReference({ filingId, recorded, label = 'Filing lifecycle reference' }: {
  filingId: string | null | undefined; recorded?: RecordedFilingContext; label?: string;
}) {
  const reference = filingLifecycleReferenceFor(filingId, recorded);
  return <section className="filing-lifecycle-reference" aria-label={label}>
    {!reference ? <p>No filing lifecycle guide is available for this recorded filing.</p> : <details>
      <summary>Reference guide</summary>
      <p><strong>Authored filing-family guidance.</strong> {reference.loop.label}.</p>
      <p>Use recorded agency requirements and correspondence for the steps and dates of your filing. Platform support is stated separately in the filing offer.</p>
      <p><strong>Timing examples:</strong> {reference.loop.clock}</p>
      <ol>{reference.loop.stages.map(stage => <li key={stage}>{stage}</li>)}</ol>
      <p><strong>If it comes back: {reference.loop.ret.label}.</strong> {reference.loop.ret.desc}</p>
    </details>}
  </section>;
}
