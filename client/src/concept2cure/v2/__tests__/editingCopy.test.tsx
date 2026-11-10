// @vitest-environment jsdom
/**
 * A filing's editing copy, one rule for every client reader (editor/editingCopy.ts):
 * the document bound to it, or none, or — where the database holds more than
 * one, which its plain index allows — said, never chosen between.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { editingCopyOf } from '../editor/editingCopy';
import { FilingMarkets } from '../editor/FilingMarkets';

afterEach(cleanup);

const bindingOf = (d: { c2c_document_id?: string | null }) => d.c2c_document_id;

describe('editingCopyOf', () => {
  it('one bound document is the copy; none is none; two are said, not chosen', () => {
    const a = { id: 'a', c2c_document_id: 'f1' };
    const b = { id: 'b', c2c_document_id: 'f1' };
    const other = { id: 'c', c2c_document_id: 'f2' };
    expect(editingCopyOf([a, other], 'f1', bindingOf)).toEqual({ kind: 'one', doc: a });
    expect(editingCopyOf([other], 'f1', bindingOf)).toEqual({ kind: 'none' });
    expect(editingCopyOf([a, b, other], 'f1', bindingOf)).toEqual({ kind: 'several', docs: [a, b] });
  });
});

describe('the editor\'s filing list reads the same rule', () => {
  const home = { id: 'f-home', title: 'IND', agency: 'fda', doc_type: 'ind' };
  const market = { id: 'f-ema', title: 'MAA', agency: 'ema', doc_type: 'maa' };
  const props = (docs: Array<{ id: string; title: string; c2c_document_id?: string | null }>) => ({
    home, markets: [market], marketsError: false, shownId: 'f-home', docs, onOpen: vi.fn(), onCreate: vi.fn(), creatingId: null,
  });

  it('a market with two bound documents says so and offers neither', () => {
    render(<FilingMarkets {...props([{ id: 'x', title: 'X', c2c_document_id: 'f-ema' }, { id: 'y', title: 'Y', c2c_document_id: 'f-ema' }])} />);
    expect(screen.getByText('2 documents are bound to this filing')).toBeTruthy();
    // The market's row. (The home filing here has no copy, so it offers its create: see below.)
    const marketRow = within(screen.getByText(/EMA · MAA/).closest('li') as HTMLElement);
    expect(marketRow.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(marketRow.queryByRole('button', { name: 'Create editing copy' })).toBeNull();
  });

  it('a market with one bound document opens it', () => {
    const p = props([{ id: 'x', title: 'X', c2c_document_id: 'f-ema' }]);
    render(<FilingMarkets {...p} />);
    screen.getByRole('button', { name: 'Open' }).click();
    expect(p.onOpen).toHaveBeenCalledWith('x');
  });
});

/* Walking the device journey in the running app, 2026-11-02 (MDX journey slice
   5): since 31a5453861 a document binds to a filing only when its create names
   it, and the only create that named one was a market's. The list rendered
   nothing for a project with no added market, and named the home filing
   "Shown in the outline" with no copy, so a new project's home filing could
   not get its editing copy from any screen and no section reached it. */
describe('the home filing\'s editing copy can be created', () => {
  const home = { id: 'f-home', title: 'Aurora pump — 510(k)', agency: 'fda', doc_type: 'k510' };
  const base = (over: Record<string, unknown> = {}) => ({
    home, markets: [], marketsError: false, shownId: 'f-home', docs: [] as Array<{ id: string; title: string; c2c_document_id?: string | null }>,
    onOpen: vi.fn(), onCreate: vi.fn(), creatingId: null, ...over,
  });

  it('a project with no added market offers it, and the create names the home filing', () => {
    const p = base();
    render(<FilingMarkets {...p} />);
    const create = screen.queryByRole('button', { name: 'Create editing copy' });
    expect(create, 'the home filing offered no way to create its editing copy').not.toBeNull();
    create!.click();
    expect(p.onCreate).toHaveBeenCalledWith(home, true);
  });

  it('is offered while a working document is open, which is where a new project lands', () => {
    render(<FilingMarkets {...base({ quiet: true, docs: [{ id: 'w', title: 'A working document', c2c_document_id: null }] })} />);
    expect(screen.queryByRole('button', { name: 'Create editing copy' })).not.toBeNull();
  });

  it('once the copy exists, a project with no market shows no list while a working document is open', () => {
    const { container } = render(<FilingMarkets {...base({ quiet: true, docs: [{ id: 'c', title: 'Copy', c2c_document_id: 'f-home' }] })} />);
    expect(container.textContent).toBe('');
  });

  it('a home filing whose copy is open is still "Shown in the outline"', () => {
    render(<FilingMarkets {...base({ markets: [{ id: 'f-ema', title: 'MAA', agency: 'ema', doc_type: 'maa' }], docs: [{ id: 'c', title: 'Copy', c2c_document_id: 'f-home' }] })} />);
    expect(screen.getByText('Shown in the outline')).toBeTruthy();
  });
});
