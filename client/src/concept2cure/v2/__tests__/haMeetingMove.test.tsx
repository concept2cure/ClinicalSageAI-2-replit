// @vitest-environment jsdom
/**
 * Moving a health-authority meeting from Communication (P-39 step 4): the form
 * offers only the moves the lifecycle allows (shared/regulatory/ha-interaction-lifecycle.ts,
 * which the server enforces) and sends the date the move records.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { MoveMeetingForm, meetingMoves } from '../surfaces/HaMeetings';

afterEach(cleanup);

describe('MoveMeetingForm', () => {
  it('offers a scheduled meeting held or cancelled, and sends the held date', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
    const onMoved = vi.fn();
    render(<MoveMeetingForm meeting={{ id: 9, title: 'Pre-IND meeting', status: 'scheduled' }} fire={vi.fn()} onCancel={vi.fn()} onMoved={onMoved} />);
    const dialog = screen.getByRole('dialog');
    const select = within(dialog).getByLabelText(/^Move to/) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value).filter(Boolean)).toEqual(['held', 'cancelled']);
    fireEvent.change(select, { target: { value: 'held' } });
    fireEvent.change(within(dialog).getByLabelText(/^Date/), { target: { value: '2026-11-02' } });
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: 'Meeting held with CDER' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move meeting' }));
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/ha-interactions/interactions/9/status',
      { status: 'held', heldDate: '2026-11-02', reason: 'Meeting held with CDER' });
  });

  it('offers no move for a closed or cancelled meeting', () => {
    expect(meetingMoves('closed')).toEqual([]);
    expect(meetingMoves('cancelled')).toEqual([]);
    expect(meetingMoves('not-a-status')).toEqual([]);
  });
});
