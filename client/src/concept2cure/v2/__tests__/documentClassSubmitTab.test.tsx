// @vitest-environment jsdom
/**
 * A filing document class project on the Submit tab and in Submission
 * Readiness (review finding, 2026-10-18).
 *
 * A PAS, an IND amendment or a CSR project is authored here and this platform
 * builds no sequence for it (shared/regulatory/filing-document-classes.ts). Its
 * Submit tab still offered "Add a market" (refused, NOT_AN_APPLICATION) and
 * "Compile and download" (a CTD backbone, so a CSR read as missing Modules
 * 1–5), and Submission Readiness told it to "Create its pas submission in the
 * Submission Center and build a sequence": an instruction the New submission
 * form cannot carry out, naming the class by its key.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectMarkets, ProjectStatusLine } from '../surfaces/ProjectMarkets';
import { DispatchReadiness } from '../surfaces/DispatchReadiness';
import { programTypeLabel } from '../surfaces/programSequence';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { filingDocumentClassOf } from '@shared/regulatory/filing-document-classes';

const PROGRAM_UUID = '5d1e3f7a-2b4c-4d6e-8f0a-1b3c5d7e9f2a';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const markets = { list: { rows: [], loading: false, empty: true }, notOffered: 0, markets: [], retryList: vi.fn(), retryMarket: vi.fn() } as never;
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the Submit tab of a filing document class project', () => {
  it('offers no market, no compile and no readiness, and says why in the platform\'s terms', () => {
    const onNav = vi.fn();
    render(<ProjectMarkets markets={markets} onNav={onNav} available={() => true} ectdFiling={false} canChange
      documentClass={filingDocumentClassOf('pas')} />);
    expect(screen.queryByRole('button', { name: /Add a market/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Compile and download/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Open readiness/ })).toBeNull();
    expect(text()).toContain('No market: this project is authored, not sequenced');
    expect(text()).toContain('An FDA supplement is not built as a sequence yet, so this platform sends nothing for the Prior Approval Supplement.');
    expect(text()).not.toMatch(/Add a market to start one/);
  });

  it('an application project keeps its doors', () => {
    render(<ProjectMarkets markets={markets} onNav={vi.fn()} available={() => true} ectdFiling canChange documentClass={null} />);
    expect(screen.getByRole('button', { name: /Add a market/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Compile and download/ })).toBeTruthy();
  });

  it('the status line does not promise a market to a class project', () => {
    const reviews = { state: { loading: false, data: { queue: [] } }, retry: vi.fn(), cap: 50, inReview: () => false } as never;
    render(<ProjectStatusLine markets={markets} reviews={reviews} documentClass={filingDocumentClassOf('csr')} />);
    expect(text()).toContain('Authored here, not sequenced');
    expect(text()).not.toContain('No market yet');
  });

  it('a class is named by its label, never its key', () => {
    expect(programTypeLabel('pas')).toBe('Prior Approval Supplement');
    expect(programTypeLabel('ind_amendment')).toBe(filingDocumentClassOf('ind_amendment')?.label);
    expect(programTypeLabel('nda')).toBe('NDA');
  });
});

describe('Submission Readiness on a filing document class project', () => {
  it('says there is nothing to gate, and never tells it to create a submission', async () => {
    apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
      const url = String(raw ?? '');
      if (url === `/api/c2c/projects/${PROGRAM_UUID}`) {
        return ok({ id: PROGRAM_UUID, name: 'VX-9 PAS', code: 'VX-9', product_name: 'Velorab', program_type: 'pas' });
      }
      return ok([]);
    });
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    function Probe() {
      seen.ctx = useActiveSurfaceContext('dispatch-readiness');
      return null;
    }
    render(<><DispatchReadiness surface={{ id: 'dispatch-readiness', label: 'Dispatch' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="regulatory" /><Probe /></>);
    // F18: the Submit tab's own words (NotSequencedState), on both screens.
    await waitFor(() => expect(text()).toContain('No market: this project is authored, not sequenced'));
    expect(text()).toContain('An FDA supplement is not built as a sequence yet, so this platform sends nothing for the Prior Approval Supplement.');
    expect(text()).not.toMatch(/Create its|Add one from|No market for this project yet/);
    expect(text()).not.toMatch(/\bpas submission\b/);
    await waitFor(() => expect(seen.ctx?.summary).toBeTruthy());
    expect(seen.ctx?.summary).toContain('is a Prior Approval Supplement, authored here and not built as a sequence');
    expect(seen.ctx?.summary).not.toMatch(/pas submission/);
  });
});
