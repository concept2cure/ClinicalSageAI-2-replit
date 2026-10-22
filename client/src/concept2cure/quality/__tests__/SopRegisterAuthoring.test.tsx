// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ docs: [] as unknown[], request: vi.fn(), refresh: vi.fn(), ask: vi.fn(), nav: vi.fn(), workbench: null as unknown }));
const PROGRAM = '40000000-0000-4000-8000-000000000001';
const DOCUMENT = '40000000-0000-4000-8000-000000000002';
const DRAFT = { id: 4, docNumber: 'SOP-004', title: 'Document control', docType: 'sop', category: null,
  version: '1.0', status: 'draft', effectiveDate: null, nextReviewDate: null, updatedAt: null, authoringDocumentId: DOCUMENT };
const TEMPLATE = { key: 'sop', label: 'Standard operating procedure', docType: 'sop', family: 'quality',
  description: 'Controlled procedure', numberPrefix: 'SOP', category: 'misc', sections: [{ key: 'purpose', label: 'Purpose', order: 1 }] };
vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: H.docs, loading: false, error: null, refresh: H.refresh }),
  useSopTemplates: () => ({ templates: [TEMPLATE], loading: false, error: null }),
  useReviewDue: () => ({ rows: [], loading: false, error: null }),
  useTrainingCompliance: () => ({ rows: [], loading: false, error: null }),
}));
vi.mock('../../mdx/lib/useSampleRows', () => ({ useSampleRows: (rows: unknown[]) => rows, useShowingSample: () => false }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'Author' }) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...args: unknown[]) => H.request(...args),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null, redactInternals: (m: string, fallback: string) => m || fallback }));
vi.mock('../../v2/shellProject', () => ({ useShellProject: () => ({ id: PROGRAM, title: 'Sponsor program' }), shellProgramId: (p: { id: string }) => p.id }));
vi.mock('../../v2/editor/DocumentWorkbench', () => ({ DocumentWorkbench: (props: {
  docs: { id: string; title: string }[]; onNav: (id: string) => void; embedded: { onBack: () => void }; reloadDocs: () => Promise<void>;
}) => {
  H.workbench = props;
  return <div data-testid="canonical-workbench">{props.docs[0].title}
    <button onClick={props.embedded.onBack}>Back to Quality register</button>
    <button onClick={() => props.onNav('vault')}>Open Vault</button>
    <button onClick={() => void props.reloadDocs()}>Refresh editing copy</button>
  </div>;
} }));
vi.mock('../../v2/editor/AuthoredHtml', () => ({ AuthoredHtml: ({ html }: { html: string }) => <div data-testid="saved-snapshot-content">{html}</div> }));
vi.mock('../../_shared/components/EsignModal', () => ({ EsignModal: () => null, esignSignerOf: () => undefined }));
vi.mock('../changeHooks', () => ({ useChangeRegister: () => ({ changes: [], loading: false, error: null }) }));
vi.mock('../../v2/surfaceActions', () => ({ useSurfaceActionHandlers: () => undefined, notifySurfaceActionReady: () => undefined }));
vi.mock('../../v2/surfaceContext', () => ({ usePublishSurfaceContext: () => undefined }));
import { SopRegister } from '../SopRegister';
import { QualityApp } from '../App';

const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ data }) });
const editor = { document: { id: DOCUMENT, title: DRAFT.title, module: null, product_code: null, status: 'draft', updated_at: null, section_count: 1 },
  programId: PROGRAM, qmsDocument: { id: 4, status: 'draft' } };
const renderRegister = () => render(<SopRegister onAsk={H.ask} onNavigate={H.nav} filter="all" onFilterChange={vi.fn()} />);
beforeEach(() => {
  H.docs = [DRAFT]; H.ask.mockReset(); H.nav.mockReset(); H.refresh.mockReset(); H.workbench = null;
  H.request.mockReset().mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path.startsWith('/api/c2c/projects')) return response([{ id: PROGRAM, title: 'Sponsor program', code: 'SP', status: 'active' }]);
    if (method === 'GET' && path.endsWith('/editor')) return response(editor);
    if (method === 'PATCH') return response({ id: 4, status: 'in_review' });
    return response({ id: 4, authoring_document_id: DOCUMENT, metadata: { programId: PROGRAM } });
  });
});
afterEach(cleanup);

