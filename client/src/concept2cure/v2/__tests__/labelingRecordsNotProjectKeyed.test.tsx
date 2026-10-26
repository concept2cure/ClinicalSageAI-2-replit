// @vitest-environment jsdom
/**
 * Labeling — another project's labeling records are not shown (slice 0).
 *
 * The map's `labeling` row (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * section 5, "Device labeling and UDI"; section 8, slice 0): the screen read
 * GET /api/mdx/labeling with no project key (Labeling.tsx:136-137). That route
 * returns every labeling document in the organization ordered by device name
 * (server/routes/mdx-labeling.ts:82-101), and the screen took the first row as
 * "the" label — its header, translation coverage, symbols, UDI-DI and the
 * add-translation write all belonged to whichever device sorts first, which
 * may be another project's.
 *
 * Until the read takes the project (slice 20), the record panels are not shown
 * and one plain line says why. AnA is told the same, not the other document.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

type Published = { summary?: string; facts?: Record<string, unknown>; availableActions?: string[] };
const published = vi.hoisted(() => ({ current: null as null | Published }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (...args: [string, Published]) => { published.current = args[1]; },
}));

import { Labeling } from '../surfaces/Labeling';

/* Another project's IFU: the first row of the organization-wide read. */
const OTHER_DOC = {
  id: 91, device_name: 'Other project infusion pump', doc_kind: 'ifu', version: '7',
  organization_id: 7, program_id: '11111111-2222-4333-8444-555555555555',
  status: 'approved', udi_di: '00812345000017',
};
const OTHER_SYMBOL = { id: 3, symbol_code: 'ISO-OTHER-5.1.1', symbol_name: 'Other project manufacturer', description: null, required_by: ['EU MDR'] };
const OTHER_TRANSLATION = {
  id: 12, language: 'sv', status: 'approved', translation_method: 'human', back_translation_verified: true,
};

const paths: string[] = [];

beforeEach(() => {
  paths.length = 0;
  published.current = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    paths.push(path);
    const data = path === '/api/mdx/labeling' ? [OTHER_DOC]
      : path.endsWith('/symbols') ? [OTHER_SYMBOL]
      : path.endsWith('/translations') ? [OTHER_TRANSLATION]
      : [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
});
afterEach(() => cleanup());

const mount = () => render(<Labeling {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof Labeling>)} />);
const text = () => document.body.textContent ?? '';
/* Let every read that would be made settle, so a panel that renders the
   organization's first document has had the chance to. */
const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0)); };

describe('Labeling — record panels wait for a project-keyed read (slice 0)', () => {
  it('shows none of the organization’s first labeling document, and says why', async () => {
    mount();
    await waitFor(() => expect(text()).toMatch(/Labeling and IFU/));
    await settle();

    /* The other document's kind and version, from the page eyebrow. The device
       name is not asserted: before slice 0 it reached only the closed Add
       translation form and AnA, never the page, so that check could not fail. */
    expect(text()).not.toMatch(/Instructions for use v7/);
    expect(text()).not.toMatch(/00812345000017/);
    expect(text()).not.toMatch(/ISO-OTHER-5\.1\.1|Other project manufacturer/);
    expect(text()).not.toMatch(/Swedish/);
    expect(text()).not.toMatch(/ v7\b/);
    // The write that would land on that document is not offered either.
    expect(Array.from(document.body.querySelectorAll('button')).map((b) => b.textContent)).not.toContainEqual(
      expect.stringMatching(/Add (a )?translation/),
    );

    /* The line names what is withheld, so it cannot be read as describing the
       panels that are still shown beneath it. */
    expect(document.body.querySelector('[data-testid="labeling-not-keyed"]')?.textContent ?? '').toMatch(
      /^Translation coverage, ISO 15223-1 symbols, UDI placement and the translations table are shown once this screen reads this project's records\./,
    );
    // Nothing that holds no record was taken away with them.
    const titles = Array.from(document.body.querySelectorAll('.sec-title')).map((t) => t.textContent);
    expect(titles).toEqual(expect.arrayContaining(['Warnings and precautions', 'Compliance checks', 'Label and IFU sections']));
  });

  it('makes no organization-wide labeling read', async () => {
    mount();
    await waitFor(() => expect(text()).toMatch(/Labeling and IFU/));
    await settle();
    expect(paths).not.toContain('/api/mdx/labeling');
    expect(paths.filter((p) => p.startsWith('/api/mdx/labeling/'))).toEqual([]);
  });

  /* The key comes from the screen, not a flag: given the project, the one
     labeling read carries program_id, and the organization-wide read is never
     made, so turning the panels on cannot bring the first-document defect back. */
  it('with the project, reads only that project’s labeling documents', async () => {
    const PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
    const KEYED = `/api/mdx/labeling?program_id=${PROGRAM_ID}`;
    const OWN_DOC = { ...OTHER_DOC, id: 4, device_name: 'Aurora CGM', version: '3', program_id: PROGRAM_ID, udi_di: null };
    apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
      const path = String(rawPath ?? '');
      paths.push(path);
      const data = path === '/api/mdx/labeling' ? [OTHER_DOC] : path === KEYED ? [OWN_DOC] : [];
      return { ok: true, status: 200, json: async () => ({ data }) } as Response;
    });
    render(<Labeling {...({ onAsk: () => {}, programId: PROGRAM_ID } as unknown as React.ComponentProps<typeof Labeling>)} />);
    await waitFor(() => expect(paths).toContain(KEYED));
    await settle();
    expect(paths).not.toContain('/api/mdx/labeling');
    await waitFor(() => expect(text()).toMatch(/Instructions for use v3/));
    expect(text()).not.toMatch(/00812345000017/);
    expect(document.body.querySelector('[data-testid="labeling-not-keyed"]')).toBeNull();
  });

  /* The reason given is the one the code has. There is no organization-wide
     read left to "not limit" (the test above proves it is never made): the
     screen is not handed the project, so it reads no labeling document at all.
     Saying the read "would show the organization's first labeling document"
     describes the removed read, and AnA would repeat it to a user as a limit of
     the labeling service, which does filter by project. */
  const TRUE_REASON = /This screen is not given the open project yet, so it reads none of the organization's labeling documents\./;
  const REMOVED_READ = /not limited to a project|would show the organization/;

  it('gives the true reason on the screen: the screen is not given the project', async () => {
    mount();
    await waitFor(() => expect(text()).toMatch(/Labeling and IFU/));
    await settle();
    const note = document.body.querySelector('[data-testid="labeling-not-keyed"]')?.textContent ?? '';
    expect(note).toMatch(new RegExp(TRUE_REASON.source + '$'));
    expect(note).not.toMatch(REMOVED_READ);
  });

  it('gives AnA the same reason', async () => {
    mount();
    await waitFor(() => expect(text()).toMatch(/Labeling and IFU/));
    await settle();
    const summary = published.current?.summary ?? '';
    expect(summary).toMatch(TRUE_REASON);
    expect(summary).not.toMatch(REMOVED_READ);
  });

  it('tells AnA the records are not shown, not another project’s document', async () => {
    mount();
    await waitFor(() => expect(text()).toMatch(/Labeling and IFU/));
    await settle();
    expect(published.current).not.toBeNull();
    expect(published.current?.facts?.document).toBeUndefined();
    expect(published.current?.summary ?? '').not.toMatch(/Other project infusion pump/);
    expect(published.current?.summary ?? '').toMatch(/not shown/i);
    expect(published.current?.summary ?? '').toMatch(/project/);
  });
});
