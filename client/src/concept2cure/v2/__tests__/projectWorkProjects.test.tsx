// @vitest-environment jsdom
/**
 * S12 (founder decisions P-83, P-109): the project's work projects, in Project knowledge's Work areas card. They are
 * read from GET /api/project-hierarchy/:anchor/children?programId= and added through the one intake, POST
 * /api/c2c/projects with { parentProjectId, workKind }, the routes tests/db/work-projects.dbtest.ts pins on PostgreSQL under row-level security. Pinned here: the read is by the
 * project's verified integer id and its program; a failed read says so, never "none"; adding posts the kind and name
 * and reads again; a refusal is said; a person who may not change the project is offered no add.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));

import { ProjectWorkProjects } from '../surfaces/ProjectCoreWork';

const PID = '6065271c-d4b0-4936-aad1-02855423a738';
const READ = `/api/project-hierarchy/11/children?programId=${PID}`;
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => body }) as Response;
const child = (id: number, name: string, workKind: string) => ({ id, name, workKind, ownerName: 'JM Smith', status: 'active', depth: 1, path: `11/${id}`, childCount: 0, createdAt: null });
let rows: unknown[] = [];

beforeEach(() => {
  rows = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: { name: string; workKind: string }) => {
    if (method === 'GET' && url === READ) return ok({ success: true, data: { parentId: 11, programId: PID, anchorProjectId: 11, children: rows, total: rows.length } });
    if (method === 'POST' && url === '/api/c2c/projects') {
      rows = [...rows, child(101, body!.name, body!.workKind)];
      return ok({ data: { projectId: 101, created: true, parentId: 11, depth: 1, path: '11/101', programId: PID, ...body }, meta: { created: true } }, 201);
    }
    return ok({}, 404);
  });
});
afterEach(() => cleanup());

describe('the project\'s work projects (S12)', () => {
  it('lists them by the project\'s verified id and program, with their kind in words', async () => {
    rows = [child(101, 'Drug substance CMC', 'cmc'), child(102, 'Study 201 biostatistics', 'biostatistics')];
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    const list = await screen.findByTestId('pj-work-projects');
    await within(list).findByText('Drug substance CMC');
    expect(list.textContent).toContain('CMC · JM Smith');
    expect(list.textContent).toContain('Biostatistics · JM Smith');
    expect(apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === READ)).toBe(true);
  });

  it('says none, and a failed read is an error, never "none"', async () => {
    const { unmount } = render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect(await screen.findByText(/None yet/)).toBeTruthy();
    unmount();
    apiRequest.mockImplementation(async () => ok({ success: false, error: { code: 'PROJECT_ACCESS_UNAVAILABLE' } }, 503));
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect(await screen.findByText("This project's work projects could not be read.")).toBeTruthy();
    expect(screen.queryByText(/None yet/)).toBeNull();
  });

  it('adds one with its kind and name, then lists it', async () => {
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    await screen.findByText(/None yet/);
    fireEvent.click(screen.getByRole('button', { name: /Add a work project/ }));
    fireEvent.change(await screen.findByLabelText(/Kind of work/), { target: { value: 'biostatistics' } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Study 201 biostatistics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add work project' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/c2c/projects',
      { parentProjectId: 11, name: 'Study 201 biostatistics', workKind: 'biostatistics' }));
    expect(await screen.findByText('Study 201 biostatistics')).toBeTruthy();
  });

  it('says a refusal, and offers no add to a person who may not change the project, nor anything before the id is known', async () => {
    apiRequest.mockImplementation(async (method: string) => method === 'GET'
      ? ok({ success: true, data: { children: [] } })
      : ok({ error: 'PARENT_NOT_IN_PROGRAM', message: "The parent is not a program's project or one of its work projects." }, 404));
    const { unmount } = render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    await screen.findByText(/None yet/);
    fireEvent.click(screen.getByRole('button', { name: /Add a work project/ }));
    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Elsewhere' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add work project' }));
    expect(await screen.findByText(/The work project was not added: .*not a program's project/)).toBeTruthy();
    unmount();
    const viewer = render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange={false} />);
    await screen.findByText(/None yet/);
    expect(screen.queryByRole('button', { name: /Add a work project/ })).toBeNull();
    viewer.unmount();
    apiRequest.mockClear();
    const { container } = render(<ProjectWorkProjects programId={PID} anchorProjectId={null} canChange />);
    expect(container.textContent).toBe('');
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
