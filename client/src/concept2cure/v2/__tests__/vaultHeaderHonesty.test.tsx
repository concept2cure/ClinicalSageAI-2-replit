// @vitest-environment jsdom
/**
 * Vault (DMS) — the header states only what a read established.
 *
 * ── The defects (launch sweep, empty org) ────────────────────────────────────
 * 1. The header said "0 documents" beside a body saying "Open a project to see
 *    its vault". No vault request had been made: the count was
 *    `flattenDocs(EMPTY_TREE).length`, the placeholder tree, so it also read
 *    "0 documents" while loading and over a FAILED read.
 * 2. A refused read (403) said "the governed document store didn't respond".
 *    It responded; it said no.
 * 3. The upload type picker showed the wire token ("OTHER", "MODULE 3") where
 *    the enum's own label map names each type for a reader.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';

const PID = '11111111-1111-4111-8111-1111111111cc';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const failed = (status: number) => ({ ok: false, status, json: async () => ({ success: false }) }) as Response;

const props = () => ({
  surface: { id: 'vault', label: 'Vault' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

const headerText = () => document.querySelector('.vd-top')?.textContent ?? '';

function vaultWith(vault: () => Response) {
  apiRequest.mockImplementation(async (method: string, url: string) =>
    url === `/api/c2c/project-vault/${PID}` && method === 'GET' ? vault() : ok({}),
  );
}

beforeEach(() => apiRequest.mockReset());
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Vault — header document count', () => {
  it('states no count when no project is open and nothing was read', async () => {
    vaultWith(() => ok({}));
    render(<Vault {...props()} />);
    expect(await screen.findByText('Open a project to see its vault')).toBeTruthy();

    expect(headerText(), 'a document count over a vault nobody read').not.toMatch(/\d+\s+documents?/);
    expect(apiRequest.mock.calls.filter(([, url]) => String(url).startsWith('/api/c2c/project-vault'))).toEqual([]);
  });

  it('states no count over a FAILED read', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    vaultWith(() => failed(500));
    render(<Vault {...props()} />);
    expect(await screen.findByText(/Couldn.t load the project vault/)).toBeTruthy();

    expect(headerText()).not.toMatch(/\d+\s+documents?/);
  });

  it('states the count once the read succeeds', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    vaultWith(() =>
      ok({ success: true, data: { program: 'BX-301', spine: 'IND · 21 CFR 312', standard: 'pharma', documentCount: 0, tree: [] } }),
    );
    render(<Vault {...props()} />);
    expect(await screen.findByText(/No documents in this project's vault yet/)).toBeTruthy();

    // A real, settled zero — the figure is allowed exactly here.
    await waitFor(() => expect(headerText()).toMatch(/IND · 21 CFR 312.*0 documents/));
  });
});

/* QA 2026-10-08 (j1, "Vault shows '1 document' for a new project with zero
   files"): a program the wizard had just created read "1 document" over lanes
   saying "0 uploaded files" and "Captured 0". The one was the IND build the
   wizard scaffolds — an authored document with every section not started — and
   the header did not say so. The read already names its parts
   (documentCounts); the header now states them. */
describe('Vault — the header names what its count is made of', () => {
  const vaultOf = (documentCounts: unknown, documentCount: number) =>
    ok({
      success: true,
      data: {
        program: 'HLV-333', spine: 'IND · 21 CFR 312', standard: 'pharma', documentCount, documentCounts,
        tree: [{ id: 'vaultdoc-1', code: 'IND', label: 'IND build', children: [{ id: 's1', num: '1.1.1', title: 'Form FDA 1571', status: 'not_started', src: 'authored' }] }],
      },
    });

  it('an authored build with no files reads as one authored document and no uploads', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'HLV-333' };
    vaultWith(() => vaultOf({ authored: 1, cmcArtifacts: 0, uploads: 0 }, 1));
    render(<Vault {...props()} />);
    await waitFor(() => expect(headerText()).toMatch(/1 authored document/));
    expect(headerText()).toMatch(/0 uploaded files/);
    expect(headerText(), 'a bare "1 document" reads as a file').not.toMatch(/(^|[^d] )1 document\b/);
  });

  /* The same screen showed "Required sections: 0 of 36 have a confirmed
     document" and, on the build's folder, a bare "0/72". They count different
     things — required CTD headings with a confirmed filing, and the authored
     build's own sections that are settled — and the bare fraction said neither. */
  it('a folder count says what it counts', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'HLV-333' };
    vaultWith(() => vaultOf({ authored: 1, cmcArtifacts: 0, uploads: 0 }, 1));
    render(<Vault {...props()} />);
    await waitFor(() => expect(document.querySelector('.vd-fcount')).not.toBeNull());
    const count = document.querySelector('.vd-fcount') as HTMLElement;
    expect(count.textContent).toBe('0/1');
    expect(count.getAttribute('aria-label')).toBe('0 of 1 settled — approved, final or reviewed');
    expect(count.getAttribute('title')).toBe(count.getAttribute('aria-label'));
  });

  it('names Module 3 artifacts only when there are some, and claims no upload count it could not read', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'HLV-333' };
    vaultWith(() => vaultOf({ authored: 2, cmcArtifacts: 3, uploads: null }, 5));
    render(<Vault {...props()} />);
    await waitFor(() => expect(headerText()).toMatch(/2 authored documents/));
    expect(headerText()).toMatch(/3 Module 3 artifacts/);
    expect(headerText()).not.toMatch(/uploaded file/);
  });
});

describe('Vault — a refused read is a refusal', () => {
  it('a 403 says access was refused, not that the store did not respond', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    vaultWith(() => failed(403));
    render(<Vault {...props()} />);
    expect(await screen.findByText(/Couldn.t load the project vault/)).toBeTruthy();

    expect(document.body.textContent).toMatch(/don.t have access to this project.s documents/i);
    expect(document.body.textContent).not.toMatch(/didn.t respond/i);
  });

  it('a 5xx says the store did not respond, and offers a retry', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    vaultWith(() => failed(503));
    render(<Vault {...props()} />);
    expect(await screen.findByText(/Couldn.t load the project vault/)).toBeTruthy();

    expect(document.body.textContent).toMatch(/didn.t respond/i);
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeTruthy();
  });
});

describe('Vault — upload controls', () => {
  it('names document types for a reader, not by wire token', async () => {
    vaultWith(() => ok({}));
    render(<Vault {...props()} />);
    const picker = (await screen.findByTestId('vault-upload-type')) as HTMLSelectElement;
    const labels = Array.from(picker.options).map((o) => o.textContent);

    expect(labels).toContain('Other');
    expect(labels).toContain('Module 3 · quality');
    expect(labels.filter((l) => /^[A-Z0-9 _]+$/.test(l ?? '')), 'raw enum tokens shown to the user').toEqual([]);
    // The submitted value is still the wire token the ingest route accepts.
    expect(picker.value).toBe('OTHER');
  });

  it('with no project open, Upload is disabled and says why', async () => {
    /* Its disabled LOOK is journey-v2.css `.sp-primary:disabled` (jsdom loads
       no stylesheets, so that half is verified by the live capture, not here). */
    vaultWith(() => ok({}));
    render(<Vault {...props()} />);
    const upload = (await screen.findByTestId('vault-upload-button')) as HTMLButtonElement;
    expect(upload.disabled).toBe(true);
    expect(upload.title).toMatch(/Open a project first/);
  });
});
