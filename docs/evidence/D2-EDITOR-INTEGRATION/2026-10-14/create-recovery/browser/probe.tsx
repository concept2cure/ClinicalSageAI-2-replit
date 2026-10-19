import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../../../design-system/colors_and_type.css';
import '../../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/authoring-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';
import { DocumentWorkbench, type EditorBridge } from '../../../../../../client/src/concept2cure/v2/editor/DocumentWorkbench';
import { AuthoringCreateExport } from '../../../../../../client/src/concept2cure/v2/surfaces/AuthoringCreateExport';
import { AuthProvider } from '../../../../../../client/src/services/portal/authService';
import { publishShellProject } from '../../../../../../client/src/concept2cure/v2/shellProject';
import { peekEditorTarget } from '../../../../../../client/src/concept2cure/v2/editorTarget';
import records from './records.json';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const mode = params.get('mode');
const fixtureWindow = window as any;
fixtureWindow.creationToasts = [];
fixtureWindow.creationReceipts = [];
fixtureWindow.creationChecks = [];
fixtureWindow.creationNavigation = [];
publishShellProject({ id: mode === 'held' ? records.otherProgram : records.program.id,
  title: records.program.name, productType: 'drug' });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Probe() {
  const [docs, setDocs] = useState([records.document]);
  const [status, setStatus] = useState('all');
  const [noticeContainer, setNoticeContainer] = useState<HTMLDivElement | null>(null);
  const reloadDocs = useCallback(async () => {
    const response = await fetch(`/api/authoring/docs?status=all&programId=${records.program.id}`);
    const body = await response.json();
    if (!response.ok || !Array.isArray(body.documents)) throw new Error('Synthetic list refresh failed');
    setDocs(body.documents);
  }, []);
  const bridge = useCallback((value: EditorBridge | null) => {
    fixtureWindow.creationBridge = value ? { docId: value.docId, sectionId: value.sectionId, editable: value.editable } : null;
  }, []);
  const fireToast = useCallback((message: string, tone?: string) => {
    fixtureWindow.creationToasts.push({ message, tone });
  }, []);
  const navigate = useCallback((id: string) => {
    fixtureWindow.creationNavigation.push({ route: id, target: peekEditorTarget() });
  }, []);
  const workbench = mode === 'workbench';
  return <div data-theme={theme} className={`c2c-v2 ${theme === 'dark' ? 'dark' : ''}`}
    style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
    <main aria-label="Existing authoring creation recovery evaluation" style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {workbench ? <DocumentWorkbench docs={docs} docsState="ready" status={status} onStatusChange={setStatus}
        reloadDocs={reloadDocs} programId={records.program.id} pinnedDocId={records.document.id}
        onNav={navigate} surfaceActionId={null} embedded={{ onBack: () => {}, hostShowsBack: true, onEditorBridge: bridge }} />
        : <div className="ed-doc" style={{ width: '100%', height: '100%' }}><div className="ed-doc-h"><div className="ed-doc-actions"><AuthoringCreateExport docId={records.document.id}
          docTitle={records.document.title} docStatus="DRAFT" module="M3" programId={records.program.id}
          programSwitchHeld={mode === 'held'} fireToast={fireToast} noticeContainer={noticeContainer}
          onDocCreated={document => fixtureWindow.creationReceipts.push({ kind: 'document', ...document })}
          onSectionCreated={section => fixtureWindow.creationReceipts.push({ kind: 'section', ...section })}
          onCheckCreation={kind => fixtureWindow.creationChecks.push(kind)} /></div></div><div ref={setNoticeContainer} /></div>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
