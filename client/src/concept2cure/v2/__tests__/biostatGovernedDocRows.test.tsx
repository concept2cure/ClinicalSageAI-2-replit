// @vitest-environment jsdom
/**
 * A governed-document row is a button only when there is somewhere to go.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Every row in "Governed statistical documents" rendered as a full-width
 * <button>, and its handler was `() => { if (p.doc) setDocType(p.doc) }`. When
 * a persisted artifact carried no recorded `doc` type — a condition the type
 * itself declares as NORMAL ("null when statisticalDocumentType was not
 * recorded on the artifact") — clicking did nothing at all. No navigation, no
 * message, no disabled state: an ordinary persisted document, presented as an
 * interactive control that silently declined.
 *
 * A row we cannot open is still a row. It renders, it is disabled, and the
 * reason is on the row rather than nowhere.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * That a row WITH a recorded type actually switches the generator (the thing
 * the control claims to do), that a row WITHOUT one is inert-by-declaration
 * rather than inert-in-practice, and that the reason is reachable — the case
 * a screenshot cannot distinguish from the defect.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Biostatistics } from '../surfaces/Biostatistics';

const Surface = Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;

/** One artifact with a recorded statistical type, one without — both normal. */
const ROWS = [
  { id: 'ART-501', study: 'BX-204 Phase 2', endpoint: 'PFS', doc: 'dsmb_charter', status: 'approved' },
  { id: 'ART-502', study: 'BX-301 pivotal', endpoint: null, doc: null, status: 'draft' },
];

function routeReads(rows: unknown = ROWS) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET') throw new Error('unrouted ' + method + ' ' + path);
    if (path === '/api/ana-biostats/governed-documents') {
      return { ok: true, status: 200, json: async () => ({ data: rows }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
}

const rowFor = (artifactId: string) =>
  Array.from(document.querySelectorAll('.sp-list .sp-row'))
    .find(r => r.textContent?.includes(artifactId)) as HTMLElement;

/** The document the generator is currently producing. */
const activeGenerator = () =>
  (document.querySelector('.bs-doc-kind') as HTMLElement | null)?.textContent ?? null;

const mount = () => render(<Surface onAsk={() => {}} onNav={() => {}} />);

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('Biostatistics — governed document rows', () => {
  it('opens the generator for a row that HAS a recorded statistical type', async () => {
    routeReads();
    mount();
    await waitFor(() => expect(rowFor('ART-501')).toBeTruthy());

    // Not the DSMB charter to begin with — otherwise this asserts nothing.
    expect(activeGenerator()).not.toBe('DSMB / DMC Charter');

    fireEvent.click(rowFor('ART-501'));

    await waitFor(() => expect(activeGenerator()).toBe('DSMB / DMC Charter'));
  });

  it('renders the untyped row as DISABLED rather than as a button that declines', async () => {
    routeReads();
    mount();
    await waitFor(() => expect(rowFor('ART-502')).toBeTruthy());

    const row = rowFor('ART-502');
    expect(
      (row as HTMLButtonElement).disabled,
      'a row with nothing to open was still offered as a live control',
    ).toBe(true);
    // And the row still appears — a document we cannot open is not a document
    // we hide. The list would otherwise under-report the org's file.
    expect(row.textContent).toContain('BX-301 pivotal');
  });

  it('says on the row why it cannot be opened', async () => {
    routeReads();
    mount();
    await waitFor(() => expect(rowFor('ART-502')).toBeTruthy());

    const row = rowFor('ART-502');
    expect(row.textContent).toContain('no recorded type');
    expect(row.getAttribute('title')).toMatch(/no recorded statistical type/i);
  });

  it('leaves the generator alone when the untyped row is clicked', async () => {
    /* The defect's actual symptom, asserted directly: the click changes
       nothing. What is different now is that the control said so first. */
    routeReads();
    mount();
    await waitFor(() => expect(rowFor('ART-502')).toBeTruthy());

    const before = activeGenerator();
    fireEvent.click(rowFor('ART-502'));
    expect(activeGenerator()).toBe(before);
  });

  it('does not describe an untyped artifact as a document type it does not have', async () => {
    // The row's subtitle falls back to the generic noun, never to a guess at
    // which statistical document this artifact might be.
    routeReads();
    mount();
    await waitFor(() => expect(rowFor('ART-502')).toBeTruthy());

    expect(rowFor('ART-502').textContent).toContain('Statistical document');
    expect(rowFor('ART-502').textContent).not.toContain('DSMB');
  });
});
