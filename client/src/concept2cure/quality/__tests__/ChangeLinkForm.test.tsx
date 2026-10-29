// @vitest-environment jsdom
/**
 * A change links to a record Quality holds: for a CAPA, a nonconformance or a
 * supplier, the drawer lists the organisation's own records and the reference
 * is the pick's, shown read-only. A register that could not be read says so,
 * and the typed reference stays available.
 */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ reads: {} as Record<string, { data: unknown; loading: boolean; error: string | null }> }));
vi.mock('../../mdx/hooks/useFetchJson', () => ({
  useFetchJson: (url: string | null) => (url ? H.reads[url] ?? { data: null, loading: true, error: null } : { data: null, loading: false, error: null }),
}));

import { ChangeLinkForm } from '../ChangeLinkForm';

afterEach(() => { cleanup(); H.reads = {}; });

const open = (onSubmit = vi.fn()) => {
  render(<ChangeLinkForm changeNumber="CC-2026-014" refusal={null} onCancel={vi.fn()} onSubmit={onSubmit} />);
  return { d: screen.getByRole('dialog'), onSubmit };
};

describe('Link a record', () => {
  it('links the CAPA chosen from the register, with its own number and title', () => {
    H.reads['/api/capa-mdr/capa'] = { data: { rows: [{ id: 'c1', capaCode: 'CAPA-007', title: 'Assay OOS recurrence' }] }, loading: false, error: null };
    const { d, onSubmit } = open();
    fireEvent.change(within(d).getByLabelText(/Record type/), { target: { value: 'capa' } });
    fireEvent.change(within(d).getByLabelText(/Choose the CAPA/), { target: { value: 'CAPA-007' } });
    expect((within(d).getByLabelText(/^Reference/) as HTMLInputElement).readOnly).toBe(true);
    fireEvent.click(within(d).getByRole('button', { name: 'Link record' }));
    expect(onSubmit).toHaveBeenCalledWith({ linkType: 'capa', linkedRef: 'CAPA-007', linkedLabel: 'Assay OOS recurrence', relationship: undefined });
  });

  it('says so when the register could not be read, and keeps the typed reference', () => {
    H.reads['/api/mdx/qms/nonconforming'] = { data: null, loading: false, error: 'HTTP 500' };
    const { d, onSubmit } = open();
    fireEvent.change(within(d).getByLabelText(/Record type/), { target: { value: 'deviation' } });
    expect(within(d).getByText(/nonconformance register could not be read/)).toBeTruthy();
    fireEvent.change(within(d).getByLabelText(/^Reference/), { target: { value: 'DEV-2026-041' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Link record' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ linkType: 'deviation', linkedRef: 'DEV-2026-041' }));
  });
});
