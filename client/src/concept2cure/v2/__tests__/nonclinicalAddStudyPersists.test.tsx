// @vitest-environment jsdom
/**
 * "Add study" said it had saved, and saved nothing.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Nonclinical.tsx:347 — `onSubmit` called `addStudy`, a LOCAL optimistic-row
 * helper, and toasted "Study added — <id> — SEND queued". The row appeared, the
 * study count moved, and all of it was gone on reload. Nothing was POSTed, no
 * SEND was queued, and no audit entry was written — while the form's own
 * governed banner told the user all three had happened.
 *
 * `POST /api/nonclinical/studies` existed the entire time with no caller. It is
 * a GOVERNED write that requires a reason for change.
 *
 * A second, quieter defect: the form's nine study-type options
 * ("Toxicokinetics", "Safety pharm (CV)", …) were the surface's own invention
 * and are NOT in the server's STUDY_TYPE enum, so even a wired-up form would
 * have been rejected on every single submit.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The chain: the reason gates the write, the body matches the server's schema,
 * the list is RE-READ rather than locally appended, and a refusal says nothing
 * was saved.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Nonclinical } from '../surfaces/Nonclinical';

const STUDY_LIST = '/api/nonclinical/studies';
const CREATE = '/api/nonclinical/studies';

/** Every non-GET call — i.e. the writes under test. */
const writes = () => apiRequest.mock.calls.filter((c) => String(c[0]) !== 'GET');
const listReads = () => apiRequest.mock.calls.filter((c) => String(c[0]) === 'GET' && String(c[1]) === STUDY_LIST);

let createAnswer: { ok: boolean; status: number; body: unknown };

const props = () => ({
  surface: { id: 'nonclinical' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

beforeEach(() => {
  apiRequest.mockReset();
  createAnswer = { ok: true, status: 201, body: { id: 12, ctdSection: '4.2.3', requiredSendDomains: ['LB', 'BW'] } };
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === CREATE) {
      return { ok: createAnswer.ok, status: createAnswer.status, json: async () => createAnswer.body } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
  });
});
afterEach(() => cleanup());

async function openForm() {
  render(<Nonclinical {...props()} />);
  const add = await screen.findAllByRole('button', { name: /Add study/ });
  fireEvent.click(add[0]);
  return screen.findByLabelText(/Study number/i);
}

/** The FORM's submit. The page carries two "Add study" buttons of its own that
 *  merely open the form, so the name alone is ambiguous — the form's is the
 *  primary in its footer (`.de-btn.primary`). */
function submitForm() {
  const btn = document.querySelector('.de-btn.primary') as HTMLButtonElement | null;
  expect(btn, 'the governed form submit must be on screen').toBeTruthy();
  fireEvent.click(btn as HTMLButtonElement);
}

function fill(values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    const el = screen.getByLabelText(new RegExp(label, 'i'));
    fireEvent.change(el, { target: { value } });
  }
}

const GOOD = {
  'Study number': 'TX-703',
  // The value, not the label — this field carries the SERVER's enum.
  'Study type': 'repeat_dose_tox',
  'Study title': '26-week repeat-dose toxicity study in the rat',
  'Reason for change': 'Recording the completed 26-week study report',
};

describe('Add study', () => {
  it('will not write without the governed reason the route requires', async () => {
    await openForm();
    fill({ 'Study number': 'TX-703', 'Study title': 'A study', 'Reason for change': 'short' });
    submitForm();
    await waitFor(() => expect(screen.getByText(/reason for change/i)).toBeTruthy());
    expect(writes()).toHaveLength(0);
  });

  it('POSTs the server’s schema — studyNumber/title/studyType/reason, not the display shape', async () => {
    await openForm();
    fill(GOOD);
    submitForm();
    await waitFor(() => expect(writes()).toHaveLength(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('POST');
    expect(path).toBe(CREATE);
    expect(body).toMatchObject({
      studyNumber: 'TX-703',
      title: '26-week repeat-dose toxicity study in the rat',
      reason: 'Recording the completed 26-week study report',
    });
    // studyType must be a member of the server's enum, never a display label.
    expect(String((body as { studyType: string }).studyType)).toMatch(/^[a-z_]+$/);
    // The display-only fields the store does not carry are not sent.
    expect(body).not.toHaveProperty('cls');
    expect(body).not.toHaveProperty('send');
  });

  it('re-reads the list after the server confirms, instead of appending locally', async () => {
    await openForm();
    const before = listReads().length;
    fill(GOOD);
    submitForm();
    await waitFor(() => expect(listReads().length).toBeGreaterThan(before));
  });

  it('says nothing was saved when the server refuses, and keeps the form open', async () => {
    createAnswer = { ok: false, status: 400, body: { error: { code: 'VALIDATION', message: 'studyType is invalid.' } } };
    await openForm();
    fill(GOOD);
    submitForm();
    await waitFor(() => expect(screen.getByText(/Nothing was saved/i)).toBeTruthy());
    // The form is still up — the user has not been told to start over.
    expect(screen.getByLabelText(/Study number/i)).toBeTruthy();
  });
});
