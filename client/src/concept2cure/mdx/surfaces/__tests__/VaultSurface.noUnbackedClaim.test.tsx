// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (INFORMATION_ARCHITECTURE.md, row
 * `device-vault`): the device vault claims nothing it does not do.
 *
 *   - Its subtitle read "21 CFR Part 11 audit trail · SHA-256 chained · 7-year
 *     minimum retention". The page does not read or verify a chain, and it
 *     states a 7-year minimum while the platform default is 25 years (ADR-0014
 *     §6, DEFAULT_RETENTION_YEARS) and organization-set. It shows neither, so
 *     the claim comes off. (Not a claim that no chain or retention exists:
 *     audit_logs is a per-tenant SHA-256 chain, and uploads are dated by the
 *     organization's retention period at admission.)
 *   - Its replacement must hold for uploads too. GET /api/mdx/vault/:id/versions
 *     and /:id/audit look the id up only in concept2cure_artifacts, so an
 *     uploaded file (source 'upload', vault.documents) is a 404 on both. The
 *     drawer says this page does not show them, never "could not be loaded".
 *   - Its *Export manifest* button sent AnA a sentence asking for "the full
 *     vault manifest as a signed PDF, including SHA-256 chain validation". No
 *     AnA tool and no route builds a vault manifest (a project's export manifest
 *     is on the founder's list, section 5.9), so the button did nothing a user
 *     could rely on. It is removed; Upload, which files for real, stays.
 *   - The drawer's *Download* only sent AnA a prompt ("… and log access to
 *     audit trail"); no file came back. An uploaded file with its project open
 *     now downloads through the project vault's governed route, which records
 *     the download and verifies the bytes against their hash first. Where that
 *     route cannot serve (an authored artifact, no project open), the button
 *     says what it does: it asks AnA.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, screen, fireEvent, within, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VaultSurface } from '../VaultSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));
/* The browser hand-off is the shared helper's; here it only has to be reached. */
const downloadBlob = vi.fn((_name: string, _blob: Blob) => true);
vi.mock('../../../v2/download', async (orig) => ({
  ...(await orig<typeof import('../../../v2/download')>()),
  downloadBlob: (name: string, blob: Blob) => downloadBlob(name, blob),
}));

const ARTIFACT = {
  id: 1, artifactId: 'art-1', title: 'Real Test Report', category: 'report', type: 'PDF',
  family: 'working-files', version: 2, status: 'review', updatedAt: '2026-09-01T00:00:00Z',
  createdById: 12, eSig: false,
};

const UPLOAD_ID = '0f1e2d3c-4b5a-4968-8776-655443322110';
/* As GET /api/mdx/vault maps a vault.documents row (server/routes/mdx-vault.ts). */
const UPLOAD = {
  id: UPLOAD_ID, artifactId: 'DOC-0007', title: 'Uploaded bench report', type: 'report', category: null,
  family: 'Uploaded files', ctdSection: null, status: 'uploaded', version: 1, contentHash: 'abc123',
  createdById: 12, createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', lockedAt: null,
  eSig: false, source: 'upload', fileSize: 2048, mimeType: 'application/octet-stream',
};

const PROJECT = { id: '11111111-2222-4333-8444-555555555555', code: 'MDX-1', title: 'Device project' } as Program;

let calls: string[] = [];
function serve(rows: unknown[]) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/api/c2c/project-vault/') && url.endsWith('/download')) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="bench.bin"' },
      });
    }
    /* Like the server: versions and audit are read from concept2cure_artifacts only. */
    if (/\/api\/mdx\/vault\/[^/]+\/(versions|audit)/.test(url)) {
      if (url.includes(UPLOAD_ID) || url.includes('DOC-0007')) return json({ error: 'Artifact not found' }, 404);
      return url.includes('/audit')
        ? json({ data: { events: [], actions: [], resources: [], kpis: [] } })
        : json({ data: [] });
    }
    if (url.includes('/api/mdx/vault')) return json({ data: rows });
    return json({ data: [] });
  }));
}

function mount(onAskAna: (t: string) => void = () => {}, program: Program | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <VaultSurface program={program} onAskAna={onAskAna} />
    </QueryClientProvider>,
  );
}

afterEach(() => { vi.unstubAllGlobals(); cleanup(); downloadBlob.mockClear(); });

