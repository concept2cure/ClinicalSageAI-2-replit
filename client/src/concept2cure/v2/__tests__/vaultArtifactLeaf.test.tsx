// @vitest-environment jsdom
/**
 * Vault — a governed artifact's leaf (fold F3 slice B, D2, 2026-10-29).
 *
 * Slice A (3038bbe66) listed every governed artifact of the project in the
 * Vault, with its governance in the detail pane, and handed on what the leaf
 * could not yet do. This slice reaches what already exists for each:
 *
 *   versions   GET /api/concept2cure/projects/:p/artifacts/:a/versions
 *              (c2c/artifacts.ts), organization- and project-bound (PF-17).
 *   audit      GET …/audit-report, read when a person asks: the route records
 *              each read in the artifact's provenance, so selecting a leaf
 *              must not write a record.
 *   download   GET /api/artifacts-center/:a/export (the governed DOCX, recorded
 *              before it is delivered). A refusal says why.
 *   manifest   the Artifacts center's CSV index, one builder for both screens
 *              (the gallery is the Vault's organization view since slice C).
 *   editor     the authoring.open-document directive the Artifacts center rides.
 *   AnA        Ask AnA on the leaf, and vault.focus-document.
 *
 * A failed versions or audit read is an error, never an empty history.
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

const ART = 'artifact_2';
const VERSIONS = `/api/concept2cure/projects/${PID}/artifacts/${ART}/versions`;
const AUDIT = `/api/concept2cure/projects/${PID}/artifacts/${ART}/audit-report`;
const EXPORT = `/api/artifacts-center/${ART}/export?format=docx`;

/** The converged manifest's columns (artifactManifest.ts), the same for both screens. */
const MANIFEST_HEADERS = [
  'Name', 'Artifact ID', 'CTD section', 'Kind', 'Format', 'Origin', 'Model', 'Author', 'Status', 'Version',
  'Signed', 'Human review', 'Cited sources', 'Recorded hash', 'Stored content size', 'Project', 'Updated',
];

function leaf(id: number, over: Record<string, unknown> = {}, facts: Record<string, unknown> = {}) {
  return {
    id: `art-${id}`, num: '2.5', title: `Artifact ${id}`, type: 'Clinical overview', status: 'draft', pct: 0,
    owner: 'R. Writer', ver: 'v5', updated: '2h ago', preview: `Artifact ${id}`, src: 'artifact', sizeLabel: '24 KB',
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
        leaf(4, { num: '2.7.3', title: 'Clinical summary of efficacy' }, { ctdSection: '2.7.3' }),
      ],
    },
    { id: 'art-none', code: '', label: 'No CTD section', children: [leaf(3, { num: '—', title: 'device-file.pdf' }, { ctdSection: null, origin: 'import', kind: 'Imported', contentHash: 'f'.repeat(64) })] },
  ],
});

function payload(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      program: 'BX-301', spine: 'IND · 21 CFR 312', standard: 'pharma',
      documentCount: 4, documentCounts: { authored: 0, artifacts: 4, uploads: 0 },
      tree: [artifactsBranch()],
      artifacts: {
        total: 4, byStatus: { approved: 1, review: 1, draft: 2 },
        signatures: { none: 2, current: 1, stale: 1, unknown: 0 }, reviewed: 1,
        window: { shown: 4, total: 4, truncated: false },
      },
      unfiledCount: 0,
      ...over,
    },
  };
}

const versionsBody = () => ({
  success: true,
  data: {
    artifactId: ART, title: 'Clinical overview', currentVersion: 5,
    versions: [
      { id: 55, version: 5, content: 'v5 text', contentHash: '5'.repeat(64), changeDescription: 'Efficacy tables updated', createdById: 12, createdBy: 'R. Writer', createdAt: '2026-10-28T14:02:00.000Z' },
      { id: 33, version: 3, content: 'v3 text', contentHash: '3'.repeat(64), changeDescription: null, createdById: 13, createdBy: 'A. Reviewer', createdAt: '2026-10-20T09:15:00.000Z' },
    ],
  },
});

