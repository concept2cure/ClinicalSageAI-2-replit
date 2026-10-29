// @vitest-environment jsdom
/**
 * Labeling reads the open project (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-features-reach-three/).
 *
 * Slice 0 made the screen read `GET /api/mdx/labeling?program_id=` only when it
 * was handed `programId`, and no caller handed it one, so it read nothing and
 * said "This screen is not given the open project yet". The map points the
 * device workflow's labeling package here (INFORMATION_ARCHITECTURE.md
 * section 6 and slice 20), so the screen now asks the shell which project is
 * open (useShellProject), the read every other project screen makes.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
type Published = { summary?: string; facts?: Record<string, unknown> };
const published = vi.hoisted(() => ({ current: null as null | Published }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (_id: string, ctx: Published) => { published.current = ctx; },
}));

import { Labeling } from '../surfaces/Labeling';
import { clearShellProject, publishShellProject } from '../shellProject';

const A = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const B = '7d1e2f3a-5b6c-4d7e-8f90-a1b2c3d4e5f6';
const doc = (id: number, program: string, device: string, version: string) => ({
  id, device_name: device, doc_kind: 'ifu', version, organization_id: 7, program_id: program, status: 'draft', udi_di: null,
});
const DOCS: Record<string, ReturnType<typeof doc>> = { [A]: doc(4, A, 'Aurora CGM', '3'), [B]: doc(5, B, 'Borealis monitor', '8') };

const paths: string[] = [];
let held: { id: string; release: () => void } | null = null;
beforeEach(() => {
  paths.length = 0;
  held = null;
  published.current = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    paths.push(path);
    if (held && path.includes(held.id)) await new Promise<void>((resolve) => { held!.release = resolve; });
    const pid = new URL(path, 'http://test').searchParams.get('program_id');
    const data = path.startsWith('/api/mdx/labeling?') && pid && DOCS[pid] ? [DOCS[pid]] : [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

const mount = (onNav = vi.fn()) => render(<Labeling {...({ onAsk: () => {}, onNav } as unknown as React.ComponentProps<typeof Labeling>)} />);
const text = () => document.body.textContent ?? '';
const settle = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

describe('Labeling reads the open project', () => {
  it('reads the open project\'s labeling documents, with no prop from its caller', async () => {
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await waitFor(() => expect(paths).toContain(`/api/mdx/labeling?program_id=${A}`));
    await waitFor(() => expect(text()).toMatch(/Instructions for use v3/));
    expect(paths).not.toContain('/api/mdx/labeling');
    expect(published.current?.summary ?? '').toContain('Aurora CGM');
  });

  it('with no project open, reads nothing, says so, and offers the way to open one', async () => {
    const onNav = vi.fn();
    mount(onNav);
    await settle();
    expect(paths.filter((p) => p.startsWith('/api/mdx/labeling'))).toEqual([]);
    expect(screen.getByTestId('labeling-no-project').textContent).toMatch(/No project is open/);
    fireEvent.click(screen.getByRole('button', { name: 'Open projects' }));
    expect(onNav).toHaveBeenCalledWith('projects');
    expect(published.current?.summary ?? '').toMatch(/No project is open/);
  });

  it('with an open project it cannot read by project, reads nothing and says that', async () => {
    publishShellProject({ id: '42', title: 'Legacy workspace' });
    mount();
    await settle();
    expect(paths.filter((p) => p.startsWith('/api/mdx/labeling'))).toEqual([]);
    expect(screen.getByTestId('labeling-no-project').textContent).toMatch(/can't be read by project here/);
  });

  it('never draws the previous project\'s label under the next project', async () => {
    publishShellProject({ id: A, title: 'Aurora' });
    mount();
    await waitFor(() => expect(text()).toMatch(/Instructions for use v3/));
    held = { id: B, release: () => {} };
    act(() => publishShellProject({ id: B, title: 'Borealis' }));
    await waitFor(() => expect(paths).toContain(`/api/mdx/labeling?program_id=${B}`));
    expect(text()).not.toMatch(/Instructions for use v3/);
    await act(async () => { held!.release(); });
    await waitFor(() => expect(text()).toMatch(/Instructions for use v8/));
  });
});
