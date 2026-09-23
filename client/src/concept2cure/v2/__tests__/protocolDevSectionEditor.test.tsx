// @vitest-environment jsdom
/**
 * Protocol development — the section body is editable, through the ONE editor.
 *
 * `PATCH /api/protocol-development/sections/:id` has existed since C2C-17 and
 * had no caller on this surface: the Document tab rendered static prose and the
 * header said so ("the document body is read-only"). Five editor generations
 * were built and deleted in this repository; the canonical one is
 * `v2/editor/RichSectionEditor`, and this mounts that one rather than a sixth.
 *
 * What is asserted: the canvas is present and editable, the save carries the
 * governed reason AND the `expectedUpdatedAt` the section was loaded with (the
 * route's concurrency token), and a 409 SECTION_CHANGED is reported as a
 * refusal with the draft intact — never as a silent success.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolSectionPane } from '../surfaces/ProtocolDevSection';

const REASON = 'Recording the agreed dose-ranging rationale in the synopsis';
const STAMP = '2026-09-21T10:00:00.000Z';

const DOC = {
  id: '2', shortTitle: 'C2C-101-201',
  sections: [{ id: '101', num: '1', title: 'Synopsis', status: 'draft', required: true, updatedAt: STAMP }],
  content: { 101: [{ h: 'Synopsis', p: 'A randomised, double-blind study.', prov: {} }] },
};
const SEC = DOC.sections[0];

const created = (obj: unknown) => ({ ok: true, status: 201, json: async () => obj }) as Response;
const conflict = () => ({
  ok: false, status: 409,
  json: async () => ({ error: { code: 'SECTION_CHANGED', message: 'This section was changed by someone else since you opened it.' } }),
}) as Response;

function mount(onSaved = vi.fn()) {
  render(
    <ProtocolSectionPane
      doc={DOC as never} sec={SEC as never} canWrite
      onAsk={vi.fn()} onSaved={onSaved}
    />,
  );
  return { onSaved };
}

beforeEach(() => { apiRequest.mockReset(); apiRequest.mockResolvedValue(created({ id: 101, updatedAt: '2026-09-22T09:00:00.000Z', status: 'draft' })); });
afterEach(() => cleanup());

describe('the protocol section body is editable', () => {
  it('mounts the canonical rich section editor on the stored content', async () => {
    mount();
    const canvas = await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    expect(canvas).toBeTruthy();
    expect(canvas.textContent).toContain('A randomised, double-blind study.');
  });

  it('refuses to save until a governed reason is given, and writes nothing', async () => {
    mount();
    await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    // A change to save, so the disabled control is waiting on the REASON and
    // not merely on there being nothing to write.
    fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'complete' } });
    const save = screen.getByRole('button', { name: /Save section/ });
    expect(save.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('State a reason for change to save')).toBeTruthy();
    fireEvent.click(save);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('saves through the section PATCH with the reason and the concurrency token', async () => {
    const { onSaved } = mount();
    await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'complete' } });
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Save section/ }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [method, path, body] = apiRequest.mock.calls[0];
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/protocol-development/sections/101');
    expect(body).toMatchObject({ reason: REASON, expectedUpdatedAt: STAMP, status: 'complete' });
    expect(typeof (body as { content?: unknown }).content).toBe('string');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('reports a concurrent change as a refusal, and does not report a save', async () => {
    apiRequest.mockResolvedValue(conflict());
    const { onSaved } = mount();
    await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'complete' } });
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Save section/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/changed by someone else/));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
