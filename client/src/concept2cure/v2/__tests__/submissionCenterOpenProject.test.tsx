// @vitest-environment jsdom
/**
 * Submission Center reads the open project (ONE_ANA_ONE_CANVAS.md slice 24).
 *
 * The founder: functionality was split into separate apps instead of following
 * the client's workflow. With a project open, the Submission Center listed
 * every submission of the organization (GET /api/submissions) and asked, on
 * create, which programme the submission belonged to — a project the person
 * had already opened.
 *
 * With a project open it now reads GET /api/submissions?programId=<uuid>, says
 * whose submissions these are and how many others the organization has (the
 * server's meta.notOffered, never a client count), offers a control to list
 * them all, and creates a submission in the open project with no picker. With
 * no project open it reads and creates exactly as before.
 *
 * The review of this slice added four cases: the toggle keeps keyboard focus
 * (WCAG 2.4.3); an unnamed project is not named twice as "the open project";
 * a failed scoped read does not call the list the organization's; and AnA's
 * miss on a submission outside the project says it is outside the list, not
 * that it does not exist.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { __resetSurfaceActionBus, applySurfaceAction, registeredSurfaceId } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const PID = '4c2a9e1b-7d3f-4a51-9b8e-2f6d0c1a3b57';
const SCOPED = `/api/submissions?programId=${PID}`;
const res = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const MINE = {
  id: 41, title: 'ONC-221 IND', productName: 'Vorelinib', applicationType: 'ind', clientType: 'biotech',
  primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PID,
};
const OTHER = {
  id: 42, title: 'BX-990 NDA', productName: 'Other', applicationType: 'nda', clientType: 'pharma',
  primaryRegion: 'fda', status: 'planning', lifecycleStage: 'planning', programId: '0a1b2c3d-0000-4000-8000-000000000001',
};

const posts: unknown[] = [];
function serve(opts: { notOffered?: unknown; failScoped?: boolean; projects?: unknown[] } = {}) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === 'POST' && url === '/api/submissions') {
      posts.push(body);
      return res({ ...MINE, id: 77, title: (body as { title: string }).title }, 201);
    }
    // The server's scoped read: the program's rows, the count it left out in meta.
    if (method === 'GET' && url === SCOPED) {
      if (opts.failScoped) throw Object.assign(new Error('Server error'), { status: 500 });
      return res({ data: [MINE], meta: 'notOffered' in opts ? { notOffered: opts.notOffered } : { notOffered: 3 } });
    }
    // The unscoped read returns the organization's rows bare (routes/submissions.ts).
    if (method === 'GET' && url === '/api/submissions') return res([MINE, OTHER]);
    if (method === 'GET' && url === '/api/c2c/projects') {
      return res({ data: opts.projects ?? [{ id: PID, title: 'ONC-221 · Vorelinib', code: 'ONC-221' }] });
    }
    return res({ data: [] });
  });
}

const urls = () => apiRequest.mock.calls.map((c) => String(c[1]));
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  posts.length = 0;
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Submission Center — with a project open', () => {
  it('reads the project-scoped list, not the organization, and lists only its submissions', async () => {
    serve();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open ONC-221 IND' });
    expect(urls()).toContain(SCOPED);
    expect(urls()).not.toContain('/api/submissions');
    expect(screen.queryByRole('button', { name: 'Open BX-990 NDA' })).toBeNull();
  });

  it('says whose submissions these are and how many others the server left out', async () => {
    serve();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    const line = await screen.findByTestId('sc-scope');
    await waitFor(() => expect(line.textContent).toMatch(/3 other submissions in your organization are not shown/));
    expect(line.textContent).toMatch(/Submissions of ONC-221, the open project\./);
  });

  it('shows every submission of the organization on request, and can go back', async () => {
    serve();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: "Show all of the organization's submissions" }));
    await screen.findByRole('button', { name: 'Open BX-990 NDA' });
    expect(urls()).toContain('/api/submissions');
    expect(screen.getByTestId('sc-scope').textContent).toMatch(/Every submission in your organization\./);
    fireEvent.click(screen.getByRole('button', { name: "Show only ONC-221's submissions" }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open BX-990 NDA' })).toBeNull());
  });

  it('does not guess the count of others when the server did not send one', async () => {
    serve({ notOffered: undefined });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open ONC-221 IND' });
    const line = screen.getByTestId('sc-scope').textContent ?? '';
    expect(line).toMatch(/Submissions of ONC-221, the open project\./);
    expect(line).not.toMatch(/not shown|no other submissions/);
    // The way to the others stays: their number is unknown, not zero.
    expect(screen.getByRole('button', { name: "Show all of the organization's submissions" })).toBeTruthy();
  });

  it('creates the submission in the open project: no programme picker, the project named', async () => {
    serve();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /New submission/ }));
    await screen.findByLabelText(/Title/);
    expect(screen.queryByRole('combobox', { name: /^Project/ })).toBeNull();
    const project = screen.getByLabelText(/Project/) as HTMLInputElement;
    expect(project.value).toBe('ONC-221');
    expect(project.readOnly).toBe(true);

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'ONC-221 — EU MAA' } });
    fireEvent.change(screen.getByLabelText(/Application type/), { target: { value: 'maa' } });
    fireEvent.change(screen.getByLabelText(/Primary region/), { target: { value: 'eu' } });
    // No client type is preselected unless the project's product type or the
    // open workspace names one (F20: no longer Biotech for every submission).
    fireEvent.change(screen.getByLabelText(/Client type/), { target: { value: 'biotech' } });
    fireEvent.click(screen.getByRole('button', { name: /Create submission/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ title: 'ONC-221 — EU MAA', programId: PID, applicationType: 'maa', primaryRegion: 'eu' });
  });
});

describe('Submission Center — with no project open', () => {
  it('reads the organization as before, with no scope line and the programme picker', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    serve();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open BX-990 NDA' });
    expect(urls()).toContain('/api/submissions');
    expect(urls()).not.toContain(SCOPED);
    expect(screen.queryByTestId('sc-scope')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /New submission/ }));
    expect(await screen.findByRole('combobox', { name: /^Project/ })).toBeTruthy();
    expect(text()).not.toMatch(/the open project/);
  });
});

describe('Submission Center — the open project, as the review found it', () => {
  it('keeps keyboard focus on the scope toggle in both directions', async () => {
    serve();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    const showAll = await screen.findByRole('button', { name: "Show all of the organization's submissions" });
    showAll.focus();
    fireEvent.click(showAll);
    const showOnly = await screen.findByRole('button', { name: "Show only ONC-221's submissions" });
    // The same element, relabelled — not a new button with focus left on <body>.
    expect(showOnly).toBe(showAll);
    expect(document.activeElement).toBe(showOnly);
    fireEvent.click(showOnly);
    const back = await screen.findByRole('button', { name: "Show all of the organization's submissions" });
    expect(document.activeElement).toBe(back);
  });

  it('a project known only by its id is "the open project" once, not twice', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID };
    serve({ projects: [] });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open ONC-221 IND' });
    const line = screen.getByTestId('sc-scope').textContent ?? '';
    expect(line).toMatch(/Submissions of the open project\./);
    expect(line).not.toMatch(/the open project, the open project/);
    fireEvent.click(screen.getByRole('button', { name: "Show all of the organization's submissions" }));
    expect(await screen.findByRole('button', { name: "Show only the open project's submissions" })).toBeTruthy();
  });

  it('a failed scoped read does not call the list the organization’s', async () => {
    serve({ failScoped: true });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    expect(await screen.findByText("Couldn't load the submissions")).toBeTruthy();
    expect(text()).toMatch(/this project's submissions could not be read/);
    expect(text()).not.toMatch(/These are your organization's submissions/);
  });

  it('AnA asking for another project’s submission is told it is not listed here, not that it does not exist', async () => {
    serve();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open ONC-221 IND' });
    await waitFor(() => expect(screen.getByTestId('sc-scope').textContent).toMatch(/3 other submissions/));
    await waitFor(() => expect(registeredSurfaceId()).toBe('submission-center'));
    const resolved = resolveSurfaceAction('submissions.select-submission', { submission: 'BX-990 NDA' });
    if (!resolved.ok) throw new Error(resolved.error);
    let outcome: { status: string; reason?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(resolved.directive, vi.fn()) as typeof outcome;
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toMatch(/among the open project's submissions \(ONC-221\)/);
    expect(outcome.reason).toMatch(/3 other submissions of the organization are not listed here/);
    expect(outcome.reason).toMatch(/Show all of the organization's submissions/);
    expect(outcome.reason).not.toMatch(/in this portfolio/);
  });
});
