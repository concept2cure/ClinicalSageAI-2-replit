// @vitest-environment jsdom
/**
 * Project files belong to the captured project/session visit. Keep the real
 * audited-download classifier and PDF viewer so a stale non-PDF completion
 * cannot hide a browser download behind a suppressed toast or viewer callback.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DataReadOwner } from '../../dataConnect';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const downloadBlob = vi.hoisted(() => vi.fn((_name: string, _blob: Blob) => true));
vi.mock('../../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../download')>()),
  downloadBlob,
}));
const presentOpenedFile = vi.hoisted(() => vi.fn());
vi.mock('../vaultPdfViewer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../vaultPdfViewer')>();
  presentOpenedFile.mockImplementation(actual.presentOpenedFile);
  return { ...actual, presentOpenedFile };
});

import { ProjectFilesPanel } from '../ProjectFilesPanel';

// The baseline ignores this optional prop. It must fail a presentation assertion,
// rather than fail compilation before the behavioral regression can execute.
type OwnedPanelProps = React.ComponentProps<typeof ProjectFilesPanel> & { readOwner?: DataReadOwner };
const OwnedPanel = ProjectFilesPanel as React.ComponentType<OwnedPanelProps>;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT_PATH = `/api/c2c/project-vault/${PROGRAM}`;
const DOWNLOAD_PATH = `${VAULT_PATH}/documents/upload-1/download`;
const TITLE = 'Study report.pdf';
const FRAME_TITLE = `${TITLE} — PDF viewer`;
const HASH = 'ab'.repeat(32);
const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const CSV = new TextEncoder().encode('participant,group\n1,A\n');
const DOC = {
  id: 'upload-1', num: '', title: TITLE, type: 'Report', status: 'unfiled', pct: null,
  owner: '', ver: '', updated: '', preview: '', src: 'upload', docId: 'upload-1',
};
const createObjectURL = vi.fn((_blob: Blob) => 'blob:session-test/1');
const revokeObjectURL = vi.fn((_url: string) => {});
let originalCreate: PropertyDescriptor | undefined;
let originalRevoke: PropertyDescriptor | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function fileReply(arrayBuffer: () => Promise<ArrayBuffer>) {
  return {
    ok: true, status: 200,
    headers: new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="Study report.pdf"',
      'X-Content-SHA256': HASH,
    }),
    arrayBuffer,
  };
}

/** Serve the actual panel's read and audited download, delaying only its body. */
function serve(firstReply: unknown, currentBytes = PDF) {
  let downloads = 0;
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path === VAULT_PATH) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { tree: [DOC] } }) };
    }
    if (path === DOWNLOAD_PATH) {
      downloads += 1;
      return downloads === 1 ? firstReply : fileReply(async () => bytesBuffer(currentBytes));
    }
    throw new Error(`Unexpected request ${path}`);
  });
}

function owners() {
  let active: string | null = 'session-a';
  return {
    a: { key: 'session-a', current: () => active === 'session-a' },
    b: { key: 'session-b', current: () => active === 'session-b' },
    use: (key: string | null) => { active = key; },
  };
}

function mount(readOwner: DataReadOwner) {
  const fireToast = vi.fn();
  const panel = (owner: DataReadOwner, sectionCode: string | null = null) => (
    <OwnedPanel programId={PROGRAM} programName="Program" fireToast={fireToast}
      readOwner={owner} sectionOpen={Boolean(sectionCode)} sectionCode={sectionCode} projectSources={[]}
      onCite={() => false} onInsertReference={() => false} />
  );
  const view = render(panel(readOwner));
  return {
    fireToast,
    replace: (owner: DataReadOwner, sectionCode: string | null = null) => {
      view.rerender(panel(owner, sectionCode));
    },
  };
}

async function selectRow() {
  const title = await screen.findByText(TITLE, { selector: '.pf-row-t' });
  const row = title.closest('button');
  if (!row) throw new Error('Project file title has no selectable row');
  fireEvent.click(row);
  return row;
}

async function beginOpen(readBody?: ReturnType<typeof vi.fn>) {
  await selectRow();
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  if (readBody) await waitFor(() => expect(readBody).toHaveBeenCalledTimes(1));
}

