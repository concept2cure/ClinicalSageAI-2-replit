// @vitest-environment jsdom
/**
 * Project home starts a conversation in the project. It is not one.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md §2.3. The page drew a chat panel of its
 * own: a header "AnA · co-author", an "Open full thread" link, and a message
 * in AnA's voice ("I'm your co-author on …") that no model wrote and nothing
 * stored. With the shell conversation as the one place AnA talks, that panel
 * was a second AnA on the screen, and its opening line was invented. The box
 * now says what it does, and what is typed in it starts a new conversation in
 * this project, where AnA answers.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '0f3c1a2b-1111-4222-8333-444455556666';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const props = () => ({ surface: { id: 'project-home', label: 'Project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ title: 'BX-301', readiness: 42 });
    if (url.startsWith('/api/chat/threads?program_id=')) return ok({ threads: [] });
    return ok({});
  });
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; delete (window as any).C2C_CONVO; });

describe('Project home — the start box', () => {
  it('names what it does and speaks in no voice but the page\'s', async () => {
    const { container } = render(<ProjectHome {...props()} />);
    await waitFor(() => expect(container.querySelector('.pj-convo')).toBeTruthy());
    // No pretend chat: no AnA bubble, no "co-author" header, no second thread link.
    expect(container.querySelector('.pj-msg'), 'a message bubble nobody sent').toBeNull();
    expect(container.textContent).not.toMatch(/AnA · co-author/);
    expect(container.textContent).not.toMatch(/I'm your co-author/);
    expect(screen.queryByText('Open full thread')).toBeNull();
    const box = screen.getByRole('region', { name: /Start a conversation in/ });
    expect(box.textContent).toMatch(/Start a conversation in BX-301/);
  });

  it('a question typed here starts a new conversation in the project, carrying the words', async () => {
    const p = props();
    render(<ProjectHome {...p} />);
    const box = await screen.findByRole('textbox', { name: /Start a conversation in/ });
    const send = screen.getByRole('button', { name: 'Start the conversation' });
    expect((send as HTMLButtonElement).disabled, 'nothing to start with an empty box').toBe(true);

    fireEvent.change(box, { target: { value: '  Draft the 2.5 overview  ' } });
    fireEvent.click(send);
    expect((window as any).C2C_CONVO).toEqual({ id: 'new', seed: 'Draft the 2.5 overview' });
    expect(p.onNav).toHaveBeenCalledWith('conversation-thread');
  });

  it('Enter with an empty box goes nowhere', async () => {
    const p = props();
    render(<ProjectHome {...p} />);
    const box = await screen.findByRole('textbox', { name: /Start a conversation in/ });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(p.onNav).not.toHaveBeenCalledWith('conversation-thread'));
    expect((window as any).C2C_CONVO).toBeUndefined();
  });
});
