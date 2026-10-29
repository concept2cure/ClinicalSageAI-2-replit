// @vitest-environment jsdom
/**
 * The Vault's organization view of governed artifacts, and AnA selecting an
 * artifact by its id (D2, fold F3 slice C, 2026-10-29).
 *
 * The Artifacts center (AdminSurfaces.tsx ArtifactsCenter) was the one screen
 * listing governed artifacts across projects. It retires into the Vault, so
 * the Vault carries what it did, over the read it already made
 * (GET /api/artifacts-center), now bound to the projects the caller can open:
 *
 *   listing   every artifact of the projects the caller can open: kind, format,
 *             project, model, version, the signature on the current version
 *             (four states), cited sources and human review;
 *   download  the governed DOCX (the leaf's export, recorded before delivery);
 *   editor    authoring.open-document by title;
 *   manifest  the shared CSV builder (artifactManifest.ts), same columns;
 *   AnA       the view's state in context, and vault.focus-document, which
 *             now also takes an artifact id: the Live Drive hand-off rides it.
 *
 * A failed read is an error, a refusal says what it is, and neither is an
 * empty registry.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const dl = vi.hoisted(() => ({ blob: vi.fn((..._a: unknown[]) => true), csv: vi.fn((..._a: unknown[]) => true) }));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob: dl.blob,
  downloadCsv: dl.csv,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { Vault } from '../surfaces/Vault';
import { __resetSurfaceActionBus, applySurfaceAction, registerSurfaceActionHandlers, registeredSurfaceId } from '../surfaceActions';
import { resolveSurfaceIdForTarget } from '../navParams';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { PID, ok, props } from './_vault-surface-fixtures';

const ORG = '/api/artifacts-center';

/** The converged manifest's columns (artifactManifest.ts). */
const MANIFEST_HEADERS = [
  'Name', 'Artifact ID', 'CTD section', 'Kind', 'Format', 'Origin', 'Model', 'Author', 'Status', 'Version',
  'Signed', 'Human review', 'Cited sources', 'Recorded hash', 'Stored content size', 'Project', 'Updated',
];

function orgRow(over: Record<string, unknown> = {}) {
  return {
    id: 'artifact_9', name: 'IND cover letter', kind: 'Regulatory document', fmt: 'docx', size: '2 KB', model: null,
    when: 'today', ver: 'v7', sig: true, sigVersion: 7, sigStale: false, reviewed: true, sourceCount: 2, prog: 'BX-204',
    ctdSection: '1.2', status: 'approved', origin: null, author: 'R. Writer', contentHash: 'a'.repeat(64),
    ...over,
  };
}
const ORG_ROWS = () => [
  orgRow(),
  orgRow({ id: 'artifact_10', name: 'Clinical overview', kind: 'Clinical overview', ver: 'v5', sigVersion: 3, sigStale: true, reviewed: false, sourceCount: 1, prog: 'BX-301', ctdSection: '2.5', status: 'review', model: 'claude-opus-4' }),
  orgRow({ id: 'artifact_11', name: 'Clinical summary of efficacy', kind: 'Clinical summary', ver: 'v1', sig: false, sigVersion: null, sigStale: null, reviewed: false, sourceCount: 0, prog: 'BX-301', ctdSection: '2.7.3', status: 'draft' }),
];
const orgBody = (rows: unknown[] = ORG_ROWS(), meta: Record<string, unknown> = {}) => ({
  success: true, data: rows, total: rows.length,
  meta: { scope: 'accessible-projects', total: rows.length, listed: rows.length, truncated: false, ...meta },
});

type Route = (method: string, url: string) => unknown;
function mockApi(extra: Route = () => undefined) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const hit = extra(method, url);
    if (hit !== undefined) {
      if (hit instanceof Error) throw hit;
      return hit;
    }
    if (method === 'GET' && url === ORG) return ok(orgBody());
    if (method === 'GET' && url.startsWith('/api/artifacts-center/')) {
      return { ok: true, status: 200, headers: new Headers({ 'Content-Disposition': 'attachment; filename="IND_cover_letter.docx"' }), blob: async () => new Blob(['docx']) } as unknown as Response;
    }
    return ok({});
  });
}
const fail = (status: number, body: unknown = {}) => ({ ok: false, status, json: async () => body }) as Response;
const urls = () => apiRequest.mock.calls.map((c) => String(c[1]));
const orgPanel = () => screen.findByTestId('vault-org-artifacts');