async function release<T>(pending: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => {
    pending.resolve(value);
    await pending.promise;
  });
}

function expectNoPresentation(fireToast: ReturnType<typeof vi.fn>) {
  expect(presentOpenedFile).not.toHaveBeenCalled();
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByTitle(FRAME_TITLE)).toBeNull();
  expect(fireToast).not.toHaveBeenCalled();
}

function vaultReads() {
  return apiRequest.mock.calls.filter(([, path]) => path === VAULT_PATH).length;
}

function restoreURLMethod(name: 'createObjectURL' | 'revokeObjectURL', descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(URL, name, descriptor);
  else Reflect.deleteProperty(URL, name);
}

beforeEach(() => {
  apiRequest.mockReset();
  presentOpenedFile.mockClear();
  downloadBlob.mockClear();
  downloadBlob.mockReturnValue(true);
  createObjectURL.mockReset();
  createObjectURL.mockImplementation(() => `blob:session-test/${createObjectURL.mock.calls.length}`);
  revokeObjectURL.mockClear();
  originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
});

afterEach(() => {
  cleanup();
  restoreURLMethod('createObjectURL', originalCreate);
  restoreURLMethod('revokeObjectURL', originalRevoke);
  vi.clearAllMocks();
});

it.each([
  { kind: 'PDF', bytes: PDF },
  { kind: 'non-PDF', bytes: CSV },
])('retires a delayed $kind body on same-program session replacement and opens for the current owner', async ({ kind, bytes }) => {
  const pending = deferred<ArrayBuffer>();
  const readBody = vi.fn(() => pending.promise);
  serve(fileReply(readBody), bytes);
  const owner = owners();
  const panel = mount(owner.a);
  await beginOpen(readBody);

  owner.use(owner.b.key);
  panel.replace(owner.b);
  await release(pending, bytesBuffer(bytes));

  // Check the whole dispatch before waiting on any replacement read. This is
  // the failing behavior on the unowned baseline, including non-PDF saves.
  expectNoPresentation(panel.fireToast);
  await beginOpen();
  await waitFor(() => expect(presentOpenedFile).toHaveBeenCalledTimes(1));
  expect(apiRequest.mock.calls.filter(([, path]) => path === DOWNLOAD_PATH)).toHaveLength(2);
  if (kind === 'PDF') {
    expect(await screen.findByTitle(FRAME_TITLE)).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(panel.fireToast).not.toHaveBeenCalled();
  } else {
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(panel.fireToast).toHaveBeenCalledWith(expect.stringContaining('Downloaded'), 'ok');
    expect(screen.queryByTitle(FRAME_TITLE)).toBeNull();
  }
});

it('retires a delayed refusal json body without a toast in the replacement session', async () => {
  const pending = deferred<unknown>();
  const readBody = vi.fn(() => pending.promise);
  serve({ ok: false, status: 403, json: readBody });
  const owner = owners();
  const panel = mount(owner.a);
  await beginOpen(readBody);

  owner.use(owner.b.key);
  panel.replace(owner.b);
  await release(pending, { message: 'Previous session could not open this file' });

  expectNoPresentation(panel.fireToast);
  await beginOpen();
  expect(await screen.findByTitle(FRAME_TITLE)).toBeTruthy();
  expect(presentOpenedFile).toHaveBeenCalledTimes(1);
});

it('retires an in-flight file immediately when the supplied owner becomes invalid', async () => {
  const pending = deferred<ArrayBuffer>();
  const readBody = vi.fn(() => pending.promise);
  serve(fileReply(readBody));
  const owner = owners();
  const panel = mount(owner.a);
  await beginOpen(readBody);

  owner.use(null);
  panel.replace(owner.a);
  await release(pending, bytesBuffer(PDF));

  expectNoPresentation(panel.fireToast);
  expect(screen.queryByText(TITLE, { selector: '.pf-row-t' })).toBeNull();
});

