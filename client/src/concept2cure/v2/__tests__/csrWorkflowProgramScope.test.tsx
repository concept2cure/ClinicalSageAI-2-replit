// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSurface } from '@shared/constants/ui-surface-registry';
const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest: api }));
vi.mock('../clinicalRegulatoryGraphFlag', () => ({ isClinicalRegulatoryGraphEnabled: () => false }));
import { CsrWorkflow } from '../surfaces/BiopharmaProject';
import { publishShellProject } from '../shellProject';
const A = '11111111-2222-4333-8444-000000000011';
const B = '11111111-2222-4333-8444-000000000012';
const props: React.ComponentProps<typeof CsrWorkflow> = { surface: getSurface('csr-workflow')!, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' };
function response(title: string) {
  return { ok: true, status: 200, json: async () => ({ success: true, data: { program: { title, code: 'ICH E3', readiness: 45 }, sections: [{ num: '11', label: 'Efficacy Results', status: 'draft' }] } }) } as Response;
}
beforeEach(() => { api.mockReset(); publishShellProject({ id: '' }); });
afterEach(() => { cleanup(); publishShellProject({ id: '' }); });
describe('CSR board program changes', () => {
  it('reads the actual shell program and clears the previous study while the next program loads', async () => {
    let resolveB!: (value: Response) => void;
    api.mockImplementation((_method: string, path: string) => path.includes(A) ? Promise.resolve(response('Study A')) : new Promise<Response>(resolve => { resolveB = resolve; }));
    publishShellProject({ id: A, title: 'Program A' });
    render(<CsrWorkflow {...props} />);
    expect(await screen.findByText(/Study A/)).toBeTruthy();
    expect(api).toHaveBeenCalledWith('GET', `/api/csr-workflow/board?programId=${A}`);
    act(() => publishShellProject({ id: B, title: 'Program B' }));
    expect(screen.queryByText(/Study A/)).toBeNull();
    expect(screen.getByText('Loading CSR workflow…')).toBeTruthy();
    await act(async () => { resolveB(response('Study B')); });
    expect(await screen.findByText(/Study B/)).toBeTruthy();
    expect(document.body.textContent).toContain('build progress 45%');
    expect(document.body.textContent).not.toContain('45% ready');
  });
  it('discards a delayed old-program response after navigation', async () => {
    let resolveA!: (value: Response) => void;
    api.mockImplementation((_method: string, path: string) => path.includes(A) ? new Promise<Response>(resolve => { resolveA = resolve; }) : Promise.resolve(response('Study B')));
    publishShellProject({ id: A, title: 'Program A' });
    render(<CsrWorkflow {...props} />);
    await waitFor(() => expect(api).toHaveBeenCalled());
    act(() => publishShellProject({ id: B, title: 'Program B' }));
    expect(await screen.findByText(/Study B/)).toBeTruthy();
    await act(async () => { resolveA(response('Delayed Study A')); });
    expect(screen.queryByText(/Delayed Study A/)).toBeNull();
    expect(screen.getByText(/Study B/)).toBeTruthy();
  });
});