function ContextProbe({ onContext }: { onContext: (c: SurfaceContext | null) => void }) {
  onContext(useActiveSurfaceContext('vault'));
  return null;
}

function run(params: Record<string, string>) {
  const res = resolveSurfaceAction('vault.focus-document', params);
  if (!res.ok) throw new Error(res.error);
  let outcome: unknown;
  act(() => { outcome = applySurfaceAction(res.directive, vi.fn()); });
  return outcome as { status: string; reason?: string; detail?: string };
}

beforeEach(() => {
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  dl.blob.mockClear();
  dl.csv.mockClear();
  __resetSurfaceActionBus();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('with no project open, the Vault lists the governed artifacts of the projects the caller can open', () => {
  it('reads the organization listing and shows each artifact’s governance', async () => {
    mockApi();
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    expect(urls()).toContain(ORG);
    expect(panel.textContent).toMatch(/3 governed artifacts in the projects you can open/);
    // Kind, project, version and model as the read records them; an unrecorded model is said so.
    const cover = within(panel).getByTestId('vault-org-artifact-artifact_9');
    expect(cover.textContent).toMatch(/Regulatory document/);
    expect(cover.textContent).toMatch(/BX-204/);
    expect(cover.textContent).toMatch(/v7/);
    expect(cover.textContent).toMatch(/DOCX/);
    expect(cover.textContent).toMatch(/Model not recorded/);
    expect(within(panel).getByTestId('vault-org-artifact-artifact_10').textContent).toMatch(/claude-opus-4/);
  });

  it('says the signature on the current version in words, four states', async () => {
    mockApi(() => undefined);
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === ORG ? ok(orgBody([...ORG_ROWS(), orgRow({ id: 'artifact_12', name: 'Unknown cover', sigVersion: null, sigStale: null })])) : ok({}));
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    expect(within(panel).getByTestId('vault-org-artifact-artifact_9').textContent).toMatch(/Signed on the current version/);
    expect(within(panel).getByTestId('vault-org-artifact-artifact_10').textContent).toMatch(/Signed on v3 only; the current version \(v5\) is not signed/);
    expect(within(panel).getByTestId('vault-org-artifact-artifact_11').textContent).toMatch(/Not signed/);
    expect(within(panel).getByTestId('vault-org-artifact-artifact_12').textContent).toMatch(/version the signature covers could not be determined/);
  });

  it('carries the gallery’s cited-source and review line, verbatim', async () => {
    mockApi();
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    expect(within(panel).getByTestId('artifact-governance-artifact_9').textContent).toBe('2 cited sources · Human review recorded');
    expect(within(panel).getByTestId('artifact-governance-artifact_10').textContent).toBe('1 cited source · Human review required');
  });

  it('says whose projects it covers, and when the window is full, that it is', async () => {
    mockApi((_m, url) => (url === ORG ? ok(orgBody(ORG_ROWS(), { total: 412, listed: 3, truncated: true })) : undefined));
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    expect(panel.textContent).toMatch(/412 governed artifacts in the projects you can open/);
    expect(panel.textContent).toMatch(/the newest 3 are listed/);
    expect(panel.textContent).toMatch(/Only the projects you can open are listed/);
  });

  it('none in the projects the caller can open is said as that', async () => {
    mockApi((_m, url) => (url === ORG ? ok(orgBody([])) : undefined));
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    await waitFor(() => expect(panel.textContent).toMatch(/No governed artifacts in the projects you can open yet/));
  });

  it('a failed read is an error, never an empty registry, and can be tried again', async () => {
    let calls = 0;
    mockApi((_m, url) => {
      if (url !== ORG) return undefined;
      calls += 1;
      return calls === 1 ? fail(500) : ok(orgBody());
    });
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    const alert = await within(panel).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read/);
    expect(alert.textContent).toMatch(/not an empty registry/i);
    expect(panel.textContent).not.toMatch(/No governed artifacts/);
    fireEvent.click(within(alert).getByRole('button', { name: /Try again/ }));
    await within(panel).findByText('IND cover letter');
  });

  it('a refusal says what it is, with no retry a retry cannot change', async () => {
    mockApi((_m, url) => (url === ORG
      ? new ApiRequestError('This feature is not enabled.', 403, { error: 'MODULE_NOT_LICENSED' }, 'MODULE_NOT_LICENSED')
      : undefined));
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    const alert = await within(panel).findByRole('alert');
    expect(alert.textContent).toMatch(/not enabled for your organization/);
    expect(within(alert).queryByRole('button', { name: /Try again/ })).toBeNull();
  });

});

