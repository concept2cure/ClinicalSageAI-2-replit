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
import { AuthProvider, authService } from '../../../../../../client/src/services/portal/authService';
import { publishShellProject } from '../../../../../../client/src/concept2cure/v2/shellProject';
import { peekEditorTarget } from '../../../../../../client/src/concept2cure/v2/editorTarget';
import { DOC, PROGRAM, documentRow, program } from './mock-api.mjs';

declare global {
  interface Window {
    assemblyNavigation: Array<{ route: string; target: ReturnType<typeof peekEditorTarget> }>;
    assemblyBridge: { docId: string | null; sectionId: string | null; editable: boolean } | null;
  }
}
const theme = new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light';
window.assemblyNavigation = [];
window.assemblyBridge = null;
await authService.adoptSession('synthetic-assembly-browser-session');
publishShellProject({ id: PROGRAM, title: program.name, productType: 'drug' });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Probe() {
  const [docs, setDocs] = useState([documentRow]);
  const [status, setStatus] = useState('all');
  const reloadDocs = useCallback(async () => {
    const response = await fetch(`/api/authoring/docs?status=all&programId=${PROGRAM}`);
    const body = await response.json();
    if (!response.ok || !Array.isArray(body.documents)) throw new Error('Synthetic list refresh failed');
    setDocs(body.documents);
  }, []);
  const bridge = useCallback((value: EditorBridge | null) => {
    window.assemblyBridge = value ? { docId: value.docId, sectionId: value.sectionId ?? null, editable: value.editable } : null;
  }, []);
  return <div data-theme={theme} className={`c2c-v2 ${theme === 'dark' ? 'dark' : ''}`}
    style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
    <main className="dcv-workbench" aria-label="Actual existing editor with synthetic assembly API" style={{ height: '100%' }}>
      <DocumentWorkbench docs={docs} docsState="ready" status={status} onStatusChange={setStatus}
        reloadDocs={reloadDocs} programId={PROGRAM} pinnedDocId={DOC} surfaceActionId={null}
        onNav={route => window.assemblyNavigation.push({ route, target: peekEditorTarget() })}
        embedded={{ onBack: () => {}, hostShowsBack: true, onEditorBridge: bridge }} />
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
