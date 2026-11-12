// @vitest-environment jsdom
/**
 * Finding a document sits across the structure and the list, so a person's documents are on the first screen.
 *
 * The founder, 2026-11-10: "The vault UI seems to be lacking in a lot of ways." P-122: a person's own work is on the
 * first screen. Measured in the running app at 1440x900 on the demo's IND project: the Library's first document
 * began at 853px and none was wholly visible. The search, the two scopes and the six filters sat inside the list's
 * column (446px), where the filters took three rows. They now sit in one bar across the tree and the list, where
 * the six filters share a row. Nothing is removed or hidden. The measurements are in
 * docs/evidence/SPINE/S6/2026-11-12-vault-library-first-screen/.
 *
 * At 1280x800 the list's column is 308px and the bar still took two rows there, with the binder's line and the
 * confirm control each said twice above the first document (904px). The bar now spans the whole Library, the
 * record included; the binder's line names the outline once; the confirm control reads "Confirm…" beside the
 * sentence that names its folder.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { PID, ok, vaultPayload, props, mockVaultApi } from './_vault-surface-fixtures';

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('the Library’s find bar', () => {
  it('holds the search, saved views, the two scopes and every filter, outside the list’s column', async () => {
    mockVaultApi(apiRequest, () => ok(vaultPayload()));
    render(<Vault {...props()} />);
    const bar = await screen.findByTestId('vault-findbar');
    expect(within(bar).getByRole('searchbox', { name: 'Search this vault' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Saved views' })).toBeTruthy();
    expect(within(bar).getByRole('checkbox', { name: 'Earlier versions' })).toBeTruthy();
    expect(within(bar).getByRole('checkbox', { name: 'All my projects' })).toBeTruthy();
    const filters = within(bar).getByRole('group', { name: 'Filter documents' });
    for (const name of ['Type', 'Filing', 'Classification', 'Evidence kind', 'Review']) {
      expect(within(filters).getByLabelText(name)).toBeTruthy();
    }
    // Across the whole Library: a child of the Library's grid, over the structure, the list and the record.
    expect(bar.parentElement?.classList.contains('vd-grid')).toBe(true);
    expect(bar.closest('.vd-browse')).toBeNull();
    expect(bar.closest('.vd-list')).toBeNull();
    // The list keeps what is the list's: where it is, and the documents.
    const list = document.querySelector('.vd-list') as HTMLElement;
    expect(within(list).queryByRole('searchbox')).toBeNull();
    expect(list.querySelector('.vd-breadcrumb')).not.toBeNull();
  });

  it('spans the grid, and its filters share the row (the stylesheet; jsdom applies none)', () => {
    const css = readFileSync(resolve(__dirname, '../styles/misc-surfaces-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
    expect(css).toContain('.vd-findbar{grid-column:1/-1;');
    expect(css).toMatch(/\.vd-findbar>\.vd-facets\[aria-label="Filterdocuments"\]\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(\d+px,1fr\)\)/);
  });
});
