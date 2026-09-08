// @vitest-environment jsdom
/**
 * "Open in editor" must open the document the user selected.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Vault.tsx:270 — the whole handler was
 *
 *   const openDoc = () => { onNav && onNav('document-authoring'); };
 *
 * `sel`, the document the user had just clicked in the dossier tree, was never
 * read. They picked §3.2.P.8 out of a 71-section filing, pressed the one button
 * that promises to open it, and arrived at the editor's default view with the
 * selection silently gone — the failure a user is least likely to report,
 * because it looks like the editor simply opened.
 *
 * The deep-link channel for exactly this already existed and had one sender:
 * v2/editorTarget.ts (one-shot, TTL-guarded, consumed by DocumentAuthoring on
 * mount, which resolves by section code then title and posts an honest notice
 * on a miss).
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN: that the click publishes a target carrying the SELECTED section's
 * code and label before the navigation, that the document family is named only
 * when it is one the channel can express (a governed IND dossier is not — and
 * naming it anyway would make the editor REFUSE the target), and that the
 * target reaches the channel's own reader, `peekEditorTarget`, rather than some
 * private global this surface invented.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
import type { SurfaceViewProps } from '../surfaceViews';

const PROJECT_ID = '2c1f9c2a-0000-4000-8000-000000000001';

const leaf = (id: string, num: string, title: string) => ({
  id, num, title, type: 'Required', status: 'draft', pct: 0,
  owner: '—', ver: 'v1', updated: '2 days ago', preview: `${title} · ${num}`,
});

/** One governed 510(k) document and one governed IND document, each with its
 *  own section leaf — the read-model's real shape (documentFolder →
 *  `vaultdoc-<id>` whose `code` is the row's doc_type uppercased). */
const TREE = [
  {
    id: 'vaultdoc-11', code: 'K510', label: 'Acme Cutter — 510(k)',
    children: [leaf('sec-11-B1', 'B1', 'Device Description')],
  },
  {
    id: 'vaultdoc-22', code: 'IND', label: 'BX204 — IND',
    children: [leaf('sec-22-2.7.3', '2.7.3', 'Summary of Clinical Efficacy')],
  },
];

const VAULT_PAYLOAD = {
  success: true,
  data: { program: 'BX204', spine: 'eCTD', tree: TREE, unfiledCount: 0, unavailable: [] },
};

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

let navigated: string[];

function mount() {
  navigated = [];
  const props = {
    surface: { id: 'vault', label: 'Vault' },
    segment: 'biotech',
    onAsk: () => {},
    onNav: (id: string) => navigated.push(id),
  } as unknown as SurfaceViewProps;
  return render(<Vault {...props} />);
}

/** Open the document folder `folderLabel` in the tree (the list shows one
 *  folder at a time), click the row for `title`, then "Open in editor". */
async function openInEditor(title: string, folderLabel: string) {
  const folder = await waitFor(() => {
    const el = Array.from(document.querySelectorAll('.vd-folder')).find((b) =>
      b.textContent?.includes(folderLabel),
    );
    if (!el) throw new Error(`folder "${folderLabel}" not rendered`);
    return el;
  });
  fireEvent.click(folder);
  const row = await waitFor(() => {
    const el = Array.from(document.querySelectorAll('.vd-row')).find((b) =>
      b.textContent?.includes(title),
    );
    if (!el) throw new Error(`row "${title}" not rendered`);
    return el;
  });
  fireEvent.click(row);
  const btn = await waitFor(() => screen.getByText(/Open in editor/));
  fireEvent.click(btn);
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) =>
    url.startsWith('/api/c2c/project-vault/')
      ? Promise.resolve(ok(VAULT_PAYLOAD))
      : Promise.resolve(ok({ success: true, data: null })),
  );
  clearEditorTarget();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
    id: PROJECT_ID,
    title: 'BX204',
  };
});
afterEach(() => {
  cleanup();
  clearEditorTarget();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Vault — Open in editor carries the selected document', () => {
  it('publishes the selected section on the editor deep-link channel before navigating', async () => {
    mount();
    await openInEditor('Device Description', 'Acme Cutter');

    const target = peekEditorTarget();
    expect(target, 'nothing was published on the editor channel').not.toBeNull();
    expect(target!.sectionCode).toBe('B1');
    expect(target!.sectionLabel).toBe('Device Description');
    // The family IS expressible for a 510(k), so it is named — that is the
    // stronger claim, and it is what lets the editor refuse a wrong dossier.
    expect(target!.docType).toBe('k510');
    expect(target!.programId).toBe(PROJECT_ID);
    expect(target!.programTitle).toBe('BX204');
    expect(navigated).toEqual(['document-authoring']);
  });

  it('carries the section but NOT an invented family for a dossier the channel cannot name', async () => {
    mount();
    await openInEditor('Summary of Clinical Efficacy', 'BX204 — IND');

    const target = peekEditorTarget();
    expect(target).not.toBeNull();
    expect(target!.sectionCode).toBe('2.7.3');
    expect(target!.sectionLabel).toBe('Summary of Clinical Efficacy');
    // 'ind' is a governed doc_type but not one this channel spells. Naming a
    // near neighbour ('k510', 'cer') would make DocumentAuthoring answer
    // "this project's governed dossier is IND, not 510(k)" and refuse a target
    // that was never wrong — so the claim is dropped, not guessed.
    expect(target!.docType).toBeNull();
    expect(navigated).toEqual(['document-authoring']);
  });

  it('leaves no stale target behind for the next, unrelated visit to the editor', async () => {
    mount();
    await openInEditor('Device Description', 'Acme Cutter');
    expect(peekEditorTarget()).not.toBeNull();
    // The channel is one-shot: DocumentAuthoring consumes on mount. Pinned here
    // so the vault's writes stay compatible with that contract.
    const consumed = peekEditorTarget();
    clearEditorTarget();
    expect(consumed).not.toBeNull();
    expect(peekEditorTarget()).toBeNull();
  });
});
