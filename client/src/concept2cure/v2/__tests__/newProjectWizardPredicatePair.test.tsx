// @vitest-environment jsdom
/**
 * The New Project wizard files a WHOLE predicate of record, or none.
 *
 * `predicate_devices[0]` is what the official eSTAR prints the predicate
 * submission number and trade name from, so an entry there is a claim of
 * substantial equivalence the sponsor makes to FDA (21 CFR 807.87(f)).
 *
 * Until 2026-10-19 this wizard asked for the K-number alone and
 * `POST /api/c2c/projects` wrote `[{ kNumber }]` — no id, no name. The governed
 * write refuses exactly that row (`predicateDeviceSchema` requires id and
 * name), so a project created here put a nameless claim on the record that the
 * write owning the column could not have made. The number and the trade name
 * now travel together, and `normalizeDeviceClassification` keeps neither half
 * when only one arrives.
 *
 * These tests hold the client's half: that both fields are offered on a device
 * filing, that both are sent, and that the review panel does not read a half
 * answer as recorded.
 */
import React from 'react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => intakeFixtureRequest(apiRequest, args),
}));

const reg = vi.hoisted(() => ({
  ctx: {
    id: 'us_510k',
    displayName: 'Premarket Notification 510(k)',
    pathwayKey: '510k',
    agency: 'FDA',
    region: 'US',
    submissionFormat: 'eSTAR',
  } as Record<string, string>,
}));
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange(reg.ctx.id)}>
      Pick filing
    </button>
  ),
}));
vi.mock('../surfaces/RegistryBridge', () => ({
  getSubmissionTypeContext: () => reg.ctx,
}));

import { NewProjectWizard } from '../surfaces/Projects';

async function toConfigure() {
  render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /pick filing/i }));
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  await waitForIntakeWorkspace();
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), {
    target: { value: 'AeroFlow PF · peak expiratory flow (510(k))' },
  });
}

const continueBtn = () => screen.getByRole('button', { name: /^continue$/i }) as HTMLButtonElement;
const numberInput = () =>
  screen.queryByRole('textbox', { name: /predicate 510\(k\) number/i }) as HTMLInputElement | null;
const nameInput = () =>
  screen.queryByRole('textbox', { name: /predicate device name/i }) as HTMLInputElement | null;
const reviewValue = (term: string) =>
  Array.from(document.querySelectorAll('.npw-review-row'))
    .find((r) => r.querySelector('dt')?.textContent === term)
    ?.querySelector('dd')?.textContent ?? null;

async function create(): Promise<Record<string, unknown>> {
  apiRequest.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ data: { id: '8a11b987-ac2d-4748-9e9c-5dc40c082662', title: 'x', code: 'AERO' }, meta: {} }),
  });
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /create project/i })); });
  const createCall = () =>
    apiRequest.mock.calls.find((c: unknown[]) => c[0] === 'POST' && c[1] === '/api/c2c/projects');
  await vi.waitFor(() => expect(createCall(), 'the wizard never posted the project').toBeDefined());
  return createCall()![2] as Record<string, unknown>;
}

const classificationOf = (body: Record<string, unknown>) =>
  (body.deviceClassification ?? {}) as Record<string, unknown>;

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('New Project wizard — the predicate of record is whole or absent', () => {
  it('asks for the trade name as well as the number', async () => {
    await toConfigure();
    expect(numberInput(), 'the 510(k) number field is gone').not.toBeNull();
    expect(nameInput(), 'the eSTAR prints a trade name and the wizard never asked for one').not.toBeNull();
  });

  it('sends both halves when both are given', async () => {
    await toConfigure();
    fireEvent.change(numberInput()!, { target: { value: 'k181234' } });
    fireEvent.change(nameInput()!, { target: { value: 'AeroCheck PF Meter' } });
    fireEvent.click(continueBtn());
    expect(reviewValue('Predicate')).toBe('K181234 — AeroCheck PF Meter');
    const dc = classificationOf(await create());
    expect(dc.predicateK).toBe('K181234');
    expect(dc.predicateName).toBe('AeroCheck PF Meter');
  });

  it('does not read a number with no trade name as a recorded predicate', async () => {
    await toConfigure();
    fireEvent.change(numberInput()!, { target: { value: 'K181234' } });
    fireEvent.click(continueBtn());
    expect(reviewValue('Predicate'), 'a half answer read as recorded').toMatch(/not recorded/i);
    /* The field is still SENT as typed — the server names the missing half
       rather than the client silently dropping what the person wrote. */
    const dc = classificationOf(await create());
    expect(dc.predicateK).toBe('K181234');
    expect(dc.predicateName ?? '').toBe('');
  });

  it('says nothing about a predicate when neither half is given', async () => {
    await toConfigure();
    fireEvent.click(continueBtn());
    expect(reviewValue('Predicate')).toBe('Not recorded');
    const dc = classificationOf(await create());
    expect(dc.predicateK ?? '').toBe('');
    expect(dc.predicateName ?? '').toBe('');
  });
});
