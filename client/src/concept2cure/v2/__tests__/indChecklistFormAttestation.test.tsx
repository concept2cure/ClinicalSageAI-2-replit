// @vitest-environment jsdom
/**
 * An attached Module 1 form is "attached — not attested" until the uploader
 * states it is the completed, signed form; the upload control lets them state it.
 *
 * What it used to do (report_ind_ivd_irb #15, 2026-10-15): the checklist showed
 * a form Complete whenever its attached PDF passed the forms engine's check,
 * which reads the program record and not the file, and the forms panel called
 * that attachment "completed form filed". An edited, unsigned PDF read as the
 * signed 1571. Nothing on screen let the person say the file was signed, and
 * nothing said that nobody had.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const apiUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
  apiUpload,
}));
const publish = vi.hoisted(() => vi.fn());
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: publish }));

import { IndLifecycle } from '../surfaces/IndLifecycle';
import { IndFormsPanel } from '../surfaces/IndFormsPanel';

afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});
beforeEach(() => { apiRequest.mockReset(); apiUpload.mockReset(); publish.mockReset(); });

const FORM = (id: string, extra: Record<string, unknown>) => ({ id, title: `Form FDA ${id.slice(4)}`, label: 'x', ref: '21 CFR 312.23(a)(1)', ...extra });

describe('the IND checklist says what an attached form amounts to', () => {
  function mockChecklist(forms: unknown[]) {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/ind-checklist') {
        return {
          ok: true, status: 200,
          json: async () => ({
            data: [{ code: 'PLR-606', drugName: 'Pelorant', productName: 'PLR-606 IND', indication: null, sponsorName: 'Acme', submissionType: 'IND', targetReceiptDate: null, forms, sections: [] }],
            meta: { count: 1 },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }
  const props = () => ({ surface: { id: 'ind-lifecycle' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as Parameters<typeof IndLifecycle>[0]);

  it('an attached file nobody attested is "Attached — not attested", never Complete; the others say what they are', async () => {
    mockChecklist([
      FORM('FDA_1571', { done: false, attachment: { attested: false, requiredFieldsMissing: [] } }),
      FORM('FDA_1572', { done: true, attachment: { attested: true, requiredFieldsMissing: [] } }),
      FORM('FDA_3674', { done: false, attachment: { attested: true, requiredFieldsMissing: ['certification_selected'] } }),
    ]);
    const { container } = render(<IndLifecycle {...props()} />);
    await waitFor(() => expect(container.querySelectorAll('.indl-form')).toHaveLength(3));
    const row = (i: number) => container.querySelectorAll('.indl-form')[i].textContent ?? '';
    expect(row(0), 'an unattested attachment is shown as plain "Open"').toMatch(/Attached — not attested/);
    expect(row(0)).not.toMatch(/Complete/);
    expect(row(1)).toMatch(/Complete/);
    expect(row(2)).toMatch(/Attested — fields missing/);
    expect(row(2)).toMatch(/certification_selected/);
    // AnA is told the same thing the screen shows.
    const facts = publish.mock.calls.at(-1)?.[1]?.facts;
    expect(facts.module1Forms.map((f: { attachedFile: string }) => f.attachedFile)).toEqual([
      'attached — not attested', 'attested — complete', 'attested — required fields missing',
    ]);
  });

  it('a form with no file says Open, and an older server that reports no attachment state is not read as "none"', async () => {
    mockChecklist([FORM('FDA_1571', { done: false, attachment: null }), FORM('FDA_1572', { done: false })]);
    const { container } = render(<IndLifecycle {...props()} />);
    await waitFor(() => expect(container.querySelectorAll('.indl-form')).toHaveLength(2));
    expect(container.querySelectorAll('.indl-form')[0].textContent).toMatch(/Open/);
    const facts = publish.mock.calls.at(-1)?.[1]?.facts;
    expect(facts.module1Forms.map((f: { attachedFile: string }) => f.attachedFile)).toEqual(['none', 'not reported']);
  });
});

describe('the forms panel lets the uploader state the attestation, and says when nobody has', () => {
  const PROGRAM_UUID = 'e6af0047-33b4-46fa-bde2-73daeb9615df';
  const SUBMISSION = { id: 15, title: 'PLR-606 IND', applicationType: 'ind', primaryRegion: 'fda', status: 'active', programId: PROGRAM_UUID };
  const SEQ = { id: 61, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'fda' };
  const PLACED = { formId: 'FDA_1571', leafId: 12, sectionCode: 'm1.1', sequenceId: 61, sequenceNumber: '0000', fileName: 'a.pdf', sha256: 'a'.repeat(64), byteSize: 2048, requiredFieldsMissing: [] };

  function mockListing(placements: unknown[] = []) {
    (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/ind-forms/')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            forms: ['FDA_1571'], renderPlans: [], formDefinitions: [],
            program: { id: PROGRAM_UUID, code: 'PLR-606', name: 'PLR-606 (IND)', programType: 'IND', sponsorName: 'Acme', productName: 'PLR-606', indication: null, applicationNumber: null, formMetadata: {} },
            placements,
          }),
        } as Response;
      }
      if (method === 'GET' && url.startsWith('/api/submissions?')) return { ok: true, status: 200, json: async () => [SUBMISSION] } as Response;
      if (method === 'GET' && url === `/api/submissions/${SUBMISSION.id}/sequences`) return { ok: true, status: 200, json: async () => [SEQ] } as Response;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }
  async function chooseTarget() {
    fireEvent.change(await screen.findByLabelText('Target submission'), { target: { value: String(SUBMISSION.id) } });
    const seq = (await screen.findByLabelText('Sequence')) as HTMLSelectElement;
    await waitFor(() => expect(seq.options.length).toBeGreaterThan(1));
    fireEvent.change(seq, { target: { value: String(SEQ.id) } });
  }
  const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'FDA-1571.pdf', { type: 'application/pdf' });

  it('the attestation is sent only when the person ticks it, and the tick is cleared after the filing', async () => {
    mockListing();
    apiUpload.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ ...PLACED, requiredFieldsMissing: [], complete: true, attested: true, attestedAt: '2026-10-15T09:00:00.000Z', attestedBy: 9 }),
    } as Response);
    const note = vi.fn();
    const { container } = render(<IndFormsPanel note={note} />);
    await chooseTarget();
    const tick = (await screen.findByRole('checkbox', { name: /attest .*completed, signed form/i })) as HTMLInputElement;
    expect(tick.checked).toBe(false);

    // Unticked: nothing is attested.
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [pdf()] } });
    await waitFor(() => expect(apiUpload).toHaveBeenCalledTimes(1));
    expect((apiUpload.mock.calls[0][2] as FormData).get('attestCompletedSigned')).toBeNull();

    // Ticked: the statement travels with the file — and only the statement.
    await waitFor(() => expect(tick.disabled).toBe(false));
    fireEvent.click(tick);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [pdf()] } });
    await waitFor(() => expect(apiUpload).toHaveBeenCalledTimes(2));
    const sent = apiUpload.mock.calls[1][2] as FormData;
    expect(sent.get('attestCompletedSigned')).toBe('true');
    expect(sent.get('attestedBy')).toBeNull();
    await waitFor(() => expect(tick.checked).toBe(false));
  });

  it('a filing checked complete but not attested is reported as not counted, never as a completed form', async () => {
    mockListing();
    apiUpload.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ ...PLACED, requiredFieldsMissing: [], complete: false, attested: false, attestedAt: null, attestedBy: null }),
    } as Response);
    const note = vi.fn();
    const { container } = render(<IndFormsPanel note={note} />);
    await chooseTarget();
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [pdf()] } });
    await waitFor(() => expect(note).toHaveBeenCalled());
    const said = String(note.mock.calls[0][0]);
    expect(said).not.toMatch(/^Completed FDA/);
    expect(said).toMatch(/not counted as complete/i);
    expect(said).toMatch(/not attested/i);
  });

  it('a placement nobody attested is "attached · not attested"; an attested one is the completed form; an unreported one claims neither', async () => {
    mockListing([
      { ...PLACED, leafId: 12, attestedAt: null },
      { ...PLACED, leafId: 13, sequenceNumber: '0001', sequenceId: 62, attestedAt: '2026-10-15T09:00:00.000Z' },
      { ...PLACED, leafId: 14, sequenceNumber: '0002', sequenceId: 63 },
    ]);
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText('attached · not attested')).toBeTruthy();
    expect(screen.getAllByText('completed form filed')).toHaveLength(1);
    expect(screen.getByText('checked · attestation not reported')).toBeTruthy();
  });
});
