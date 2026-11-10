/** Quality hosts the one Authoring editor, pinned to its controlled version. */
import * as React from 'react';
import { redactInternals } from '@/lib/queryClient';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import { QmsRequestError, readQmsEditingCopy, type QmsEditingCopy } from './qmsDocuments';
import '../v2/styles/authoring-v2.css';

const DocumentWorkbench = React.lazy(async () => {
  const module = await import('../v2/editor/DocumentWorkbench');
  return { default: module.DocumentWorkbench };
});

export function ControlledDocumentWorkbench({ documentId, onBack, onNavigate, onReadText }: {
  documentId: number; onBack: () => void; onNavigate: (target: string) => void;
  /** Where the controlled text can still be read when the editor cannot open it (a role without an authoring grant,
      a register entry with no editing copy): the personal reader (review C5-3). */
  onReadText?: () => void;
}) {
  const [copy, setCopy] = React.useState<QmsEditingCopy | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<{ status: number; code?: string } | null>(null);
  const generation = React.useRef(0);
  const alive = React.useRef(true);
  const load = React.useCallback(async () => {
    const request = ++generation.current;
    setError(null);
    setFailure(null);
    try {
      const next = await readQmsEditingCopy(documentId);
      if (alive.current && request === generation.current) setCopy(next);
    } catch (err) {
      if (alive.current && request === generation.current) {
        setCopy(null);
        setFailure(err instanceof QmsRequestError ? { status: err.status, code: err.code } : null);
        setError(redactInternals(err instanceof Error ? err.message : '', 'The editing copy could not be read. Try again.'));
      }
    }
  }, [documentId]);
  React.useEffect(() => {
    alive.current = true;
    setCopy(null);
    void load();
    return () => { alive.current = false; generation.current += 1; };
  }, [load]);
  return <div className="qms-workbench">
    {error ? <>
      <button type="button" className="btn ghost small" onClick={onBack}>Back to Quality register</button>
      {/* A refusal (a role, no editing copy) is said without a Try again that cannot change it; its text can still be read. */}
      <ErrorState title="The controlled document could not be opened" message={error}
        retry={failure && (failure.status === 403 || failure.status === 409) ? undefined : () => void load()}
        read={failure ?? undefined} readWhat="this controlled document's editing copy" />
      {onReadText && failure && (failure.status === 403 || failure.status === 409) && (
        <button type="button" className="btn ghost small" onClick={onReadText}>Read its controlled text</button>
      )}
    </> : copy ? <React.Suspense fallback={<div role="status">Loading the document editor…</div>}>
      <DocumentWorkbench docs={[copy.document]} docsState="ready" status="all" programId={copy.programId}
        pinnedDocId={copy.document.id} reloadDocs={load} surfaceActionId={null} consumeDeepLinks={false}
        embedded={{ onBack, backLabel: 'Back to Quality register' }} onNav={onNavigate} onAsk={null} />
    </React.Suspense> : <EmptyState title="Opening the controlled document…" busy />}
  </div>;
}
