// @vitest-environment jsdom
/** D4: accepted result freshness at the calculator → Authoring boundary. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
}
function fail(status: number, error?: string) {
  return { ok: false, status, json: async () => ({ success: false, error }) } as Response;
}
const props = () => ({ surface: { id: 'biostat-workbench', label: 'Biostat' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const setProject = (project: unknown) => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = project;
};
beforeEach(() => {
  setProject({ id: '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60' });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, url: string) =>
    ok(url === '/api/biostat/assurance' ? { assurance: 0.72 } : {}),
  );
});
afterEach(() => {
  cleanup();
  setProject(undefined);
});

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function selectCalculator(title: string) {
  fireEvent.click(screen.getByRole('button', { name: title }));
}

function pendingResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function enterAssurance() {
  fill(/Prior mean effect/, '0.4');
  fill(/^Prior SD/, '0.15');
  fill(/^n per arm/, '120');
}
function compute() {
  fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
}
function expectNothingFileable() {
  expect(screen.queryByRole('button', { name: /Insert into document/ })).toBeNull();
  expect(apiRequest.mock.calls.some((c) => String(c[1]).startsWith('/api/authoring/'))).toBe(false);
}

describe('D4 — Biostat result freshness, edited and failed calculations', () => {
  it('revokes a successful result immediately on edit and does not revive it on edit-back', async () => {
    render(<BiostatWorkbench {...props()} />);
    enterAssurance();
    compute();
    expect(await screen.findByText('0.72')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Show raw response/ }));

    fill(/Prior mean effect/, '0.5');
    expectNothingFileable();
    expect(screen.queryByText('0.72')).toBeNull();
    expect(screen.queryByRole('button', { name: /raw response/ })).toBeNull();
    expect(screen.getByText(/Inputs changed.*Compute again/i)).toBeTruthy();
    fill(/Prior mean effect/, '0.4');
    expectNothingFileable();
    compute();
    expect(await screen.findByRole('button', { name: /Insert into document/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Show raw response/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the previous result unavailable after local validation refuses a rerun', async () => {
    render(<BiostatWorkbench {...props()} />);
    enterAssurance();
    compute();
    await screen.findByRole('button', { name: /Insert into document/ });
    fill(/^Prior SD/, '');
    compute();
    expect(screen.getByLabelText(/^Prior SD/).getAttribute('aria-invalid')).toBe('true');
    expectNothingFileable();
    expect(screen.queryByText('0.72')).toBeNull();
    expect(apiRequest.mock.calls.filter((c) => c[1] === '/api/biostat/assurance')).toHaveLength(1);
  });

  it.each([
    ['domain refusal', false, 'priorSd must be positive'],
    ['thrown network failure', true, 'Calculation failed (HTTP 0).'],
  ])('revokes the previous result before an unchanged-input rerun and keeps it revoked after %s', async (_label, rejects, message) => {
    const retry = pendingResponse();
    apiRequest.mockResolvedValueOnce(ok({ assurance: 0.72 })).mockImplementationOnce(() => retry.promise);
    render(<BiostatWorkbench {...props()} />);
    enterAssurance();
    compute();
    await screen.findByRole('button', { name: /Insert into document/ });
    compute();
    // Filing must stop while the new attempt is pending, before its outcome.
    expectNothingFileable();
    await act(async () => {
      if (rejects) retry.reject(new TypeError('Failed to fetch'));
      else retry.resolve(fail(400, message));
    });
    expect(screen.getByRole('alert').textContent).toContain(message);
    expectNothingFileable();
    expect(screen.queryByText('0.72')).toBeNull();
    expect((screen.getByRole('button', { name: /^Compute$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

});

describe('D4 — Biostat result freshness, out-of-order responses', () => {
  it('ignores a pending success after an edit-back even though the input text matches again', async () => {
    const old = pendingResponse();
    apiRequest.mockImplementationOnce(() => old.promise);
    render(<BiostatWorkbench {...props()} />);
    enterAssurance();
    compute();
    fill(/Prior mean effect/, '0.5');
    fill(/Prior mean effect/, '0.4');
    await act(async () => { old.resolve(ok({ assurance: 0.111111 })); });
    expectNothingFileable();
    expect(screen.queryByText('0.111111')).toBeNull();
    expect((screen.getByRole('button', { name: /^Compute$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('files only the newer accepted result when the older success arrives last', async () => {
    const old = pendingResponse();
    const current = pendingResponse();
    const hash = 'c'.repeat(64);
    apiRequest.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/authoring/docs') return { ok: true, status: 200, json: async () => ({ document: { id: 'doc-current' } }) } as Response;
      if (url === '/api/authoring/sections') return { ok: true, status: 200, json: async () => ({ section: { id: 'sec-current' } }) } as Response;
      return ok({});
    });
    render(<BiostatWorkbench {...props()} />);
    enterAssurance();
    compute();
    fill(/Prior mean effect/, '0.5');
    compute();
    await act(async () => {
      current.resolve(ok({ assurance: 0.888888, grid: Array.from({ length: 65 }, (_, i) => ({ drift: i, power: 0.888888 })), provenance: { inputsSha256: hash } }));
    });
    await act(async () => { old.resolve(ok({ assurance: 0.111111, provenance: { inputsSha256: 'd'.repeat(64) } })); });
    expect(screen.queryByText('0.111111')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Insert into document/ }));
    await waitFor(() => {
      const section = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/sections');
      expect(section).toBeTruthy();
      expect(section![2].content).toContain('<td>64</td><td>0.888888</td>');
      expect(section![2].content).toContain(hash);
      expect(section![2].content).not.toContain('0.111111');
      expect(section![2].content).not.toContain('d'.repeat(64));
    });
  });

  it('ignores an obsolete thrown error without ending the newer pending calculation', async () => {
    const old = pendingResponse();
    const current = pendingResponse();
    apiRequest.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    render(<BiostatWorkbench {...props()} />);
    enterAssurance();
    compute();
    fill(/Prior mean effect/, '0.5');
    compute();
    await act(async () => { old.reject(new TypeError('Failed to fetch')); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: /Computing/ }) as HTMLButtonElement).disabled).toBe(true);
    expectNothingFileable();
    await act(async () => { current.resolve(ok({ assurance: 0.888888 })); });
    expect(screen.getByText('0.888888')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Insert into document/ })).toBeTruthy();
  });

});

describe('D4 — Biostat result freshness, calculator lifecycle', () => {
  it('reset abandons a pending response and restores an empty ready form', async () => {
    const old = pendingResponse();
    apiRequest.mockImplementationOnce(() => old.promise);
    render(<BiostatWorkbench {...props()} />);
    enterAssurance();
    compute();
    fireEvent.click(screen.getByRole('button', { name: /^Reset$/ }));
    expect((screen.getByLabelText(/Prior mean effect/) as HTMLInputElement).value).toBe('');
    await act(async () => { old.resolve(ok({ assurance: 0.111111 })); });
    expectNothingFileable();
    expect(screen.queryByText('0.111111')).toBeNull();
    expect((screen.getByRole('button', { name: /^Compute$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('switching calculators abandons the unmounted calculation and its error', async () => {
    const old = pendingResponse();
    apiRequest.mockImplementationOnce(() => old.promise);
    render(<BiostatWorkbench {...props()} />);
    enterAssurance();
    compute();
    selectCalculator('Restricted mean survival time');
    await act(async () => { old.resolve(fail(400, 'Obsolete assurance error')); });
    expect(screen.queryByText('Obsolete assurance error')).toBeNull();
    expect((screen.getByRole('button', { name: /^Compute$/ }) as HTMLButtonElement).disabled).toBe(false);
    selectCalculator('Assurance (Bayesian power)');
    expect((screen.getByLabelText(/Prior mean effect/) as HTMLInputElement).value).toBe('');
    expectNothingFileable();
  });

  it('files a current snapshot under StrictMode and finishes it after an edit during the save', async () => {
    const documentSave = pendingResponse();
    const hash = 'e'.repeat(64);
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/biostat/assurance') return ok({ assurance: 0.72, provenance: { inputsSha256: hash } });
      if (url === '/api/authoring/docs') return documentSave.promise;
      if (url === '/api/authoring/sections') return { ok: true, status: 200, json: async () => ({ section: { id: 'sec-snapshot' } }) } as Response;
      return ok({});
    });
    render(<React.StrictMode><BiostatWorkbench {...props()} /></React.StrictMode>);
    enterAssurance();
    compute();
    fireEvent.click(await screen.findByRole('button', { name: /Insert into document/ }));
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/authoring/docs')).toBe(true);
    fill(/Prior mean effect/, '0.5');
    expect(screen.queryByText('0.72')).toBeNull();
    expect(screen.queryByRole('button', { name: /Insert into document/ })).toBeNull();
    await act(async () => {
      documentSave.resolve({ ok: true, status: 200, json: async () => ({ document: { id: 'doc-snapshot' } }) } as Response);
    });
    const section = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/sections');
    expect(section).toBeTruthy();
    expect(section![2].content).toContain('0.72');
    expect(section![2].content).toContain(hash);
    expect(screen.getByText(/Saved to the authoring store/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Insert into document/ })).toBeNull();
  });
});
