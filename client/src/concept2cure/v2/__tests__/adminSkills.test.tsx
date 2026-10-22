// @vitest-environment jsdom
/**
 * Admin and access → Skills: a failed read is an error, never an empty
 * library; turning a skill off asks for a reason and sends it; the question
 * test shows why each skill would load.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));

import { ApiRequestError } from '@/lib/queryClient';
import { AdminSkills } from '../surfaces/AdminSkills';

const STABILITY = {
  key: 'cmc.stability',
  name: 'Stability programs and shelf life',
  description: 'Designing stability studies and supporting a shelf-life claim.',
  parent: 'cmc',
  version: 1,
  contentHash: 'abcdef012345',
  review: { state: 'unreviewed', note: 'Not yet read against its sources.' },
  enabled: true,
  extendedBy: [],
  disciplines: ['cmc'],
  useCases: ['study-design'],
  segments: ['pharma', 'biotech'],
  therapeuticAreas: [],
  regions: [],
  submissionTypes: [],
  surfaces: [],
  documentTypes: [],
};

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function routes(overrides: Record<string, () => unknown> = {}) {
  apiRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
    const key = `${method} ${path.split('?')[0]}`;
    if (overrides[key]) return overrides[key]();
    if (key === 'GET /api/ana-skills/library') return ok({ skills: [STABILITY], withheld: [] });
    if (key === 'GET /api/ana-skills/organization') return ok({ skills: [] });
    if (key === 'GET /api/ana-skills/library/cmc.stability') {
      return ok({ skill: { ...STABILITY, instructions: '## Method\nRun `estimate_shelf_life`.', triggers: ['shelf life'], tools: ['estimate_shelf_life'], references: [{ kind: 'ich', id: 'Q1E', label: 'ICH Q1E: Evaluation of stability data' }], disabledReason: null } });
    }
    if (key === 'PUT /api/ana-skills/library/cmc.stability/enabled') return ok({ key: 'cmc.stability', changed: true, enabled: false, audited: true, body });
    if (key === 'POST /api/ana-skills/test') {
      return ok({ selection: { selected: [{ key: 'cmc.stability', name: STABILITY.name, source: 'library', version: 1, contentHash: 'abcdef012345', score: 4, reasons: ['asked about "shelf life"'], attached: [] }], passedOver: [], considered: 120 } });
    }
    throw new Error(`unexpected ${key}`);
  });
}

beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(cleanup);

describe('the Skills tab', () => {
  it('says a failed library read failed, and never shows it as an empty library', async () => {
    routes({ 'GET /api/ana-skills/library': () => { throw new ApiRequestError('boom', 500, {}); } });
    render(<AdminSkills />);
    await screen.findByText("Couldn't load the skill library");
    expect(screen.queryByText('No skill matches these filters.')).toBeNull();
  });

  it('turns a skill off only with a stated reason, and sends that reason', async () => {
    routes();
    render(<AdminSkills />);
    fireEvent.click(await screen.findByRole('button', { name: /Stability programs and shelf life/ }));
    await screen.findByText('Run `estimate_shelf_life`.', { exact: false });
    expect(screen.getByText('ICH Q1E: Evaluation of stability data')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: 'short' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Turn off/ }));
    await waitFor(() => expect(screen.getByText(/A reason of at least 8 characters is required/)).toBeTruthy());
    expect(apiRequest).not.toHaveBeenCalledWith('PUT', expect.anything(), expect.anything());
  });

  it('sends the change with the reason when one is stated', async () => {
    routes();
    render(<AdminSkills />);
    fireEvent.click(await screen.findByRole('button', { name: /Stability programs and shelf life/ }));
    await screen.findByText('Run `estimate_shelf_life`.', { exact: false });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: 'Our CMC team uses its own SOP.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Turn off/ }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/ana-skills/library/cmc.stability/enabled', {
        enabled: false,
        reason: 'Our CMC team uses its own SOP.',
      }),
    );
  });

  it('shows which skills a question would load and why', async () => {
    routes();
    render(<AdminSkills />);
    fireEvent.change(await screen.findByLabelText('Question'), { target: { value: 'How do we justify our shelf life?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await screen.findByText(/Because asked about "shelf life"/);
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/ana-skills/test', { message: 'How do we justify our shelf life?', submissionType: null });
  });
});
