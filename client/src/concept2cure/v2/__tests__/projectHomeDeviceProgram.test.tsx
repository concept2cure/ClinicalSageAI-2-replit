/** @vitest-environment jsdom */
/**
 * Project home renders the DEVICE taxonomy for a device / IVD program and the
 * drug facts for a drug program — every value from GET /api/c2c/projects/:id,
 * only the fields that exist, never a placeholder.
 *
 * MDX demo pack, 2026-09-21, finding F9: the read omitted device_class,
 * regulatory_path, product_code, predicate_devices, product_type and the
 * metadata intake stored, so a 510(k) IVD program's home showed no class,
 * product code or predicate.
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
import { readShellProject } from '../shellProject';

const PID = '82d3b729-87a1-4714-9a21-819b538683f3';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

function deviceProgram(over: Record<string, unknown> = {}) {
  return {
    id: PID, code: 'DMN5', name: '[Demo · MDX] NeuroPanel-Dx 510(k)', program_type: '510k',
    status: 'active', phase: 'planning', priority: 'high', description: null,
    product_name: 'NeuroPanel-Dx', indication: 'Differential diagnosis of viral CNS infection',
    intended_use: 'Qualitative multiplexed IVD test.', primary_agency: 'FDA', target_submission_date: null, progress_percent: 0,
    sponsor_name: 'Concept2Cure Diagnostics', application_number: null,
    product_type: 'ivd', device_class: 'II', regulatory_path: '510k', product_code: 'QNX',
    predicate_devices: [{ kNumber: 'K223456' }], review_panel: 'Microbiology', regulation_number: '866.3985',
    device_flags: ['softwareAiMl', 'cyberDevice', 'clinicalData'],
    ...over,
  };
}
function drugProgram() {
  return deviceProgram({
    code: 'BX-512', name: 'BX-512 · Vorelinib (IND)', program_type: 'IND', product_name: 'Vorelinib',
    indication: 'KIT-mutant GIST', application_number: '000512', product_type: 'drug',
    device_class: null, regulatory_path: null, product_code: null, predicate_devices: [], review_panel: null,
    regulation_number: null, device_flags: null,
  });
}
function mockProgram(row: Record<string, unknown>) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok(row);
    return ok({});
  });
}
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'Handoff title', ws: 'MDX' };
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
  sessionStorage.clear();
});

describe('project home — device program', () => {
  it('shows class, regulatory path, product code, regulation, panel, predicate and flags from the row', async () => {
    mockProgram(deviceProgram());
    render(<ProjectHome {...props()} />);
    const facts = within(await screen.findByRole('region', { name: /program identity/i }));
    expect(facts.getByText('Device class')).toBeTruthy();
    expect(facts.getByText('Class II')).toBeTruthy();
    expect(facts.getByText('Product code')).toBeTruthy();
    expect(facts.getByText('QNX')).toBeTruthy();
    expect(facts.getByText('Regulation')).toBeTruthy();
    expect(facts.getByText('21 CFR 866.3985')).toBeTruthy();
    expect(facts.getByText('Review panel')).toBeTruthy();
    expect(facts.getByText('Microbiology')).toBeTruthy();
    expect(facts.getByText('Predicate')).toBeTruthy();
    expect(facts.getByText('K223456')).toBeTruthy();
    expect(facts.getByText('Regulatory path')).toBeTruthy();
    expect(facts.getByText('510(k)')).toBeTruthy();
    expect(facts.getByText(/Software \/ AI-ML/)).toBeTruthy();
    // A device program has no IND / NDA number fact.
    expect(facts.queryByText(/IND number|NDA number|Application number/)).toBeNull();
  });

  it('states absence for a device field the row lacks — never a placeholder', async () => {
    mockProgram(deviceProgram({ product_code: null, predicate_devices: [], device_flags: [] }));
    render(<ProjectHome {...props()} />);
    const facts = within(await screen.findByRole('region', { name: /program identity/i }));
    expect(facts.getByText('Product code')).toBeTruthy();
    expect(facts.getByText('Predicate')).toBeTruthy();
    expect(facts.getAllByText('not recorded').length).toBeGreaterThanOrEqual(2);
    expect(facts.getByText('none declared')).toBeTruthy();
    expect(facts.queryByText('QNX')).toBeNull();
  });

  it('publishes the product type onto the open shell project so the shell can follow it', async () => {
    mockProgram(deviceProgram());
    render(<ProjectHome {...props()} />);
    await screen.findByRole('region', { name: /program identity/i });
    expect(readShellProject()?.productType).toBe('ivd');
  });
});

describe('project home — drug program is unchanged', () => {
  it('renders the drug facts and no device block', async () => {
    mockProgram(drugProgram());
    render(<ProjectHome {...props()} />);
    const facts = within(await screen.findByRole('region', { name: /program identity/i }));
    expect(facts.getByText('IND number')).toBeTruthy();
    expect(facts.getByText('000512')).toBeTruthy();
    expect(facts.getByText('Vorelinib')).toBeTruthy();
    expect(facts.queryByText('Device class')).toBeNull();
    expect(facts.queryByText('Product code')).toBeNull();
    expect(facts.queryByText('Predicate')).toBeNull();
  });
});
