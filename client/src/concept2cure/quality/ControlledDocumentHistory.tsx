/** Read-only signed snapshots. Content rendering stays in Authoring's renderer. */
import * as React from 'react';
import { redactInternals } from '@/lib/queryClient';
import { EmptyState, ErrorState, type FailedRead } from '../v2/dataConnect';
import { DialogPanel, failedReadOf } from './ControlledDocumentDialogs';
import { formatDate, type QmsDoc } from './data';
import { readQmsSignedVersions, type QmsSignedVersion, type QmsVersionStanding } from './qmsDocuments';

/** The version's standing in words; nothing when the server did not say. */
export function standingLine(standing: QmsVersionStanding | undefined): string | null {
  switch (standing?.state) {
    case 'in-force': return standing.effectiveFrom ? `In force since ${formatDate(standing.effectiveFrom)}` : 'In force';
    case 'pending-effective': return `Approved, effective from ${formatDate(standing.effectiveFrom)}`;
    case 'superseded': return `Superseded by version ${standing.by}${standing.from ? ` from ${formatDate(standing.from)}` : ''}`;
    case 'retired': return standing.at ? `Retired ${formatDate(standing.at)}` : 'Retired';
    case 'not-in-force': return 'Not in force';
    default: return null;
  }
}
const AuthoredHtml = React.lazy(async () => {
  const module = await import('../v2/editor/AuthoredHtml');
  return { default: module.AuthoredHtml };
});

export function ControlledDocumentHistory({ document, onClose }: { document: QmsDoc; onClose: () => void }) {
  const [versions, setVersions] = React.useState<QmsSignedVersion[] | null>(null);
  const [error, setError] = React.useState<{ message: string; read: FailedRead } | null>(null);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    setError(null); setVersions(null);
    void readQmsSignedVersions(document.id).then(rows => { if (!cancelled) setVersions(rows); }).catch(err => {
      if (!cancelled) setError({ message: redactInternals(err instanceof Error ? err.message : '', 'The signed version history could not be read. Try again.'), read: failedReadOf(err) });
    });
    return () => { cancelled = true; };
  }, [document.id, retry]);
  return <DialogPanel title={`Version history of ${document.docNumber}`} busy={false} onClose={onClose}
    sub={`${document.title}. Retained signed versions and earlier registry records are read-only; revisions use a separate draft.`}>
    {error ? <ErrorState title="The signed version history could not be read" message={error.message} read={error.read} readWhat="this document's version history"
      retry={() => setRetry(n => n + 1)} testId="qms-history-failed" /> :
      versions === null ? <EmptyState title="Loading document versions…" busy /> :
      versions.length === 0 ? <p>No document versions recorded yet.</p> : versions.map((version, index) => (
        <details key={`${version.version}:${version.approved_at}`} open={index === 0} className="qms-signed-version">
          <summary>
            Version {version.version} · {version.record_kind === 'legacy-registry' ? 'earlier registry record' : `approved ${formatDate(version.approved_at)}`}
            {standingLine(version.standing) && <> · <span data-testid="qms-version-standing">{standingLine(version.standing)}</span></>}
          </summary>
          {version.record_kind === 'legacy-registry' && <p>No authored content was recorded for this earlier registry version. Its former register record is retained.</p>}
          <React.Suspense fallback={<p role="status">Loading the saved content…</p>}>
            {version.sections.map(section => <section key={section.id}>
              <h3>{section.code} {section.title}</h3><AuthoredHtml html={section.content} />
            </section>)}
          </React.Suspense>
        </details>
      ))}
  </DialogPanel>;
}