const auditBody = (over: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    reportType: 'Document Intelligence Report', generatedAt: '2026-10-29T10:00:00.000Z',
    integrityVerification: {
      currentHash: '5'.repeat(64), algorithm: 'SHA-256', hashChain: [],
      scope: 'Compares each stored artifact version against the SHA-256 recorded with it. Does NOT read or verify the bytes of the originating source document.',
      sourceDocumentBytesVerified: false, chainIntact: true, currentHashVerified: true, failureReason: null,
    },
    versionTimeline: [],
    sourceLineage: [{ action: 'source_attached', description: 'Study 301 CSR', timestamp: '2026-10-19T08:00:00.000Z', actor: 'R. Writer' }],
    generationLineage: [{ action: 'draft_generated', description: null, actor: 'R. Writer', timestamp: '2026-10-19T08:05:00.000Z' }],
    reviewSignatureSummary: {
      totalSignatures: 1,
      signatures: [{ signer: 'A. Reviewer', email: 'a@x', role: 'reviewer', purpose: 'approval', meaning: 'Approved for filing', method: 'password', twoFactorVerified: true, signedAt: '2026-10-21T11:30:00.000Z' }],
    },
    exportHistory: [{ action: 'audit_report_export', actor: 'r@x', timestamp: '2026-10-22T12:00:00.000Z', details: {} }],
    ...over,
  },
});

type Route = (method: string, url: string) => unknown;
function mockApi(extra: Route = () => undefined, vault: () => unknown = () => payload()) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const hit = extra(method, url);
    if (hit !== undefined) {
      if (hit instanceof Error) throw hit;
      return hit;
    }
    if (method === 'GET' && url === `/api/c2c/project-vault/${PID}`) return ok(vault());
    if (method === 'GET' && url === VERSIONS) return ok(versionsBody());
    if (method === 'GET' && url === AUDIT) return ok(auditBody());
    if (method === 'GET' && url.startsWith('/api/artifacts-center/')) {
      return { ok: true, status: 200, headers: new Headers({ 'Content-Disposition': 'attachment; filename="Clinical_overview.docx"' }), blob: async () => new Blob(['docx']) } as unknown as Response;
    }
    return ok({});
  });
}

const urls = () => apiRequest.mock.calls.map((c) => String(c[1]));
const tree = () => document.querySelector('.vd-tree') as HTMLElement;

async function openClinicalOverview(p = props()) {
  render(<Vault {...p} />);
  await waitFor(() => expect(tree()).not.toBeNull());
  fireEvent.click(within(tree()).getByText('Module 2'));
  fireEvent.click(await screen.findByRole('button', { name: /^2\.5\s*Clinical overview/ }));
  await screen.findByTestId('vault-artifact-governance');
  return p;
}

function ContextProbe({ onContext }: { onContext: (c: SurfaceContext | null) => void }) {
  onContext(useActiveSurfaceContext('vault'));
  return null;
}

beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
  dl.blob.mockClear();
  dl.csv.mockClear();
  __resetSurfaceActionBus();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('an artifact leaf — its versions', () => {
  it('lists every version, newest first, with who, when, what changed and its hash, under the project', async () => {
    mockApi();
    await openClinicalOverview();
    const pane = await screen.findByTestId('vault-artifact-versions');
    await waitFor(() => expect(pane.textContent).toMatch(/v5/));
    const text = pane.textContent ?? '';
    expect(urls()).toContain(VERSIONS);
    expect(text).toMatch(/v5[\s\S]*current version/i);
    expect(text).toMatch(/R\. Writer/);
    expect(text).toMatch(/2026-10-28 14:02 UTC/);
    expect(text).toMatch(/Efficacy tables updated/);
    expect(text).toMatch(/5555555555555555…/);
    // v3 is the version the stale signature covers.
    expect(text).toMatch(/v3[\s\S]*signed/i);
    expect(text).toMatch(/No change description recorded/);
    expect(text.indexOf('v5')).toBeLessThan(text.indexOf('v3'));
  });

  it('a failed versions read is an error, never an empty history', async () => {
    mockApi((m, u) => (u === VERSIONS ? new ApiRequestError('Failed to fetch versions', 500, {}, undefined) : undefined));
    await openClinicalOverview();
    const pane = await screen.findByTestId('vault-artifact-versions');
    const alert = await within(pane).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read/i);
    expect(pane.textContent).not.toMatch(/No versions/i);
  });

  it('a refused versions read says what the refusal is', async () => {
    mockApi((m, u) => (u === VERSIONS ? new ApiRequestError('Artifact not found', 404, {}, undefined) : undefined));
    await openClinicalOverview();
    const alert = await within(await screen.findByTestId('vault-artifact-versions')).findByRole('alert');
    expect(alert.textContent).toMatch(/This artifact was not found in your organization, so the version history was not read/);
  });

  it('under module enforcement the versions read is refused as not enabled, never as an outage or an empty history', async () => {
    // /api/concept2cure/projects is not claimed by the Vault (slice B README); the gate answers this.
    mockApi((m, u) => (u === VERSIONS ? new ApiRequestError('Module access denied', 403, { code: 'MODULE_NOT_LICENSED' }, 'MODULE_NOT_LICENSED') : undefined));
    await openClinicalOverview();
    const pane = await screen.findByTestId('vault-artifact-versions');
    const alert = await within(pane).findByRole('alert');
    expect(alert.textContent).toMatch(/This feature is not enabled for your organization, so the version history was not read/);
    expect(alert.textContent).not.toMatch(/could not be read|Try again/);
    expect(pane.textContent).not.toMatch(/records no versions/);
  });
});

describe('an artifact leaf — its audit report', () => {
  it('is read only when a person asks, and says the read is recorded', async () => {
    mockApi();
    await openClinicalOverview();
    const audit = await screen.findByTestId('vault-artifact-audit');
    await waitFor(() => expect(urls()).toContain(VERSIONS));
    expect(urls()).not.toContain(AUDIT);
    expect(audit.textContent).toMatch(/recorded in the artifact’s provenance/);
    fireEvent.click(within(audit).getByRole('button', { name: /Read the audit report/ }));
    await waitFor(() => expect(urls()).toContain(AUDIT));
    await waitFor(() => expect(audit.textContent).toMatch(/A\. Reviewer/));
    const text = audit.textContent ?? '';
    expect(text).toMatch(/Intact/);
    expect(text).toMatch(/Does NOT read or verify the bytes of the originating source document/);
    expect(text).toMatch(/Approved for filing/);
    expect(text).toMatch(/2026-10-21 11:30 UTC/);
    expect(text).toMatch(/draft_generated/);
    expect(text).toMatch(/source_attached/);
  });

  it('a broken hash chain is said, with the server’s reason', async () => {
    mockApi((m, u) => (u === AUDIT ? ok(auditBody({ integrityVerification: { ...auditBody().data.integrityVerification, chainIntact: false, currentHashVerified: false, failureReason: 'Version 3 hash mismatch' } })) : undefined));
    await openClinicalOverview();
    const audit = await screen.findByTestId('vault-artifact-audit');
    fireEvent.click(within(audit).getByRole('button', { name: /Read the audit report/ }));
    await waitFor(() => expect(audit.textContent).toMatch(/Not intact/));
    expect(audit.textContent).toMatch(/Version 3 hash mismatch/);
  });

  it('a failed audit read is an error, never an empty trail', async () => {
    mockApi((m, u) => (u === AUDIT ? new ApiRequestError('Failed to generate audit report', 500, {}, undefined) : undefined));
    await openClinicalOverview();
    const audit = await screen.findByTestId('vault-artifact-audit');
    fireEvent.click(within(audit).getByRole('button', { name: /Read the audit report/ }));
    const alert = await within(audit).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read/i);
    expect(audit.textContent).not.toMatch(/No signatures/i);
  });
});

