// @vitest-environment jsdom
/**
 * Human factors reads the open project's HFE/UE file (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-features-human-factors/).
 *
 * The screen read `GET /api/human-factors`, the organization's first file, and
 * hid its panels because it could not tie the file to the project (slice 0).
 * The map places the screen in the project (INFORMATION_ARCHITECTURE.md
 * section 5, the `human-factors` row; slice 19), and `hf_engineering_files`
 * now records the project (20261029). So the screen asks the shell which
 * project is open (useShellProject), reads `?program_id=` with it, and shows a
 * file only when the route says the read is that project's (`meta.scope:
 * 'program'` and `meta.programId`). Its writes carry the same project. With no
 * project open it reads nothing and says a project is needed.
 *
 * A project with no file of its own offers "Start the usability file" (slice
 * 19), which records the device's file for this project over the existing
 * POST. A refused or failed start says so, and no file is shown.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
type Published = { summary?: string; facts?: Record<string, unknown>; availableActions?: string[] };
const published = vi.hoisted(() => ({ current: null as null | Published }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (_id: string, ctx: Published) => { published.current = ctx; },
}));

import { ApiRequestError } from '@/lib/queryClient';
import { HumanFactors } from '../surfaces/HumanFactors';
import { clearShellProject, publishShellProject } from '../shellProject';

const A = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const B = '7d1e2f3a-5b6c-4d7e-8f90-a1b2c3d4e5f6';
const fileOf = (device: string) => ({
  device, framework: 'IEC 62366-1', present: { useSpecification: true, userProfiles: true },
  scenarios: [{ id: 'hfs-1', task: `${device} bolus entry`, useError: 'Decimal misplaced', potentialHarmSeverity: 'critical', mitigated: false }],
});
const keyedTo = (programId: string, data: unknown) => ({ data, meta: { count: data ? 1 : 0, source: 'hf_engineering_files', scope: 'program', programId } });
/** What each project's read answers. Replaced per case. */
let files: Record<string, unknown> = {};
/** A read answered for something other than the open project. */
let override: ((path: string) => unknown) | null = null;

const calls: Array<{ method: string; path: string; body: unknown }> = [];
let held: { id: string; release: () => void } | null = null;
let onWrite: (method: string, path: string, body: unknown) => unknown = () => ({ data: null });
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body } as Response);

