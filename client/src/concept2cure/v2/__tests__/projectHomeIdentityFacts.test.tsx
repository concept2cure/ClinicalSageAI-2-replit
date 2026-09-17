/** @vitest-environment jsdom */
/**
 * WO-9 Click 1 — landing in a drug program.
 *
 * Opening a program must show sponsor, product, indication and the agency
 * application number (the IND number for an IND), every value read from
 * GET /api/c2c/projects/:id — never from the window.C2C_PROJECT display
 * handoff, never derived from the title, never a placeholder. A program the
 * agency has not numbered says so in words; it never shows a made-up number.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

function program(over: Record<string, unknown> = {}) {
  return {
    id: PID, code: 'BX-512', name: 'BX-512 · Vorelinib (IND)', program_type: 'IND',
    status: 'active', phase: 'clinical', priority: 'high', description: null,
    product_name: 'Vorelinib', indication: 'KIT-mutant gastrointestinal stromal tumor',
    intended_use: null, primary_agency: 'FDA', target_submission_date: null, progress_percent: 0,
    sponsor_name: 'Concept2Cure Therapeutics', application_number: '000512',
    ...over,
  };
}
function mockProgram(row: Record<string, unknown>) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok(row);
    return ok({});
  });
}
beforeEach(() => {
  // The navigation handoff carries display hints only; the facts must not use them.
  (window as any).C2C_PROJECT = { id: PID, title: 'Handoff title', product: 'HANDOFF-PRODUCT' };
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('project home shows the program identity from the database', () => {
  it('renders sponsor, product, indication and the IND number from GET /api/c2c/projects/:id', async () => {
    mockProgram(program());
    render(<ProjectHome {...props()} />);
    const facts = within(await screen.findByRole('region', { name: /program identity/i }));
    expect(facts.getByText('Sponsor')).toBeTruthy();
    expect(facts.getByText('Concept2Cure Therapeutics')).toBeTruthy();
    expect(facts.getByText('Product')).toBeTruthy();
    expect(facts.getByText('Vorelinib')).toBeTruthy();
    expect(facts.getByText('Indication')).toBeTruthy();
    expect(facts.getByText('KIT-mutant gastrointestinal stromal tumor')).toBeTruthy();
    expect(facts.getByText('IND number')).toBeTruthy();
    expect(facts.getByText('000512')).toBeTruthy();
  });

  it('takes product from the row, not from the navigation handoff', async () => {
    mockProgram(program());
    render(<ProjectHome {...props()} />);
    const facts = within(await screen.findByRole('region', { name: /program identity/i }));
    expect(facts.getByText('Vorelinib')).toBeTruthy();
    expect(facts.queryByText('HANDOFF-PRODUCT')).toBeNull();
  });

  it('labels the number by program type', async () => {
    mockProgram(program({ program_type: 'NDA', application_number: '215000' }));
    render(<ProjectHome {...props()} />);
    const facts = within(await screen.findByRole('region', { name: /program identity/i }));
    expect(facts.getByText('NDA number')).toBeTruthy();
    expect(facts.queryByText('IND number')).toBeNull();
  });

  it('says "not assigned" when the agency has not numbered the program — never a placeholder', async () => {
    mockProgram(program({ application_number: null }));
    render(<ProjectHome {...props()} />);
    const facts = within(await screen.findByRole('region', { name: /program identity/i }));
    expect(facts.getByText('IND number')).toBeTruthy();
    expect(facts.getByText('not assigned')).toBeTruthy();
    expect(facts.queryByText(/^\d{6}$/)).toBeNull();
  });

  it('says "not recorded" for sponsor, product or indication the row lacks', async () => {
    mockProgram(program({ sponsor_name: null, indication: null }));
    render(<ProjectHome {...props()} />);
    const facts = within(await screen.findByRole('region', { name: /program identity/i }));
    expect(facts.getAllByText('not recorded')).toHaveLength(2);
    expect(facts.getByText('Vorelinib')).toBeTruthy();
  });
});