describe('a person acts on a row of the organization view as on the gallery', () => {
  it('exports the listing through the one manifest builder, with the same columns', async () => {
    mockApi((_m, url) => (url === ORG ? ok(orgBody([orgRow(), orgRow({ id: 'artifact_13', name: 'Status memo', status: 'superseded', contentHash: null, ctdSection: null, sig: false, sigVersion: null, sigStale: null })])) : undefined));
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    fireEvent.click(within(panel).getByRole('button', { name: /Export manifest/ }));
    expect(dl.csv).toHaveBeenCalledTimes(1);
    const [name, headers, rows] = dl.csv.mock.calls[0] as [string, string[], unknown[][]];
    expect(name).toBe('governed-artifacts-across-projects.csv');
    expect(headers).toEqual(MANIFEST_HEADERS);
    expect(rows[0]).toEqual([
      'IND cover letter', 'artifact_9', '1.2', 'Regulatory document', 'DOCX', 'Not recorded', 'Not recorded', 'R. Writer',
      'Approved', 'v7', 'yes', 'Recorded on the current version', 2, 'a'.repeat(64), '2 KB', 'BX-204', 'today',
    ]);
    // A status the Vault has no label for is written as the row records it.
    expect(rows[1][8]).toBe('superseded');
    expect(rows[1][13]).toBe('Not recorded');
  });

  it('downloads a row’s governed DOCX, and says a refusal in words', async () => {
    mockApi((_m, url) => (url === '/api/artifacts-center/artifact_10/export?format=docx'
      ? fail(403, { error: { code: 'HUMAN_REVIEW_REQUIRED' } }) : undefined));
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    fireEvent.click(within(within(panel).getByTestId('vault-org-artifact-artifact_9')).getByRole('button', { name: /Download DOCX/ }));
    await waitFor(() => expect(dl.blob).toHaveBeenCalledTimes(1));
    expect(dl.blob.mock.calls[0][0]).toBe('IND_cover_letter.docx');
    expect(urls()).toContain('/api/artifacts-center/artifact_9/export?format=docx');
    fireEvent.click(within(within(panel).getByTestId('vault-org-artifact-artifact_10')).getByRole('button', { name: /Download DOCX/ }));
    await screen.findByText(/Clinical overview was not downloaded — there is no recorded human review or signature on its current version/);
  });

  it('opens a row in the editor through authoring.open-document, by title', async () => {
    mockApi();
    const p = props();
    render(<Vault {...p} />);
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    fireEvent.click(within(within(panel).getByTestId('vault-org-artifact-artifact_9')).getByRole('button', { name: /Open in editor/ }));
    expect(p.onNav).toHaveBeenCalledWith('authoring');
    const open = vi.fn(() => ({ ok: true as const, detail: 'Opened' }));
    cleanup();
    registerSurfaceActionHandlers(resolveSurfaceIdForTarget('authoring'), { 'authoring.open-document': open });
    expect((open.mock.calls[0] as unknown[])[0]).toEqual({ title: 'IND cover letter' });
  });

  it('asks AnA about a row by name, project and version', async () => {
    mockApi();
    const p = props();
    render(<Vault {...p} />);
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    fireEvent.click(within(within(panel).getByTestId('vault-org-artifact-artifact_10')).getByRole('button', { name: /Ask AnA/ }));
    const prompt = String((p.onAsk as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(prompt).toMatch(/governed artifact “Clinical overview”/);
    expect(prompt).toMatch(/BX-301/);
    expect(prompt).toMatch(/v5/);
  });

});

describe('AnA reads the organization view', () => {
  it('tells AnA what the view shows, and that a failed read is not zero', async () => {
    mockApi();
    let latest: SurfaceContext | null = null;
    render(<><Vault {...props()} /><ContextProbe onContext={(c) => { latest = c; }} /></>);
    await waitFor(() => expect((latest as SurfaceContext | null)?.facts?.organizationArtifacts).toBeTruthy());
    const facts = (latest as unknown as SurfaceContext).facts!.organizationArtifacts as Record<string, unknown>;
    expect(facts).toMatchObject({ total: 3, listed: 3, truncated: false, signedOnCurrentVersion: 1, signedOnEarlierVersionOnly: 1, humanReviewRecorded: 1, scope: 'the projects you can open' });
    expect(String((latest as unknown as SurfaceContext).summary)).toMatch(/No project is open/);
    cleanup();
    mockApi((_m, url) => (url === ORG ? fail(500) : undefined));
    latest = null;
    render(<><Vault {...props()} /><ContextProbe onContext={(c) => { latest = c; }} /></>);
    await waitFor(() => expect((latest as SurfaceContext | null)?.facts?.organizationArtifacts).toBe('unavailable — counts unknown, not zero'));
  });
});

describe('with a project open, the organization view is one click away and reads nothing until opened', () => {
  it('reads the listing only when asked', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    mockApi((m, url) => (m === 'GET' && url === `/api/c2c/project-vault/${PID}` ? ok({ success: true, data: { program: 'BX-301', tree: [], documentCount: 0, unfiledCount: 0 } }) : undefined));
    render(<Vault {...props()} />);
    const panel = await orgPanel();
    expect(urls()).not.toContain(ORG);
    fireEvent.click(within(panel).getByRole('button', { name: /Show governed artifacts across your projects/ }));
    await within(panel).findByText('IND cover letter');
    expect(urls()).toContain(ORG);
  });
});

/* ── vault.focus-document by artifact id ─────────────────────────────────── */

function leaf(id: number, title: string) {
  return {
    id: `art-${id}`, num: '2.5', title, type: 'Clinical overview', status: 'draft', pct: 0, owner: 'R. Writer', ver: 'v5',
    updated: '2h ago', preview: title, src: 'artifact', sizeLabel: '24 KB',
    artifact: {
      artifactId: `artifact_${id}`, kind: 'Clinical overview', format: 'docx', model: null, origin: 'ana', author: 'R. Writer',
      contentHash: null, ctdSection: '2.5', signature: 'none', signedVersion: null, reviewed: false, sourceCount: 0,
    },
  };
}
const projectVault = (leaves: unknown[]) => ({
  success: true,
  data: {
    program: 'BX-301', documentCount: leaves.length, documentCounts: { authored: 0, artifacts: leaves.length, uploads: 0 }, unfiledCount: 0,
    tree: [{ id: 'artifacts', code: '', label: 'Governed artifacts', children: [{ id: 'art-m2', code: '', label: 'Module 2', children: leaves }] }],
    artifacts: { total: leaves.length, byStatus: { draft: leaves.length }, signatures: { none: leaves.length, current: 0, stale: 0, unknown: 0 }, reviewed: 0, window: { shown: leaves.length, total: leaves.length, truncated: false } },
  },
});

describe('vault.focus-document selects an artifact by its id', () => {
  it('is in the registry with an artifact id and no title', () => {
    const res = resolveSurfaceAction('vault.focus-document', { artifactId: 'artifact_2' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.directive.params).toEqual({ artifactId: 'artifact_2' });
  });

  it('with a project open, selects the leaf whose artifact id it is, the state a person’s click drives', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    mockApi((m, url) => (m === 'GET' && url === `/api/c2c/project-vault/${PID}` ? ok(projectVault([leaf(1, 'Clinical overview'), leaf(2, 'Clinical overview (copy)')])) : undefined));
    render(<Vault {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    await waitFor(() => expect(document.querySelector('.vd-tree')).not.toBeNull());
    expect(run({ artifactId: 'artifact_2' })).toEqual({ status: 'applied', detail: 'Selected “Clinical overview (copy)” in Module 2' });
    await waitFor(() => expect(document.querySelector('.vd-d-title')?.textContent).toMatch(/Clinical overview \(copy\)/));
  });

  it('an artifact saved after the tree was read is found on one re-read, then selected', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    let reads = 0;
    mockApi((m, url) => {
      if (m !== 'GET' || url !== `/api/c2c/project-vault/${PID}`) return undefined;
      reads += 1;
      return ok(projectVault(reads === 1 ? [leaf(1, 'Clinical overview')] : [leaf(1, 'Clinical overview'), leaf(7, 'Nonclinical overview')]));
    });
    render(<Vault {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    await waitFor(() => expect(document.querySelector('.vd-tree')).not.toBeNull());
    expect(run({ artifactId: 'artifact_7' }).status).toBe('stashed');
    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() => expect(document.querySelector('.vd-d-title')?.textContent).toMatch(/Nonclinical overview/));
  });

  it('one that is not in this project’s Vault after the re-read is an honest miss, never a guess', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    let reads = 0;
    mockApi((m, url) => {
      if (m !== 'GET' || url !== `/api/c2c/project-vault/${PID}`) return undefined;
      reads += 1;
      return ok(projectVault([leaf(1, 'Clinical overview')]));
    });
    const outcomes: unknown[] = [];
    render(<Vault {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    await waitFor(() => expect(document.querySelector('.vd-tree')).not.toBeNull());
    const res = resolveSurfaceAction('vault.focus-document', { artifactId: 'artifact_404' });
    if (!res.ok) throw new Error(res.error);
    act(() => { applySurfaceAction(res.directive, vi.fn(), (o) => outcomes.push(o)); });
    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(reads).toBe(2);
    expect(outcomes[0]).toEqual({
      status: 'failed',
      reason: 'The artifact artifact_404 is not in this project’s Vault: it belongs to another project, or it is archived.',
    });
  });

  it('with no project open, focuses the row in the organization view, by id or by name', async () => {
    mockApi();
    const { container } = render(<Vault {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    const panel = await orgPanel();
    await within(panel).findByText('IND cover letter');
    expect(run({ artifactId: 'artifact_10' })).toEqual({ status: 'applied', detail: 'Focused “Clinical overview” (BX-301) in governed artifacts across your projects' });
    await waitFor(() => expect(container.querySelector('.art-row.is-focus')?.getAttribute('data-testid')).toBe('vault-org-artifact-artifact_10'));
    expect(run({ document: 'ind cover' })).toEqual({ status: 'applied', detail: 'Focused “IND cover letter” (BX-204) in governed artifacts across your projects' });
    expect(run({ document: 'Clinical' })).toEqual({ status: 'failed', reason: '"Clinical" matches 2 governed artifacts across your projects — name one exactly.' });
    // An id the listing does not hold is read again once (AnA may have saved it since), then missed in words.
    const orgReads = () => urls().filter((u) => u === ORG).length;
    expect(orgReads()).toBe(1);
    const res = resolveSurfaceAction('vault.focus-document', { artifactId: 'artifact_404' });
    if (!res.ok) throw new Error(res.error);
    const outcomes: unknown[] = [];
    act(() => { applySurfaceAction(res.directive, vi.fn(), (o) => outcomes.push(o)); });
    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(orgReads()).toBe(2);
    expect(outcomes[0]).toEqual({ status: 'failed', reason: 'No governed artifact artifact_404 in the projects you can open.' });
  });

  it('with neither a title nor an id, refuses', async () => {
    mockApi();
    render(<Vault {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    expect(run({})).toEqual({ status: 'failed', reason: 'No document named.' });
  });
});
