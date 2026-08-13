// @vitest-environment jsdom
/**
 * The workbench → editor hand-off carries its context.
 *
 * The documented gap this pins shut: MdxSurfaceHost's `openEditor` used to
 * discard the section id and doc type — every "Open in editor" click landed on
 * DocumentAuthoring's default view. The section now travels on
 * window.C2C_EDITOR_TARGET (v2/editorTarget.ts) and the program hand-off
 * mirrors openProgram's C2C_PROJECT replace. This test clicks the real
 * affordances and asserts what reaches the channel and the router —
 * DocumentAuthoring's side of the contract is proven in
 * v2/__tests__/documentAuthoringDeepLink.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MdxSurfaceHost } from '../MdxSurfaceHost';
import { GeneratorTab } from '../surfaces/cer/GeneratorTab';
import { clearEditorTarget } from '../../v2/editorTarget';
import type { SurfaceViewProps } from '../../v2/surfaceViews';
import type { EstarRow } from '../data/k510';

// The host fans out to live endpoints; this test is about the hand-off, not
// any fetch, so everything resolves empty and the fixtures render.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
);

afterEach(cleanup);
beforeEach(() => {
  clearEditorTarget();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

function renderHost(nav: string, onNav = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    surface: { id: nav },
    onAsk: () => {},
    onNav,
    segment: 'medtech',
  } as unknown as SurfaceViewProps;
  render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav={nav as never} />
    </QueryClientProvider>,
  );
  return onNav;
}

describe('the 510(k) workspace hands the editor its section', () => {
  it('"Open §11 in editor" writes docType + section to the channel and navigates', () => {
    const onNav = renderHost('device-510k');

    fireEvent.click(screen.getByRole('button', { name: /Open §11 in editor/i }));

    expect(onNav).toHaveBeenCalledWith('document-authoring');
    const t = window.C2C_EDITOR_TARGET;
    expect(t).toBeTruthy();
    expect(t!.docType).toBe('k510');
    expect(t!.sectionCode).toBe('11');
    // The fixture's §11 label rides along for the title-match fallback and
    // for the editor's honest-miss wording.
    expect(t!.sectionLabel).toBe('Substantial Equivalence Discussion');
  });

  it('a click with no program in scope still writes the pathway anchor docType', () => {
    // fetch returns no programs, so programForContext is null and the target
    // carries no programId — the editor resolves best-effort in the user's own
    // scope, and the docType still travels from the PATHWAY_ANCHOR.
    renderHost('device-510k');
    fireEvent.click(screen.getByRole('button', { name: /Open §11 in editor/i }));
    expect(window.C2C_EDITOR_TARGET?.programId).toBeNull();
    expect(window.C2C_EDITOR_TARGET?.docType).toBe('k510');
  });
});

describe('the CER Generator rows hand the editor their section', () => {
  it('a section row passes ITS OWN code and label through onOpenEditor', () => {
    const onOpenEditor = vi.fn();
    const sections: EstarRow[] = [
      { id: 4, label: 'Clinical data summary', status: 'draft' },
      { id: 7, label: 'PMS plan', status: 'empty' },
    ];
    render(
      <GeneratorTab
        program={null}
        sections={sections}
        sectionsLoading={false}
        sectionsError={null}
        refreshSections={() => {}}
        includedSignalCount={0}
        literatureTotal={0}
        profile={null}
        onAskAna={() => {}}
        onOpenEditor={onOpenEditor}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open PMS plan in the document editor' }));
    expect(onOpenEditor).toHaveBeenCalledWith({ code: 7, label: 'PMS plan' });
  });

  it('without an onOpenEditor the affordance is not drawn — no dead buttons', () => {
    render(
      <GeneratorTab
        program={null}
        sections={[{ id: 4, label: 'Clinical data summary', status: 'draft' }]}
        sectionsLoading={false}
        sectionsError={null}
        refreshSections={() => {}}
        includedSignalCount={0}
        literatureTotal={0}
        profile={null}
        onAskAna={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /in the document editor/i })).toBeNull();
  });
});
