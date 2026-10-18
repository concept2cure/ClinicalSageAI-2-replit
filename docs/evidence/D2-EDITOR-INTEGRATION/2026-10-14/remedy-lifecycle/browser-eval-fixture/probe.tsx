import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import '../../../../../../design-system/colors_and_type.css';
import '../../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/authoring-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';
import {DocumentCanvas} from '../../../../../../client/src/concept2cure/v2/editor/DocumentCanvas';
import type {EditorBridge} from '../../../../../../client/src/concept2cure/v2/editor/DocumentWorkbench';
import {AuthoringRemedies} from '../../../../../../client/src/concept2cure/v2/editor/AuthoringRemedies';
import type {AnaTurnRecordStatus} from '../../../../../../client/src/concept2cure/components/ana/useAnaChat.types';
import {AuthProvider} from '../../../../../../client/src/services/portal/authService';
import {publishShellProject} from '../../../../../../client/src/concept2cure/v2/shellProject';
import snapshot from './api-contract.json';

const params=new URLSearchParams(window.location.search);
const theme=params.get('theme')==='dark'?'dark':'light';
const mode=params.get('mode')??'lifecycle';
const mobile=window.innerWidth<800;
const fixtureWindow=window as any;
fixtureWindow.remedyAttempts=[];
fixtureWindow.remedyToasts=[];
publishShellProject({id:snapshot.program.id,title:snapshot.program.name,productType:'drug'});
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
const remedy={...snapshot.remedy,...(mode==='stale'?{baseUpdatedAt:'2026-10-13T06:00:00.000Z'}:{}),...(mode==='wrong-section'?{sectionId:snapshot.sections[1].id}: {})};
const record=mode==='unqualified'?{...snapshot.record,servedBy:snapshot.record.servedBy.map(m=>({...m,qualified:false,approvedForHighRisk:false}))}:snapshot.record;
const answer='Review this synthetic source correction.\n```authoring-remedy\n'+JSON.stringify(remedy)+'\n```';
function Probe(){
  const [bridge,setBridge]=useState<EditorBridge|null>(null);
  const [opened,setOpened]=useState(true);
  const [paneEl,setPaneEl]=useState<HTMLDivElement|null>(null);
  const onBridge=useCallback((_id:string,next:EditorBridge|null,open:boolean)=>{setBridge(next);setOpened(open);fixtureWindow.remedyBridge=next?{docId:next.docId,sectionId:next.sectionId,viewMode:next.viewMode,editable:next.editable}:null;},[]);
  const target=useMemo(()=>bridge?{...bridge,open:opened,reopen:()=>setOpened(true),propose:async(...args:Parameters<EditorBridge['propose']>)=>{
    const result=await bridge.propose(...args);fixtureWindow.remedyAttempts.push({proposal:args[0],result});return result;
  }}:undefined,[bridge,opened]);
  useEffect(()=>{fixtureWindow.remedyStates=()=>fixtureWindow.remedyAttempts.map((attempt:any)=>attempt.result.receipt?bridge?.getProposalState?.(attempt.result.receipt)??'unavailable':null);},[bridge]);
  return <div data-theme={theme} className={`c2c-v2 ${theme==='dark'?'dark':''}`} style={{minHeight:'100vh',height:mobile?'auto':'100vh',overflow:mobile?'visible':'hidden'}}>
    <main aria-label="Remedy lifecycle browser evaluation" style={{display:'flex',flexDirection:mobile?'column':'row',height:mobile?'auto':'100%',minHeight:0}}>
      <div style={{flex:mobile?'0 0 auto':'0 0 340px',minWidth:0,padding:'var(--space-3)',overflowY:mobile?'visible':'auto'}}>
        <AuthoringRemedies text={answer} settled record={record as AnaTurnRecordStatus} unfinished={false} target={target} />
      </div>
      <div ref={setPaneEl} className="ct-canvas-pane" style={{height:mobile?'100vh':undefined,minHeight:mobile?'100vh':0,minWidth:0}} />
      <DocumentCanvas docId={snapshot.document.id} programId={snapshot.program.id} conversationId={null} fromThisConversation={false}
        expanded={opened} onExpandedChange={setOpened} onNav={()=>{}} onAsk={()=>{}} fireToast={message=>fixtureWindow.remedyToasts.push(message)} cardless paneEl={paneEl} onEditorBridge={onBridge} />
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
