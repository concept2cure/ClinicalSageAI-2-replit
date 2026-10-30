// @vitest-environment jsdom
/** Actual drawer, upload hook and canonical session; only the HTTP response is synthetic. */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DossierDrawer, type DossierDrawerProps } from '../pathway/PathwayPanes';
import { DossierStore } from '../../store/dossierStore';
import { ingestReceipt, stubIngestXhr, type IngestInit } from '../../../v2/__tests__/_ingest-xhr-fake';
import { endCompanySession, seedCompanySession } from '../../../v2/__tests__/_company-session-fixture';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const SECTION = { id: 'upload-section', label: 'Upload review' };
const file = (name: string, body = 'synthetic document bytes') => new File([body], name, { type: 'text/plain' });
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
const success = (init: IngestInit) => ({ status: 201, json: async () => ingestReceipt(init.body as FormData) });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let props: DossierDrawerProps = { open: true, target: SECTION, pathway: 'k510', programId: PROGRAM, onClose: vi.fn() };
  const view = () => <QueryClientProvider client={client}><DossierDrawer {...props} /></QueryClientProvider>;
  const rendered = render(view());
  const attachments = () => fireEvent.click(screen.getByRole('tab', { name: /^Attachments/ }));
  attachments();
  return { ...rendered, attachments, change: (patch: Partial<DossierDrawerProps>) => { props = { ...props, ...patch }; rendered.rerender(view()); } };
}
function selectFiles(files: File[]) {
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files } });
}
const stored = () => DossierStore.readSectionAttachments('k510', SECTION.id, SECTION.label);
beforeEach(() => { DossierStore.clearAllPathways(); seedCompanySession({}, 'drawer-upload'); });
afterEach(() => { cleanup(); endCompanySession(); DossierStore.clearAllPathways(); vi.unstubAllGlobals(); });

describe('Dossier attachment uploads report the Vault outcome', () => {
  it('lists only the exact confirmed file when same-name files have different outcomes', async () => {
    let count = 0;
    stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => {
      count += 1;
      return count === 1 ? success(init) : { status: 409, json: async () => ({ error: { code: 'VERSION_CONTENT_CONFLICT', message: 'Different bytes are already recorded at this name.' } }) };
    }));
    mount();
    selectFiles([file('duplicate.txt', 'first'), file('duplicate.txt', 'second different bytes')]);
    await screen.findByRole('alert');
    expect(stored()).toHaveLength(1);
    expect(stored()[0].size).toBe(5);
    expect(document.querySelectorAll('.dd-att-row')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toContain('Not filed');
  });

  it.each(['unknown receipt', 'refused file'] as const)('shows a visible %s instead of silently leaving an empty attachment list', async (kind) => {
    stubIngestXhr(vi.fn(async () => kind === 'unknown receipt'
      ? { status: 201, json: async () => ({ success: true }) }
      : { status: 422, json: async () => ({ error: { code: 'INVALID_FILE', message: 'This file format was refused.' } }) }));
    mount();
    selectFiles([file('unconfirmed.txt')]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(kind === 'unknown receipt' ? /not known whether.*recorded/i : /not filed.*file format was refused/i);
    if (kind === 'unknown receipt') expect(alert.textContent).toMatch(/reload the vault and check/i);
    expect(stored()).toEqual([]);
    expect(document.querySelectorAll('.dd-att-row')).toHaveLength(0);
  });

  it('announces a confirmed upload and keeps its local list distinct from the recorded audit history', async () => {
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => success(init)));
    const drawer = mount();
    selectFiles([file('accepted.txt')]);
    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toMatch(/Unfiled/i);
    expect(document.querySelector('.dd-att-name')?.textContent).toBe('accepted.txt');
    fireEvent.click(screen.getByRole('tab', { name: /^Activity/ }));
    expect(screen.getByTestId('dd-act-no-document')).toBeTruthy();
    expect(drawer.container.textContent).not.toContain('Reg Lead');
  });
});

describe('Dossier attachment dispatch belongs to the open section visit', () => {
  it.each(['close', 'section', 'close and reopen'] as const)('retires a partly confirmed batch on %s and never associates its rows later', async (transition) => {
    const held = deferred();
    let count = 0;
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => {
      count += 1;
      if (count === 2) await held.promise;
      return success(init);
    }));
    const drawer = mount();
    selectFiles([file('first-confirmed.txt'), file('held.txt'), file('must-not-send.txt')]);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    if (transition === 'section') drawer.change({ target: { id: 'another-section', label: 'Another section' } });
    else drawer.change({ open: false });
    if (transition === 'close and reopen') { drawer.change({ open: true }); drawer.attachments(); }
    await act(async () => { held.release(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(stored()).toEqual([]);
    expect(DossierStore.readSectionAttachments('k510', 'another-section', 'Another section')).toEqual([]);
    expect(document.querySelectorAll('.dd-att-row')).toHaveLength(0);
  });

  it('disables and guards picker and drop dispatch while the current request is busy', async () => {
    const held = deferred();
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => { await held.promise; return success(init); }));
    mount();
    selectFiles([file('first.txt')]);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/uploading/i);
    const drop = document.querySelector('.dd-att-drop')!;
    expect(drop.getAttribute('aria-disabled')).toBe('true');
    fireEvent.drop(drop, { dataTransfer: { files: [file('duplicate-drop.txt')] } });
    await act(async () => { held.release(); });
    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(request).toHaveBeenCalledTimes(1);
    expect(stored()[0].name).toBe('first.txt');
    expect(input.disabled).toBe(false);
  });
});
