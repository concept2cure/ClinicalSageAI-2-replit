// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/services/portal/authService';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';
import type { RichSectionEditorHandle, RichSectionEditorProps } from '../../v2/editor/RichSectionEditor';

const H = vi.hoisted(() => ({ request: vi.fn(), props: [] as RichSectionEditorProps[],
  realEditor: null as typeof import('../../v2/editor/RichSectionEditor')['RichSectionEditor'] | null }));
vi.mock('@/lib/queryClient', async () => ({
  ...await vi.importActual<typeof import('@/lib/queryClient')>('@/lib/queryClient'),
  apiRequest: H.request,
}));
vi.mock('../../v2/editor/RichSectionEditor', () => {
  type CanvasHandle = Pick<RichSectionEditorHandle, 'getContent' | 'save'>;
  const Canvas = React.forwardRef<CanvasHandle, RichSectionEditorProps>(function Canvas(props, ref) {
    const [value, setValue] = React.useState(props.value);
    H.props.push(props);
    React.useImperativeHandle(ref, () => ({
      getContent: () => value.replace(/\r\n/g, '\n'),
      save: async () => { try { await props.onSave(value); return true; } catch { return false; } },
    }));
    return <textarea aria-label={props.ariaLabel} value={value} readOnly={props.readOnly}
      onChange={event => { setValue(event.target.value); props.onDirtyChange?.(event.target.value !== props.value); }}
      onKeyDown={event => { if (event.ctrlKey && event.key === 's') { event.preventDefault(); void Promise.resolve(props.onSave(value)).catch(() => undefined); } }} />;
  });
  return { RichSectionEditor: React.forwardRef<RichSectionEditorHandle, RichSectionEditorProps>(function Editor(props, ref) {
    return H.realEditor ? <H.realEditor {...props} ref={ref} /> :
      <Canvas {...props} ref={ref as React.Ref<CanvasHandle>} />;
  }) };
});

import { ApiRequestError } from '@/lib/queryClient';
import { deviceDraftKey } from '@/lib/deviceDraftCache';
import { ControlledTextEditor, type ControlledTextEditorProps } from '../ControlledTextEditor';

const DIGEST = 'a'.repeat(64);
const TOKEN = `fixture.${btoa(JSON.stringify({ userId: '7', organizationId: '42' }))}.fixture`;
const NEXT_DIGEST = 'b'.repeat(64);
const USER = { id: '7', organizationId: '42', permissions: ['governed:write'] } as AuthUser;
const SECTIONS = [
  { key: 'purpose', label: 'Purpose', body: 'Use the approved list.', order: 1, hint: 'State the purpose.' },
  { key: 'procedure', label: 'Procedure', body: 'Record the decision.', order: 2 },
];
const RESPONSE_SECTIONS = [{ ...SECTIONS[0], body: 'Use the verified list.' }, SECTIONS[1]];
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const saved = (overrides: Record<string, unknown> = {}) => ({
  data: { id: 31, organization_id: 42, version: '2.0', status: 'draft', metadata: { sections: RESPONSE_SECTIONS, other: 'preserved' } },
  meta: {
    training: { documentId: 31, docNumber: 'SOP-031', title: 'Supplier controls', documentVersion: '2.0', status: 'draft',
      contentDigest: NEXT_DIGEST, eligible: false, unavailableReason: 'This document is not effective.',
      sections: RESPONSE_SECTIONS.map(({ key, label, body }) => ({ key, label, body })), acknowledgement: null },
    auditTrail: { persisted: true, chained: true },
  },
  ...overrides,
});

function mount(overrides: Partial<ControlledTextEditorProps> = {}) {
  const onSaved = vi.fn();
  const onReload = vi.fn();
  let beforeClose: (() => Promise<boolean>) | null = null;
  const props: ControlledTextEditorProps = {
    documentId: 31, documentVersion: '2.0', contentDigest: DIGEST, status: 'draft',
    metadata: { sections: SECTIONS }, user: USER, storageKey: 'qms-42-7-31',
    isCurrent: () => true, onSaved, onReload,
    registerBeforeClose: guard => { beforeClose = guard; }, ...overrides,
  };
  const view = render(<ControlledTextEditor {...props} />);
  return { ...view, onSaved, onReload, guard: () => beforeClose!() };
}
function editAndReason() {
  fireEvent.change(screen.getByLabelText('Purpose controlled text'), { target: { value: 'Use the verified list.' } });
  fireEvent.change(screen.getByLabelText(/Reason for controlled-text change/), { target: { value: 'Clarify the verified supplier list.' } });
}