describe('device-vault claims nothing it does not do (slice 0)', () => {
  it('its subtitle claims no hash chain and no retention period', async () => {
    serve([ARTIFACT]);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toContain('Real Test Report'));
    const sub = container.querySelector('.page-header .page-sub')?.textContent ?? '';
    expect(sub).not.toMatch(/SHA-256 chained/i);
    expect(sub).not.toMatch(/7-year/i);
    expect(sub).not.toMatch(/retention/i);
    expect(sub).not.toMatch(/every signature/i);
  });

  it('offers no Export manifest button, and keeps the real upload', async () => {
    serve([ARTIFACT]);
    const asked: string[] = [];
    const { container } = mount((t) => { asked.push(t); });
    await waitFor(() => expect(container.textContent ?? '').toContain('Real Test Report'));
    /* Every control in the header and the drawer is pressed, so a prompt
       asking for a manifest from any of them is caught here, not only a
       button with that label. */
    const header = container.querySelector('.page-header') as HTMLElement;
    const drawer = container.querySelector('.vault-drawer') as HTMLElement;
    for (const b of [...within(header).queryAllByRole('button'), ...within(drawer).queryAllByRole('button')]) {
      fireEvent.click(b);
    }
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.some((t) => /manifest/i.test(t))).toBe(false);
    expect(screen.queryByRole('button', { name: /export manifest/i })).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/Export manifest/i);
    expect(screen.getByRole('button', { name: /upload/i })).toBeTruthy();
  });
});

describe('device-vault says what it shows for an uploaded file (audit [0])', () => {
  it('the subtitle promises per-document history only for authored documents', async () => {
    serve([UPLOAD, ARTIFACT]);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toContain('Uploaded bench report'));
    const sub = container.querySelector('.page-header .page-sub')?.textContent ?? '';
    expect(sub).not.toMatch(/each one’s versions and audit trail/i);
    expect(sub).toMatch(/Authored documents show their versions and audit trail/);
  });

  it('for an upload the drawer says this page does not show its versions or audit, not that a read failed', async () => {
    serve([UPLOAD, ARTIFACT]);
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('.drawer-title')?.textContent).toBe('Uploaded bench report'));
    await waitFor(() => expect(screen.getByTestId('vault-versions-upload')).toBeTruthy());
    const drawer = container.querySelector('.vault-drawer')?.textContent ?? '';
    expect(drawer).not.toMatch(/could not be loaded/i);
    expect(screen.getByTestId('vault-versions-upload').textContent).toMatch(/does not show versions of uploaded files/);
    expect(screen.getByTestId('vault-audit-upload').textContent).toMatch(/does not show the audit trail of uploaded files/);
    expect(screen.queryByTestId('vault-audit-error')).toBeNull();
    /* Nothing is asked of a route that only knows authored artifacts. */
    expect(calls.some((u) => u.includes(`/api/mdx/vault/${UPLOAD_ID}/`) || u.includes('/api/mdx/vault/DOC-0007/'))).toBe(false);
  });
});

/** One KPI tile, found by its label. */
function tile(container: HTMLElement, label: RegExp) {
  const card = Array.from(container.querySelectorAll('.metric-card')).find((c) =>
    label.test(c.querySelector('.metric-label')?.textContent ?? ''),
  );
  if (!card) throw new Error(`no tile labelled ${label}`);
  return {
    metric: card.querySelector('.metric-val')?.textContent ?? '',
    meta: card.querySelector('.metric-meta')?.textContent ?? '',
  };
}

