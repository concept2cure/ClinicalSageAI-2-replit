// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VaultVersionPicker } from '../surfaces/VaultLibraryResults';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const hit = (title: string, current = true) => ({ id: title, title, version: '2', current, snippet: null, contentHash: 'A'.repeat(64) });
const page = (title: string, offset = 0, total = 1, current = true) => json({ data: { query: 'original', total, limit: 25, offset, results: [hit(title, current)] } });
const search = (text = 'original') => {
  fireEvent.change(screen.getByLabelText("Search this project's Vault"), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Search Vault' }));
};
const pendingResponse = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); apiRequest.mockReset(); });
afterEach(cleanup);

describe('Canonical Vault version picker', () => {
  it('retries the same scoped page after a refusal, preserving its version and hash contract', async () => {
    const choose = vi.fn(); let failed = false;
    apiRequest.mockImplementation(async (_method, path) => {
      const later = String(path).includes('offset=25');
      if (failed && later) return json({ message: 'Access could not be verified.' }, 503);
      return page(later ? 'Later original' : 'First original', later ? 25 : 0, 26);
    });
    render(<VaultVersionPicker programId={PROGRAM} includeEarlier disabled={false} label="Search this project's Vault" onChoose={choose} />);
    search(); await screen.findByText('First original'); failed = true;
    fireEvent.click(screen.getByRole('button', { name: 'Next Vault results' }));
    await screen.findByRole('button', { name: 'Retry Vault search' });
    expect(screen.queryByText('First original')).toBeNull();
    expect(screen.queryByText(/No matching documents/)).toBeNull();
    failed = false; fireEvent.click(screen.getByRole('button', { name: 'Retry Vault search' }));
    await screen.findByText('Later original');
    expect(screen.getByText('Showing 26–26 of 26 matches.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Select document' }));
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: 'Later original', programId: PROGRAM, contentHash: 'a'.repeat(64) }));
    const laterPath = `/api/c2c/project-vault/${PROGRAM}/search?q=original&limit=25&includeSuperseded=true&offset=25`;
    expect(apiRequest.mock.calls.filter(([, path]) => path === laterPath)).toHaveLength(2);
    expect(apiRequest.mock.calls.some(([, path]) => String(path).startsWith('/api/c2c/project-vault/search?'))).toBe(false);
  });

  it('can repeat a successful query, go back and start another query at its first page', async () => {
    apiRequest.mockImplementation(async (_method, path) => page(String(path).includes('offset=25') ? 'Later original' : 'First original', String(path).includes('offset=25') ? 25 : 0, 26));
    render(<VaultVersionPicker programId={PROGRAM} disabled={false} label="Search this project's Vault" onChoose={vi.fn()} />);
    search(); await screen.findByText('First original');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Search Vault' }) as HTMLButtonElement).disabled).toBe(false));
    search(); await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    await screen.findByText('First original'); fireEvent.click(screen.getByRole('button', { name: 'Next Vault results' }));
    await screen.findByText('Later original'); fireEvent.click(screen.getByRole('button', { name: 'Previous Vault results' }));
    await screen.findByText('First original'); fireEvent.click(screen.getByRole('button', { name: 'Next Vault results' }));
    await screen.findByText('Later original'); search('renewed'); await screen.findByText('First original');
    expect(apiRequest.mock.calls.at(-1)?.[1]).toBe(`/api/c2c/project-vault/${PROGRAM}/search?q=renewed&limit=25`);
  });

  it('does not expose a late result after its program or signed-in session changes', async () => {
    const oldProgram = pendingResponse(); const oldSession = pendingResponse(); const choose = vi.fn();
    apiRequest.mockResolvedValueOnce(oldProgram.promise).mockResolvedValueOnce(oldSession.promise);
    const view = render(<VaultVersionPicker programId={PROGRAM} disabled={false} label="Search this project's Vault" onChoose={choose} />);
    search(); view.rerender(<VaultVersionPicker programId={OTHER} disabled={false} label="Search this project's Vault" onChoose={choose} />);
    expect((screen.getByLabelText("Search this project's Vault") as HTMLInputElement).value).toBe('');
    search(); sessionStorage.setItem('trialsage_access_token', `header.${btoa(JSON.stringify({ organizationId: 2, id: 44 }))}.signature`);
    view.rerender(<VaultVersionPicker programId={OTHER} disabled={false} label="Search this project's Vault" onChoose={choose} />);
    await act(async () => { oldProgram.resolve(page('Private old program')); oldSession.resolve(page('Private old session')); });
    expect(screen.queryByText('Private old program')).toBeNull(); expect(screen.queryByText('Private old session')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select document' })).toBeNull();
    expect((screen.getByLabelText("Search this project's Vault") as HTMLInputElement).value).toBe('');
    expect(choose).not.toHaveBeenCalled();
  });

  it('allows an earlier version only when requested and retains caller labels and focus', async () => {
    apiRequest.mockImplementation(async () => page('Earlier original', 0, 1, false));
    const view = render(<VaultVersionPicker programId={PROGRAM} disabled={false} autoFocus label="Search this project's Vault" onChoose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText("Search this project's Vault"));
    search(); expect((await screen.findByRole('button', { name: 'Select document' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<VaultVersionPicker programId={PROGRAM} includeEarlier disabled={false} label="Search this project's Vault" onChoose={vi.fn()} />);
    search(); expect((await screen.findByRole('button', { name: 'Select document' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/earlier version/)).toBeTruthy();
  });
});
