/** Read-only signed snapshots. Content rendering stays in Authoring's renderer. */
import * as React from 'react';
import { redactInternals } from '@/lib/queryClient';
import { DialogPanel } from './ControlledDocumentDialogs';
import { formatDate, type QmsDoc } from './data';
import { readQmsSignedVersions, type QmsSignedVersion } from './qmsDocuments';
const AuthoredHtml = React.lazy(async () => {
  const module = await import('../v2/editor/AuthoredHtml');
  return { default: module.AuthoredHtml };
});

export function ControlledDocumentHistory({ document, onClose }: { document: QmsDoc; onClose: () => void }) {
  const [versions, setVersions] = React.useState<QmsSignedVersion[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    setError(null); setVersions(null);
    void readQmsSignedVersions(document.id).then(rows => { if (!cancelled) setVersions(rows); }).catch(err => {
      if (!cancelled) setError(redactInternals(err instanceof Error ? err.message : '', 'The signed version history could not be read. Try again.'));
    });
    return () => { cancelled = true; };
  }, [document.id, retry]);
  return <DialogPanel title={`Version history of ${document.docNumber}`} busy={false} onClose={onClose}>
    <p>{document.title}. Retained signed versions and earlier registry records are read-only; revisions use a separate draft.</p>
    {error ? <div role="alert">{error} <button className="qms-btn ghost" onClick={() => setRetry(n => n + 1)}>Try again</button></div> :
      versions === null ? <p role="status">Loading document versions…</p> :
      versions.length === 0 ? <p>No document versions recorded yet.</p> : versions.map((version, index) => (
        <details key={`${version.version}:${version.approved_at}`} open={index === 0} className="qms-signed-version">
          <summary>Version {version.version} · {version.record_kind === 'legacy-registry' ? 'earlier registry record' : `approved ${formatDate(version.approved_at)}`}</summary>
          {version.record_kind === 'legacy-registry' && <p>No authored content was recorded for this earlier registry version. Its former register record is retained.</p>}
          <React.Suspense fallback={<p role="status">Loading the saved content…</p>}>
            {version.sections.map(section => <section key={section.id}>
              <h3>{section.code} {section.title}</h3><AuthoredHtml html={section.content} />
            </section>)}
          </React.Suspense>
        </details>
      ))}
    <div className="qms-dialog-actions"><button className="qms-btn ghost" onClick={onClose}>Close</button></div>
  </DialogPanel>;
}
