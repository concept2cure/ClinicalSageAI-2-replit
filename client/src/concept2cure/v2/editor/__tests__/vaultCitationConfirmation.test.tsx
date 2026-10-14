// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ProjectFilesPanel } from '../ProjectFilesPanel';
import type { FireToast } from '../../toast';

const programId = '11111111-1111-4111-8111-111111111111';
const source = { id: 5, title: 'Protocol', checksum: 'sha-protocol', extractionStatus: 'extracted',
  isCurrent: true, dataEligible: true, originalFileAvailable: true };
const upload = { id: 'upload-5', num: '', title: 'Protocol', type: 'Protocol', status: 'unfiled', pct: null,
  owner: '', ver: '', updated: '', preview: '', src: 'upload', docId: 'upload-5', hash: 'sha-protocol' };
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { tree: [upload], documentCount: 1 } }) });
});
afterEach(() => cleanup());

async function setup(onCite: () => Promise<boolean>, fireToast: FireToast) {
  const view = render(<ProjectFilesPanel programId={programId} programName="IND project" fireToast={fireToast}
    sectionOpen sectionCode="2.5" projectSources={[source]} onCite={onCite} onInsertReference={() => false} />);
  fireEvent.click(await screen.findByRole('button', { name: /Protocol/ }));
  fireEvent.click(screen.getByTestId('pf-cite'));
  return view;
}

describe('Vault citation outcomes follow the confirmed editor insertion', () => {
  it('waits for confirmation and holds repeated clicks', async () => {
    let finish!: (inserted: boolean) => void;
    const onCite = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const toast = vi.fn();
    await setup(onCite, toast);
    fireEvent.click(screen.getByTestId('pf-cite'));
    expect(toast).not.toHaveBeenCalled();
    expect(onCite).toHaveBeenCalledTimes(1);
    await act(async () => finish(true));
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Cited “Protocol”'), 'ok');
  });

  it('reports a refused insertion without claiming a citation', async () => {
    const toast = vi.fn();
    await setup(async () => false, toast);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Couldn’t insert the citation'), 'error');
    expect(toast.mock.calls.some(([, tone]) => tone === 'ok')).toBe(false);
  });

  it('does not report an old citation outcome after the rail is unmounted', async () => {
    let finish!: (inserted: boolean) => void;
    const toast = vi.fn();
    const view = await setup(() => new Promise<boolean>(resolve => { finish = resolve; }), toast);
    view.unmount();
    await act(async () => finish(true));
    expect(toast).not.toHaveBeenCalled();
  });
});
