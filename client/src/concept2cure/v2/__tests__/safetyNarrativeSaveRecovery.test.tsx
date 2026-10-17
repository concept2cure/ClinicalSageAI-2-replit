// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';

const h = vi.hoisted(() => ({ apiRequest: vi.fn(), fire: vi.fn() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: h.apiRequest }));
vi.mock('../toast', () => ({ useToast: () => [{ msg: '', tone: 'ok' }, h.fire], C2CToast: () => null }));

import { ApiRequestError } from '@/lib/queryClient';
import { SafetyNarrative } from '../surfaces/SafetyNarrative';

const CASE = {
  id: 'synthetic-case-1', studyId: '51', studyDrug: 'Synthetic product', dose: 'Recorded dose',
  subjectId: 'Synthetic subject', clock: '15-day expedited report', due: '2026-10-20', dueDays: 6,
  expectedness: 'unexpected', seriousnessAssessed: true, reportingDetermined: true,
  event: { term: 'Recorded event', seriousnessCriteria: ['hospitalization'], causality: 'related', outcome: 'recovering' },
  medicalHistory: [], concomitantMeds: [], narrative: 'The exact previously stored narrative.',
};
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
function mount() {
  const surface = UI_SURFACES.find((item) => item.id === 'safety-narrative');
  if (!surface) throw new Error('Actual registered safety surface missing');
  return render(<SafetyNarrative surface={surface} onAsk={vi.fn()} onNav={vi.fn()} segment="pharma" />);
}
async function save() {
  await screen.findByText('Stored narrative');
  fireEvent.change(screen.getByLabelText('Reason for change, required to save this narrative version'), { target: { value: 'Synthetic source clarification' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save version/ })); });
}
beforeEach(() => {
  h.fire.mockReset(); h.apiRequest.mockReset();
  h.apiRequest.mockImplementation(async (method: string) => {
    if (method === 'GET') return response({ data: [CASE] });
    return response({ saved: true, data: { ...CASE, narrative: 'The exact newly stored narrative.' } });
  });
});
afterEach(() => cleanup());

describe('safety narrative save and exact stored readback', () => {
  it('preserves an unassessed seriousness value during a narrative-only save', async () => {
    h.apiRequest.mockImplementation(async (method: string) => method === 'GET'
      ? response({ data: [{ ...CASE, seriousnessAssessed: false, event: { ...CASE.event, seriousnessCriteria: [] } }] })
      : response({ saved: true, data: CASE }));
    mount(); await save();
    const payload = h.apiRequest.mock.calls.find(([method]) => method === 'PATCH')?.[2] as { fields: Record<string, unknown> };
    expect(payload.fields).not.toHaveProperty('seriousnessCriteria');
  });
  it('records an explicit criteria assessment after the reviewer edits it', async () => {
    h.apiRequest.mockImplementation(async (method: string) => method === 'GET'
      ? response({ data: [{ ...CASE, seriousnessAssessed: false, event: { ...CASE.event, seriousnessCriteria: [] } }] })
      : response({ saved: true, data: CASE }));
    mount(); await screen.findByText('Stored narrative');
    fireEvent.click(screen.getByRole('button', { name: 'hospitalization' }));
    await save();
    const payload = h.apiRequest.mock.calls.find(([method]) => method === 'PATCH')?.[2] as { fields: Record<string, unknown> };
    expect(payload.fields.seriousnessCriteria).toEqual(['hospitalization']);
  });
  it('renders the exact stored narrative after save and a later reload', async () => {
    const view = mount();
    await save();
    expect(await screen.findByText('The exact newly stored narrative.')).toBeTruthy();
    expect(h.apiRequest.mock.calls.find(([method]) => method === 'PATCH')?.[1]).toBe('/api/safety-narratives/cases/synthetic-case-1');
    view.unmount();
    h.apiRequest.mockResolvedValue(response({ data: [{ ...CASE, narrative: 'The exact newly stored narrative.' }] }));
    mount();
    expect(await screen.findByText('The exact newly stored narrative.')).toBeTruthy();
  });

  it('calls a confirmed commit with a failed display refresh saved and blocks another save until exact readback', async () => {
    h.apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'PATCH') return response({ saved: true, data: null, meta: { readback: { available: false } } });
      return response({ data: url.endsWith('/synthetic-case-1') ? { ...CASE, narrative: 'Confirmed saved text.' } : [CASE] });
    });
    mount(); await save();
    expect(await screen.findByText(/version and its audit history were saved/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Save version/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read stored case' })); });
    expect(await screen.findByText('Confirmed saved text.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Read stored case' })).toBeNull());
    expect(h.fire.mock.calls.some(([message]) => String(message).includes('case is unchanged'))).toBe(false);
  });

  it.each(['commit', 'network'])('keeps an unconfirmed %s attempt blocked through failed readback and requires review after a successful read', async (mode) => {
    let readFails = true;
    h.apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'PATCH') throw mode === 'commit'
        ? new ApiRequestError('The save could not be confirmed.', 503, { saved: null }, 'SAE_CASE_COMMIT_UNCONFIRMED')
        : new TypeError('Synthetic transport failure');
      if (url.endsWith('/synthetic-case-1')) {
        if (readFails) throw new TypeError('Synthetic read failure');
        return response({ data: { ...CASE, narrative: 'Authoritative current record.' } });
      }
      return response({ data: [CASE] });
    });
    mount(); await save();
    expect(await screen.findByText(/previous save is unconfirmed/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Save version/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read stored case' })); });
    await waitFor(() => expect(h.fire).toHaveBeenCalledWith(expect.stringMatching(/could not be read/), 'error'));
    expect((screen.getByRole('button', { name: /Save version/ }) as HTMLButtonElement).disabled).toBe(true);
    readFails = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read stored case' })); });
    expect(await screen.findByText('Authoritative current record.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Save version/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /I reviewed the stored case/ })); });
    await waitFor(() => expect(screen.queryByText(/previous save is unconfirmed/)).toBeNull());
    expect(h.apiRequest.mock.calls.filter(([method]) => method === 'PATCH')).toHaveLength(1);
    expect(h.fire.mock.calls.some(([message]) => String(message).includes('case is unchanged'))).toBe(false);
  });

  it('shows a confirmed history refusal without claiming a completed save', async () => {
    h.apiRequest.mockImplementation(async (method: string) => {
      if (method === 'PATCH') throw new ApiRequestError('The history could not be recorded, so the change was rolled back.', 503,
        { saved: false }, 'SAE_CASE_HISTORY_UNAVAILABLE');
      return response({ data: [CASE] });
    });
    mount(); await save();
    await waitFor(() => expect(h.fire).toHaveBeenCalledWith(expect.stringMatching(/rolled back/), 'error'));
    expect(screen.queryByRole('button', { name: 'Read stored case' })).toBeNull();
    expect(screen.getByText('The exact previously stored narrative.')).toBeTruthy();
  });
});
