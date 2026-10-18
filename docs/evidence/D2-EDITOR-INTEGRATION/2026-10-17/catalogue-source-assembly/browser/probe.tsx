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
import { ProjectHome } from '../../../../../../client/src/concept2cure/v2/surfaces/ProjectHome';
import { UI_SURFACES } from '../../../../../../shared/constants/ui-surface-registry';
import { AuthProvider, authService } from '../../../../../../client/src/services/portal/authService';
import { publishShellProject } from '../../../../../../client/src/concept2cure/v2/shellProject';
import { peekEditorTarget } from '../../../../../../client/src/concept2cure/v2/editorTarget';
import { DOC, PROGRAM, documentRow, program } from './mock-api.mjs';

declare global {
  interface Window {
    assemblyNavigation: Array<{ route: string; target: ReturnType<typeof peekEditorTarget> }>;
    assemblyBridge: { docId: string | null; sectionId: string | null; editable: boolean } | null;
    sourceAssemblyVisit: (programId: string) => void;
  }
}
const theme = new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light';
window.assemblyNavigation = [];
window.assemblyBridge = null;
await authService.adoptSession('synthetic-assembly-browser-session');
publishShellProject({ id: PROGRAM, title: program.name, productType: 'drug' });
// The fixture exposes the actual shell-project publisher at its host boundary.
window.sourceAssemblyVisit = programId => publishShellProject({ id: programId,
  title: programId === PROGRAM ? program.name : 'Synthetic other project', productType: 'drug' });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Probe() {
  const [host, setHost] = useState<'catalogue' | 'editor'>('catalogue');
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
  const navigate = useCallback((route: string) => {
    window.assemblyNavigation.push({ route, target: peekEditorTarget() });
    if (route === 'document-authoring') setHost('editor');
  }, []);
  const projectSurface = UI_SURFACES.find(row => row.id === 'project-home');
  if (!projectSurface) throw new Error('Canonical project registry entry is unavailable');
  return <div data-theme={theme} className={`c2c-v2 ${theme === 'dark' ? 'dark' : ''}`}
    style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
    {host === 'catalogue' ? <main className="page" aria-label="Actual project source catalogue with synthetic HTTP" style={{ height: '100%', overflowY: 'auto' }}>
      <div className="page-inner"><ProjectHome surface={projectSurface} segment="biopharma" onAsk={() => {}} onNav={navigate} /></div>
    </main> : <main className="dcv-workbench" aria-label="Actual existing editor with synthetic assembly API" style={{ height: '100%' }}>
      <DocumentWorkbench docs={docs} docsState="ready" status={status} onStatusChange={setStatus}
        reloadDocs={reloadDocs} programId={PROGRAM} pinnedDocId={DOC} surfaceActionId={null} consumeDeepLinks
        onNav={navigate}
        embedded={{ onBack: () => {}, hostShowsBack: true, onEditorBridge: bridge }} />
    </main>}
  </div>;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