it('does not revive a retired in-flight file when the same owner key becomes valid again', async () => {
  const pending = deferred<ArrayBuffer>();
  const readBody = vi.fn(() => pending.promise);
  serve(fileReply(readBody));
  const owner = owners();
  const panel = mount(owner.a);
  await beginOpen(readBody);

  owner.use(null);
  panel.replace(owner.a);
  owner.use(owner.a.key);
  panel.replace(owner.a);
  await release(pending, bytesBuffer(PDF));

  expectNoPresentation(panel.fireToast);
  await beginOpen();
  expect(await screen.findByTitle(FRAME_TITLE)).toBeTruthy();
  expect(presentOpenedFile).toHaveBeenCalledTimes(1);
});

it('does not give the first A visit authority after an A to B to A session visit', async () => {
  const pending = deferred<ArrayBuffer>();
  const readBody = vi.fn(() => pending.promise);
  serve(fileReply(readBody));
  const owner = owners();
  const panel = mount(owner.a);
  await beginOpen(readBody);

  owner.use(owner.b.key);
  panel.replace(owner.b);
  owner.use(owner.a.key);
  panel.replace(owner.a);
  await release(pending, bytesBuffer(PDF));

  expectNoPresentation(panel.fireToast);
  await beginOpen();
  expect(await screen.findByTitle(FRAME_TITLE)).toBeTruthy();
  expect(presentOpenedFile).toHaveBeenCalledTimes(1);
});

it('keeps selection, an in-flight open and its viewer through equivalent owner and section rerenders', async () => {
  const pending = deferred<ArrayBuffer>();
  const readBody = vi.fn(() => pending.promise);
  serve(fileReply(readBody));
  const owner = owners();
  const panel = mount(owner.a);
  const selected = await selectRow();
  expect(selected.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await waitFor(() => expect(readBody).toHaveBeenCalledTimes(1));

  panel.replace({ ...owner.a }, '2.4');
  expect((await screen.findByText(TITLE, { selector: '.pf-row-t' })).closest('button')).toBe(selected);
  expect(selected.getAttribute('aria-pressed')).toBe('true');
  expect(vaultReads()).toBe(1);
  await release(pending, bytesBuffer(PDF));
  const frame = await screen.findByTitle(FRAME_TITLE);
  const url = frame.getAttribute('src');

  panel.replace({ ...owner.a }, '2.6');
  expect(screen.getByTitle(FRAME_TITLE)).toBe(frame);
  expect(frame.getAttribute('src')).toBe(url);
  expect(vaultReads()).toBe(1);
  expect(presentOpenedFile).toHaveBeenCalledTimes(1);
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).not.toHaveBeenCalled();
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(panel.fireToast).not.toHaveBeenCalled();
});

it('releases an open PDF URL on same-program session replacement before another file opens', async () => {
  serve(fileReply(async () => bytesBuffer(PDF)));
  const owner = owners();
  const panel = mount(owner.a);
  await beginOpen();
  const frame = await screen.findByTitle(FRAME_TITLE);
  const oldURL = frame.getAttribute('src');

  owner.use(owner.b.key);
  panel.replace(owner.b);

  expect(screen.queryByTitle(FRAME_TITLE)).toBeNull();
  expect(revokeObjectURL).toHaveBeenCalledWith(oldURL);
  expect(presentOpenedFile).toHaveBeenCalledTimes(1);
  await beginOpen();
  const currentFrame = await screen.findByTitle(FRAME_TITLE);
  expect(currentFrame.getAttribute('src')).not.toBe(oldURL);
  expect(createObjectURL).toHaveBeenCalledTimes(2);
  expect(presentOpenedFile).toHaveBeenCalledTimes(2);
});

it('still reports a refusal that belongs to the current session', async () => {
  serve({ ok: false, status: 403, json: async () => ({ message: 'File access is unavailable' }) });
  const owner = owners();
  const panel = mount(owner.a);

  await beginOpen();

  await waitFor(() => expect(panel.fireToast).toHaveBeenCalledWith(
    expect.stringContaining('File access is unavailable'), 'error',
  ));
  expect(presentOpenedFile).toHaveBeenCalledTimes(1);
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByTitle(FRAME_TITLE)).toBeNull();
});

