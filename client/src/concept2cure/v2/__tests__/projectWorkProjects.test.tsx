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

// The signed-in person, for the Plan's Assign (PlanAssign.tsx): null is a person with no permissions list, who may write.
const auth = vi.hoisted(() => ({ user: null as null | { id: string; permissions?: string[] } }));
vi.mock('@/services/portal/authService', async (original) => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => auth, useAuthUser: () => auth.user }));

import { ProjectWorkProjects, WORK_PROJECT_TASK_ENTITY, workProjectOpenable } from '../surfaces/ProjectCoreWork';

const PID = '6065271c-d4b0-4936-aad1-02855423a738';
const READ = `/api/project-hierarchy/11/children?programId=${PID}`;
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => body }) as Response;
const child = (id: number, name: string, workKind: string) => ({ id, name, workKind, ownerName: 'JM Smith', status: 'active', depth: 1, path: `11/${id}`, childCount: 0, createdAt: null });
let rows: unknown[] = [];
/** The Plan's task rows (GET /api/tasks/tasks/by-module/Plan), or 'fail'. */
let planTasks: unknown[] | 'fail' = [];
/** The project's changes (GET /api/c2c/projects/:id/source-changes): its Vault-fed sections, or a reply without them. */
let changesReply: Record<string, unknown> | null = null;
let changesStatus = 200;
const PLAN_READ = '/api/tasks/tasks/by-module/Plan';

/** The project's changes, when a case sets them. */
const changesRoute = (method: string, url: string) =>
  method === 'GET' && url === `/api/c2c/projects/${PID}/source-changes` && changesReply ? ok(changesReply, changesStatus) : null;

