// @vitest-environment jsdom
/**
 * Design controls reads the open project's design inputs, and draws them only
 * when the route says the read is that project's (D2, fold F1 slice A,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
 *
 * The screen read GET /api/design-controls, the organization's whole store,
 * whatever project was open, and its "New design input" posted no project. The
 * route now takes `program_id`, admits it, and answers `meta.scope: 'program'`
 * with the `programId` (design-controls.routes.ts). Here:
 *   - with a project open, the read and the write name it;
 *   - rows are drawn only from an answer keyed to that project;
 *   - with no project open, the screen reads the organization's register, as
 *     before.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string; body?: unknown }>,
  readAnswer: null as unknown,
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));

import { DesignControls } from '../surfaces/DesignControls';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const OTHER_PROGRAM = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const INPUT = { id: 'DI-01', cat: 'performance', req: 'Battery lasts a full 14-day wear period', riskRef: null, outputs: [], ver: null, verRef: null, val: null, valRef: null };
const keyed = (programId: string) => ({ data: [INPUT], meta: { count: 1, scope: 'program', programId } });
const ORG_ANSWER = { data: [INPUT], meta: { count: 1, scope: 'organization' } };

beforeEach(() => {
  H.calls.length = 0;
  H.readAnswer = keyed(PROGRAM_ID);
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string, body?: unknown) => {
    H.calls.push({ method, path, body });
    if (method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ data: { ...INPUT, id: 'dc-2', req: 'New one' }, meta: { created: true, scope: 'program', programId: PROGRAM_ID } }) };
    }
    return { ok: true, status: 200, json: async () => H.readAnswer };
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

function mount() {
  return render(<DesignControls {...({ surface: { id: 'design-controls' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof DesignControls>)} />);
}
const reads = () => H.calls.filter((c) => c.method === 'GET');
const settled = (el: HTMLElement) => waitFor(() => expect(el.textContent ?? '').not.toMatch(/Loading design inputs/));

describe('with a project open', () => {
  it('reads that project\'s design inputs, by its id', async () => {
    publishShellProject({ id: PROGRAM_ID });
    const { container } = mount();
    await settled(container);
    expect(reads().map((c) => c.path)).toEqual([`/api/design-controls?program_id=${PROGRAM_ID}`]);
    expect(container.textContent).toContain('Battery lasts a full 14-day wear period');
    expect(container.textContent).toContain('This project’s design inputs.');
  });

  it.each([
    ['the organization\'s scope', ORG_ANSWER],
    ['another project\'s scope', keyed(OTHER_PROGRAM)],
    ['no scope at all', { data: [INPUT], meta: { count: 1 } }],
  ])('draws no input from an answer with %s, and says the read was not this project\'s', async (_what, body) => {
    H.readAnswer = body;
    publishShellProject({ id: PROGRAM_ID });
    const { container } = mount();
    await settled(container);
    expect(container.textContent).not.toContain('Battery lasts a full 14-day wear period');
    expect(container.textContent).toContain("Couldn't load this project's design inputs");
    expect((screen.getByRole('button', { name: /New design input/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a new design input names the project', async () => {
    publishShellProject({ id: PROGRAM_ID });
    const { container } = mount();
    await settled(container);
    fireEvent.click(screen.getByRole('button', { name: /New design input/ }));
    fireEvent.change(screen.getByLabelText(/Requirement/), { target: { value: 'New one' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'performance' } });
    fireEvent.click(screen.getByRole('button', { name: /Add design input/ }));
    await waitFor(() => expect(H.calls.some((c) => c.method === 'POST')).toBe(true));
    const post = H.calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/api/design-controls');
    expect(post.body).toMatchObject({ req: 'New one', programId: PROGRAM_ID });
  });
});

describe('with no project open', () => {
  it('reads the organization\'s register, as before, and draws it', async () => {
    H.readAnswer = ORG_ANSWER;
    const { container } = mount();
    await settled(container);
    expect(reads().map((c) => c.path)).toEqual(['/api/design-controls']);
    expect(container.textContent).toContain('Battery lasts a full 14-day wear period');
    expect(container.textContent).toContain('Organization-wide design-controls register.');
  });

  it('a new design input names no project', async () => {
    H.readAnswer = ORG_ANSWER;
    const { container } = mount();
    await settled(container);
    fireEvent.click(screen.getByRole('button', { name: /New design input/ }));
    fireEvent.change(screen.getByLabelText(/Requirement/), { target: { value: 'New one' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'performance' } });
    fireEvent.click(screen.getByRole('button', { name: /Add design input/ }));
    await waitFor(() => expect(H.calls.some((c) => c.method === 'POST')).toBe(true));
    expect((H.calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>).programId).toBeUndefined();
  });
});
