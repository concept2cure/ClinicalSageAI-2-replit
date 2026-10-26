import React from 'react';
import { filingLifecycleReference } from '@shared/regulatory/filing-lifecycle-reference';
import { filingAskPrompt } from '@shared/regulatory/filing-catalog';

/** One read-only projection shared by intake and the recorded project's Plan.
 * Reference stages are never presented as this project's progress or gates. */
export function FilingLifecycleReference({ filingId }: { filingId?: string | null }) {
  const reference = filingLifecycleReference(filingId);
  if (!reference) return null;
  const { entry, loop } = reference;
  if (!loop) return <p className="rpk-result-note">No lifecycle reference is authored for {entry.displayName}.</p>;
  return <section className="rpk-result-note" data-testid="filing-lifecycle-reference" aria-label={`Lifecycle reference for ${entry.displayName}`}>
    <h3>Authored lifecycle reference</h3>
    <p>{entry.displayName} · {loop.label}</p>
    <p>This is general catalog reference, not this project’s status, deadline or agency commitment. Applicable requirements and timelines need to be checked for the filing and jurisdiction.</p>
    <p><strong>Reference review clock.</strong> {loop.clock}</p>
    <ol>{loop.stages.map(stage => <li key={stage}>{stage}</li>)}</ol>
    <p><strong>If it comes back: {loop.ret.label}.</strong> {loop.ret.desc}</p>
  </section>;
}

export function FilingReferenceDetails({ filingId, onAsk }: { filingId: string; onAsk?: (question: string) => void }) {
  const reference = filingLifecycleReference(filingId);
  if (!reference) return null;
  const { entry, workflowLabel } = reference;
  return <>
    <dl data-testid="filing-reference-metadata">
      <dt>Authority / region</dt><dd>{entry.agency} · {entry.region}</dd>
      <dt>Submission format</dt><dd>{entry.submissionFormat && entry.submissionFormat !== '—' ? entry.submissionFormat : 'No standard transmission format'}</dd>
      <dt>CTD module</dt><dd>{entry.ctdModule && entry.ctdModule !== '—' ? entry.ctdModule : 'Not CTD-structured'}</dd>
      <dt>Reference workflow</dt><dd>{workflowLabel}</dd>
    </dl>
    <FilingLifecycleReference filingId={filingId} />
    {onAsk && <button type="button" className="btn ghost sm" onClick={() => onAsk(filingAskPrompt(entry.displayName))}>Ask AnA</button>}
  </>;
}