describe('an artifact leaf — the governed DOCX download', () => {
  it('downloads the governed export of this artifact', async () => {
    mockApi();
    await openClinicalOverview();
    fireEvent.click(screen.getByRole('button', { name: /Download DOCX/ }));
    await waitFor(() => expect(urls()).toContain(EXPORT));
    await waitFor(() => expect(dl.blob).toHaveBeenCalled());
    expect(dl.blob.mock.calls[0][0]).toBe('Clinical_overview.docx');
    expect(screen.queryByRole('button', { name: /No file to download/ })).toBeNull();
  });

  it('a refusal for want of review says why', async () => {
    mockApi((m, u) =>
      u === EXPORT
        ? new ApiRequestError('The current artifact version has no persisted approval decision or active signature.', 403, { error: 'HUMAN_REVIEW_REQUIRED' }, 'HUMAN_REVIEW_REQUIRED')
        : undefined,
    );
    await openClinicalOverview();
    fireEvent.click(screen.getByRole('button', { name: /Download DOCX/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Clinical overview was not downloaded/));
    expect(document.body.textContent).toMatch(/no recorded human review or signature on its current version/);
    expect(document.body.textContent).not.toMatch(/Your role cannot/);
    expect(dl.blob).not.toHaveBeenCalled();
  });

  it('a refusal by the module gate says the feature is not enabled, not that the read failed', async () => {
    mockApi((m, u) => (u === EXPORT ? new ApiRequestError('Module access denied', 403, { code: 'MODULE_NOT_LICENSED' }, 'MODULE_NOT_LICENSED') : undefined));
    await openClinicalOverview();
    fireEvent.click(screen.getByRole('button', { name: /Download DOCX/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Clinical overview was not downloaded — not enabled for your organization/));
  });

  it('an export that could not be recorded says nothing was sent', async () => {
    mockApi((m, u) =>
      u === EXPORT
        ? new ApiRequestError('The file was not delivered because its record could not be written. Try again.', 503, { code: 'UNAUDITED_EXPORT_REFUSED' }, 'UNAUDITED_EXPORT_REFUSED')
        : undefined,
    );
    await openClinicalOverview();
    fireEvent.click(screen.getByRole('button', { name: /Download DOCX/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/could not be recorded, so nothing was sent/));
  });
});

describe('the governed-artifact manifest — one builder for the Vault’s project and organization views', () => {
  it('the Vault exports the branch’s rows as CSV, with their governance', async () => {
    mockApi();
    render(<Vault {...props()} />);
    const laneEl = await screen.findByTestId('vault-artifacts-lane');
    fireEvent.click(within(laneEl).getByRole('button', { name: /Export manifest/ }));
    expect(dl.csv).toHaveBeenCalledTimes(1);
    const [name, headers, rows] = dl.csv.mock.calls[0] as [string, string[], unknown[][]];
    expect(name).toBe('BX-301-governed-artifacts.csv');
    expect(headers).toEqual(MANIFEST_HEADERS);
    expect(rows).toHaveLength(4);
    const overview = rows.find((r) => r[0] === 'Clinical overview')!;
    expect(overview).toEqual([
      'Clinical overview', 'artifact_2', '2.5', 'Clinical overview', 'DOCX', 'Drafted by AnA', 'claude-opus-4', 'R. Writer',
      'In review', 'v5', 'earlier version only (v3)', 'None recorded on the current version', 4, 'c'.repeat(64), '24 KB',
      'BX-301', '2h ago',
    ]);
    const imported = rows.find((r) => r[0] === 'device-file.pdf')!;
    expect(imported[2]).toBe('None');
    expect(imported[5]).toBe('Imported file');
    expect(imported[6]).toBe('Not recorded');
  });
  /* The Artifacts center's export of the same builder and columns moved with the gallery
     into the Vault's organization view (fold F3 slice C): vaultOrganizationArtifacts.test.tsx. */
});

describe('an artifact leaf — the editor, and Ask AnA', () => {
  it('opens the artifact in the editor through authoring.open-document', async () => {
    mockApi();
    const p = await openClinicalOverview();
    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));
    expect(p.onNav).toHaveBeenCalledWith('authoring');
    // The directive waits for the editor and is performed there, by title.
    const open = vi.fn(() => ({ ok: true as const, detail: 'Opened' }));
    cleanup();
    registerSurfaceActionHandlers(resolveSurfaceIdForTarget('authoring'), { 'authoring.open-document': open });
    expect(open).toHaveBeenCalledTimes(1);
    expect((open.mock.calls[0] as unknown[])[0]).toEqual({ title: 'Clinical overview' });
  });

  it('asks AnA about this artifact by name, section, version and governance', async () => {
    mockApi();
    const p = await openClinicalOverview();
    const actionsBar = document.querySelector('.vd-d-actions') as HTMLElement;
    fireEvent.click(within(actionsBar).getByRole('button', { name: /Ask AnA/ }));
    expect(p.onAsk).toHaveBeenCalledTimes(1);
    const prompt = String((p.onAsk as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(prompt).toMatch(/governed artifact “Clinical overview”/);
    expect(prompt).toMatch(/CTD §2\.5/);
    expect(prompt).toMatch(/v5/);
    expect(prompt).toMatch(/signature, human review and cited sources/);
  });
});

describe('vault.focus-document — AnA selects a document by name', () => {
  it('is in the registry, on the vault', () => {
    const res = resolveSurfaceAction('vault.focus-document', { document: 'Clinical overview' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.directive.surfaceId).toBe('vault');
  });

  it('selects the named artifact and opens its folder, the state a person’s click drives', async () => {
    mockApi();
    render(<Vault {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    await waitFor(() => expect(tree()).not.toBeNull());
    const res = resolveSurfaceAction('vault.focus-document', { document: 'clinical overview' });
    if (!res.ok) throw new Error(res.error);
    let outcome: unknown;
    act(() => { outcome = applySurfaceAction(res.directive, vi.fn()); });
    expect(outcome).toEqual({ status: 'applied', detail: 'Selected “Clinical overview” in Module 2' });
    await waitFor(() => expect(screen.getByTestId('vault-artifact-governance').textContent).toMatch(/claude-opus-4/));
  });

  it('an ambiguous or unknown name is an honest miss', async () => {
    mockApi();
    render(<Vault {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('vault'));
    await waitFor(() => expect(tree()).not.toBeNull());
    const run = (document: string) => {
      const res = resolveSurfaceAction('vault.focus-document', { document });
      if (!res.ok) throw new Error(res.error);
      let outcome: unknown;
      act(() => { outcome = applySurfaceAction(res.directive, vi.fn()); });
      return outcome as { status: string; reason?: string };
    };
    expect(run('Clinical')).toEqual({ status: 'failed', reason: '"Clinical" matches 2 documents — name one exactly.' });
    expect(run('Narnia')).toEqual({ status: 'failed', reason: 'No document named "Narnia" in this vault.' });
  });

  it('AnA is told she can focus a document, download an artifact and read its versions', async () => {
    mockApi();
    let latest: SurfaceContext | null = null;
    render(<><Vault {...props()} /><ContextProbe onContext={(c) => { latest = c; }} /></>);
    await waitFor(() => expect((latest as SurfaceContext | null)?.facts?.governedArtifacts).toBeTruthy());
    const actions = ((latest as unknown as SurfaceContext).availableActions ?? []).join('\n');
    expect(actions).toMatch(/Select a named document/);
    expect(actions).toMatch(/Download a governed artifact as DOCX/);
    expect(actions).toMatch(/versions and, on request, its audit report/);
    expect(actions).toMatch(/manifest/);
  });
});
