/** Quality hosts the one Authoring editor, pinned to its controlled version. */
import * as React from 'react';
import { redactInternals } from '@/lib/queryClient';
import { ErrorState } from '../v2/dataConnect';
import { readQmsEditingCopy, type QmsEditingCopy } from './qmsDocuments';
import '../v2/styles/authoring-v2.css';

const DocumentWorkbench = React.lazy(async () => {
  const module = await import('../v2/editor/DocumentWorkbench');
  return { default: module.DocumentWorkbench };
});

export function ControlledDocumentWorkbench({ documentId, onBack, onNavigate, onAsk }: {
  documentId: number; onBack: () => void; onNavigate: (target: string) => void; onAsk: (text: string) => void;
}) {
  const [copy, setCopy] = React.useState<QmsEditingCopy | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const generation = React.useRef(0);
  const alive = React.useRef(true);
  const load = React.useCallback(async () => {
    const request = ++generation.current;
    setError(null);
    try {
      const next = await readQmsEditingCopy(documentId);
      if (alive.current && request === generation.current) setCopy(next);
    } catch (err) {
      if (alive.current && request === generation.current) {
        setCopy(null);
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
      <button className="qms-btn ghost" onClick={onBack}>Back to Quality register</button>
      <ErrorState title="The controlled document could not be opened" message={error} retry={() => void load()} />
    </> : copy ? <React.Suspense fallback={<div role="status">Loading the document editor…</div>}>
      <DocumentWorkbench docs={[copy.document]} docsState="ready" status="all" programId={copy.programId}
        pinnedDocId={copy.document.id} reloadDocs={load} surfaceActionId={null} consumeDeepLinks={false}
        embedded={{ onBack, backLabel: 'Back to Quality register' }} onNav={onNavigate} onAsk={onAsk} />
    </React.Suspense> : <div className="qms-empty" role="status">Opening the controlled document…</div>}
  </div>;
}
