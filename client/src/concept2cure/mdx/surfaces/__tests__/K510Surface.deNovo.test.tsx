// @vitest-environment jsdom
/**
 * The 510(k) screen names itself for the pathway the project files (P-114
 * item 4, 2026-11-09, decided under the founder's delegation; MDX journey M7).
 *
 * A De Novo project's eSTAR is produced here (the kit folds De Novo into this
 * screen), and its Official eSTAR panel already said "De Novo". Found in the
 * running app, 2026-11-12: everything else on the screen called a De Novo a
 * 510(k): "510(k) pathway · Lumina retinal scanner", "Export 510(k) package",
 * "Predicate search", "Substantial equivalence matrix", and the stages
 * "Predicate search" and "Substantial equivalence".
 *
 * A De Novo claims no predicate (FD&C Act 513(f)(2)). Its request shows the
 * search that found none, says how the device differs from similar ones, and
 * proposes the class and special controls (21 CFR 860.220): the governed
 * De Novo outline's group C.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MdxSurfaceHost } from '../../MdxSurfaceHost';
import { clearShellProject, publishShellProject } from '../../../v2/shellProject';
import { consumeEditorTarget } from '../../../v2/editorTarget';
import type { SurfaceViewProps } from '../../../v2/surfaceViews';

vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/authToken')>(),
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const base = {
  id: ID, code: 'LRS', description: null, productType: 'device', deviceClass: null, primaryAgency: 'FDA',
  status: 'active', phase: 'planning', priority: null, targetSubmissionDate: null, progressPercent: 0,
  completedMilestones: 0, totalMilestones: 0, leadUserId: null, leadUserName: null, teamMembers: null, metadata: null,
  createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z',
};
const DE_NOVO = { ...base, name: 'Lumina retinal scanner', productName: 'Lumina retinal scanner', programType: 'DE_NOVO', regulatoryPath: 'de_novo' };
const K510 = { ...base, name: 'Helix spinal cage', productName: 'Helix spinal cage', programType: '510k', regulatoryPath: '510k' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function mount(row: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/api\/regulatory-programs$/.test(url)) return json({ data: [row] });
    if (/\/api\/regulatory-programs\/[^/?]+$/.test(url)) return json({ data: row });
    return json({ data: [] });
  }));
  publishShellProject({ id: ID });
  const onNav = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = { surface: { id: 'device-510k' }, onAsk: vi.fn(), onNav, segment: 'medtech' } as unknown as SurfaceViewProps;
  const view = render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav="device-510k" />
    </QueryClientProvider>,
  );
  return { ...view, onNav };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearShellProject(); sessionStorage.clear(); });

const title = (c: HTMLElement) => c.querySelector('.section-title')?.textContent?.replace(/\s+/g, ' ').trim();
const panelTitles = (c: HTMLElement) => Array.from(c.querySelectorAll('.panel-hdr .t')).map((e) => e.textContent?.trim());
const stages = (c: HTMLElement) => Array.from(c.querySelectorAll('.stage-strip .stage-label')).map((e) => e.textContent?.trim());
const buttons = (c: HTMLElement) => Array.from(c.querySelectorAll('button')).map((b) => b.textContent?.replace(/\s+/g, ' ').trim());

describe('the 510(k) screen, opened on a De Novo project', () => {
  it('calls the pathway and its package De Novo', async () => {
    const { container } = mount(DE_NOVO);
    await waitFor(() => expect(title(container)).toBe('De Novo pathway · Lumina retinal scanner'));
    expect(buttons(container)).toContain('Export De Novo package');
    expect(buttons(container)).not.toContain('Export 510(k) package');
  });

  it('claims no predicate and no substantial equivalence: similar devices, and how this one differs', async () => {
    const { container } = mount(DE_NOVO);
    await waitFor(() => expect(title(container)).toMatch(/^De Novo pathway/));
    expect(panelTitles(container)).toEqual(expect.arrayContaining(['Similar devices · K-numbers', 'Comparison with similar devices']));
    expect(panelTitles(container)).not.toContain('Predicate search · K-numbers');
    expect(panelTitles(container)).not.toContain('Substantial equivalence matrix');
    // The empty panels say what they serve once their reads have answered.
    await waitFor(() => expect(container.textContent).toMatch(/Serves the De Novo classification summary: how this device differs/));
    expect(container.textContent).toMatch(/Serves the De Novo classification summary: the search that found no predicate/);
    expect(container.textContent).not.toMatch(/Serves the 510\(k\)/);
    expect(container.textContent).toMatch(/No similar-device comparison rows yet/);
    expect(container.textContent).not.toMatch(/substantial-equivalence rows|SE matrix/);
  });

  it('shows the De Novo stages in place of the two that are a 510(k)\'s, and keeps the count', async () => {
    const { container } = mount(DE_NOVO);
    await waitFor(() => expect(title(container)).toMatch(/^De Novo pathway/));
    expect(stages(container)).toEqual([
      'Intake', 'Classify', 'Similar-device search', 'Performance testing',
      'Classification and special controls', 'Assemble eSTAR', 'Submit',
    ]);
  });

  it('opens the section that says why a De Novo is appropriate, not an SE discussion', async () => {
    const { container, onNav } = mount(DE_NOVO);
    await waitFor(() => expect(title(container)).toMatch(/^De Novo pathway/));
    const open = Array.from(container.querySelectorAll('button')).find((b) => /^Open §C1 in editor/.test(b.textContent ?? ''));
    expect(open, 'the editor button names the De Novo section').toBeDefined();
    fireEvent.click(open!);
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    /* The target names the governed document class the filing is recorded
       under, `denovo` (server/services/c2c/document-class.ts), not the kit's
       pathway spelling `de_novo`. Walked in the running app, 2026-11-12: with
       `de_novo` the editor answered "No DE_NOVO filing is recorded for this
       project. Nothing was opened." for a project whose De Novo filing exists. */
    expect(consumeEditorTarget()).toMatchObject({
      docType: 'denovo', sectionCode: 'C1', sectionLabel: 'Reason De Novo is appropriate (no legally marketed predicate)',
    });
  });
});

