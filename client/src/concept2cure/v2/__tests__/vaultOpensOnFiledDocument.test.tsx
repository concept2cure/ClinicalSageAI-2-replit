// @vitest-environment jsdom
/**
 * Vault — "Open in Vault" after File to Vault opens on the document just filed
 * (filing-path trace, 2026-10-15).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The path from an approved Authoring document to a submission leaf runs File
 * to Vault, then the filed record's "Place into filing…" in the Vault. The
 * dialog's "Open in Vault" landed on the Vault's first node (the CTD spine),
 * so the person had to find the record they had just filed before the next
 * step was on screen. The dialog now names the document (vaultTarget.ts) and
 * the Vault opens on its row: folder, list and detail pane, with the
 * placement action, and no click.
 *
 * A target for another project is dropped, never applied to this vault; a
 * target the read model does not hold is said, not silently ignored.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { locateVaultDocument, setVaultTarget } from '../vaultTarget';

const PID = 'ac97f9db-c0fe-46de-ad90-d0bc6b7bbf12';
const DOC_UUID = '7ab9a621-84a9-4c28-8a87-55eb7a648687';
const DOC_TITLE = 'OQ-002 Protocol 20260921011458';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function sectionLeaf(num: string, title: string) {
  return {
    id: `sec-doc_67dd-${num}`,
    num,
    title,
    type: 'Required',
    status: 'not_started',
    pct: 0,
    owner: '—',
    ver: 'v1',
    updated: 'just now',
    preview: `${title} · mandatory section`,
    blocker: true,
    src: 'authored',
  };
}

/** The filed upload, as the read model projects a vault.documents row after
 *  POST …/file placed it in Module 5 (OQ-VAULT-07). */
function filedUpload() {
  return {
    id: `up-${DOC_UUID}`,
    num: '—',
    title: DOC_TITLE,
    type: 'Protocol',
    status: 'confirmed',
    pct: 100,
    owner: 'JM Smith',
    ver: 'v1.0',
    updated: 'just now',
    preview: 'OQ-002-Protocol-20260921011458.pdf · 611 B · SHA-256 2d811d6a9643…',
    src: 'upload',
    docId: DOC_UUID,
    sizeLabel: '611 B',
    hash: '2d811d6a964381f417c4535c5006865a224bc40d88c4e189495babf73a2a4fa9',
    filing: {
      folderId: 'module-5',
      folderLabel: 'Module 5 · Clinical',
      evidenceKind: null,
      ctdSection: null,
      placementStatus: 'confirmed',
      confidence: null,
      rationale: 'OQ-002 step 07 — filed into Module 5 by validation.',
    },
  };
}

/** Spine FIRST, cabinet LAST — the order GET /api/c2c/project-vault/:id emits. */
function readModelTree() {
  return [
    {
      id: 'vaultdoc-doc_67dd',
      code: 'IND',
      label: 'OQ-002 Vault program — IND × FDA · eCTD M1 + ICH M4 M2–M5',
      children: [
        {
          id: 'sec-doc_67dd-M1',
          code: 'M1',
          label: 'Module 1 · Administrative',
          children: [sectionLeaf('1.2', 'Cover letter'), sectionLeaf('1.20', 'Introductory statement')],
        },
      ],
    },
    {
      id: 'cabinet',
      code: '',
      label: 'Source files · filing cabinet',
      children: [
        { id: 'cab-unfiled', code: '', label: 'Unfiled · needs review', children: [] },
        { id: 'cab-module-5', code: '', label: 'Module 5 · Clinical', children: [filedUpload()] },
      ],
    },
  ];
}

function vaultPayload(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      program: 'OQ-002 Vault program',
      spine: 'IND · 21 CFR 312',
      standard: 'biotech',
      documentCount: 3,
      tree: readModelTree(),
      unfiledCount: 0,
      uploadsWindow: { shown: 1, total: 1, truncated: false },
      dataRoom: { captured: 0, classified: 0, filed: 0, sources: [] },
      ...over,
    },
  };
}

const props = () => ({
  surface: { id: 'vault', label: 'Vault' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'OQ-002 Vault program' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    return ok({});
  });
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
  delete (window as any).C2C_VAULT_TARGET;
});

const PLACE = 'vault-place-into-submission';
const detail = () => document.querySelector('.vd-detail') as HTMLElement;

describe('Vault — opens on the document File to Vault named', () => {
  it('CONTROL: with no target the Vault opens on its first node, away from the filed record', async () => {
    render(<Vault {...props()} />);
    await screen.findAllByText('Cover letter');
    expect(within(detail()).queryByText(DOC_TITLE)).toBeNull();
    expect(screen.queryByTestId(PLACE)).toBeNull();
  });

  it('with the filed document named, opens on its row with "Place into filing…" on screen', async () => {
    setVaultTarget({ documentId: DOC_UUID, programId: PID });
    render(<Vault {...props()} />);
    expect(await screen.findByTestId(PLACE)).toBeTruthy();
    expect(within(detail()).getAllByText(DOC_TITLE).length).toBeGreaterThan(0);
    const list = document.querySelector('.vd-list') as HTMLElement;
    expect(within(list).getByText(/Module 5 · Clinical/)).toBeTruthy();
    // One-shot: the target is consumed, so a later visit opens normally.
    expect((window as any).C2C_VAULT_TARGET).toBeNull();
  });

  it('a target named for another project is not applied here, and says where the document is', async () => {
    setVaultTarget({ documentId: DOC_UUID, programId: 'another-project' });
    render(<Vault {...props()} />);
    await screen.findAllByText('Cover letter');
    expect(screen.queryByTestId(PLACE)).toBeNull();
    expect(screen.queryByTestId('vault-target-missing')).toBeNull();
    expect(screen.getByTestId('vault-target-other-project').textContent).toContain('belongs to another project');
    expect((window as any).C2C_VAULT_TARGET).toBeNull();
  });

  it('a filed document the read model does not hold is said, not silently ignored', async () => {
    setVaultTarget({ documentId: '00000000-0000-4000-8000-000000000000', programId: PID });
    render(<Vault {...props()} />);
    expect((await screen.findByTestId('vault-target-missing')).textContent).toContain('not in this list');
  });
});

describe('locateVaultDocument', () => {
  it('finds the row and the folder that holds it by the document uuid', () => {
    expect(locateVaultDocument(readModelTree() as any, DOC_UUID)).toEqual({ folderId: 'cab-module-5', rowId: `up-${DOC_UUID}` });
    expect(locateVaultDocument(readModelTree() as any, 'absent')).toBeNull();
  });
});
