// @vitest-environment jsdom
/**
 * The Client Review Room on the device project (D2, fold F6, 2026-10-30;
 * decision P-61 item 5: the room admits the project before anything is read or
 * shared; docs/evidence/D2-ONE-ANA/2026-10-30/fold-f6-device-workstream/).
 *
 * The room was drawn on the kit portfolio (mdx/surfaces/Overview.tsx) with no
 * project, so it read the organization's room: every project's client-visible
 * tasks. The portfolio is retired into Projects; the room is mounted on the
 * device project's Review step (ProjectHome.tsx) for that project only. It asks
 * GET /api/mdx/client-review with the project's verified integer id and its
 * program, so the route admits both before anything is read
 * (server/routes/__tests__/mdx-client-review-admits-project.test.ts), and says it
 * is the project's room. With no verified project it reads nothing.
 *
 * Only the transport (`fetch`) is replaced.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { ProjectClientReview } from '../surfaces/ProjectClientReview';

const PROGRAM = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const fetchMock = vi.fn();
const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const TASK = {
  taskId: 't-1', title: 'Confirm the predicate device list', description: null, status: 'open', priority: 'high',
  progress: null, taskType: null, moduleType: 'device', projectId: 12, lifecyclePhase: null, market: 'US',
  filingType: '510(k)', clientVisibility: 'client_action_required', dueDate: null, completedAt: null,
  updatedAt: '2026-10-29T10:00:00Z',
};
const ROOM = {
  data: {
    groups: { client_action_required: [TASK], client_visible: [], authority_ready: [] },
    counts: { client_action_required: 1, client_visible: 0, authority_ready: 0 },
    total: 1,
  },
  meta: { scope: 'project', projectId: 12, programId: PROGRAM },
};

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(json(200, ROOM));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the Client Review Room on a device project', () => {
  it('asks for this project\'s room, by its verified integer id and its program, and says it is the project\'s', async () => {
    render(<ProjectClientReview programId={PROGRAM} projectId={12} />);
    const room = await screen.findByRole('region', { name: 'Client review' });
    await waitFor(() => expect(room.textContent).toContain('Confirm the predicate device list'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe('/api/mdx/client-review');
    expect(url.searchParams.get('project_id')).toBe('12');
    expect(url.searchParams.get('programId')).toBe(PROGRAM);
    expect(room.textContent).toMatch(/Scoped to the selected project/);
    expect(room.textContent).not.toMatch(/Organization-wide/);
    // Drawn inside the device kit's scope root, where its styles apply.
    expect(room.closest('.mdx-shell')).not.toBeNull();
  });

  it('reads nothing, and draws nothing, until the project is verified', () => {
    const { container, rerender } = render(<ProjectClientReview programId={PROGRAM} projectId={null} />);
    expect(container.innerHTML).toBe('');
    rerender(<ProjectClientReview programId={null} projectId={12} />);
    expect(container.innerHTML).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says a refused or failed read is one, never an empty room', async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: 'NOT_FOUND', message: 'Project not found' } }));
    render(<ProjectClientReview programId={PROGRAM} projectId={12} />);
    const room = await screen.findByRole('region', { name: 'Client review' });
    await waitFor(() => expect(room.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0));
    expect(room.textContent).not.toContain('Confirm the predicate device list');
  });
});
