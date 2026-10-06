// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AnaRail } from '../Shell';

vi.mock('../dataConnect', () => ({ connected: () => false }));
afterEach(cleanup);

function props() {
  return {
    open: true, setOpen: vi.fn(), surface: { id: 'cmc', label: 'CMC' },
    segment: 'biotech', mode: 'standard', setMode: vi.fn(), messages: [],
    onSend: vi.fn(), onAct: vi.fn(), onNewThread: vi.fn(), onRetryThread: vi.fn(),
    isLoadingThread: false,
    threadLoadError: null as { threadId: string; message: string } | null,
  };
}

describe('AnA rail history recovery', () => {
  it('keeps the draft while history loads, then sends it after loading', () => {
    const p = props();
    const { rerender } = render(<AnaRail {...p} isLoadingThread />);
    const composer = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'Continue our discussion' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(p.onSend).not.toHaveBeenCalled();
    expect(composer.value).toBe('Continue our discussion');
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Loading conversation…')).toBeTruthy();
    rerender(<AnaRail {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(p.onSend).toHaveBeenCalledWith('Continue our discussion', []);
    expect(composer.value).toBe('');
  });

  it('shows a failed load with retry and preserves a draft until recovery', () => {
    const p = props();
    p.threadLoadError = { threadId: 'thread-b', message: 'Could not load this conversation.' };
    const { rerender } = render(<AnaRail {...p} />);
    const composer = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'My question' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(p.onSend).not.toHaveBeenCalled();
    expect(composer.value).toBe('My question');
    expect(screen.getByRole('alert').textContent).toContain('Could not load this conversation.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading conversation' }));
    expect(p.onRetryThread).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'New thread' }));
    expect(p.onNewThread).toHaveBeenCalledOnce();
    rerender(<AnaRail {...p} threadLoadError={null} />);
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(p.onSend).toHaveBeenCalledWith('My question', []);
  });
});