describe('the 510(k) screen, opened on a De Novo project, when predicate intelligence is not configured', () => {
  it('says so in De Novo\'s words: no substantial-equivalence matrix is promised', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/api\/regulatory-programs$/.test(url)) return json({ data: [DE_NOVO] });
      if (/\/api\/regulatory-programs\/[^/?]+$/.test(url)) return json({ data: DE_NOVO });
      if (/\/api\/predicate-intelligence\//.test(url)) {
        return json({ error: 'Predicate Intelligence not configured', code: 'PREDICATE_INTELLIGENCE_NOT_CONFIGURED' }, 503);
      }
      return json({ data: [] });
    }));
    publishShellProject({ id: ID });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const props = { surface: { id: 'device-510k' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps;
    const { container } = render(
      <QueryClientProvider client={client}>
        <MdxSurfaceHost {...props} nav="device-510k" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(container.textContent).toMatch(/The comparison with similar devices is built by predicate intelligence, which is not configured/));
    expect(container.textContent).toMatch(/Live K-number candidates and the comparison with similar devices appear here once it is/);
    expect(container.textContent).not.toMatch(/substantial-equivalence matrix|SE matrix/);
  });
});

describe('the 510(k) screen, opened on a 510(k) project, says what it said', () => {
  it('keeps its pathway, package, panels and stages', async () => {
    const { container } = mount(K510);
    await waitFor(() => expect(title(container)).toBe('510(k) pathway · Helix spinal cage'));
    expect(buttons(container)).toContain('Export 510(k) package');
    expect(panelTitles(container)).toEqual(expect.arrayContaining(['Predicate search · K-numbers', 'Substantial equivalence matrix']));
    expect(stages(container)).toEqual([
      'Intake', 'Classify', 'Predicate search', 'Performance testing', 'Substantial equivalence', 'Assemble eSTAR', 'Submit',
    ]);
    expect(Array.from(container.querySelectorAll('button')).some((b) => /^Open §11 in editor/.test(b.textContent ?? ''))).toBe(true);
  });
});
