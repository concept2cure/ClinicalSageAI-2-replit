// @vitest-environment jsdom
/**
 * Milestones: the recorded status, the timeline engine's buckets, and the
 * status write (R1).
 *
 * PATCH /api/protocol-milestones/milestones/:id/status was governed and served,
 * and nothing called it. The tab showed a status derived from the dates
 * ("complete" or "pending"), so a missed or cancelled milestone read as
 * pending, and its node never took the stylesheet's done or active style. The
 * view now carries the recorded status and the bucket from milestoneBucket,
 * the engine the timeline route uses (pdev-view-assembler.pglite.integration.test.ts).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { MilestonesTab } from '../surfaces/ProtocolDevPanes';
import { submitPdevForm } from '../surfaces/ProtocolDevForms';

const REASON = 'Recording the first patient in at site 104';
const MS = [
  { id: '5', label: 'First patient in', date: '2026-11-20', status: 'in_progress', urgency: 'due_30' },
  { id: '6', label: 'Interim analysis', date: '2026-06-01', status: 'cancelled', urgency: 'done' },
  { id: '7', label: 'Database lock', date: '2026-04-01', status: 'met', urgency: 'done' },
];

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 5 }) } as Response);
});
afterEach(cleanup);

describe('the timeline', () => {
  it('shows the engine’s bucket and the recorded status, and styles the node from the status', () => {
    const { container } = render(<MilestonesTab doc={{ milestones: MS }} onAdd={vi.fn()} />);
    expect(screen.getByText('Due ≤30d')).toBeTruthy();
    expect(screen.getAllByText('Done')).toHaveLength(2);
    const nodes = [...container.querySelectorAll('.pd-tl-node')].map((n) => n.getAttribute('data-status'));
    // The stylesheet's hooks are "done" and "active"; a cancelled milestone is neither.
    expect(nodes).toEqual(['active', 'cancelled', 'done']);
    expect(container.querySelectorAll('.pd-tl-node')[2].textContent).toBe('✓');
    expect(container.querySelectorAll('.pd-tl-node')[1].textContent).toBe('');
  });

  it('offers a status update on each milestone to a writer only', () => {
    const onEdit = vi.fn();
    const { unmount } = render(<MilestonesTab doc={{ milestones: MS }} onAdd={vi.fn()} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Update status: First patient in' }));
    expect(onEdit).toHaveBeenCalledWith('milestone-status', { id: 5, label: 'First patient in', defaults: { status: 'in_progress' } });
    unmount();
    render(<MilestonesTab doc={{ milestones: MS }} onAdd={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Update status/ })).toBeNull();
  });
});

describe('the write', () => {
  it('records the status, and the actual date when given', async () => {
    await submitPdevForm('milestone-status', 2, { id: 5 }, { status: 'met', actualDate: '2026-11-18', reason: REASON });
    expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/protocol-milestones/milestones/5/status', { status: 'met', actualDate: '2026-11-18', reason: REASON });
  });

  it('leaves the actual date out when none is given, so the server stamps "met" with today', async () => {
    await submitPdevForm('milestone-status', 2, { id: 5 }, { status: 'met', actualDate: '', reason: REASON });
    expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/protocol-milestones/milestones/5/status', { status: 'met', reason: REASON });
  });

  it('refuses a short reason in the browser: nothing is sent', async () => {
    await expect(submitPdevForm('milestone-status', 2, { id: 5 }, { status: 'met', reason: 'short' })).rejects.toThrow(/Nothing was written/);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
