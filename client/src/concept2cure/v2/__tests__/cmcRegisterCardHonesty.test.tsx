// @vitest-environment jsdom
/**
 * A register card's header may not state a figure the read did not establish.
 *
 * `RegisterCard` is the one component behind all fifteen CMC registers, and its
 * body is honest: a read in flight shows the busy state, a failed read shows
 * `tone="error"` with its own title and hint, and a register that was read and
 * holds nothing shows the empty state. The HEADER was outside that triage. It
 * rendered `meta(rows)` unconditionally, over the local working set, which is
 * seeded only once a read has resolved — so on a FAILED read it printed
 *
 *   organization-wide — ICH Q2 — 0/0 validated
 *
 * beside a body saying "Couldn't load analytical methods". The same card, at the
 * same moment, both refusing to show the register and stating its contents.
 *
 * A CMC lead reads "0/0 validated" as a fact about the register, and on this
 * one it is the fact that stops every specification approval (ICH Q2). The
 * working agreement's rule is the general form: "an error is never rendered as
 * an empty result".
 *
 * These cases pin the RULE — no figure without a resolved read — not the
 * wording, so the copy can change.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

import { CmMethodLibrary } from '../surfaces/cmcRegisters';

/** Every read answers `route`; the register's path is the only one it makes. */
function stubRead(route: { status: number; body: unknown }) {
  const fn = vi.fn(async () => ({
    ok: route.status < 400,
    status: route.status,
    json: async () => route.body,
    text: async () => JSON.stringify(route.body),
    headers: new Headers(),
  } as unknown as Response));
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

/** A read that never resolves, so the card stays in flight. */
function stubPending() {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch);
}

const METHOD = {
  id: 1, methodCode: 'AM-001', title: 'Assay by HPLC', technique: 'HPLC',
  purpose: 'assay', analyte: 'C2C-201', matrix: 'Drug substance', status: 'validated',
};

/** The grey sub-line beside the register's title. */
const subLine = () =>
  (document.querySelector('.pj-sec-h .sec-sub') as HTMLElement | null)?.textContent?.trim() ?? '';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a CMC register header states no figure over an unresolved read', () => {
  it('states the figure once the read resolved, which is the point of the line', async () => {
    stubRead({ status: 200, body: { success: true, data: [METHOD] } });
    render(<CmMethodLibrary />);
    await waitFor(() => expect(subLine()).toContain('1/1 validated'));
  });

  it('states it over a register that was read and holds nothing — zero is a fact there', async () => {
    stubRead({ status: 200, body: { success: true, data: [] } });
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('No analytical methods yet')).toBeTruthy());
    expect(subLine()).toContain('0/0 validated');
  });

  // The defect. The body says the read failed; the header said "0/0 validated".
  it('states NO figure when the read failed', async () => {
    stubRead({ status: 500, body: { success: false, error: 'boom' } });
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('Couldn’t load analytical methods')).toBeTruthy());
    expect(subLine()).not.toMatch(/\d+\s*\/\s*\d+\s*validated/);
    expect(subLine()).not.toMatch(/\bICH Q2\b.*\d/);
  });

  it('says plainly that it was not loaded, rather than going silent', async () => {
    stubRead({ status: 500, body: { success: false, error: 'boom' } });
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('Couldn’t load analytical methods')).toBeTruthy());
    expect(subLine().toLowerCase()).toContain('not loaded');
  });

  it('states no figure while the read is still in flight', async () => {
    stubPending();
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('Loading analytical methods…')).toBeTruthy());
    expect(subLine()).not.toMatch(/\d+\s*\/\s*\d+\s*validated/);
    expect(subLine().toLowerCase()).toContain('loading');
  });

  /* The scope note is not a figure — it states where the register lives, which
     is true whether the read worked or not, and it is how a reader knows an
     org-scoped register is not empty merely because no project is open. */
  it('keeps the scope note on a failed read', async () => {
    stubRead({ status: 500, body: { success: false, error: 'boom' } });
    render(<CmMethodLibrary />);
    await waitFor(() => expect(screen.getByText('Couldn’t load analytical methods')).toBeTruthy());
    expect(document.querySelector('.pj-sec-h .sec-sub')).toBeTruthy();
  });
});
