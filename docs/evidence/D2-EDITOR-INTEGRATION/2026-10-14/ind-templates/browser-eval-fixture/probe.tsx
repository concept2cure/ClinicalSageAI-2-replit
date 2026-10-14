import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../design-system/colors_and_type.css';
import '../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../client/src/concept2cure/v2/styles/authoring-v2.css';
import '../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../client/src/concept2cure/v2/styles/surface-text-ramp.css';
import { IndDocumentLibrary } from '../../client/src/concept2cure/v2/editor/IndDocumentLibrary';
import { DocumentCanvas } from '../../client/src/concept2cure/v2/editor/DocumentCanvas';
import { AuthProvider } from '../../client/src/services/portal/authService';
import { publishShellProject } from '../../client/src/concept2cure/v2/shellProject';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
publishShellProject({id:PROGRAM,title:'Synthetic IND browser evaluation',productType:'drug'});
(window as any).evalEvents = [];
(window as any).evalAskEvents = [];
(window as any).evalHeld = false;
const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
function Probe() {
  const [docId, setDocId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showLibrary, setShowLibrary] = useState(true);
  const [paneEl, setPaneEl] = useState<HTMLDivElement | null>(null);
  const bridge = useRef<any>(null);
  const open = useCallback((id:string) => {
    (window as any).evalEvents.push({kind:'open',id,held:(window as any).evalHeld});
    if ((window as any).evalHeld) return;
    setDocId(id);setShowLibrary(false);setExpanded(true);
  },[]);
  const onBridge = useCallback((id:string, next:any, opened:boolean) => {
    bridge.current = opened ? next : null;
    (window as any).evalBridge = opened && next ? {docId:id,sectionId:next.sectionId,sectionCode:next.sectionCode,editable:next.editable} : null;
  },[]);
  useEffect(()=>{
    (window as any).evalShowLibrary = () => setShowLibrary(true);
    (window as any).evalShowEditor = () => setShowLibrary(false);
    (window as any).evalOpen = open;
    (window as any).evalOpenSection = (id:string) => bridge.current?.openSection?.(id);
  },[open]);
  return <div data-theme={theme} className={`c2c-v2 ${theme==='dark'?'dark':''}`} style={{height:'100vh',overflow:'hidden'}}>
    <main aria-label="IND template browser evaluation" style={{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}}>
      <div hidden={!showLibrary} style={{height:'100%',minHeight:0,display:showLibrary?'flex':'none',flexDirection:'column'}}>
        <IndDocumentLibrary programId={PROGRAM} onOpenDocument={open} onFindSources={()=>{}} onAsk={text=>(window as any).evalAskEvents.push(text)} />
      </div>
      <div ref={setPaneEl} className="ct-canvas-pane" hidden={showLibrary} />
      {docId && <div>
        <DocumentCanvas key={docId} docId={docId} programId={PROGRAM} conversationId={null} fromThisConversation={false}
          expanded={expanded} onExpandedChange={setExpanded} onNav={()=>{}} onAsk={()=>{}} fireToast={()=>{}}
          cardless paneEl={paneEl} onShowList={()=>setShowLibrary(true)} listCount={1} onEditorBridge={onBridge} />
      </div>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
