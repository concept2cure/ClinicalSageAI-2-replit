// @vitest-environment jsdom
import React from 'react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
const apiRequest=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/queryClient',async(original)=>({...await original<typeof import('@/lib/queryClient')>(),apiRequest}));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(),useAuth:()=>({user:{displayName:'Author',email:'author@example.test'}})}));
// The editor's dirty callback is a controlled seam; the real Workbench owns every leave decision.
vi.mock('../editor/RichSectionEditor',()=>({RichSectionEditor:React.forwardRef(({value,onDirtyChange}:any,_ref)=><div><div data-testid="native-canvas">{value}</div><button onClick={()=>onDirtyChange(true)}>Make unsaved edit</button></div>)}));
import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { clearEditorTarget,setEditorTarget } from '../editorTarget';
import { clearNavParams } from '../navParams';
import { clearShellProject } from '../shellProject';
import { registerCeremonyOpen,__resetCeremonies } from '../ceremony';
const response=(body:unknown)=>({ok:true,status:200,json:async()=>body}) as Response;
afterEach(()=>{cleanup();clearEditorTarget();clearNavParams();clearShellProject();__resetCeremonies();vi.restoreAllMocks();});
describe('F19 Authoring uses its canonical unsaved-work decision',()=>{
  it('an asynchronously resolved section does not move the editor after a governed form opens',async()=>{
    let resolveTarget!: (value: Response)=>void;
    const pendingTarget=new Promise<Response>(resolve=>{resolveTarget=resolve;});
    apiRequest.mockImplementation(async(_method:string,path:string)=>{
      if(path.startsWith('/api/authoring/docs?'))return response({documents:[{id:'D1',title:'Current working document',status:'draft',module:'M3'},{id:'D2',title:'Incoming target',status:'draft',module:'M3'}]});
      if(path==='/api/authoring/docs/D1/sections')return response({sections:[{id:'S1',doc_id:'D1',code:'3.2.S.1',title:'Current section',content:'Existing unsaved workspace',order_index:0}]});
      if(path==='/api/authoring/docs/D2/sections')return pendingTarget;
      return response({success:true});
    });
    render(<DocumentAuthoring surface={{id:'document-authoring',label:'Authoring'} as any} onNav={vi.fn()} segment="biopharma"/>);
    await screen.findByText('Existing unsaved workspace');
    act(()=>setEditorTarget({docType:null,docId:'D2',code:'3.2.P.8'}));
    await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('GET','/api/authoring/docs/D2/sections'));
    const release=registerCeremonyOpen();
    await act(async()=>resolveTarget(response({sections:[{id:'S2',doc_id:'D2',code:'3.2.P.8',title:'Target section',content:'Target section text'}]})));
    expect(await screen.findByText(/Finish or cancel the open governed form/)).toBeTruthy();
    expect(screen.getByText('Existing unsaved workspace')).toBeTruthy();
    expect(screen.queryByText('Target section text')).toBeNull();
    release();
  });
  it('a same-surface target does not remount or discard dirty work and cancel preserves the original document',async()=>{
    clearEditorTarget();clearNavParams();clearShellProject();
    apiRequest.mockImplementation(async(_method:string,path:string)=>{
      if(path.startsWith('/api/authoring/docs?'))return response({documents:[{id:'D1',title:'Current working document',status:'draft',module:'M3'},{id:'D2',title:'Incoming target',status:'draft',module:'M3'}]});
      const doc=/\/docs\/(D1|D2)\/sections$/.exec(path)?.[1];
      if(doc)return response({sections:[{id:doc+'-section',doc_id:doc,code:doc==='D1'?'3.2.S.1':'3.2.P.8',title:doc+' section',content:doc==='D1'?'Existing unsaved workspace':'Target section text',order_index:0}]});
      return response({success:true});
    });
    render(<DocumentAuthoring surface={{id:'document-authoring',label:'Authoring'} as any} onNav={vi.fn()} segment="biopharma"/>);
    await screen.findByText('Existing unsaved workspace');
    fireEvent.click(screen.getByRole('button',{name:'Make unsaved edit'}));
    act(()=>setEditorTarget({docType:null,docId:'D2',code:'3.2.P.8'}));
    expect(await screen.findByRole('alertdialog',{name:/Unsaved changes/})).toBeTruthy();
    expect(screen.getByText('Existing unsaved workspace')).toBeTruthy();
    expect(screen.queryByText('Target section text')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect(screen.getByText('Existing unsaved workspace')).toBeTruthy();
    expect(screen.queryByText('Target section text')).toBeNull();
  });
});
