// @vitest-environment jsdom
/**
 * Amendments: add a change, and move the status the lifecycle allows (R1).
 *
 * POST /api/protocol-amendments/amendments/:id/changes and PATCH .../status
 * were governed and served, and nothing called them: an amendment could be
 * logged but never itemised or moved on. The card now offers both. The next
 * statuses are the server's own transition table (`nextStatuses`, from the
 * view assembler), so the screen never offers a move the server refuses.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AmendmentsTab } from '../surfaces/ProtocolDevPanes';
import { configFor, submitPdevForm } from '../surfaces/ProtocolDevForms';

const REASON = 'Itemising the eligibility amendment for IRB review';
const AMD = (over: Record<string, unknown>) => ({
  id: '7', num: 'A1', summary: 'Widen eligibility', status: 'draft', nextStatuses: ['submitted'],
  reconsent: null, path: '', changes: [], ...over,
});

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, status: 201, json: async () => ({ amendmentId: 7 }) } as Response);
});
afterEach(cleanup);

describe('the amendment card', () => {
  it('offers a change while the amendment is a draft, and its next statuses', () => {
    const onEdit = vi.fn();
    render(<AmendmentsTab doc={{ amendments: [AMD({})] }} onAdd={vi.fn()} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a change' }));
    expect(onEdit).toHaveBeenLastCalledWith('amendment-change', { id: 7, label: 'A1' });
    fireEvent.click(screen.getByRole('button', { name: 'Change status' }));
    expect(onEdit).toHaveBeenLastCalledWith('amendment-status', { id: 7, label: 'A1', options: ['submitted'] });
  });

  it('offers no change once submitted, and nothing at a final status', () => {
    const { unmount } = render(<AmendmentsTab doc={{ amendments: [AMD({ status: 'under_review', nextStatuses: ['approved', 'rejected'] })] }} onAdd={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add a change' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change status' })).toBeTruthy();
    unmount();
    render(<AmendmentsTab doc={{ amendments: [AMD({ status: 'implemented', nextStatuses: [] })] }} onAdd={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Change status' })).toBeNull();
  });

  it('offers nothing to a reader who cannot write', () => {
    render(<AmendmentsTab doc={{ amendments: [AMD({})] }} onAdd={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add a change' })).toBeNull();
  });
});

describe('the writes', () => {
  it('the status form offers only the server’s next statuses', () => {
    const cfg = configFor('amendment-status', { id: 7, label: 'A1', options: ['approved', 'rejected'] });
    const status = cfg.fields.find((f) => f.key === 'status');
    expect(status?.options).toEqual([{ value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]);
    expect(status?.default).toBe('approved');
  });

  it('adds a change through the changes route', async () => {
    await submitPdevForm('amendment-change', 2, { id: 7 }, {
      changeDescription: 'Widen the upper age limit', sectionRef: '5.1', previousText: '18-65', proposedText: '18+', reason: REASON,
    });
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/protocol-amendments/amendments/7/changes', {
      changeDescription: 'Widen the upper age limit', sectionRef: '5.1', previousText: '18-65', proposedText: '18+', reason: REASON,
    });
  });

  it('records the next status through the status route', async () => {
    await submitPdevForm('amendment-status', 2, { id: 7 }, { status: 'submitted', reason: REASON });
    expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/protocol-amendments/amendments/7/status', { status: 'submitted', reason: REASON });
  });

  it('refuses a short reason in the browser: nothing is sent', async () => {
    await expect(submitPdevForm('amendment-status', 2, { id: 7 }, { status: 'submitted', reason: 'short' })).rejects.toThrow(/Nothing was written/);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