describe('device-vault states no figure it did not read (audit 2)', () => {
  /* Audit 2 [6]: `linked` was the literal 0, so every file read "Linked 0
     artifacts", a link count nothing read. */
  it('the drawer states no link count', async () => {
    serve([ARTIFACT]);
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('.drawer-title')?.textContent).toBe('Real Test Report'));
    const drawer = container.querySelector('.vault-drawer')?.textContent ?? '';
    expect(drawer).not.toMatch(/Linked/);
    expect(drawer).not.toMatch(/0 artifacts/);
  });

  /* Audit 2 [9]: the KPI strip and the panel subtitle read 0 while the list
     was in flight and after it failed, beside the error banner. */
  it('a vault read in flight states no count', async () => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const { container } = mount();
    await act(async () => {});
    expect(tile(container, /Artifacts in vault/).metric).toBe('—');
    expect(tile(container, /Vault size/).metric).toBe('—');
    expect(container.textContent ?? '').not.toMatch(/0 of 0 artifacts/);
    expect(container.textContent ?? '').not.toMatch(/0 e-signed/);
    /* The folder rail and the framework filter count the same unread list. */
    for (const n of Array.from(container.querySelectorAll('.vault-tree-row .n'))) expect(n.textContent).toBe('—');
    expect(container.querySelectorAll('.vault-main .seg-btn .count')).toHaveLength(0);
    expect(container.textContent ?? '').toMatch(/Loading/);
  });

  it('a vault 200 that is not a list is a failure, never an empty vault', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ data: { rows: [] } }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ));
    const { container } = mount();
    await waitFor(() => expect(screen.getByTestId('vault-error')).toBeTruthy());
    expect(tile(container, /Artifacts in vault/).metric).toBe('—');
  });

  it('a FAILED vault read states no count beside its error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'upstream unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }),
    ));
    const { container } = mount();
    await waitFor(() => expect(screen.getByTestId('vault-error')).toBeTruthy());
    expect(tile(container, /Artifacts in vault/).metric).toBe('—');
    expect(tile(container, /Vault size/).metric).toBe('—');
    expect(container.textContent ?? '').not.toMatch(/0 of 0 artifacts/);
    expect(container.textContent ?? '').not.toMatch(/0\.0\s*MB/);
  });

  it('an answered, empty vault read keeps its zeros', async () => {
    serve([]);
    const { container } = mount();
    await waitFor(() => expect(tile(container, /Artifacts in vault/).metric).toBe('0'));
    expect(container.textContent ?? '').toMatch(/0 of 0 artifacts/);
    expect(screen.queryByTestId('vault-error')).toBeNull();
  });
});

describe('device-vault Download delivers a file, or says it asks AnA (audit [7])', () => {
  it('an uploaded file of the open project downloads through the governed route', async () => {
    serve([UPLOAD]);
    const asked: string[] = [];
    const { container } = mount((t) => { asked.push(t); }, PROJECT);
    await waitFor(() => expect(container.querySelector('.drawer-title')?.textContent).toBe('Uploaded bench report'));
    fireEvent.click(within(container.querySelector('.drawer-actions') as HTMLElement).getByRole('button', { name: /^.?\s*Download$/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(calls).toContain(`/api/c2c/project-vault/${PROJECT.id}/documents/${UPLOAD_ID}/download`);
    expect(downloadBlob.mock.calls[0][0]).toBe('bench.bin');
    expect(asked.some((t) => /download/i.test(t))).toBe(false);
  });

  it('a refused download says so and hands nothing over', async () => {
    serve([UPLOAD]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/download')) {
        return new Response(JSON.stringify({ success: false, error: 'NO_STORED_FILE', message: 'This vault record has no stored file — it was catalogued without content.' }), {
          status: 409, headers: { 'content-type': 'application/json' },
        });
      }
      if (/\/api\/mdx\/vault\/[^/]+\/(versions|audit)/.test(url)) return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ data: [UPLOAD] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const { container } = mount(() => {}, PROJECT);
    await waitFor(() => expect(container.querySelector('.drawer-title')?.textContent).toBe('Uploaded bench report'));
    fireEvent.click(within(container.querySelector('.drawer-actions') as HTMLElement).getByRole('button', { name: /^.?\s*Download$/ }));
    await waitFor(() => expect(screen.getByTestId('vault-download-error')).toBeTruthy());
    expect(screen.getByTestId('vault-download-error').textContent).toMatch(/was not downloaded/);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('an authored artifact offers no Download; its button says it asks AnA, and promises no logging', async () => {
    serve([ARTIFACT]);
    const asked: string[] = [];
    const { container } = mount((t) => { asked.push(t); }, PROJECT);
    await waitFor(() => expect(container.querySelector('.drawer-title')?.textContent).toBe('Real Test Report'));
    const actions = within(container.querySelector('.drawer-actions') as HTMLElement);
    expect(actions.queryByRole('button', { name: /^.?\s*Download$/ })).toBeNull();
    fireEvent.click(actions.getByRole('button', { name: /ask ana about this file/i }));
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toMatch(/^Download/);
    expect(asked[0]).not.toMatch(/log access/i);
    expect(calls.some((u) => u.includes('/download'))).toBe(false);
  });
});
