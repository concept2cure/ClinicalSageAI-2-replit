// @vitest-environment jsdom
/**
 * No control on Project home may claim to open project settings.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * ProjectHome.tsx:1099 — a ⋯ button, tooltip "Project settings", handler
 * `onNav('projects')`. It did not open settings; it threw the user out of the
 * project workspace they were in and back to the all-projects list, discarding
 * the whole context they had navigated into — while sitting two rows below an
 * "All projects" control that does the same thing honestly.
 *
 * ── Why the fix is a deletion ────────────────────────────────────────────────
 * There is nothing to route it to, and the evidence is checkable:
 * `shared/constants/ui-surface-registry.ts` declares no project-settings
 * surface, and `server/routes/c2c/projects.ts` exposes no PATCH or PUT for a
 * regulatory program at all — only POST /, POST /:id/evidence and
 * DELETE /:id/evidence/:evId. A project's settings cannot be edited anywhere in
 * the product, so any destination the button reached would be a second lie in
 * place of the first.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * That the claim is gone, and — the half that matters — that nothing on this
 * screen navigates AWAY from the open project under a label that promises to
 * go deeper into it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import type { SurfaceViewProps } from '../surfaceViews';

const PROJECT_ID = '9a7f0b10-0000-4000-8000-0000000000aa';
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

let navigated: string[];

beforeEach(() => {
  navigated = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PROJECT_ID}`) {
      return Promise.resolve(
        ok({ success: true, data: { name: 'BX204', description: 'Phase 3 BLA', status: 'active' } }),
      );
    }
    return Promise.resolve(ok({ success: true, data: null }));
  });
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
    id: PROJECT_ID,
    title: 'BX204',
  };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

function mount() {
  const props = {
    surface: { id: 'project-home', label: 'Project home' },
    segment: 'biotech',
    onAsk: () => {},
    onNav: (id: string) => navigated.push(id),
  } as unknown as SurfaceViewProps;
  return render(<ProjectHome {...props} />);
}

describe('Project home — the "Project settings" control', () => {
  it('does not offer project settings anywhere on the screen', async () => {
    mount();
    await waitFor(() => expect(document.querySelector('.pj-title')).not.toBeNull());

    const claims = Array.from(document.querySelectorAll('button, a')).filter((el) =>
      /project settings/i.test(
        `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.textContent ?? ''}`,
      ),
    );
    expect(
      claims.map((c) => c.getAttribute('title') ?? c.textContent),
      'a control still claims to open project settings',
    ).toEqual([]);
  });

  it('leaves only the honest way out of the project workspace', async () => {
    mount();
    await waitFor(() => expect(document.querySelector('.pj-title')).not.toBeNull());

    // Every control that navigates to the all-projects list must SAY so. The
    // back control does; the ⋯ button did not.
    const leavers = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.className.includes('pj-back') || b.className.includes('pj-icon'),
    );
    for (const b of leavers) {
      expect(b.textContent, `"${b.className}" leaves the project without saying so`)
        .toMatch(/All projects/i);
    }
  });
});
