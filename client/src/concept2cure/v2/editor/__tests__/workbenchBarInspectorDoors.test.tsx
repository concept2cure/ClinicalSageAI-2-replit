// @vitest-environment jsdom
/**
 * P-122 (2026-11-10): the editor's review, signature and filing controls are on the bar again.
 *
 * b6a46499f (2026-11-02) put Versions, Review tasks, Signatures, Audit trail, Send for review… and File to vault…
 * behind "More", so in a demo they looked gone (P-122 inventory, vault-authoring-submission.md §2.2, §4 #1d).
 * §2's inspector pattern keeps review, versions, signatures and filing in an inspector that slides in, not in
 * permanent panels, and the bar's doors to that inspector are allowed: Comments has always been one. So each is a
 * quiet icon on the bar that opens its panel of the inspector, or its dialog, through the handler it already had.
 * At phone width the bar does not draw them and More keeps them (`.ed-more-narrow`), so nothing leaves the screen.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Synthetic author', email: 'assembly@example.test' } }),
}));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({
  AuthoringFilingBar: () => <span data-testid="filing-bar-stub"><button type="button">Freeze</button><button type="button">E-sign</button></span>,
}));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({
  AuthoringPlaceIntoFiling: () => <button type="button" data-testid="place-into-filing-stub">Place into filing</button>,
}));

import { PID, DOC, doc, section, template, ok, user, bearer, mounted } from './workbenchAssemblyBuild.testSupport';
import { authService } from '@/services/portal/authService';
import { publishShellProject } from '../../shellProject';
import { clearEditorTarget } from '../../editorTarget';

for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: user() })));
  await authService.adoptSession(bearer());
  publishShellProject({ id: PID });
  apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (url === '/api/authoring/templates') return ok({ success: true, templates: [template] });
    if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [{ ...doc, program_id: PID }] });
    if (pathname === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: doc });
    if (pathname === `/api/authoring/docs/${DOC}/sections`) return ok({ success: true, sections: [{ ...section, revision_count: 3, comment_count: 2 }] });
    if (url.includes('/sources')) return ok({ sources: [] });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  publishShellProject({ id: '' }); vi.unstubAllGlobals();
});

const bar = () => screen.getByTestId('ed-bar');
/** A control on the bar itself, not inside More's menu. */
const onBar = (name: string) => {
  const hits = within(bar()).queryAllByRole('button', { name }).filter((b) => !b.closest('[data-testid="ed-more"]'));
  expect(hits, `"${name}" on the bar`).toHaveLength(1);
  return hits[0];
};

describe('P-122: the inspector\'s doors are on the editor bar', () => {
  it('Versions, Review tasks, Signatures and Audit trail are on the bar, each opening its panel', async () => {
    await mounted();
    for (const [name, heading] of [
      ['Signatures', 'Electronic signatures'],
      ['Audit trail', /^Audit trail/],
      ['Versions', 'Revision history'],
    ] as const) {
      const door = onBar(name);
      expect(door.classList.contains('ed-ico')).toBe(true);
      fireEvent.click(door);
      await waitFor(() => expect(screen.getAllByText(heading).length).toBeGreaterThan(0));
      expect(door.getAttribute('aria-pressed')).toBe('true');
    }
    fireEvent.click(onBar('Review tasks'));
    await waitFor(() => expect(document.querySelector('aside[aria-label="Review tasks"]')).toBeTruthy());
  });

  it('Send for review and File to vault are on the bar, and open their dialogs', async () => {
    await mounted();
    const send = onBar('Send for review…');
    expect(send.getAttribute('data-testid')).toBe('ed-send-for-review');
    const file = onBar('File to vault…');
    expect(file.getAttribute('data-testid')).toBe('ed-file-to-vault');
    fireEvent.click(send);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  it('More still holds each of them for a phone-width bar, by name and test id', async () => {
    await mounted();
    fireEvent.click(within(screen.getByTestId('ed-more')).getAllByRole('button')[0]);
    const menu = within(screen.getByTestId('ed-more')).getByRole('menu');
    for (const name of ['Versions', 'Review tasks', 'Signatures', 'Audit trail', 'Send for review…', 'File to vault…']) {
      expect(within(menu).getByRole('menuitem', { name }).closest('.ed-more-narrow'), name).toBeTruthy();
    }
    expect(within(menu).getByRole('menuitem', { name: 'Send for review…' }).getAttribute('data-testid')).toBe('send-for-review-open');
    expect(within(menu).getByRole('menuitem', { name: 'File to vault…' }).getAttribute('data-testid')).toBe('file-to-vault-open');
  });
});
