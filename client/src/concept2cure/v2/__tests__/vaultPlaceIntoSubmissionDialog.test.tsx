// @vitest-environment jsdom
/**
 * The filing dialog behaves like a dialog, and is part of the design system.
 *
 * ── Why the class test exists ────────────────────────────────────────────────
 * This dialog shipped with six invented class names — `de-backdrop`,
 * `de-dialog`, `de-head`, `de-title`, `de-foot`, `de-ok` — none of which are in
 * any stylesheet. It rendered with no backdrop, no dialog box, no header and no
 * footer, and EVERY behavioural test passed, because a test that drives a form
 * never looks at whether the form is visible.
 *
 * So the class check below is not pedantry about naming. It is the only
 * automated thing standing between "the tests are green" and "the control is
 * unusable", for a class of mistake that behavioural tests are structurally
 * blind to.
 *
 * ── Why the focus tests exist ────────────────────────────────────────────────
 * `aria-modal="true"` is a claim that everything outside the dialog is inert.
 * Making that claim without trapping focus is worse than not making it: a
 * screen-reader user is told the rest of the page is unavailable while their
 * focus can still walk into it. The claim is backed here, and these pin it.
 */
import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultPlaceIntoSubmission } from '../surfaces/VaultPlaceIntoSubmission';

const DOC_UUID = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

const props = (over: Record<string, unknown> = {}) => ({
  documentUuid: DOC_UUID,
  documentTitle: 'CSR-201',
  onClose: vi.fn(),
  ...over,
});

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/submissions') return ok([]);
    return ok({});
  });
});
afterEach(() => cleanup());

/** Every class name defined anywhere in the v2 stylesheets. */
function definedClasses(): Set<string> {
  const dir = join(__dirname, '..', 'styles');
  const names = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(join(dir, f), 'utf8');
    for (const m of css.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) names.add(m[1]);
  }
  return names;
}

describe('the dialog is styled by the design system, not by invented names', () => {
  it('uses no class that no stylesheet defines', async () => {
    render(<VaultPlaceIntoSubmission {...(props() as any)} />);
    await screen.findByRole('dialog');

    const defined = definedClasses();
    const used = new Set<string>();
    for (const el of Array.from(document.querySelectorAll('[class]'))) {
      // getAttribute, not .className: on an SVG element className is an
      // SVGAnimatedString, and stringifying it yields "[object ...]".
      for (const c of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) used.add(c);
    }

    /* lucide-* comes from the icon library's own SVGs and is styled by the
       library, not by this app's stylesheets. Excluded by NAMESPACE rather than
       by listing the three that happen to appear today, so adding an icon does
       not fail this test for the wrong reason. */
    const libraryOwned = (c: string) => c === 'lucide' || c.startsWith('lucide-');
    const invented = [...used].filter((c) => !defined.has(c) && !libraryOwned(c)).sort();
    expect(
      invented,
      `these class names are not defined in any v2 stylesheet, so they style nothing: ${invented.join(', ')}`,
    ).toEqual([]);
  });

  it('renders the shared dialog shell the other dialogs use', async () => {
    // Structural, not cosmetic: without the backdrop and the dialog box there
    // is no modal surface at all, whatever the fields inside do.
    render(<VaultPlaceIntoSubmission {...(props() as any)} />);
    await screen.findByRole('dialog');
    expect(document.querySelector('.de-bd'), 'no backdrop').toBeTruthy();
    expect(document.querySelector('.de'), 'no dialog box').toBeTruthy();
    expect(document.querySelector('.de-h'), 'no header').toBeTruthy();
    expect(document.querySelector('.de-f'), 'no footer').toBeTruthy();
  });
});

describe('it behaves like a modal dialog', () => {
  it('is labelled by its own title', async () => {
    render(<VaultPlaceIntoSubmission {...(props() as any)} />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toMatch(/place into submission/i);
  });

  it('moves focus into the dialog on open', async () => {
    render(<VaultPlaceIntoSubmission {...(props() as any)} />);
    const dialog = await screen.findByRole('dialog');
    // Focus must be inside, or a keyboard user starts outside a surface that
    // claims the rest of the page is inert.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('returns focus to whatever opened it', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<VaultPlaceIntoSubmission {...(props() as any)} />);
    await screen.findByRole('dialog');
    unmount();

    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<VaultPlaceIntoSubmission {...(props({ onClose }) as any)} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a click outside, but not on a click inside', async () => {
    const onClose = vi.fn();
    render(<VaultPlaceIntoSubmission {...(props({ onClose }) as any)} />);
    const dialog = await screen.findByRole('dialog');

    fireEvent.mouseDown(dialog);
    expect(onClose, 'a click inside the dialog dismissed it').not.toHaveBeenCalled();

    fireEvent.mouseDown(document.querySelector('.de-bd')!);
    expect(onClose).toHaveBeenCalled();
  });
});