beforeEach(() => { H.request.mockReset(); H.props.length = 0; H.realEditor = null; localStorage.clear(); setAuthToken(TOKEN); });
afterEach(() => { cleanup(); clearAuthToken(); });

describe('controlled text stays in the existing governed editor', () => {
  it('saves all current sections with version, digest, reason and canonical transport', async () => {
    H.request.mockResolvedValue(response(saved()));
    const { onSaved } = mount({ status: 'in_review' });
    expect(H.props).toEqual(expect.arrayContaining([expect.objectContaining({ format: 'text', autosaveMs: null, showSaveButton: false })]));
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(H.request).toHaveBeenCalledExactlyOnceWith('PATCH', '/api/mdx/qms/documents/31', {
      controlledText: { documentVersion: '2.0', contentDigest: DIGEST, sections: RESPONSE_SECTIONS },
      reason: 'Clarify the verified supplier list.',
    }, { Authorization: `Bearer ${TOKEN}`, 'x-organization-id': '42' });
  });

  it('requires the stated reason on button and keyboard save paths', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Purpose controlled text'), { target: { value: 'Use the verified list.' } });
    expect((screen.getByRole('button', { name: 'Save controlled text' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Purpose controlled text'), { key: 's', ctrlKey: true });
    await screen.findByRole('alert');
    expect(H.request).not.toHaveBeenCalled();
  });

  it('does not save under another account whose token replaces storage before the reader rerenders', async () => {
    const { onSaved } = mount();
    editAndReason();
    setAuthToken(`fixture.${btoa(JSON.stringify({ userId: '8', organizationId: '42' }))}.fixture`);
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/signed-in account or organization changed/);
    expect(H.request).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each(['effective', 'superseded', 'retired'] as const)('does not edit a %s record', status => {
    mount({ status });
    expect(screen.queryByLabelText('Purpose controlled text')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save controlled text' })).toBeNull();
  });

  it('does not offer viewers a governed edit', () => {
    mount({ user: { ...USER, permissions: [] } });
    expect(screen.queryByLabelText('Purpose controlled text')).toBeNull();
    expect(H.request).not.toHaveBeenCalled();
  });

  it('uses the existing standard skeleton only when sections have not been provided', () => {
    mount({ metadata: {} });
    expect(screen.getByLabelText('Purpose controlled text')).toBeDefined();
    expect(screen.getByLabelText('Approval controlled text')).toBeDefined();
    expect((screen.getByLabelText('Purpose controlled text') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('legacy controlled sections preserve canonical data', () => {
  it('edits a supported legacy section with its canonical label', async () => {
    const section = { key: 'purpose', body: 'Use the approved list.' };
    const expected = { ...section, label: 'Purpose', body: 'Use the verified list.' };
    const receipt = saved();
    H.request.mockResolvedValue(response(saved({
      data: { ...receipt.data, metadata: { sections: [expected] } },
      meta: { ...receipt.meta, training: { ...receipt.meta.training, sections: [expected] } },
    })));
    const { onSaved } = mount({ metadata: { sections: [section] } });
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(H.request.mock.calls[0][2].controlledText.sections).toEqual([expected]);
  });

  it('preserves an untouched sibling body exactly instead of reserializing it', async () => {
    const sibling = { ...SECTIONS[1], body: 'Record the decision.\r\nRetain the record.' };
    const next = [RESPONSE_SECTIONS[0], sibling];
    const receipt = saved();
    H.request.mockResolvedValue(response(saved({
      data: { ...receipt.data, metadata: { sections: next } },
      meta: { ...receipt.meta, training: { ...receipt.meta.training, sections: next.map(({ key, label, body }) => ({ key, label, body })) } },
    })));
    const { onSaved } = mount({ metadata: { sections: [SECTIONS[0], sibling] } });
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(H.request.mock.calls[0][2].controlledText.sections[1].body).toBe(sibling.body);
  });

  it('edits bodies without submitting server-owned provenance attributes', async () => {
    const provenance = { source: 'approved import', recordId: 19 };
    const receipt = saved();
    H.request.mockResolvedValue(response(saved({
      data: { ...receipt.data, metadata: { sections: [{ ...RESPONSE_SECTIONS[0], provenance }, RESPONSE_SECTIONS[1]] } },
    })));
    const { onSaved } = mount({ metadata: { sections: [{ ...SECTIONS[0], provenance }, SECTIONS[1]] } });
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(H.request.mock.calls[0][2].controlledText.sections).toEqual(RESPONSE_SECTIONS);
  });

  it.each([7, null, {}, []])('refuses a malformed existing section body %j without replacing its structure', body => {
    mount({ metadata: { sections: [{ key: 'purpose', label: 'Purpose', body }] } });
    expect(screen.getByRole('alert').textContent).toMatch(/section structure/);
    expect(screen.queryByLabelText('Purpose controlled text')).toBeNull();
  });
});

describe('unsaved controlled text requires a decision', () => {
  it('keeps edits on cancel and explicitly discards the scoped device drafts', async () => {
    const view = mount();
    editAndReason();
    let result: boolean | undefined;
    let pending!: Promise<boolean>;
    act(() => { pending = view.guard().then(value => { result = value; return value; }); });
    expect(result).toBeUndefined();
    expect(screen.getByRole('alertdialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(await pending).toBe(false);
    expect((screen.getByLabelText('Purpose controlled text') as HTMLTextAreaElement).value).toBe('Use the verified list.');
    localStorage.setItem(deviceDraftKey(USER.id, 'qms-42-7-31-purpose'), 'draft');
    localStorage.setItem(deviceDraftKey('8', 'qms-42-7-31-purpose'), 'other account');
    act(() => { pending = view.guard(); });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await pending).toBe(true);
    expect(localStorage.getItem(deviceDraftKey(USER.id, 'qms-42-7-31-purpose'))).toBeNull();
    expect(localStorage.getItem(deviceDraftKey('8', 'qms-42-7-31-purpose'))).toBe('other account');
    view.unmount();
    expect(H.request).not.toHaveBeenCalled();
  });

  it('keeps focus inside the nested discard dialog and Escape cancels the pending close', async () => {
    const { guard } = mount();
    editAndReason();
    let pending!: Promise<boolean>;
    act(() => { pending = guard(); });
    const keep = screen.getByRole('button', { name: 'Keep editing' });
    const discard = screen.getByRole('button', { name: 'Discard changes' });
    discard.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(discard);
    fireEvent.keyDown(discard, { key: 'Escape' });
    expect(await pending).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByLabelText('Purpose controlled text') as HTMLTextAreaElement).value).toBe('Use the verified list.');
  });

  it('clears cached sibling drafts only after their whole snapshot is confirmed', async () => {
    const next = [{ ...SECTIONS[0], body: 'Use the verified list.' }, { ...SECTIONS[1], body: 'Record the verified decision.' }];
    const receipt = saved();
    H.request.mockResolvedValue(response(saved({
      data: { ...receipt.data, metadata: { sections: next } },
      meta: { ...receipt.meta, training: { ...receipt.meta.training, sections: next.map(({ key, label, body }) => ({ key, label, body })) } },
    })));
    const { onSaved } = mount();
    editAndReason();
    fireEvent.change(screen.getByLabelText('Procedure controlled text'), { target: { value: next[1].body } });
    for (const section of next) localStorage.setItem(deviceDraftKey(USER.id, `qms-42-7-31-${section.key}`), section.body);
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    for (const section of next) expect(localStorage.getItem(deviceDraftKey(USER.id, `qms-42-7-31-${section.key}`))).toBeNull();
  });
});

describe('only a confirmed controlled-text snapshot refreshes the record', () => {
  it('does not save when a dirty editor unmounts', () => {
    const { unmount } = mount();
    editAndReason();
    unmount();
    expect(H.request).not.toHaveBeenCalled();
  });

  it.each([
    ['missing audit', saved({ meta: { training: (saved().meta.training) } })],
    ['foreign document', saved({ data: { ...saved().data, id: 32 } })],
    ['foreign tenant', saved({ data: { ...saved().data, organization_id: 43 } })],
    ['wrong saved body', saved({ data: { ...saved().data, metadata: { sections: SECTIONS } } })],
    ['stale digest', saved({ meta: { ...saved().meta, training: { ...saved().meta.training, contentDigest: DIGEST } } })],
  ])('does not confirm %s in a successful transport response', async (_name, body) => {
    H.request.mockResolvedValue(response(body));
    const { onSaved, onReload } = mount();
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be confirmed/));
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Save controlled text' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reload record' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('keeps a stale-write refusal distinct from confirmation and preserves the draft', async () => {
    H.request.mockRejectedValue(new ApiRequestError('This document changed. Reload its current text.', 409, null, 'DOCUMENT_CHANGED'));
    const { onSaved } = mount();
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/This document changed/));
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Purpose controlled text') as HTMLTextAreaElement).value).toBe('Use the verified list.');
  });

  it.each([0, 408, 503])('treats thrown status %s as an unconfirmed outcome', async status => {
    H.request.mockRejectedValue(new ApiRequestError('Request timed out.', status));
    const { onSaved } = mount();
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be confirmed/));
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Save controlled text' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('treats a returned timeout as unconfirmed too', async () => {
    H.request.mockResolvedValue(response({ error: 'The request timed out.' }, 408));
    const { onSaved } = mount();
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be confirmed/));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('keeps a confirmed save distinct from a failed subsequent refresh', async () => {
    H.request.mockResolvedValue(response(saved()));
    mount({ onSaved: vi.fn().mockRejectedValue(new Error('Refresh failed')) });
    editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save controlled text' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/was saved, but the current record could not be refreshed/));
    expect(H.request).toHaveBeenCalledOnce();
  });

  it('does not let repeated clicks or a late old-scope response refresh another record', async () => {
    let resolve!: (value: Response) => void;
    H.request.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
    let current = true;
    const { onSaved, guard } = mount({ isCurrent: () => current });
    editAndReason();
    const button = screen.getByRole('button', { name: 'Save controlled text' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await guard()).toBe(false);
    expect(H.request).toHaveBeenCalledOnce();
    current = false;
    await act(async () => { resolve(response(saved())); });
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('the actual canonical editor has no implicit save in Quality', () => {
  it('mounts the canonical text editor and leaves a dirty unmount unwritten', async () => {
    const canonical = await vi.importActual<typeof import('../../v2/editor/RichSectionEditor')>('../../v2/editor/RichSectionEditor');
    H.realEditor = canonical.RichSectionEditor;
    for (const prototype of [Range.prototype, Element.prototype, Text.prototype]) {
      if (!('getClientRects' in prototype)) Object.defineProperty(prototype, 'getClientRects', { value: () => [], configurable: true });
      if (!('getBoundingClientRect' in prototype)) Object.defineProperty(prototype, 'getBoundingClientRect', {
        value: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }), configurable: true,
      });
    }
    const { unmount } = mount({ metadata: { sections: [SECTIONS[0]] } });
    const element = await screen.findByRole('textbox', { name: 'Purpose controlled text' });
    expect(element.classList.contains('tiptap')).toBe(true);
    const canvas = element as HTMLElement & { editor: import('@tiptap/core').Editor };
    act(() => { canvas.editor.commands.setContent('<p>Use the verified list.</p>'); });
    fireEvent.change(screen.getByLabelText(/Reason for controlled-text change/), { target: { value: 'Clarify the verified supplier list.' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save controlled text' }) as HTMLButtonElement).disabled).toBe(false));
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(H.request).not.toHaveBeenCalled();
  });
});
