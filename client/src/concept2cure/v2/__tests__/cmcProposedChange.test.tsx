// @vitest-environment jsdom
/**
 * Recording a proposed CMC change from the deferred variation assessment
 * (P-122 inventory, finding B10).
 *
 * `POST /api/cmc-changes` — the proposed-change store the Lifecycle "CMC change
 * control" card lists, audited, and written through to Module 3 when a project
 * is named — had no caller. The assessment beside it already collects exactly
 * that store's inputs (dosage form, change category, scale, site, process,
 * critical step, the material affected) and classifies them; there was no way
 * to keep the change it had just classified.
 *
 * The assessment renders only where the deployment permits deferred work
 * (P-28 withholds post-approval classification from an IND release), so this
 * widens nothing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CmcVariationAssessment } from '../surfaces/CmcVariationAssessment';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const CLASSIFIED = {
  fdaReportingCategory: 'cbe_30', emaVariationCategory: 'type_ib', supacTier: 'Level 2', bioequivalence: 'not required',
  rationale: ['A different site in the same country is a CBE-30 under SUPAC-IR.'], validationRequirements: ['Three batches on stability'],
  impactedCtdSections: ['3.2.P.3.1'], citations: ['SUPAC-IR (1995)'],
};
function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function classify() {
  render(<CmcVariationAssessment />);
  choose('Dosage form', 'immediate_release_oral_solid');
  choose('Change category', 'manufacturing_site');
  choose('Material affected', 'drug_product');
  choose('Touches a critical step', 'no');
  choose('Site change', 'different_site_same_country');
  choose('Change description', 'Move tablet compression to Building 4\nSame equipment class, same process.');
  fireEvent.click(screen.getByRole('button', { name: 'Assess proposed variation' }));
  await screen.findByText(/A different site in the same country/);
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the classified change can be recorded as a proposed change', () => {
  it('POSTs the classifier’s inputs and the open project to /api/cmc-changes, once', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/cmc/variations/classify') return res({ data: CLASSIFIED });
      if (method === 'POST' && url === '/api/cmc-changes') return res({ data: {}, id: 9, meta: { module3WriteThrough: 'recorded' } }, 201);
      return res({}, 404);
    });
    await classify();
    fireEvent.click(screen.getByRole('button', { name: 'Record this proposed change' }));
    await screen.findByText(/Recorded as a proposed change/);
    const posts = apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === '/api/cmc-changes');
    expect(posts).toHaveLength(1);
    expect(posts[0][2]).toEqual({
      title: 'Move tablet compression to Building 4',
      description: 'Move tablet compression to Building 4\nSame equipment class, same process.',
      dosageFormFamily: 'immediate_release_oral_solid',
      changeCategory: 'manufacturing_site',
      affects: 'drug_product',
      touchesCriticalStep: false,
      siteChangeKind: 'different_site_same_country',
      cmcProjectId: PROJECT,
    });
    expect(screen.getByText(/marked for rebuild/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Record this proposed change' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says what the store refused, and records nothing', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/cmc/variations/classify') return res({ data: CLASSIFIED });
      return res({ error: { code: 'VALIDATION', message: 'title is required.' } }, 400);
    });
    await classify();
    fireEvent.click(screen.getByRole('button', { name: 'Record this proposed change' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/title is required/));
    expect(screen.queryByText(/Recorded as a proposed change/)).toBeNull();
  });
});