beforeEach(() => {
  calls.length = 0;
  held = null;
  override = null;
  files = { [A]: keyedTo(A, fileOf('Aurora CGM')), [B]: keyedTo(B, fileOf('Borealis monitor')) };
  onWrite = () => ({ data: null });
  published.current = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, rawPath: unknown, body?: unknown) => {
    const path = String(rawPath ?? '');
    calls.push({ method, path, body });
    if (method !== 'GET') return ok(onWrite(method, path, body), 201);
    if (held && path.includes(held.id)) await new Promise<void>((resolve) => { held!.release = resolve; });
    if (override) return ok(override(path));
    const pid = new URL(path, 'http://test').searchParams.get('program_id');
    return ok(pid && files[pid] ? files[pid] : { data: null, meta: { count: 0 } });
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

const mount = (onNav = vi.fn()) =>
  render(<HumanFactors {...({ surface: { id: 'human-factors', label: 'Human factors' }, onAsk: vi.fn(), onNav, segment: 'device' } as unknown as React.ComponentProps<typeof HumanFactors>)} />);
const text = () => document.body.textContent ?? '';
const reads = () => calls.filter((c) => c.method === 'GET' && c.path.startsWith('/api/human-factors')).map((c) => c.path);
const settle = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

describe('HumanFactors reads the open project', () => {
  it('reads the open project\'s file by project, and shows it', async () => {
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await waitFor(() => expect(text()).toMatch(/Aurora CGM — use-related risk analysis/));
    expect(reads()).toEqual([`/api/human-factors?program_id=${A}`]);
    expect(text()).toMatch(/Aurora CGM bolus entry/);
    expect(published.current?.summary ?? '').toMatch(/for Aurora CGM/);
  });

  it('with no project open, reads nothing, says a project is needed, and offers the way to open one', async () => {
    const onNav = vi.fn();
    mount(onNav);
    await settle();
    expect(reads()).toEqual([]);
    expect(screen.getByTestId('hf-no-project').textContent).toMatch(/No project is open/);
    fireEvent.click(screen.getByRole('button', { name: 'Open projects' }));
    expect(onNav).toHaveBeenCalledWith('projects');
    expect(published.current?.summary ?? '').toMatch(/No project is open/);
    expect(screen.queryByRole('button', { name: /Start the usability file/ })).toBeNull();
  });

  it('with an open project it cannot read by project, reads nothing and says that', async () => {
    publishShellProject({ id: '42', title: 'Legacy workspace' });
    mount();
    await settle();
    expect(reads()).toEqual([]);
    expect(screen.getByTestId('hf-no-project').textContent).toMatch(/can't be read by project here/);
  });

  it.each([
    ['the organization\'s unscoped file', { scope: 'organization' }],
    ['a file the route does not scope at all', {}],
    ['another project\'s file', { scope: 'program', programId: B }],
  ] as const)('never shows %s under the open project', async (_what, meta) => {
    override = () => ({ data: fileOf('Other pump'), meta: { count: 1, source: 'hf_engineering_files', ...meta } });
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await screen.findByTestId('hf-not-keyed');
    expect(text()).not.toMatch(/Other pump/);
    expect(JSON.stringify(published.current)).not.toMatch(/Other pump/);
    expect(screen.queryByRole('button', { name: /Add use scenario/ })).toBeNull();
  });

  it('carries the open project on every write into its file', async () => {
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await waitFor(() => expect(text()).toMatch(/Aurora CGM — use-related risk analysis/));
    onWrite = (method, path) => (path.endsWith('/elements')
      ? { data: { device: 'Aurora CGM', framework: 'IEC 62366-1', present: { useSpecification: true, userProfiles: true, useEnvironments: true } } }
      : { data: { id: 'hfs-2', task: 'Sensor insertion', useError: 'Wrong angle', potentialHarmSeverity: 'minor', mitigated: false } });

    fireEvent.click(screen.getByRole('button', { name: /Use environments/ }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/human-factors/elements')).toBe(true));
    expect(calls.find((c) => c.path === '/api/human-factors/elements')?.body).toEqual({ element: 'useEnvironments', present: true, programId: A });

    fireEvent.click(screen.getByRole('button', { name: /Add use scenario/ }));
    fireEvent.change(screen.getByLabelText(/Task \/ use step/), { target: { value: 'Sensor insertion' } });
    fireEvent.change(screen.getByLabelText(/Potential use error/), { target: { value: 'Wrong angle' } });
    fireEvent.change(screen.getByLabelText(/Potential harm severity/), { target: { value: 'minor' } });
    fireEvent.change(screen.getByLabelText(/Mitigation in place/), { target: { value: 'no' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add scenario$/ }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/human-factors/scenarios')).toBe(true));
    expect(calls.find((c) => c.path === '/api/human-factors/scenarios')?.body).toMatchObject({ task: 'Sensor insertion', programId: A });
  });

  it('never draws the previous project\'s file under the next project', async () => {
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await waitFor(() => expect(text()).toMatch(/Aurora CGM/));
    held = { id: B, release: () => {} };
    act(() => publishShellProject({ id: B, title: 'Borealis' }));
    await waitFor(() => expect(reads()).toContain(`/api/human-factors?program_id=${B}`));
    expect(text()).not.toMatch(/Aurora CGM/);
    await act(async () => { held!.release(); });
    await waitFor(() => expect(text()).toMatch(/Borealis monitor/));
  });
});

describe('Start the usability file: a project with no file of its own', () => {
  const startForm = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Start the usability file' }));
    fireEvent.change(screen.getByLabelText(/Device under evaluation/), { target: { value: 'Aurora CGM' } });
    fireEvent.click(screen.getByRole('button', { name: /^Start the file$/ }));
  };

  it('is offered on the project\'s empty file, and records the device\'s file for this project', async () => {
    files[A] = keyedTo(A, null);
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await screen.findByText('No HFE/UE file yet');
    onWrite = () => {
      files[A] = keyedTo(A, { ...fileOf('Aurora CGM'), scenarios: [] });
      return { data: { device: 'Aurora CGM', framework: 'IEC 62366-1', present: {}, scenarios: [] }, id: 'hf-1', meta: { scope: 'program', programId: A } };
    };
    await startForm();
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/human-factors')).toBe(true));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/human-factors')?.body).toEqual({ device: 'Aurora CGM', programId: A });
    // The screen reads the project's file again, and shows what the record now holds.
    await waitFor(() => expect(text()).toMatch(/Aurora CGM — use-related risk analysis/));
    expect(reads().filter((p) => p === `/api/human-factors?program_id=${A}`)).toHaveLength(2);
  });

  it('a refused start says so, and no file is shown', async () => {
    files[A] = keyedTo(A, null);
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await screen.findByText('No HFE/UE file yet');
    onWrite = () => { throw new ApiRequestError('Project not found', 404, null, 'NOT_FOUND'); };
    await startForm();
    await waitFor(() => expect(text()).toMatch(/File not started — Project not found/));
    expect(text()).toMatch(/No HFE\/UE file yet/);
    expect(text()).not.toMatch(/use-related risk analysis and HFE\/UE file completeness/);
  });

  it('a start the route does not record for this project is not taken as one', async () => {
    files[A] = keyedTo(A, null);
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await screen.findByText('No HFE/UE file yet');
    // An answer that is not this project's file: an unscoped create.
    onWrite = () => ({ data: { device: 'Aurora CGM', framework: 'IEC 62366-1', present: {}, scenarios: [] }, id: 'hf-1', meta: { scope: 'organization' } });
    await startForm();
    await waitFor(() => expect(text()).toMatch(/File not started/));
    expect(reads().filter((p) => p === `/api/human-factors?program_id=${A}`)).toHaveLength(1);
  });

  it('is not offered where the empty file is not the project\'s', async () => {
    override = () => ({ data: null, meta: { count: 0, source: 'hf_engineering_files', scope: 'organization' } });
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await screen.findByText('No HFE/UE file yet');
    expect(screen.queryByRole('button', { name: 'Start the usability file' })).toBeNull();
  });
});
