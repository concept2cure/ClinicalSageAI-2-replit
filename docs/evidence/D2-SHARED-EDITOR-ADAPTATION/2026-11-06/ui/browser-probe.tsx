import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/authoring-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';
import { DocumentWorkbench, type EditorBridge } from '../../../../../client/src/concept2cure/v2/editor/DocumentWorkbench';
import { DocumentCanvas } from '../../../../../client/src/concept2cure/v2/editor/DocumentCanvas';
import { SourceImportDialog } from '../../../../../client/src/concept2cure/v2/editor/SourceImportDialog';
import { AuthProvider, authService } from '../../../../../client/src/services/portal/authService';
import { publishShellProject } from '../../../../../client/src/concept2cure/v2/shellProject';
import { setEditorTarget } from '../../../../../client/src/concept2cure/v2/editorTarget';
import { bearer, chosenDoc, filing, projectFor, projectTypeFor, scopeDocs } from './browser-fixtures.mjs';

declare global {
  interface Window {
    adaptationChoose: (kind: string) => void;
    adaptationBridge: { docId: string | null; sectionId: string | null; editable: boolean } | null;
  }
}
const query = new URLSearchParams(window.location.search), kind = query.get('kind') || 'cer';
const projectId = projectFor(kind), handoff = query.get('handoff') === 'true', artifact = query.get('artifact');
await authService.adoptSession(bearer());
publishShellProject({ id: projectId, title: 'Synthetic selected project', productType: projectTypeFor(kind) });
window.adaptationBridge = null;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const noOperation = () => {};
const noReload = async () => {};

function Probe() {
  const [selected, setSelected] = useState(kind);
  const [mounted, setMounted] = useState(!handoff && !artifact);
  const [expanded, setExpanded] = useState(true);
  const [importVisible, setImportVisible] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const scopedDocs = useMemo(() => scopeDocs(projectId), []);
  useEffect(() => { window.adaptationChoose = setSelected; }, []);
  const bridge = useCallback((value: EditorBridge | null) => {
    window.adaptationBridge = value ? { docId: value.docId, sectionId: value.sectionId ?? null, editable: value.editable } : null;
  }, []);
  const canvasBridge = useCallback((_docId: string, value: EditorBridge | null) => bridge(value), [bridge]);
  const openHandoff = () => {
    const selectedFiling = filing[kind];
    setEditorTarget({ docType: selectedFiling.doc_type, programId: projectId,
      ...(query.get('whole') === 'true' ? { filingDocumentId: selectedFiling.id } : { code: selectedFiling.code, label: selectedFiling.label }) });
    setMounted(true);
  };
  const canvasId = imported ?? chosenDoc(selected).id;
  return <div className="c2c-v2" data-theme="light" style={{ minHeight: '100vh' }}>
    <div style={{ padding: 8, fontSize: 11 }}>Synthetic qualification · actual shared editor · intercepted records · no production write or live acceptance</div>
    {handoff && !mounted && <button type="button" onClick={openHandoff}>Open existing {kind.toUpperCase()} in shared editor</button>}
    {artifact && !importVisible && !imported && <button type="button" onClick={() => setImportVisible(true)}>Inspect saved artifact in existing import dialog</button>}
    {importVisible && <SourceImportDialog programId={projectId} programName="Synthetic selected project"
      source={{ kind: 'artifact', artifactId: 'CER-synthetic-retained-44', version: 3 }} title="Retained CER artifact"
      onClose={() => setImportVisible(false)} onOpenDocument={docId => { setImported(docId); setMounted(true); }} />}
    {mounted && (query.get('host') === 'canvas' || imported
      ? <DocumentCanvas docId={canvasId} programId={projectId} conversationId={null} fromThisConversation={false}
          expanded={expanded} onExpandedChange={setExpanded} onNav={noOperation} onAsk={noOperation} fireToast={noOperation}
          cardless onEditorBridge={canvasBridge} />
      : <main className="dcv-workbench" aria-label="Actual shared workbench with intercepted records">
          <DocumentWorkbench docs={scopedDocs} docsState="ready" status="all" reloadDocs={noReload} programId={projectId}
            pinnedDocId={handoff ? null : chosenDoc(selected).id} consumeDeepLinks={handoff} onNav={noOperation}
            embedded={{ onBack: noOperation, hostShowsBack: true, onEditorBridge: bridge }} />
        </main>)}
  </div>;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
