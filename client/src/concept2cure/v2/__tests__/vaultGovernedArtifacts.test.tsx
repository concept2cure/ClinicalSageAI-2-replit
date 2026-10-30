// @vitest-environment jsdom
/**
 * Vault — the project's governed artifacts (fold F3 slice A, D2, 2026-10-29).
 *
 * Before this, the project Vault showed concept2cure_artifacts only for §3.x
 * ("Module 3 (CMC)"), with no signature, review, source, author or hash. What
 * AnA drafted for Modules 1, 2, 4 and 5 was in the device vault and the
 * organization's Artifacts center, never here. The read now returns every
 * non-archived artifact of the project as one branch; this surface renders it
 * grouped by CTD module, with a status breakdown, and each artifact's state in
 * its detail pane. A failed branch read is said as a failure; a project with
 * no artifacts says so plainly.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { PID, ok, props, mockVaultApi } from './_vault-surface-fixtures';

function leaf(id: number, over: Record<string, unknown> = {}, facts: Record<string, unknown> = {}) {
  return {
    id: `art-${id}`, num: '2.5', title: `Artifact ${id}`, type: 'Clinical overview', status: 'draft', pct: 0,
    owner: 'R. Writer', ver: 'v5', updated: '2h ago', preview: `Artifact ${id}`, src: 'artifact',
    artifact: {
      artifactId: `artifact_${id}`, kind: 'Clinical overview', format: 'docx', model: null, origin: 'ana',
      author: 'R. Writer', contentHash: 'c'.repeat(64), ctdSection: '2.5', signature: 'none',
      signedVersion: null, reviewed: false, sourceCount: 0, ...facts,
    },
    ...over,
  };
}

const artifactsBranch = () => ({
  id: 'artifacts', code: '', label: 'Governed artifacts',
  children: [
    { id: 'art-m1', code: '', label: 'Module 1', children: [leaf(1, { num: '1.2', title: 'Cover letter', status: 'approved' }, { ctdSection: '1.2', signature: 'current', signedVersion: 1, reviewed: true })] },
    {
      id: 'art-m2', code: '', label: 'Module 2', children: [
        leaf(2, { title: 'Clinical overview', status: 'review' }, { signature: 'stale', signedVersion: 3, sourceCount: 4, model: 'claude-opus-4' }),
      ],
    },
    { id: 'art-none', code: '', label: 'No CTD section', children: [leaf(3, { num: '—', title: 'device-file.pdf' }, { ctdSection: null, origin: 'import', kind: 'Imported' })] },
  ],
});

const block = (over: Record<string, unknown> = {}) => ({
  total: 3,
  byStatus: { approved: 1, review: 1, draft: 1 },
  signatures: { none: 1, current: 1, stale: 1, unknown: 0 },
  reviewed: 1,
  window: { shown: 3, total: 3, truncated: false },
  ...over,
});

function payload(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      program: 'BX-301', spine: 'IND · 21 CFR 312', standard: 'pharma',
      documentCount: 3, documentCounts: { authored: 0, artifacts: 3, uploads: 0 },
      tree: [artifactsBranch()], artifacts: block(), unfiledCount: 0,
      ...over,
    },
  };
}

function ContextProbe({ onContext }: { onContext: (c: SurfaceContext | null) => void }) {
  onContext(useActiveSurfaceContext('vault'));
  return null;
}

beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const lane = () => screen.findByTestId('vault-artifacts-lane');
const tree = () => document.querySelector('.vd-tree') as HTMLElement;

describe('Vault — the project’s governed artifacts', () => {
  it('lists the branch in the tree, grouped by CTD module', async () => {
    mockVaultApi(apiRequest, () => ok(payload()));
    render(<Vault {...props()} />);
    await waitFor(() => expect(tree()).not.toBeNull());
    const t = within(tree());
    expect(t.getByText('Governed artifacts')).toBeTruthy();
    expect(t.getByText('Module 1')).toBeTruthy();
    expect(t.getByText('Module 2')).toBeTruthy();
    expect(t.getByText('No CTD section')).toBeTruthy();
  });

  it('states the branch’s status breakdown and signature and review counts', async () => {
    mockVaultApi(apiRequest, () => ok(payload()));
    render(<Vault {...props()} />);
    const l = await lane();
    expect(l.textContent).toMatch(/3 governed artifacts in this project/);
    expect(l.textContent).toMatch(/Approved 1/);
    expect(l.textContent).toMatch(/In review 1/);
    expect(l.textContent).toMatch(/Draft 1/);
    expect(l.textContent).toMatch(/Signed on the current version 1/);
    expect(l.textContent).toMatch(/Signed on an earlier version only 1/);
    expect(l.textContent).toMatch(/Human review recorded 1/);
  });

  it('the header names governed artifacts beside authored documents', async () => {
    mockVaultApi(apiRequest, () => ok(payload()));
    render(<Vault {...props()} />);
    await waitFor(() => expect(document.querySelector('.vd-sub-x')?.textContent ?? '').toMatch(/3 governed artifacts/));
  });

  it('opens an artifact on its governance: kind, format, origin, model, author, signature, review, sources, hash', async () => {
    mockVaultApi(apiRequest, () => ok(payload()));
    render(<Vault {...props()} />);
    await waitFor(() => expect(tree()).not.toBeNull());
    fireEvent.click(within(tree()).getByText('Module 2'));
    fireEvent.click(await screen.findByRole('button', { name: /Clinical overview/ }));
    const pane = await screen.findByTestId('vault-artifact-governance');
    const text = pane.textContent ?? '';
    expect(text).toMatch(/Kind\s*Clinical overview/);
    expect(text).toMatch(/Format\s*DOCX/);
    expect(text).toMatch(/Origin\s*Drafted by AnA/);
    expect(text).toMatch(/Model\s*claude-opus-4/);
    expect(text).toMatch(/Author\s*R\. Writer/);
    expect(text).toMatch(/Signed on v3 only; the current version \(v5\) is not signed/);
    expect(text).toMatch(/Human review\s*Required/);
    expect(text).toMatch(/Cited sources\s*4/);
    expect(text).toMatch(/Recorded hash\s*cccccccccccccccc/);
  });

  it('an artifact with no recorded origin or model says so, rather than naming one', async () => {
    const quiet = artifactsBranch();
    (quiet.children[0].children[0] as any).artifact.origin = null;
    mockVaultApi(apiRequest, () => ok(payload({ tree: [quiet] })));
    render(<Vault {...props()} />);
    await waitFor(() => expect(tree()).not.toBeNull());
    fireEvent.click(within(tree()).getByText('Module 1'));
    fireEvent.click(await screen.findByRole('button', { name: /Cover letter/ }));
    const text = (await screen.findByTestId('vault-artifact-governance')).textContent ?? '';
    expect(text).toMatch(/Origin\s*Not recorded/);
    expect(text).toMatch(/Model\s*Not recorded/);
    expect(text).not.toMatch(/Drafted by AnA/);
    expect(text).toMatch(/Signed on the current version/);
    expect(text).toMatch(/Human review\s*Recorded/);
  });

});

describe('Vault — honest states of the governed artifacts', () => {
  it('a branch the server could not read is said as a failure, never as no artifacts', async () => {
    mockVaultApi(apiRequest, () =>
      ok(payload({
        tree: [], artifacts: undefined, documentCounts: { authored: 0, artifacts: null, uploads: 0 }, documentCount: 0,
        unavailable: [{ branch: 'Governed artifacts', reason: 'The governed artifact registry is not provisioned in this environment.' }],
      })),
    );
    render(<Vault {...props()} />);
    const l = await lane();
    const alert = within(l).getByRole('alert');
    expect(alert.textContent).toMatch(/could not be read/);
    expect(alert.textContent).toMatch(/not provisioned in this environment/);
    expect(l.textContent).not.toMatch(/No governed artifacts/);
  });

  it('a project with no artifacts says so plainly', async () => {
    mockVaultApi(apiRequest, () =>
      ok(payload({ tree: [], artifacts: block({ total: 0, byStatus: {}, signatures: { none: 0, current: 0, stale: 0, unknown: 0 }, reviewed: 0, window: { shown: 0, total: 0, truncated: false } }), documentCounts: { authored: 0, artifacts: 0, uploads: 0 }, documentCount: 0 })),
    );
    render(<Vault {...props()} />);
    const l = await lane();
    expect(l.textContent).toMatch(/No governed artifacts in this project yet/);
    expect(within(l).queryByRole('alert')).toBeNull();
  });

  it('a window over a larger registry says the counts cover what is listed', async () => {
    mockVaultApi(apiRequest, () => ok(payload({ artifacts: block({ total: 2400, window: { shown: 2000, total: 2400, truncated: true } }) })));
    render(<Vault {...props()} />);
    const l = await lane();
    expect(l.textContent).toMatch(/2400 governed artifacts in this project/);
    expect(l.textContent).toMatch(/the newest 2000 are listed, and the counts below cover them/);
  });

  it('does not carry the unbacked retention subtitle', async () => {
    mockVaultApi(apiRequest, () => ok(payload()));
    render(<Vault {...props()} />);
    await lane();
    expect(document.body.textContent).not.toMatch(/SHA-256 chained|7-year minimum retention/);
  });

  it('tells AnA what the branch holds, and what it could not read', async () => {
    mockVaultApi(apiRequest, () => ok(payload()));
    let latest: any = null;
    render(<><Vault {...props()} /><ContextProbe onContext={(c) => { latest = c; }} /></>);
    await waitFor(() => expect(latest?.facts?.governedArtifacts).toBeTruthy());
    expect(latest.facts.governedArtifacts).toMatchObject({ total: 3, byStatus: { approved: 1, review: 1, draft: 1 }, listTruncated: false });
    expect(latest.facts.documentCounts).toEqual({ authored: 0, artifacts: 3, uploads: 0 });

    cleanup();
    latest = null;
    mockVaultApi(apiRequest, () =>
      ok(payload({ tree: [], artifacts: undefined, unavailable: [{ branch: 'Governed artifacts', reason: 'Not provisioned.' }] })),
    );
    render(<><Vault {...props()} /><ContextProbe onContext={(c) => { latest = c; }} /></>);
    await waitFor(() => expect(latest?.facts?.governedArtifacts).toBe('unavailable — counts unknown, not zero'));
  });
});