async function completeForm(button: string, title?: string) {
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect((within(dialog).getByLabelText('Program') as HTMLSelectElement).value).toBe(PROGRAM));
  if (title) fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: title } });
  fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Establish controlled procedure for the program.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
}
describe('QMS controls reach the canonical authoring workbench', () => {
  it('opens the exact notification record even when the register has no matching row',async()=>{
    H.docs=[];
    H.request.mockImplementation(async(method:string,path:string)=>path.endsWith('/editor')?response({...editor,qmsDocument:{id:9,status:'draft'}}):
      response({id:9,doc_number:'SOP-009',title:'Notification target',doc_type:'sop',version:'1.0',status:'draft',authoring_document_id:DOCUMENT}));
    render(<QualityApp onNavigate={H.nav} qmsDocumentId="9" />);
    await screen.findByTestId('canonical-workbench');
    expect(H.request).toHaveBeenCalledWith('GET','/api/mdx/qms/documents/9');
    expect(H.request).toHaveBeenCalledWith('GET','/api/mdx/qms/documents/9/editor');
    expect(H.request.mock.calls.some(([,path])=>path.includes('/4/'))).toBe(false);
  });
  it('preserves a refused exact notification target without opening a different register row',async()=>{
    H.request.mockRejectedValue(new Error('The selected controlled document was not found.'));
    render(<QualityApp qmsDocumentId="9" />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/selected controlled document/);
    expect(screen.queryByTestId('canonical-workbench')).toBeNull();
    expect(H.request.mock.calls.every(([,path])=>path==='/api/mdx/qms/documents/9')).toBe(true);
    expect(screen.getByRole('button',{name:'Try again'})).toBeTruthy();
  });
  it('queues a new notification target while the current canonical editing copy remains open',async()=>{
    H.request.mockImplementation(async(method:string,path:string)=>path.endsWith('/editor')?response({...editor,qmsDocument:{id:Number(path.split('/').at(-2)),status:'draft'}}):
      response({id:Number(path.split('/').at(-1)),doc_number:'SOP-009',title:'Notification target',doc_type:'sop',version:'1.0',status:'draft',authoring_document_id:DOCUMENT}));
    const {rerender}=render(<QualityApp qmsDocumentId="4" />);
    await screen.findByTestId('canonical-workbench');
    rerender(<QualityApp qmsDocumentId="9" qmsTargetRequest={1} />);
    await screen.findByText(/A notification selected SOP-009/);
    expect(H.request.mock.calls.some(([,path])=>path==='/api/mdx/qms/documents/9/editor')).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'Back to Quality register'}));
    await waitFor(()=>expect(H.request).toHaveBeenCalledWith('GET','/api/mdx/qms/documents/9/editor'));
  });
  it('shows the exact unbound controlled record before offering its explicit authored revision',async()=>{
    H.request.mockResolvedValue(response({id:9,doc_number:'SOP-009',title:'Legacy selected record',doc_type:'sop',version:'3.0',status:'effective',authoring_document_id:null}));
    render(<QualityApp qmsDocumentId="9" />);
    const dialog=await screen.findByRole('dialog',{name:'Controlled document SOP-009'});
    expect(dialog.textContent).toMatch(/Legacy selected record.*version 3.0/);
    expect(within(dialog).getByRole('button',{name:'Start authored revision'})).toBeTruthy();
    expect(H.request).toHaveBeenCalledWith('GET','/api/mdx/qms/documents/9');
    expect(H.request.mock.calls.some(([,path])=>path.endsWith('/editor'))).toBe(false);
  });
  it('creates a controlled document with a real program and reason, then opens its editing copy', async () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /New controlled document/ }));
    await completeForm('Create and open', 'Document control');
    await screen.findByTestId('canonical-workbench');
    expect(H.request).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents', {
      title: 'Document control', docType: 'sop', programId: PROGRAM, reason: 'Establish controlled procedure for the program.',
    });
    expect(H.ask).not.toHaveBeenCalled();
    expect(H.workbench).toMatchObject({ docs: [{ id: DOCUMENT }], programId: PROGRAM, pinnedDocId: DOCUMENT,
      consumeDeepLinks: false, surfaceActionId: null, embedded: { backLabel: 'Back to Quality register' } });
  });
  it('passes the selected library template to the create route', async () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Standard operating procedure/ }));
    await completeForm('Create and open', 'Controlled procedure');
    await screen.findByTestId('canonical-workbench');
    expect(H.request).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents', expect.objectContaining({ templateKey: 'sop', docType: 'sop' }));
    expect(H.ask).not.toHaveBeenCalled();
  });
  it('opens the bound record directly and forwards workbench navigation to the host', async () => {
    renderRegister(); fireEvent.click(screen.getByRole('button', { name: 'SOP-004' }));
    await screen.findByTestId('canonical-workbench');
    expect(H.request).toHaveBeenCalledWith('GET', '/api/mdx/qms/documents/4/editor');
    fireEvent.click(screen.getByRole('button', { name: 'Open Vault' })); expect(H.nav).toHaveBeenCalledWith('vault');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Quality register' }));
    expect(screen.queryByTestId('canonical-workbench')).toBeNull(); expect(H.refresh).toHaveBeenCalled();
    expect(H.ask).not.toHaveBeenCalled();
  });
  it('binds an unbound legacy draft explicitly before opening its new editing copy', async () => {
    H.docs = [{ ...DRAFT, authoringDocumentId: null }];
    renderRegister(); fireEvent.click(screen.getByRole('button', { name: 'SOP-004' }));
    expect(screen.getByRole('dialog').textContent).toMatch(/Set up editing copy/);
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'sop' } });
    await completeForm('Set up and open');
    await screen.findByTestId('canonical-workbench');
    expect(H.request).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/4/bind', expect.objectContaining({ programId: PROGRAM, templateKey: 'sop', reason: expect.any(String) }));
    expect(H.ask).not.toHaveBeenCalled();
  });
  it('collects a stated reason before review and sends it through PATCH', async () => {
    renderRegister(); fireEvent.click(screen.getByRole('button', { name: /Send for review/ }));
    const dialog = screen.getByRole('dialog');
    expect(H.request).not.toHaveBeenCalledWith('PATCH', expect.anything(), expect.anything());
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Ready for independent Quality review.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send for review' }));
    await waitFor(() => expect(H.refresh).toHaveBeenCalled());
    expect(H.request).toHaveBeenCalledWith('PATCH', '/api/mdx/qms/documents/4', { status: 'in_review', reason: 'Ready for independent Quality review.' });
  });
  it('creates and opens a controlled revision through the real revision route', async () => {
    H.docs = [{ ...DRAFT, status: 'effective' }];
    renderRegister(); fireEvent.click(screen.getByRole('button', { name: /Revise/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Update the procedure after periodic review.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create revision' }));
    await screen.findByTestId('canonical-workbench');
    expect(H.request).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/4/revise', { reason: 'Update the procedure after periodic review.' });
    expect(H.ask).not.toHaveBeenCalled();
  });
  it('recovers a legacy effective registry entry with explicit program/template instead of claiming previous authored content', async () => {
    H.docs = [{...DRAFT,status:'effective',authoringDocumentId:null}];
    renderRegister(); fireEvent.click(screen.getByRole('button',{name:/Revise/}));
    expect(screen.getByRole('dialog',{name:'Start authored revision'}).textContent).toMatch(/no authored content is claimed/);
    fireEvent.change(screen.getByLabelText('Template'),{target:{value:'sop'}});
    await completeForm('Create revision and open');
    await screen.findByTestId('canonical-workbench');
    expect(H.request).toHaveBeenCalledWith('POST','/api/mdx/qms/documents/4/revise',{
      programId:PROGRAM,templateKey:'sop',reason:'Establish controlled procedure for the program.',
    });
    expect(H.request.mock.calls.some(([method,path])=>method==='POST'&&path.endsWith('/bind'))).toBe(false);
  });
  it('keeps a refused create visible and shows the server reason without claiming success', async () => {
    H.request.mockImplementation(async (method: string) => {
      if (method === 'GET') return response([{ id: PROGRAM, title: 'Sponsor program' }]);
      throw new Error('You do not have permission to author in this program.');
    });
    renderRegister(); fireEvent.click(screen.getByRole('button', { name: /New controlled document/ }));
    await completeForm('Create and open', 'Document control');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/permission to author/));
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.queryByTestId('canonical-workbench')).toBeNull();
    expect(H.refresh).not.toHaveBeenCalled();
  });
  it('renders a failed editor read as an error and supports retry without creating another record', async () => {
    let failed = true;
    H.request.mockImplementation(async () => { if (failed) throw new Error('The editing copy could not be read.'); return response(editor); });
    renderRegister(); fireEvent.click(screen.getByRole('button', { name: 'SOP-004' }));
    await screen.findByRole('alert'); expect(screen.queryByTestId('canonical-workbench')).toBeNull();
    failed = false; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('canonical-workbench');
    expect(H.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('the Quality shell forwards navigation and holds its tabs while the workbench is open', async () => {
    render(<QualityApp onAskAna={H.ask} onNavigate={H.nav} />);
    expect(screen.getByRole('tablist', { name: 'Quality surfaces' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'SOP-004' }));
    await screen.findByTestId('canonical-workbench');
    expect(screen.queryByRole('tablist', { name: 'Quality surfaces' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Vault' })); expect(H.nav).toHaveBeenCalledWith('vault');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Quality register' }));
    await waitFor(() => expect(screen.getByRole('tablist', { name: 'Quality surfaces' })).toBeTruthy());
  });
  it('opens retained signed sections through the versions service as read-only content', async () => {
    H.request.mockResolvedValue(response([{ version: '1.0', approved_at: '2026-10-10T12:00:00Z',
      sections: [{ id: 'section-1', code: '1', title: 'Purpose', content: '<p>Signed purpose.</p>', orderIndex: 1 }] }]));
    renderRegister(); fireEvent.click(screen.getByRole('button', { name: 'View version history of SOP-004' }));
    expect(await screen.findByTestId('saved-snapshot-content')).toHaveProperty('textContent', '<p>Signed purpose.</p>');
    expect(H.request).toHaveBeenCalledWith('GET', '/api/mdx/qms/documents/4/versions');
    const dialog = screen.getByRole('dialog', { name: 'Version history of SOP-004' });
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('canonical-workbench')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('does not present an unreadable history as no signed versions', async () => {
    H.request.mockRejectedValue(new Error('You do not have permission to view this authored document.'));
    renderRegister(); fireEvent.click(screen.getByRole('button', { name: 'View version history of SOP-004' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/permission to view/));
    expect(screen.queryByText('No document versions recorded yet.')).toBeNull();
    expect(screen.queryByTestId('saved-snapshot-content')).toBeNull();
  });
});
