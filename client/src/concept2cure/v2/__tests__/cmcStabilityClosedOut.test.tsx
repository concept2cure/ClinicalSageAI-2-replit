// @vitest-environment jsdom
/**
 * A closed-out stability study does not offer the two acts the server refuses.
 *
 * Closing a study out is a Part 11 signature; after it the record's content is
 * closed (services/cmc/signed-record.ts). The register kept "+ Result" and
 * "Close out" live on a closed-out study: the first opened a form whose save
 * answered 409, the second took the signer's reason and password and then
 * answered 409. Found by the Part 11 read of the CMC screens on 2026-11-12
 * (CMC-GOV-05) and confirmed in the file.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const study = (id: number, title: string, status: string) => ({
  id, studyTitle: title, productName: 'C2C-201', batchNumber: `B-${id}`, storageConditions: ['LT', '25°C / 60% RH'],
  duration: 24, status, shelfLife: '18 months', projectId: PROJECT, stabilityData: { results: [] },
});

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/cmc/stability-studies')) {
      return res({ success: true, data: [study(1, 'Closed study', 'COMPLETED'), study(2, 'Running study', 'ACTIVE')] });
    }
    return res({ success: true, data: [] });
  });
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Stability' }));
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const rowOf = async (title: string) => (await screen.findAllByText(title))[0].closest('tr') as HTMLElement;
const button = (row: HTMLElement, name: RegExp) => within(row).getByRole('button', { name }) as HTMLButtonElement;

describe('a closed-out stability study', () => {
  it('closes "Result" and "Close out", and says why on each', async () => {
    const row = await rowOf('Closed study');
    for (const name of [/Result/, /Close out/]) {
      const b = button(row, name);
      expect(b.disabled, String(name)).toBe(true);
      expect(b.title, String(name)).toMatch(/closed out under signature/);
    }
  });

  it('keeps its reads: History stays open', async () => {
    const row = await rowOf('Closed study');
    expect(button(row, /History/).disabled).toBe(false);
  });

  it('leaves a running study exactly as it was', async () => {
    const row = await rowOf('Running study');
    expect(button(row, /Result/).disabled).toBe(false);
    expect(button(row, /Close out/).disabled).toBe(false);
    expect(button(row, /Close out/).title).toMatch(/under your signature/);
  });
});
