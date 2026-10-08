// @vitest-environment jsdom
/**
 * ConversationFilesAdopt — a chat file with no project reaches the open
 * project's Data Room through one audited adopt (PF-07).
 *
 * Pins the four states (nothing to offer, a failed read, a successful adopt, a
 * refused one) and that ProjectHome's Data Room mounts it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ConversationFilesAdopt } from '../surfaces/ConversationFilesAdopt';
import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '11111111-1111-4111-8111-111111111111';
const LIST = `/api/c2c/projects/${PID}/conversation-files`;
const ADOPT = `/api/c2c/projects/${PID}/adopt`;
const ok = (data: unknown, status = 200) => ({ ok: true, status, json: async () => data }) as Response;
const FILE = { id: 'fu-1', name: 'ib-attachment.pdf', mimeType: 'application/pdf', fileSize: 1200, uploadedAt: '2026-09-29T10:00:00Z' };

function route(handlers: Record<string, (body?: unknown) => Promise<Response>>) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const h = handlers[`${method} ${url}`];
    return h ? h(body) : ok({});
  });
}

beforeEach(() => apiRequest.mockReset());
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('ConversationFilesAdopt', () => {
  it('lists the caller’s conversation files and adds one to the project through the adopt route', async () => {
    let listed = [FILE];
    route({
      [`GET ${LIST}`]: async () => ok({ projectId: PID, files: listed }),
      [`POST ${ADOPT}`]: async () => {
        listed = [];
        return ok({ adopted: true, sourceId: 77 }, 201);
      },
    });
    const onAdopted = vi.fn();
    render(<ConversationFilesAdopt pid={PID} onAdopted={onAdopted} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to this project' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/ib-attachment\.pdf is now in this project's Data Room/));
    expect(apiRequest).toHaveBeenCalledWith('POST', ADOPT, { fileUploadId: 'fu-1' });
    expect(onAdopted).toHaveBeenCalledTimes(1);
    // The list is read again, and the adopted file is no longer offered.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add to this project' })).toBeNull());
  });

  it('a refused adopt says what the server said, and changes nothing', async () => {
    route({
      [`GET ${LIST}`]: async () => ok({ projectId: PID, files: [FILE] }),
      [`POST ${ADOPT}`]: async () => {
        throw new Error('The file carries no content identity, so it cannot become a source');
      },
    });
    const onAdopted = vi.fn();
    render(<ConversationFilesAdopt pid={PID} onAdopted={onAdopted} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to this project' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/was not added — The file carries no content identity/));
    expect(onAdopted).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add to this project' })).toBeTruthy();
  });

  it('a failed read says so — it is not an empty list', async () => {
    route({ [`GET ${LIST}`]: async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }) as Response });
    render(<ConversationFilesAdopt pid={PID} onAdopted={vi.fn()} />);
    expect(await screen.findByText(/could not be read, so none are offered here/)).toBeTruthy();
  });

  it('with nothing to offer, renders nothing', async () => {
    route({ [`GET ${LIST}`]: async () => ok({ projectId: PID, files: [] }) });
    const { container } = render(<ConversationFilesAdopt pid={PID} onAdopted={vi.fn()} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(container.querySelector('[data-conversation-files]')).toBeNull();
  });

  it('is mounted in ProjectHome’s Data Room for the open project', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    route({
      [`GET ${LIST}`]: async () => ok({ projectId: PID, files: [FILE] }),
      [`GET /api/c2c/projects/${PID}`]: async () => ok({ id: PID, name: 'BX-301', code: 'BX301' }),
      [`GET /api/c2c/projects/${PID}/sources`]: async () => ok({ projectId: PID, sources: [] }),
    });
    const props = { surface: { id: 'project-home', label: 'Project' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' };
    render(<ProjectHome {...(props as unknown as React.ComponentProps<typeof ProjectHome>)} />);
    // The Data Room is on the Evidence tab (FILING_SPINE.md F3).
    fireEvent.click(Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find((b) => b.textContent?.trim() === 'Evidence')!);
    expect(await screen.findByRole('button', { name: 'Add to this project' })).toBeTruthy();
  });
});
