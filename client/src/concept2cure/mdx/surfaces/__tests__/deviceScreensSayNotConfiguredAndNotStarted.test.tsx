// @vitest-environment jsdom
/**
 * Two device panels say an answer the server gave as that answer, not as a
 * failed read with a retry that cannot change it. Found walking the demo's
 * seeded NeuroPanel-Dx 510(k) on the merged trunk, 2026-11-09:
 *
 *   - The 510(k) screen read "Could not load predicate candidates" and "Could
 *     not load substantial-equivalence rows", each with "Try again", beside a
 *     banner already saying predicate intelligence was not reachable. The
 *     server had answered 503 "Predicate Intelligence not configured"
 *     (REVIEW_ADMIN_TOKEN unset); it now carries the code
 *     PREDICATE_INTELLIGENCE_NOT_CONFIGURED.
 *   - The IVD screen read "Could not load GSPR chapters". The server had
 *     answered 404 IVDR_GSPR_NOT_FOUND: this project has no GSPR assessment
 *     yet, which is an empty matrix.
 *
 * A genuine failure still reads as one: a 503 without the code, a 500.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MdxSurfaceHost } from '../../MdxSurfaceHost';
import { clearShellProject, publishShellProject } from '../../../v2/shellProject';
import type { SurfaceViewProps } from '../../../v2/surfaceViews';

vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/authToken')>(),
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const row = {
  id: ID, name: 'NeuroPanel-Dx 510(k)', code: 'NP', description: null, programType: '510k', productType: 'ivd',
  deviceClass: 'II', regulatoryPath: '510k', primaryAgency: 'FDA', productName: 'NeuroPanel-Dx', status: 'active',
  phase: 'authoring', priority: null, targetSubmissionDate: null, progressPercent: 0, completedMilestones: 0,
  totalMilestones: 0, leadUserId: null, leadUserName: null, teamMembers: null, metadata: null,
  createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const NOT_CONFIGURED = { error: 'Predicate Intelligence not configured', code: 'PREDICATE_INTELLIGENCE_NOT_CONFIGURED', detail: 'REVIEW_ADMIN_TOKEN is not set' };
const NO_GSPR = { error: 'No GSPR assessment found for this project', code: 'IVDR_GSPR_NOT_FOUND' };

function stubFetch(answers: { predicate?: [unknown, number]; gspr?: [unknown, number] }) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/api\/regulatory-programs$/.test(url)) return json({ data: [row] });
    if (/\/api\/regulatory-programs\/[^/?]+$/.test(url)) return json({ data: row });
    if (answers.predicate && /\/api\/predicate-intelligence\//.test(url)) return json(...answers.predicate);
    if (answers.gspr && /\/api\/ivdr\/gspr-checklist\/[^/]+\/matrix/.test(url)) return json(...answers.gspr);
    return json({ data: [] });
  }));
}

function mount(nav: 'device-510k' | 'device-diagnostics') {
  publishShellProject({ id: ID });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = { surface: { id: nav }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps;
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav={nav} />
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearShellProject(); sessionStorage.clear(); });

describe('the 510(k) screen, when predicate intelligence is not configured', () => {
  it('says so once, and offers no read failure or retry for the candidates or the SE matrix', async () => {
    stubFetch({ predicate: [NOT_CONFIGURED, 503] });
    const { container } = mount('device-510k');
    await waitFor(() => expect(container.textContent).toMatch(/Predicate intelligence is not configured for this workspace/));
    await waitFor(() => expect(container.textContent).toMatch(/The SE matrix is built by predicate intelligence, which is not configured for this workspace/));
    expect(container.textContent).not.toMatch(/Could not load predicate candidates/);
    expect(container.textContent).not.toMatch(/Could not load substantial-equivalence rows/);
  });

  it('still reports a service that is down as a failure', async () => {
    stubFetch({ predicate: [{ error: 'upstream unavailable' }, 503] });
    const { container } = mount('device-510k');
    await waitFor(() => expect(container.textContent).toMatch(/Could not load substantial-equivalence rows/));
    expect(container.textContent).toMatch(/Predicate intelligence is not reachable for this tenant/);
  });
});

describe('the IVD screen, when the project has no GSPR assessment', () => {
  it('shows the empty matrix with its own hint, not a read failure', async () => {
    stubFetch({ gspr: [NO_GSPR, 404] });
    const { container } = mount('device-diagnostics');
    await waitFor(() => expect(container.textContent).toMatch(/Start the GSPR matrix for this device to populate the chapter breakdown/));
    expect(container.textContent).not.toMatch(/Could not load GSPR chapters/);
  });

  it('still reports a failed read as a failure', async () => {
    stubFetch({ gspr: [{ error: 'boom' }, 500] });
    const { container } = mount('device-diagnostics');
    await waitFor(() => expect(container.textContent).toMatch(/Could not load GSPR chapters/));
  });
});
