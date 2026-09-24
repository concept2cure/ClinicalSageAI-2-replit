// @vitest-environment jsdom
/**
 * Vault (DMS) — what the surface tells AnA about itself.
 *
 * The screen context is AnA's only view of the Vault, so a figure in it that
 * the screen does not show is still a claim — AnA repeats it to the user. These
 * cases read the context exactly as AnA's shell does, through
 * useActiveSurfaceContext('vault'). Fixtures: ./_vault-surface-fixtures.
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
import { useActiveSurfaceContext } from '../surfaceContext';
import { PID, ok, vaultPayload, props, mockVaultApi } from './_vault-surface-fixtures';

const mockApi = (vaultResponse: () => Response) => mockVaultApi(apiRequest, vaultResponse);

function ContextProbe({ onContext }: { onContext: (c: unknown) => void }) {
  onContext(useActiveSurfaceContext('vault'));
  return null;
}

afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
});

describe('Vault — what AnA is told about the selected document', () => {
  /* The surface shows no percentage for an upload (there is no authoring
     completion to show), but the context it publishes for AnA carried the
     tree's placeholder 0 as `percentComplete`, so AnA described every uploaded
     file as "0% complete". The server now sends null for an upload; the
     surface also maps an upload to null, because a 0 from a server that has
     not caught up is still not a completion figure. */

  it('an upload has no completion figure — null, not 0% complete', async () => {
    mockApi(() => ok(vaultPayload()));
    let latest: any = null;
    render(
      <>
        <Vault {...props()} />
        <ContextProbe onContext={(c) => { latest = c; }} />
      </>,
    );
    await screen.findByTestId('vault-filing-block');
    await waitFor(() => expect(latest?.facts?.selected?.title).toBe('stability-summary-24m'));
    expect(latest.facts.selected.percentComplete).toBeNull();
  });
});

describe('Vault — "N documents" counts documents, not tree entries', () => {
  /* The header and AnA's screen context counted every leaf in the tree: one
     authored IND with three rule-pack sections read "3 documents", and uploads
     counted as the page the tree carries. The server's documentCount now counts
     documents; the surface shows that figure, not the leaves. */
  const section = (key: string, title: string) => ({
    id: `sec-${key}`, num: key, title, type: 'Section', status: 'draft', pct: 0,
    owner: '—', ver: '—', updated: '', preview: title, src: 'authored',
  });
  const authoredTree = () => [
    {
      id: 'vaultdoc-doc1', code: 'IND', label: 'IND',
      children: [section('2.5', 'Clinical overview'), section('2.6', 'Nonclinical summaries'), section('2.7', 'Clinical summary')],
    },
  ];

  it('one authored document with three sections is "1 document", to the user and to AnA', async () => {
    mockApi(() =>
      ok(vaultPayload({ tree: authoredTree(), documentCount: 1, documentCounts: { authored: 1, cmcArtifacts: 0, uploads: 0 } })),
    );
    let latest: any = null;
    const { container } = render(
      <>
        <Vault {...props()} />
        <ContextProbe onContext={(c) => { latest = c; }} />
      </>,
    );
    await screen.findAllByText('Clinical overview');
    const header = container.querySelector('.vd-sub-x')?.textContent ?? '';
    expect(header).toMatch(/\b1 document\b/);
    expect(header).not.toMatch(/3 documents/);
    await waitFor(() => expect(latest?.facts?.totalDocuments).toBe(1));
    expect(latest.summary).toMatch(/Document vault: 1 document/);
    expect(latest.facts.documentCounts).toEqual({ authored: 1, cmcArtifacts: 0, uploads: 0 });
  });
});
