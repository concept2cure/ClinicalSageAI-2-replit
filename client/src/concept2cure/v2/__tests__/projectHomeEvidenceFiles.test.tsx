// @vitest-environment jsdom
/**
 * The project's page holds its files.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md slice 23. The Evidence stage said "The
 * document vault opens in its own workspace" and showed nothing: a person on
 * their project had to leave it to see what the project holds. It now shows
 * the project's vault through the one files panel the editor uses beside a
 * document (editor/ProjectFilesPanel.tsx): the same read, the same audited
 * Open, and a failed read shown as a failure. On this page there is no editor,
 * so the panel offers no Close and does not ask for a section to cite into.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { ProjectFilesPanel } from '../editor/ProjectFilesPanel';

const PID = '0f3c1a2b-1111-4222-8333-444455556666';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'x' }) } as Response);
const props = () => ({ surface: { id: 'project-home', label: 'Project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const PROTOCOL = {
  id: 'upload-1', num: '', title: 'BX-301 Protocol v3.pdf', type: 'Protocol', status: 'unfiled', pct: null,
  owner: '', ver: '', updated: '', preview: '', src: 'upload', docId: 'upload-1',
};

function route(vault: 'ok' | 'error') {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ title: 'BX-301', readiness: 42 });
    if (url.startsWith('/api/chat/threads?program_id=')) return ok({ threads: [] });
    if (url === `/api/c2c/project-vault/${PID}`) {
      return vault === 'error' ? fail(503) : ok({ success: true, data: { tree: [PROTOCOL] } });
    }
    return ok({});
  });
}

function openEvidence(container: HTMLElement) {
  const tab = [...container.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')].find(b => /Evidence/.test(b.textContent ?? ''));
  expect(tab, 'the Evidence stage').toBeTruthy();
  fireEvent.click(tab!);
}

beforeEach(() => { apiRequest.mockReset(); (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('Project home — the Evidence stage holds the project\'s files', () => {
  it('lists the project\'s vault from the project-scoped read, on the page', async () => {
    route('ok');
    const { container } = render(<ProjectHome {...props()} />);
    openEvidence(container);
    expect(await screen.findByText('BX-301 Protocol v3.pdf')).toBeTruthy();
    expect(apiRequest.mock.calls.some(c => c[1] === `/api/c2c/project-vault/${PID}`), 'read by the project id').toBe(true);
    expect(screen.queryByText(/opens in its own workspace/)).toBeNull();
  });

  it('a file can be opened here; nothing asks for a section or offers to close a rail', async () => {
    route('ok');
    const { container } = render(<ProjectHome {...props()} />);
    openEvidence(container);
    fireEvent.click(await screen.findByText('BX-301 Protocol v3.pdf'));
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    expect(screen.queryByText(/Open an editable section/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close project files' })).toBeNull();
  });

  it('a failed read is a failure with a retry, not an empty vault', async () => {
    route('error');
    const { container } = render(<ProjectHome {...props()} />);
    openEvidence(container);
    expect(await screen.findByText('Couldn’t read the project vault')).toBeTruthy();
    expect(screen.queryByText('Nothing in the vault yet')).toBeNull();
  });
});

describe('ProjectFilesPanel beside the editor is unchanged', () => {
  it('keeps its rail header and asks for a section before citing', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === `/api/c2c/project-vault/${PID}`) return ok({ success: true, data: { tree: [PROTOCOL] } });
      throw new Error(`unexpected request ${url}`);
    });
    render(
      <ProjectFilesPanel
        programId={PID} programName="BX-301" onClose={() => {}} fireToast={vi.fn()}
        sectionOpen={false} sectionCode={null} projectSources={[]}
        onCite={() => false} onInsertReference={() => false}
      />,
    );
    fireEvent.click(await screen.findByText('BX-301 Protocol v3.pdf'));
    expect(screen.getByRole('button', { name: 'Close project files' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Open an editable section to cite/)).toBeTruthy());
  });
});
