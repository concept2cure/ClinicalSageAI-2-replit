// @vitest-environment jsdom
/**
 * The Vault's seals (VR-19): the list, the ceremony, the verdict in words, and
 * a failed read that is never shown as "not sealed".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), canWrite: true, signed: null as unknown, signError: null as string | null,
  saved: [] as Array<{ name: string; blob: Blob }> }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'Sol Sealer' }) }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  ApiRequestError: class extends Error {
    constructor(message: string, public status: number, public payload?: unknown) { super(message); }
  },
  serverMessage: (p: { error?: { message?: string }; message?: string } | null) => p?.error?.message ?? p?.message ?? null,
  redactInternals: (m: string | null, fallback: string) => m ?? fallback,
}));
vi.mock('../surfaces/VaultViewOnly', () => ({ useVaultCanWrite: () => H.canWrite }));
vi.mock('../download', () => ({ downloadBlob: (name: string, blob: Blob) => { H.saved.push({ name, blob }); return true; } }));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: { action: string; meanings?: string[]; defaultMeaning?: string; onClose: () => void;
    onSign: (i: { meaning: string; reason: string; password: string }) => Promise<unknown> }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')} data-default={p.defaultMeaning}>
      <button onClick={() => p.onSign({ meaning: 'approval', reason: 'Closing the data room for diligence', password: 'pw' })
        .then((m) => { H.signed = m; }).catch((e: Error) => { H.signError = e.message; })}>stub-sign</button>
    </div>
  ),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { createHash } from 'node:crypto';
import { VaultSeals, verdictSentence } from '../surfaces/VaultSeals';

const PID = '11111111-1111-4111-8111-111111111111';
const SEAL = { id: '22222222-2222-4222-8222-222222222222', reason: 'Closing the data room for diligence', manifestSha256: 'a'.repeat(64),
  documentCount: 3, sealedBy: 7, sealedByName: 'Sol Sealer', sealedAt: '2026-10-29T10:04:00.000Z' };
const ok = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });

let seals: unknown[];
let verification: unknown;
beforeEach(() => {
  H.canWrite = true; H.signed = null; H.signError = null; H.saved = []; seals = [SEAL];
  verification = { verdict: 'intact', changed: [], unreadable: [], manifestIntact: true, bytesChecked: true };
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.endsWith('/seals')) return ok({ success: true, data: { seals } });
    if (method === 'GET' && url.includes('/verify')) return ok({ success: true, data: { seal: SEAL, verification } });
    if (method === 'POST') return ok({ data: { seal: SEAL }, signedAt: '2026-10-29T10:05:00.000Z', sha256Chain: 'c'.repeat(64) }, 201);
    return ok({});
  });
});
afterEach(() => cleanup());

describe('the Vault seals', () => {
  it('lists each seal with when, who, how many documents, its hash and why', async () => {
    render(<VaultSeals projectId={PID} />);
    const row = await screen.findByTestId('vault-seal-row');
    expect(row.textContent).toMatch(/Sealed 2026-10-29 10:04 UTC by Sol Sealer · 3 documents · SHA-256 aaaaaaaaaaaa…/);
    expect(row.textContent).toMatch(/Reason: Closing the data room for diligence/);
  });

  it('says a Vault never sealed is not sealed, and a failed read is a failure, never "not sealed"', async () => {
    seals = [];
    render(<VaultSeals projectId={PID} />);
    expect((await screen.findByTestId('vault-seals-empty')).textContent).toBe('This Vault has not been sealed.');
    cleanup();
    H.apiRequest.mockImplementation(async () => ok({ error: { message: 'Nothing was read.' } }, 500));
    render(<VaultSeals projectId={PID} />);
    expect((await screen.findByTestId('vault-seals-error')).textContent).toMatch(/The seals could not be read\./);
    expect(screen.queryByTestId('vault-seals-empty')).toBeNull();
  });

  it('seals through the ceremony with approval or responsibility, and lists the new seal', async () => {
    render(<VaultSeals projectId={PID} />);
    fireEvent.click(await screen.findByTestId('vault-seal-open'));
    const dialog = screen.getByRole('dialog', { name: 'Seal this Vault' });
    expect(dialog.getAttribute('data-meanings')).toBe('approval,responsibility');
    fireEvent.click(within(dialog).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signed).toMatchObject({ meaning: 'approval', signedAt: '2026-10-29T10:05:00.000Z', hash: 'c'.repeat(64) }));
    expect(H.apiRequest).toHaveBeenCalledWith('POST', `/api/c2c/project-vault/${PID}/seals`,
      { password: 'pw', meaning: 'approval', reason: 'Closing the data room for diligence' });
    expect(H.apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && String(u).endsWith('/seals')).length).toBeGreaterThan(1);
  });

  it("offers no seal to a role that may not write the Vault", async () => {
    H.canWrite = false;
    render(<VaultSeals projectId={PID} />);
    await screen.findByTestId('vault-seal-row');
    expect(screen.queryByTestId('vault-seal-open')).toBeNull();
  });

  it('verifies on demand and says the verdict in words, naming what changed', async () => {
    verification = { verdict: 'changed', changed: [{ id: 'd1', title: 'Clinical overview', why: 'content_changed' }], unreadable: [], manifestIntact: true, bytesChecked: true };
    render(<VaultSeals projectId={PID} />);
    fireEvent.click(await screen.findByTestId('vault-seal-verify'));
    const verdict = await screen.findByTestId('vault-seal-verdict');
    expect(verdict.textContent).toBe('Changed: the Vault no longer matches this seal. Recorded with a different hash: Clinical overview.');
    expect(verdict.getAttribute('role')).toBe('alert');
    expect(H.apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/${PID}/seals/${SEAL.id}/verify?bytes=1`);
  });
});

describe("a seal's closing archive", () => {
  const ZIP = new TextEncoder().encode('PK-closing-archive-bytes');
  const zipSha = createHash('sha256').update(ZIP).digest('hex');
  const zipResponse = (sha: string | null, withheld = '0') => ({
    ok: true, status: 200,
    headers: { get: (h: string) => ({ 'X-Content-SHA256': sha, 'X-Archive-Withheld': withheld,
      'Content-Disposition': 'attachment; filename="vault-seal-22222222-closing-archive.zip"' } as Record<string, string | null>)[h] ?? null },
    arrayBuffer: async () => ZIP.buffer.slice(ZIP.byteOffset, ZIP.byteOffset + ZIP.byteLength),
  });
  const verifyThenArchive = async () => {
    render(<VaultSeals projectId={PID} />);
    expect(screen.queryByTestId('vault-seal-archive')).toBeNull();
    fireEvent.click(await screen.findByTestId('vault-seal-verify'));
    fireEvent.click(await screen.findByTestId('vault-seal-archive'));
    return screen.findByTestId('vault-seal-archive-note');
  };
  const archiveAnswers = (answer: (url: string) => Promise<unknown>) => {
    const base = H.apiRequest.getMockImplementation()!;
    H.apiRequest.mockImplementation(async (method: string, url: string) => (url.endsWith('/archive') ? answer(url) : base(method, url)));
  };

  it('is offered once the seal verifies intact, is checked against the recorded SHA-256, saved, and the hash stated', async () => {
    archiveAnswers(async () => zipResponse(zipSha));
    const note = await verifyThenArchive();
    expect(note.textContent).toBe(`Closing archive saved. Its SHA-256, checked on receipt against the server's record: ${zipSha}.`);
    expect(note.getAttribute('role')).toBe('status');
    expect(H.saved.map((f) => f.name)).toEqual(['vault-seal-22222222-closing-archive.zip']);
    expect(H.apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/${PID}/seals/${SEAL.id}/archive`);
  });

  it('says when a sealed document’s file was removed under a data disposition and is not in the archive', async () => {
    archiveAnswers(async () => zipResponse(zipSha, '1'));
    expect((await verifyThenArchive()).textContent).toBe(`Closing archive saved. Its SHA-256, checked on receipt against the server's record: ${zipSha}. `
      + '1 sealed document’s original file was removed under a data disposition and is not in it; the index lists it.');
  });

  it('is not saved when the file received does not match the recorded hash, or no hash was stated', async () => {
    archiveAnswers(async () => zipResponse('b'.repeat(64)));
    expect((await verifyThenArchive()).textContent).toMatch(/does not match the SHA-256 the server recorded for it, so it was not saved/);
    cleanup();
    archiveAnswers(async () => zipResponse(null));
    expect((await verifyThenArchive()).textContent).toMatch(/did not state the archive's SHA-256, so it was not saved/);
    expect(H.saved).toEqual([]);
  });

  it("is not offered for a seal that does not verify, and a refusal says the server's verdict", async () => {
    verification = { verdict: 'changed', changed: [{ id: 'd1', title: 'Clinical overview', why: 'removed' }], unreadable: [], manifestIntact: true, bytesChecked: true };
    render(<VaultSeals projectId={PID} />);
    fireEvent.click(await screen.findByTestId('vault-seal-verify'));
    await screen.findByTestId('vault-seal-verdict');
    expect(screen.queryByTestId('vault-seal-archive')).toBeNull();
    cleanup();
    verification = { verdict: 'intact', changed: [], unreadable: [], manifestIntact: true, bytesChecked: true };
    archiveAnswers(async () => {
      throw new ApiRequestError('refused', 409, { error: 'SEAL_NOT_INTACT', verification: {
        verdict: 'could_not_verify', changed: [], unreadable: [{ id: 'd2', title: 'Protocol', why: 'The stored file could not be read.' }], manifestIntact: true, bytesChecked: true } });
    });
    const note = await verifyThenArchive();
    expect(note.textContent).toBe('The closing archive was not downloaded. Could not verify: this seal is not confirmed intact. Not readable: Protocol (The stored file could not be read.).');
    expect(note.getAttribute('role')).toBe('alert');
    expect(H.saved).toEqual([]);
  });
});

describe('the verdict sentence', () => {
  it('never reads intact when anything could not be read', () => {
    expect(verdictSentence({ verdict: 'could_not_verify', changed: [], unreadable: [{ id: 'd2', title: 'Protocol', why: 'The stored file could not be read.' }], manifestIntact: true, bytesChecked: true }))
      .toBe('Could not verify: this seal is not confirmed intact. Not readable: Protocol (The stored file could not be read.).');
    expect(verdictSentence({ verdict: 'could_not_verify', changed: [], unreadable: [], manifestIntact: false, bytesChecked: false }))
      .toMatch(/no longer hashes to the value recorded when it was signed/);
    expect(verdictSentence({ verdict: 'intact', changed: [], unreadable: [], manifestIntact: true, bytesChecked: false }))
      .toBe('Intact: every sealed document is recorded with its sealed hash.');
  });
});
