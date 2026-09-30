// @vitest-environment jsdom
/**
 * The vault is subtitled "21 CFR Part 11 audit trail · SHA-256 chained". It
 * may show only a signature, an audit event or a version that happened.
 *
 * Three things it showed on every live artifact, none of which happened:
 *   - a "Recent audit · sample" block — A-9924812 "Signed · {author} ·
 *     {updated}", a SHA-256 verification "2m ago", an upload "6d ago" —
 *     interpolated with the real artifact's author and date;
 *   - a "signed" badge on any artifact whose `metadata.eSig` flag was true,
 *     with the signer and time assembled from the creator and last edit;
 *   - completion 88% for review and 64% for draft, which nobody measured.
 * These cases pin that the drawer's audit trail comes from audit_logs for
 * the selected record id, that no signature state is asserted from a
 * boolean, and that a failed vault read says so.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VaultSurface } from '../VaultSurface';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

const ARTIFACT = {
  id: 1, artifactId: 'art-1', title: 'Real Test Report', category: 'report', type: 'PDF',
  family: 'working-files', version: 2, status: 'review', updatedAt: '2026-09-01T00:00:00Z',
  createdById: 12, eSig: true,
};

let calls: string[] = [];
function serve(opts: { vault: 'ok' | 'fail'; audit: unknown[] }) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (/\/api\/mdx\/vault\/[^/]+\/audit/.test(url)) return json({ data: { events: opts.audit, actions: [], resources: [], kpis: [] } });
    if (url.includes('/api/mdx/vault')) {
      return opts.vault === 'ok' ? json({ data: [ARTIFACT] }) : new Response('upstream unavailable', { status: 503 });
    }
    return json({ data: [] });
  }));
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <VaultSurface program={null} onAskAna={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

describe('VaultSurface — no invented Part 11 record', () => {
  it('reads the selected artifact’s audit trail by record id and shows only what it returns', async () => {
    serve({ vault: 'ok', audit: [] });
    const { container } = mount();
    await waitFor(() => expect(screen.getByTestId('vault-audit-empty')).toBeTruthy());
    // Under the Vault's own route: production refuses /api/mdx/audit, and the
    // unfiltered org-wide read it made with nothing selected is gone.
    expect(calls.some((u) => u.includes('/api/mdx/vault/art-1/audit'))).toBe(true);
    expect(calls.some((u) => u.includes('/api/mdx/audit'))).toBe(false);
    const text = container.textContent ?? '';
    for (const invented of ['A-9924812', 'A-9924809', 'SHA-256 verified · system', 'Recent audit · sample']) {
      expect(text).not.toContain(invented);
    }
  });

  it('asserts no signature from the eSig flag, and no unmeasured completion', async () => {
    serve({ vault: 'ok', audit: [] });
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toContain('Real Test Report'));
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Signed User #12/);
    expect(container.querySelector('.docs-esig-signed')).toBeNull();
    expect(text).not.toContain('88%');
    expect(text).not.toMatch(/e-signed/);
  });

  it('shows the recorded events, and says so when the trail cannot be read', async () => {
    serve({ vault: 'ok', audit: [{ id: 'A-5', when: '2026-09-30T10:00:00.000Z', actor: 'u-12', actorName: 'Ana Author', action: 'update' }] });
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toContain('update · Ana Author'));
    cleanup();
    vi.unstubAllGlobals();
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/audit')) return new Response('refused', { status: 404 });
      return new Response(JSON.stringify({ data: [ARTIFACT] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    mount();
    await waitFor(() => expect(screen.getByTestId('vault-audit-error')).toBeTruthy());
  });

  it('reports a FAILED vault read as a failure', async () => {
    serve({ vault: 'fail', audit: [] });
    mount();
    await waitFor(() => expect(screen.getByTestId('vault-error')).toBeTruthy());
  });
});

describe('the vault data module holds no artifact', () => {
  it('exports no example files, folders or versions', async () => {
    const exported = Object.keys(await import('../../data/vault'));
    for (const gone of ['VAULT_FILES', 'VAULT_FOLDERS', 'VAULT_VERSIONS']) expect(exported).not.toContain(gone);
  });
});