beforeEach(() => {
  rows = []; planTasks = []; auth.user = null; changesReply = null; changesStatus = 200;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: { name: string; workKind: string }) => {
    if (method === 'GET' && url === READ) return ok({ success: true, data: { parentId: 11, programId: PID, anchorProjectId: 11, children: rows, total: rows.length } });
    const changes = changesRoute(method, url);
    if (changes) return changes;
    if (method === 'GET' && url === PLAN_READ) return planTasks === 'fail' ? ok({ message: 'unavailable' }, 503) : ok({ success: true, data: planTasks, count: planTasks.length });
    if (method === 'GET' && url === '/api/task-management/assignees') return ok({ success: true, data: [{ id: '12', name: 'Dana Ruiz' }] });
    if (method === 'POST' && url === '/api/tasks/tasks') {
      const task = body as unknown as Record<string, unknown>;
      planTasks = [...(planTasks === 'fail' ? [] : planTasks), { taskId: 'task-9', sourceEntityType: task.sourceEntityType, sourceEntityId: task.sourceEntityId,
        assigneeId: 12, assigneeName: 'Dana Ruiz', dueDate: task.dueDate, status: 'pending', createdAt: '2026-11-09T00:00:00Z', moduleData: task.moduleData }];
      return ok({ success: true, data: { taskId: 'task-9', assigneeName: 'Dana Ruiz', assigneeId: 12, sourceEntityType: task.sourceEntityType, sourceEntityId: task.sourceEntityId } }, 201);
    }
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
    const kinds = await screen.findByLabelText(/Kind of work/);
    expect(Array.from(kinds.querySelectorAll('option')).map((o) => o.textContent)).toContain('Quality');
    fireEvent.change(kinds, { target: { value: 'biostatistics' } });
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

  it('opens a work project on its work area where the project offers it, and says when its kind has none (P-83 (b))', async () => {
    rows = [child(101, 'Drug substance CMC', 'cmc'), child(102, 'Study 201 biostatistics', 'biostatistics'),
      child(103, 'Site monitoring', 'rbm'), child(104, 'Tox package', 'nonclinical'), child(105, 'Drug product QA', 'quality')];
    const onOpen = vi.fn();
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange openable={(id) => id !== 'rbm'} onOpen={onOpen} />);
    const cmc = await screen.findByRole('button', { name: /Drug substance CMC/ });
    expect(cmc.getAttribute('title')).toBe('Open CMC / Module 3 on this project');
    fireEvent.click(cmc);
    fireEvent.click(screen.getByRole('button', { name: /Study 201 biostatistics/ }));
    // A Quality work project (P-111 item 5) is a door to the Quality area, in words.
    const quality = screen.getByRole('button', { name: /Drug product QA/ });
    expect(quality.textContent).toContain('Quality · JM Smith');
    fireEvent.click(quality);
    expect(onOpen.mock.calls).toEqual([['cmc'], ['biostatistics'], ['quality']]);
    // An area this project does not offer is no door; a kind with no work area says so, and is no door either.
    expect(screen.queryByRole('button', { name: /Site monitoring/ })).toBeNull();
    expect(screen.getByText('Site monitoring')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tox package/ })).toBeNull();
    expect(screen.getByText(/Nonclinical · JM Smith · No work area for this kind yet/)).toBeTruthy();
  });

  it('opens a Quality work project on the organisation\'s Quality area wherever the person may, whatever the track (P-111 item 5)', () => {
    const trackAreas = new Set(['cmc', 'biostatistics']);
    const all = workProjectOpenable(trackAreas, () => true);
    expect(['cmc', 'biostatistics', 'quality'].map(all)).toEqual([true, true, true]);
    // An area the track does not offer stays no door; a person without the area gets no door to it.
    expect(all('rbm')).toBe(false);
    const noQuality = workProjectOpenable(trackAreas, (id) => id !== 'quality');
    expect([noQuality('cmc'), noQuality('quality')]).toEqual([true, false]);
  });

  it('gives a work project its owner and due date through the Plan\'s assign, and says when its assignment cannot be read', async () => {
    rows = [child(101, 'Drug substance CMC', 'cmc')];
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect(await screen.findByText('No one is assigned to deliver it yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Assign$/ }));
    fireEvent.change(await screen.findByLabelText(/^Person/), { target: { value: '12' } });
    const due = screen.getByLabelText(/^Due date/);
    fireEvent.change(due, { target: { value: '2026-11-30' } });
    fireEvent.click(document.querySelector('.de-btn.primary') as HTMLElement);
    await waitFor(() => expect(apiRequest.mock.calls.some(([m, u]) => m === 'POST' && u === '/api/tasks/tasks')).toBe(true));
    const [, , task] = apiRequest.mock.calls.find(([m, u]) => m === 'POST' && u === '/api/tasks/tasks')!;
    expect(task).toMatchObject({ title: 'Deliver: Drug substance CMC', moduleType: 'Plan', projectId: 11, assigneeId: 12,
      sourceEntityType: WORK_PROJECT_TASK_ENTITY, sourceEntityId: `${PID}:101` });
    expect(await screen.findByText(/Assigned to Dana Ruiz, due Nov 30, 2026/)).toBeTruthy();
    cleanup();
    planTasks = 'fail';
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect(await screen.findByText('Its assignment could not be read.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Assign/ })).toBeNull();
  });
});

describe('the program map beside the work projects (S12 gap 5)', () => {
  it('beside the work projects, names the filing\'s sections drafted from the Vault with their standing, unattributed (S12 gap 5)', async () => {
    rows = [child(101, 'Drug substance CMC', 'cmc')];
    const feed = (sectionCode: string, state: 'current' | 'replaced', citedVersion: string, approvedVersion: string | null) => ({
      sectionId: `s-${sectionCode}`, sectionCode, documentTitle: 'Module 3 quality', citedVaultId: `v-${sectionCode}`, citedVersion,
      vaultTitle: 'Drug substance specification', state, approvedVaultId: approvedVersion ? 'v-new' : null, approvedVersion });
    const vaultFeeds = [feed('3.2.S.4.1', 'replaced', '1.0', '3.0'), feed('3.2.S.4.2', 'current', '3.0', null)];
    changesReply = { changes: [], count: 0, vaultChanges: [], vaultCount: 0, vaultFeeds, vaultFeedCount: 2, vaultFamilies: [], vaultFamiliesTruncated: false };
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    const map = await screen.findByTestId('pj-vault-feeds');
    expect(map.textContent).toContain('2 sections of this filing were drafted from Vault versions; 1 was replaced since cited.');
    expect(map.querySelector('h4')).toBeNull();
    expect(map.textContent).toContain('Which work project produced each version is not recorded yet.');
    expect(within(map).getByText('Module 3 quality · 3.2.S.4.1 — Drug substance specification v1.0 · replaced since cited; v3.0 is approved')).toBeTruthy();
    expect(within(map).getByText('Module 3 quality · 3.2.S.4.2 — Drug substance specification v3.0 · current')).toBeTruthy();
    cleanup();
    changesReply = { changes: [], count: 0, vaultChanges: [], vaultCount: 0 };
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect(await screen.findByText('The sections drafted from the Vault could not be checked.')).toBeTruthy();
    expect(screen.queryByTestId('pj-vault-feeds')).toBeNull();
    cleanup();
    // A refused read says the refusal (the shared readRefusalWords rule), never "could not be checked".
    changesReply = { error: 'PROJECT_PERMISSION_DENIED', message: 'Denied.' }; changesStatus = 403;
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    const refused = await screen.findByTestId('pj-vault-feeds-unread');
    expect(refused.textContent).not.toContain('could not be checked');
    expect(refused.textContent).toMatch(/the sections drafted from the Vault/);
  });

  it('names the Vault document a work project is assigned to produce, re-checked on read, and never as lineage (S12 gap 5)', async () => {
    rows = [child(101, 'Drug substance CMC', 'cmc')];
    const spec = { documentCode: 'DS-SPEC', title: 'Drug substance specification', version: '2.0' };
    changesReply = { changes: [], count: 0, vaultChanges: [], vaultCount: 0, vaultFeeds: [], vaultFeedCount: 0,
      vaultFamilies: [spec, { documentCode: 'DS-PROC', title: 'Drug substance process', version: '1.0' }], vaultFamiliesTruncated: false };
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect(await screen.findByText('No one is assigned to deliver it yet.')).toBeTruthy();
    expect(screen.queryByTestId('pj-work-project-produces')).toBeNull();
    // The picker lists the program's current families; choosing one sends its code with the Plan's task.
    const picker = await screen.findByLabelText(/Vault document it produces/);
    expect(Array.from(picker.querySelectorAll('option')).map((o) => o.textContent))
      .toEqual(['Not named', 'Drug substance specification · DS-SPEC · v2.0', 'Drug substance process · DS-PROC · v1.0']);
    fireEvent.change(picker, { target: { value: 'DS-SPEC' } });
    fireEvent.click(screen.getByRole('button', { name: /^Assign$/ }));
    fireEvent.change(await screen.findByLabelText(/^Person/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/^Due date/), { target: { value: '2026-11-30' } });
    fireEvent.click(document.querySelector('.de-btn.primary') as HTMLElement);
    await waitFor(() => expect(apiRequest.mock.calls.some(([m, u]) => m === 'POST' && u === '/api/tasks/tasks')).toBe(true));
    const [, , task] = apiRequest.mock.calls.find(([m, u]) => m === 'POST' && u === '/api/tasks/tasks')!;
    expect(task).toMatchObject({ moduleData: { programId: PID, workProjectId: 101, vaultDocumentCode: 'DS-SPEC' } });
    expect((await screen.findByTestId('pj-work-project-produces')).textContent)
      .toBe('Assigned to produce Drug substance specification (current v2.0)');
    expect(screen.queryByTestId('pj-work-project-family-partial')).toBeNull();
    cleanup();
    // Read again, the picker starts from the assigned family, so assigning another person keeps it.
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    await screen.findByTestId('pj-work-project-produces');
    expect((screen.getByLabelText(/Vault document it produces/) as HTMLSelectElement).value).toBe('DS-SPEC');
    cleanup();
    // A person who may not write is told what it was assigned to produce, and offered no picker.
    auth.user = { id: '7', permissions: ['read'] };
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    await screen.findByTestId('pj-work-project-produces');
    expect(screen.queryByLabelText(/Vault document it produces/)).toBeNull();
    auth.user = null;
    cleanup();
    // The family is gone from the program's complete list: said, as a warning.
    changesReply = { ...changesReply, vaultFamilies: [] };
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect((await screen.findByTestId('pj-work-project-produces')).textContent)
      .toBe('The assigned Vault document (DS-SPEC) is no longer in this project’s Vault.');
    cleanup();
    // A list that was cut short cannot say it is gone, and its picker says it is partial.
    changesReply = { ...changesReply, vaultFamilies: [{ documentCode: 'DS-PROC', title: 'Drug substance process', version: '1.0' }],
      vaultFamiliesTruncated: true };
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect((await screen.findByTestId('pj-work-project-produces')).textContent)
      .toBe('The assigned Vault document (DS-SPEC) could not be checked.');
    expect(screen.getByTestId('pj-work-project-family-partial').textContent).toBe('Showing the first 1 Vault document.');
    cleanup();
    // A map that could not be read offers no picker, and cannot say the family is current.
    changesReply = { changes: [], count: 0 };
    render(<ProjectWorkProjects programId={PID} anchorProjectId={11} canChange />);
    expect((await screen.findByTestId('pj-work-project-produces')).textContent)
      .toBe('The assigned Vault document (DS-SPEC) could not be checked.');
    expect(screen.queryByLabelText(/Vault document it produces/)).toBeNull();
  });
});
