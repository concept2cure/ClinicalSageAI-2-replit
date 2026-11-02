// @vitest-environment jsdom
/**
 * The PMA screen's module cards say what the PMA mapper says of the project's
 * own PMA document (MDX journey M18, `.design/client-journey/MDX_JOURNEY_2026-11-01.md`).
 *
 * Found in the running app, 2026-11-02: with B.2 written into the project's
 * PMA filing, and the PMA package export reading it, the cards read "0
 * documents total" and six "draft" cards, each "0 documents". They grouped the
 * organization's legacy 510(k) sections by a kit taxonomy; a project with no
 * PMA document showed every module "complete". The server now scores the
 * project's PMA document with `pathway-engines/pma/pma-mapper.ts`
 * (`server/services/__tests__/pma-modules-own-document.pglite.test.ts`); this
 * pins what the screen makes of it, through the real host.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
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
  id: ID, name: 'Corvant valve', code: 'CV', description: null, programType: 'PMA', productType: 'device',
  deviceClass: 'III', regulatoryPath: 'pma', primaryAgency: 'FDA', productName: 'Corvant valve', status: 'active',
  phase: 'planning', priority: null, targetSubmissionDate: null, progressPercent: 0, completedMilestones: 0,
  totalMilestones: 0, leadUserId: null, leadUserName: null, teamMembers: null, metadata: null,
  createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z',
};

const mod = (id: string, module: number, label: string, required: boolean, finished: string[], written: string[], status: string) =>
  ({ id, module, label, required, finished, written, status });
const MODULES = [
  mod('admin-regulatory', 1, 'Administrative & regulatory information', true, [], [], 'not_started'),
  mod('clinical', 5, 'Clinical investigations (pivotal study, GCP)', true, ['G.1'], ['G.3'], 'present'),
  mod('labeling', 6, 'Proposed labeling', true, [], [], 'not_started'),
  mod('ssed-summary', 7, 'Summary of safety and effectiveness data (SSED)', true, [], ['B.2'], 'written'),
  mod('references', 10, 'References & bibliography', false, [], [], 'not_started'),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stubFetch(modules: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/api\/regulatory-programs$/.test(url)) return json({ data: [row] });
    if (/\/api\/regulatory-programs\/[^/?]+$/.test(url)) return json({ data: row });
    if (/\/pma-modules$/.test(url)) return json({ data: modules });
    return json({ data: [] });
  }));
}

function mount() {
  publishShellProject({ id: ID });
  const onAsk = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = { surface: { id: 'device-pma' }, onAsk, onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps;
  const view = render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav="device-pma" />
    </QueryClientProvider>,
  );
  return { ...view, onAsk };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearShellProject(); sessionStorage.clear(); });

function card(container: HTMLElement, label: string) {
  const el = Array.from(container.querySelectorAll<HTMLElement>('.pma-mod'))
    .find((c) => c.querySelector('.pma-mod-label')?.textContent === label);
  if (!el) throw new Error(`no card ${label}`);
  return {
    el,
    pill: el.querySelector('.status-pill')?.textContent,
    tone: el.querySelector('.status-pill')?.className,
    desc: el.querySelector('.pma-mod-desc')?.textContent,
    foot: el.querySelector('.pma-mod-foot')?.textContent,
  };
}

describe("the PMA screen's module cards", () => {
  it('state the required modules present, as the assembly check counts them', async () => {
    stubFetch(MODULES);
    const { container } = mount();
    await waitFor(() => expect(container.querySelectorAll('.pma-mod').length).toBe(5));
    expect(container.textContent).toMatch(/Original PMA \(21 CFR 814\.20\) · 1 of 4 required modules present, as the assembly check\s+counts them/);
    expect(container.querySelector('.pma-modules')?.textContent).not.toMatch(/documents?/);
  });

  it('name the sections finished and written, by code', async () => {
    stubFetch(MODULES);
    const { container } = mount();
    await waitFor(() => expect(container.querySelectorAll('.pma-mod').length).toBe(5));
    expect(card(container, 'Clinical investigations (pivotal study, GCP)')).toMatchObject({
      pill: 'present', desc: 'Module 5 · required', foot: 'Finished: G.1 · written: G.3',
    });
    expect(card(container, 'Summary of safety and effectiveness data (SSED)')).toMatchObject({
      pill: 'written', foot: 'Written, not finished: B.2',
    });
    const labeling = card(container, 'Proposed labeling');
    expect(labeling).toMatchObject({ pill: 'not started', foot: 'Nothing written' });
    expect(labeling.tone).not.toMatch(/\b(draft|complete)\b/);
    expect(card(container, 'References & bibliography').desc).toBe('Module 10 · conditional');
  });

  it("ask AnA with the module's own facts", async () => {
    stubFetch(MODULES);
    const { container, onAsk } = mount();
    await waitFor(() => expect(container.querySelectorAll('.pma-mod').length).toBe(5));
    fireEvent.click(card(container, 'Summary of safety and effectiveness data (SSED)').el);
    expect(String(onAsk.mock.calls.at(-1)?.[0])).toMatch(/^PMA module 7, "Summary of safety and effectiveness data \(SSED\)": Written, not finished: B\.2\./);
  });

  it('say a malformed answer is a failed read: no throw, and not "no PMA document"', async () => {
    stubFetch([{ id: 'preclinical', label: 'Preclinical', desc: 'Bench', docs: 47, status: 'complete' }]);
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toMatch(/the answer was not a list of modules/));
    expect(container.querySelectorAll('.pma-mod').length).toBe(0);
    expect(container.textContent).not.toMatch(/This project has no PMA document/);
  });

  it('say so when the project has no PMA document', async () => {
    stubFetch([]);
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toMatch(/This project has no PMA document, so it has no PMA modules to show/));
    expect(container.querySelectorAll('.pma-mod').length).toBe(0);
  });
});
