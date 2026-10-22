import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../../../design-system/colors_and_type.css';
import '../../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/authoring-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';
import { DocumentCanvas } from '../../../../../../client/src/concept2cure/v2/editor/DocumentCanvas';
import type { EditorBridge } from '../../../../../../client/src/concept2cure/v2/editor/DocumentWorkbench';
import type { AskOrigin } from '../../../../../../client/src/concept2cure/v2/editor/askAnaToDraft';
import { AuthoringCreateExport } from '../../../../../../client/src/concept2cure/v2/surfaces/AuthoringCreateExport';
import { AuthProvider } from '../../../../../../client/src/services/portal/authService';
import { publishShellProject } from '../../../../../../client/src/concept2cure/v2/shellProject';
import snapshot from './api-contract.json';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const mobile = window.innerWidth < 800;
const fixtureWindow = window as any;
fixtureWindow.templateAsks = [];
fixtureWindow.templateToasts = [];
publishShellProject({ id: snapshot.program.id, title: snapshot.program.name, productType: 'drug' });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Probe() {
  const [docId, setDocId] = useState<string | null>(null);
  const [opened, setOpened] = useState(true);
  const [savedExample, setSavedExample] = useState(false);
  const [paneEl, setPaneEl] = useState<HTMLDivElement | null>(null);
  const onBridge = useCallback((_id: string, bridge: EditorBridge | null) => {
    fixtureWindow.templateBridge = bridge ? { docId: bridge.docId, sectionId: bridge.sectionId,
      viewMode: bridge.viewMode, editable: bridge.editable } : null;
  }, []);
  const fireToast = useCallback((message: string) => fixtureWindow.templateToasts.push(message), []);
  const onAsk = useCallback((text: string, origin?: AskOrigin) => {
    fixtureWindow.templateAsks.push({ prefill: text, origin, sendOnArrival: false });
  }, []);
  useEffect(() => {
    // Evaluation-only lifecycle: the next GET is an explicitly synthetic saved
    // reading example. This is not an editor save or persistence assertion.
    fixtureWindow.loadSyntheticSavedExample = () => setSavedExample(true);
    return () => { delete fixtureWindow.loadSyntheticSavedExample; };
  }, []);
  return <div data-theme={theme} className={`c2c-v2 ${theme === 'dark' ? 'dark' : ''}`}
    style={{ minHeight: '100vh', height: mobile ? 'auto' : '100vh', overflow: mobile ? 'visible' : 'hidden' }}>
    <main aria-label="Regional biotech template browser evaluation" style={{ display: 'flex', height: mobile ? 'auto' : '100%', minHeight: 0 }}>
      {!docId && <AuthoringCreateExport docId={null} docTitle={null} module="M1" fireToast={fireToast}
        onDocCreated={document => setDocId(document.id)} onSectionCreated={() => {}} />}
      <div ref={setPaneEl} className="ct-canvas-pane" style={{ height: mobile ? '100vh' : undefined,
        minHeight: mobile ? '100vh' : 0, minWidth: 0 }} />
      {docId && <DocumentCanvas key={savedExample ? 'synthetic-saved-example' : 'created-empty'} docId={docId} programId={snapshot.program.id} conversationId={null}
        fromThisConversation={false} expanded={opened} onExpandedChange={setOpened} onNav={() => {}}
        onAsk={onAsk} fireToast={fireToast} cardless paneEl={paneEl} onEditorBridge={onBridge} />}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
