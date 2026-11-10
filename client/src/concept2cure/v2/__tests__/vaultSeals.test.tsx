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

describe('what a seal holds (S6, binders as a view)', () => {
  const HOLDS = [
    { id: '33333333-3333-4333-8333-333333333333', title: 'Stability protocol', version: '1.0', indexNumber: '3.2.P.8.1',
      shortHash: 'abcdef012345', lifecycleStage: 'approved' },
    { id: '44444444-4444-4444-8444-444444444444', title: 'Clinical overview', version: null, indexNumber: null,
      shortHash: null, lifecycleStage: null },
    { id: '55555555-5555-4555-8555-555555555555', title: null, version: '2', indexNumber: '1.14',
      shortHash: '0123456789ab', lifecycleStage: 'in_review' },
  ];
  const OTHER = '66666666-6666-4666-8666-666666666666';
  const THIRD = '77777777-7777-4777-8777-777777777777';

  it('lists each sealed document and version under a closed disclosure, as the seal recorded it', async () => {
    seals = [{ ...SEAL, documents: HOLDS }];
    render(<VaultSeals projectId={PID} />);
    const holds = await screen.findByTestId('vault-seal-holds');
    expect(holds.tagName).toBe('DETAILS');
    expect(holds.classList.contains('pj-more')).toBe(true);
    expect(holds.hasAttribute('open')).toBe(false);
    expect(holds.querySelector('summary')?.textContent).toBe('What it holds · 3 documents');
    const rows = within(holds).getAllByTestId('vault-seal-document');
    expect(rows.map((r) => r.querySelector('.vd-ver-v')?.textContent)).toEqual([
      '3.2.P.8.1Stability protocol · v1.0', 'Clinical overview · version not recorded', '1.14Title not recorded · v2']);
    expect(rows.map((r) => r.querySelector('.vd-ver-m')?.textContent)).toEqual([
      'Approved · SHA-256 abcdef012345', 'Not sent for review · content hash not recorded', 'In review · SHA-256 0123456789ab']);
    expect(rows[0].querySelector('.vd-num')?.textContent).toBe('3.2.P.8.1');
  });

  it("opens a sealed version through the Vault's audited download, the viewer its Versions use", async () => {
    seals = [{ ...SEAL, documents: HOLDS }];
    const base = H.apiRequest.getMockImplementation()!;
    H.apiRequest.mockImplementation(async (method: string, url: string) => (url.endsWith('/download')
      ? { ok: true, status: 200,
        headers: { get: (h: string) => ({ 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="stability-protocol.txt"' } as Record<string, string>)[h] ?? null },
        arrayBuffer: async () => new TextEncoder().encode('Stability protocol, as filed.').buffer }
      : base(method, url)));
    render(<VaultSeals projectId={PID} />);
    const holds = await screen.findByTestId('vault-seal-holds');
    fireEvent.click(within(holds).getByRole('button', { name: 'Open Stability protocol v1.0' }));
    await waitFor(() => expect(H.saved.map((f) => f.name)).toEqual(['stability-protocol.txt']));
    expect(H.apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/${PID}/documents/${HOLDS[0].id}/download`);
    expect((await within(holds).findByRole('status')).textContent).toMatch(/Downloaded Stability protocol v1\.0 — the viewer here shows PDFs only\./);
  });

  it('says a seal of a Vault with no current documents holds none', async () => {
    seals = [{ ...SEAL, documentCount: 0, documents: [] }];
    render(<VaultSeals projectId={PID} />);
    expect((await screen.findByTestId('vault-seal-holds-none')).textContent)
      .toBe('This seal holds no documents. The Vault had no current documents when it was sealed.');
    expect(screen.queryByTestId('vault-seal-holds')).toBeNull();
  });

  it('says a seal whose record of its documents could not be read was not read, and never shows it as empty', async () => {
    seals = [{ ...SEAL, documents: null }, { ...SEAL, id: OTHER }, { ...SEAL, id: THIRD, documents: [{ id: 5 }] }];
    render(<VaultSeals projectId={PID} />);
    await waitFor(() => expect(screen.getAllByTestId('vault-seal-row')).toHaveLength(3));
    const unread = screen.getAllByTestId('vault-seal-holds-unread');
    expect(unread.map((u) => u.textContent)).toEqual(Array(3).fill(
      'What this seal holds could not be read from its record. This is not an empty seal. Verify it to check the record.'));
    expect(screen.queryByTestId('vault-seal-holds')).toBeNull();
    expect(screen.queryByTestId('vault-seal-holds-none')).toBeNull();
    expect(screen.queryByTestId('vault-seals-error')).toBeNull();
  });
});

/* P-107 item 3 (2026-11-08): "A seal says when its version has been superseded ('superseded by version n on date'),
   read from the version chain. What was sealed, and whether it is intact, is unchanged." The server half:
   server/services/vault/__tests__/vault-seal.service.test.ts, tests/db/vault-data-room-seal.dbtest.ts. */
describe('a seal says when a version it holds has since been superseded', () => {
  const doc = (n: number, standing?: unknown) => ({
    id: `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`,
    title: `Document ${n}`, version: '1.0', indexNumber: null, shortHash: 'abcdef012345', lifecycleStage: 'approved',
    ...(standing === undefined ? {} : { standing }),
  });
  const standings = (holds: HTMLElement) => within(holds).getAllByTestId('vault-seal-document')
    .map((r) => r.querySelector('[data-testid="vault-seal-document-standing"]')?.textContent ?? null);

  it('names the version that superseded it and when, beside what the seal recorded, and counts them in the heading', async () => {
    seals = [{ ...SEAL, documents: [
      doc(1, { state: 'superseded', byVersion: '2.0', at: '2026-11-03T09:30:00.000Z' }),
      doc(2, { state: 'current' }),
      doc(3, { state: 'superseded', byVersion: null, at: null }),
    ] }];
    render(<VaultSeals projectId={PID} />);
    const holds = await screen.findByTestId('vault-seal-holds');
    expect(holds.querySelector('summary')?.textContent).toBe('What it holds · 3 documents · 2 since superseded');
    expect(standings(holds)).toEqual([
      'Superseded by version 2.0 on 2026-11-03 09:30 UTC.',
      null,
      'Superseded by a later version. Its version and date are not recorded.',
    ]);
    // The seal's own record is shown as it was: the sealed version, stage and hash.
    const rows = within(holds).getAllByTestId('vault-seal-document');
    expect(rows.map((r) => r.querySelector('.vd-ver-v')?.textContent)).toEqual(['Document 1 · v1.0', 'Document 2 · v1.0', 'Document 3 · v1.0']);
    expect(rows[0].querySelector('.vd-ver-m')?.textContent).toBe('Approved · SHA-256 abcdef012345');
    expect(within(holds).getByTestId('vault-seal-superseded-note').textContent)
      .toBe('2 of these 3 versions have since been superseded. The seal is unchanged: it holds the versions that were sealed.');
  });

  it('says nothing more when every sealed version is still current', async () => {
    seals = [{ ...SEAL, documents: [doc(1, { state: 'current' }), doc(2, { state: 'current' })] }];
    render(<VaultSeals projectId={PID} />);
    const holds = await screen.findByTestId('vault-seal-holds');
    expect(holds.querySelector('summary')?.textContent).toBe('What it holds · 2 documents');
    expect(standings(holds)).toEqual([null, null]);
    expect(within(holds).queryByTestId('vault-seal-superseded-note')).toBeNull();
  });

  it('never shows a version as current when its standing was not read', async () => {
    seals = [{ ...SEAL, documents: [doc(1, { state: 'unknown' }), doc(2), doc(3, { state: 'archived' }), doc(4, { state: 'current' })] }];
    render(<VaultSeals projectId={PID} />);
    const holds = await screen.findByTestId('vault-seal-holds');
    const unread = 'Whether a later version has replaced it could not be read.';
    expect(standings(holds)).toEqual([unread, unread, unread, null]);
    expect(holds.querySelector('summary')?.textContent).toBe('What it holds · 4 documents');
  });
});
