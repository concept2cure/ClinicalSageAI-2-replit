// @vitest-environment jsdom
/**
 * A filing's editing copy, one rule for every client reader (editor/editingCopy.ts):
 * the document bound to it, or none, or — where the database holds more than
 * one, which its plain index allows — said, never chosen between.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create editing copy' })).toBeNull();
  });

  it('a market with one bound document opens it', () => {
    const p = props([{ id: 'x', title: 'X', c2c_document_id: 'f-ema' }]);
    render(<FilingMarkets {...p} />);
    screen.getByRole('button', { name: 'Open' }).click();
    expect(p.onOpen).toHaveBeenCalledWith('x');
  });
});
