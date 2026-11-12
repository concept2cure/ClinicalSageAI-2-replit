// @vitest-environment jsdom
/**
 * Approvals & audit states no figure over a read that did not resolve.
 *
 * The tab's grey counts line printed
 *   "0 governed events · 0 sections tracked · 0 contradictions resolved · 0 still open"
 * unconditionally — over reads still in flight, and over reads that had failed,
 * directly above "Couldn't load contradiction history". "Still open" is the
 * figure the export gate refuses on, so a zero there reads as a cleared gate.
 * The card's own header ("0 resolved — 0 open") did the same. Found by the
 * honest-state read of the CMC screens on 2026-11-12 and confirmed in the file.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
import { chainCount, readCount } from '../surfaces/cmcShared';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const SECTIONS = `/api/cmc/module3-os/sections/${PROJECT}`;
const CONTRADICTIONS = `/api/cmc/module3-os/contradictions/${PROJECT}`;

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const failed = () => res({ success: false, error: 'store unavailable' }, 500);
const pending = () => new Promise<Response>(() => {});

function wire(over: { sections?: () => Response | Promise<Response>; contradictions?: () => Response | Promise<Response> } = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === SECTIONS) return over.sections ? over.sections() : res({ success: true, data: [] });
    if (method === 'GET' && url === CONTRADICTIONS) return over.contradictions ? over.contradictions() : res({ success: true, data: [] });
    return res({ success: true, data: [] });
  });
}
function openAudit() {
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Approvals & audit' }));
}
const line = () => screen.getByTestId('cmc-audit-counts').textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the two count helpers', () => {
  it('state a count only over a read that resolved', () => {
    expect(readCount({ loading: true }, '3 x', 'sections')).toBe('reading sections…');
    expect(readCount({ loading: false, error: 'boom' }, '3 x', 'sections')).toBe('sections not read');
    expect(readCount({ loading: false }, '3 x', 'sections')).toBe('3 x');
  });
  it('call a chain with an unread section a floor, not a total', () => {
    expect(chainCount('ready', false, 4)).toBe('4 governed events');
    expect(chainCount('ready', true, 4)).toBe('at least 4 governed events');
    expect(chainCount('ready', false, 1)).toBe('1 governed event');
    expect(chainCount('loading', false, 0)).toBe('reading the audit chain…');
    expect(chainCount('error', false, 0)).toBe('audit chain not read');
  });
});

describe('Approvals & audit — the counts line', () => {
  it('states true zeros over reads that resolved and hold nothing', async () => {
    wire();
    openAudit();
    await waitFor(() => expect(line()).toContain('0 governed events'));
    expect(line()).toContain('0 sections tracked');
    expect(line()).toContain('0 contradictions resolved');
    expect(line()).toContain('0 still open');
  });

  // The defect: "0 contradictions resolved · 0 still open" over a failed read.
  it('states no contradiction count when the contradictions read failed', async () => {
    wire({ contradictions: failed });
    openAudit();
    await waitFor(() => expect(line()).toContain('contradictions not read'));
    expect(line()).not.toContain('still open');
    expect(line()).not.toMatch(/\d+ contradictions? resolved/);
    expect(screen.queryByText('0 resolved — 0 open')).toBeNull();
  });

  it('states no section or event count when the sections read failed', async () => {
    wire({ sections: failed });
    openAudit();
    await waitFor(() => expect(line()).toContain('sections not read'));
    expect(line()).toContain('audit chain not read');
    expect(line()).not.toContain('0 sections tracked');
    expect(line()).not.toContain('0 governed events');
  });

  it('says it is reading while the contradictions read is in flight', async () => {
    wire({ contradictions: pending });
    openAudit();
    await waitFor(() => expect(line()).toContain('reading contradictions…'));
    expect(line()).not.toContain('still open');
  });
});
