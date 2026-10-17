// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()),apiRequest }));
import { TaskTray } from '../TaskTray';
import { clearNavParams } from '../navParams';
import { clearEditorTarget } from '../editorTarget';
import { __resetCeremonies, registerCeremonyOpen } from '../ceremony';
import { clearShellProject, readShellProject, publishShellProject } from '../shellProject';
const PROGRAM = '10000000-0000-4000-8000-000000000001';
const OLD = '20000000-0000-4000-8000-000000000002';
const DOC = '30000000-0000-4000-8000-000000000003';
const reply = (body: unknown,status=200) => ({ ok:status<400,status,json:async()=>body }) as Response;
const report = {id:5,title:'A report awaits review',body:'Saved output',resource_type:'report_run',resource_id:'41',action_url:'https://evil.test/'};
let targetReply: () => Promise<Response>;
function serve(notice: unknown = report) {
  apiRequest.mockImplementation(async (_method: string,path: string) => {
    if (path === '/api/mdx/notifications/5/target') return targetReply();
    if (path.includes('unread-count')) return reply({data:{unread:1}});
    if (path.startsWith('/api/mdx/notifications')) return reply({data:[notice]});
    if (path.includes('/my-work')) return reply({data:{items:[],total:0}});
    if (path.includes('/my-queue')) return reply({data:{threads:[],tasks:[]}});
    return reply({data:{approvals:[]}});
  });
}
async function open(onNav = vi.fn()) {
  render(<TaskTray onNav={onNav}/>);
  fireEvent.click(screen.getByRole('button',{name:/Your work/}));
  await screen.findByText('A report awaits review');
  return onNav;
}
beforeEach(() => {
  apiRequest.mockReset(); __resetCeremonies(); clearNavParams(); clearEditorTarget(); clearShellProject();
  publishShellProject({id:OLD,title:'Previously open program'});
  targetReply = async () => reply({data:{surface:'insights',label:'Open saved report',params:{reportRunId:'41'},programId:PROGRAM}});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); __resetCeremonies(); clearNavParams(); clearEditorTarget(); clearShellProject(); sessionStorage.clear(); localStorage.clear(); });
describe('F19 actual notification-to-owning-record journey', () => {
  it('waits for authorized resolution, switches to the actual UUID program and opens the exact record without marking read', async () => {
    let resolve!: (response:Response)=>void;
    targetReply = () => new Promise<Response>(done=>{resolve=done;});
    serve(); const onNav = await open();
    fireEvent.click(screen.getByRole('button',{name:'Open saved report'}));
    await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('GET','/api/mdx/notifications/5/target',undefined));
    expect(onNav).not.toHaveBeenCalled(); expect(readShellProject()?.id).toBe(OLD);
    await act(async()=>resolve(reply({data:{surface:'insights',label:'Open saved report',params:{reportRunId:'41'},programId:PROGRAM}})));
    await waitFor(()=>expect(onNav).toHaveBeenCalled());
    const destination = new URL('/concept2cure/'+onNav.mock.calls[0][0],window.location.origin);
    expect(destination.pathname).toBe('/concept2cure/insights');
    expect(destination.searchParams.get('reportRunId')).toBe('41');
    expect(destination.searchParams.get('program')).toBe(PROGRAM);
    expect(readShellProject()?.id).toBe(PROGRAM);
    expect(apiRequest.mock.calls.some(([method])=>method==='POST')).toBe(false);
  });
  it('keeps a refused target visible with retry, and opens it only after a later confirmed read', async () => {
    targetReply = async()=>reply({error:'The linked record could not be checked. Try again.'},503);
    serve(); const onNav = await open();
    fireEvent.click(screen.getByRole('button',{name:'Open saved report'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringMatching(/could not be checked/));
    expect(onNav).not.toHaveBeenCalled(); expect(readShellProject()?.id).toBe(OLD);
    targetReply = async()=>reply({data:{surface:'insights',label:'Open saved report',params:{reportRunId:'41'},programId:null}});
    fireEvent.click(screen.getByRole('button',{name:'Retry linked record'}));
    await waitFor(()=>expect(onNav).toHaveBeenCalled());
    expect(readShellProject()).toBeNull();
  });
  it('an authored section is handed to the real editor with exact identity and section code', async () => {
    serve({...report,resource_type:'authoring_document',resource_id:DOC+':40000000-0000-4000-8000-000000000004'});
    targetReply = async()=>reply({data:{surface:'document-authoring',label:'Open linked section',params:{documentId:DOC,sectionCode:'3.2.P.8'},programId:PROGRAM}});
    const onNav = await open();
    fireEvent.click(screen.getByRole('button',{name:'Open linked record'}));
    await waitFor(()=>expect(onNav).toHaveBeenCalled());
    expect(window.C2C_EDITOR_TARGET).toMatchObject({docId:DOC,sectionCode:'3.2.P.8',programId:PROGRAM});
  });
  it('a malformed successful target never borrows the current program or follows an arbitrary action', async () => {
    targetReply = async()=>reply({data:{surface:'document-authoring',label:'Open linked record',params:{documentId:'generic-artifact-41',redirect:'https://evil.test'},programId:'11'}});
    serve(); const onNav = await open();
    fireEvent.click(screen.getByRole('button',{name:'Open saved report'}));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled(); expect(readShellProject()?.id).toBe(OLD);
  });
  it('an unsaved native editor or open signature ceremony blocks navigation before target/program state changes', async () => {
    serve(); const onNav = await open();
    const dirty=(event:Event)=>event.preventDefault(); window.addEventListener('beforeunload',dirty);
    try {
      fireEvent.click(screen.getByRole('button',{name:'Open saved report'}));
      expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringMatching(/unsaved/));
      expect(onNav).not.toHaveBeenCalled(); expect(readShellProject()?.id).toBe(OLD);
    } finally {window.removeEventListener('beforeunload',dirty);}
    const done = registerCeremonyOpen();
    try {
      fireEvent.click(screen.getByRole('button',{name:'Retry linked record'}));
      await waitFor(()=>expect(screen.getByRole('alert').textContent).toMatch(/governed form/));
      expect(onNav).not.toHaveBeenCalled(); expect(readShellProject()?.id).toBe(OLD);
    } finally {done();}
  });
});
