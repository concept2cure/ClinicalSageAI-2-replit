// @vitest-environment jsdom
/**
 * Support requests on Help & training (P-127): the person's list, a new request (written here or drafted by AnA and
 * opened from her link), a request's thread with its reply, resolve and rating, and honest failures: a failed list read
 * is not an empty list, a refused send says why and that nothing was saved.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Training, helpViewFromLocation } from '../surfaces/Training';

const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, headers: new Headers() }) as unknown as Response;
const base = { priority: 'medium', category: 'technical', openedBy: { name: 'Ann Lee', you: true }, lastReplyAt: null, firstResponseAt: null,
  resolvedAt: null, closedAt: null, rating: null, createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z', context: null };
let tickets: Array<Record<string, unknown>> = [];
let messages: Array<Record<string, unknown>> = [];
let listDown = false;
let refuseSend = false;
const posted: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  tickets = [];
  messages = [];
  listDown = false;
  refuseSend = false;
  posted.length = 0;
  window.history.replaceState(null, '', '/concept2cure/training');
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url.startsWith('/api/docs')) return json(200, { data: { collections: [], courses: [], articleCount: 0 } });
    if (url.startsWith('/api/enablement')) return json(200, { data: [] });
    if (method === 'POST') {
      posted.push({ url, body });
      if (refuseSend) return json(503, { error: { code: 'SUPPORT_UNAVAILABLE', message: 'The support request could not be recorded with its audit record. Nothing was saved.' } });
      if (url === '/api/support/tickets') {
        const b = body as { subject: string; description: string };
        const t = { ...base, number: 'SUP-000007', subject: b.subject, description: b.description, status: 'open', replies: 0 };
        tickets = [t];
        return json(201, { data: { ticket: t } });
      }
      if (url.endsWith('/resolve')) { tickets[0] = { ...tickets[0], status: 'resolved' }; return json(200, { data: { ticket: tickets[0] } }); }
      if (url.endsWith('/rating')) { tickets[0] = { ...tickets[0], rating: (body as { rating: number }).rating }; return json(200, { data: { ticket: tickets[0] } }); }
      if (url.endsWith('/messages')) {
        messages.push({ id: messages.length + 1, content: (body as { content: string }).content, createdAt: '2026-11-12T11:00:00Z', from: 'customer', author: 'Ann Lee', you: true });
        tickets[0] = { ...tickets[0], status: 'open', replies: messages.length };
        return json(201, { data: { ticket: tickets[0] } });
      }
    }
    if (url === '/api/support/tickets') return listDown ? json(503, { error: { message: 'down' } }) : json(200, { data: { tickets, scope: 'yours' } });
    const one = /^\/api\/support\/tickets\/(.+)$/.exec(url);
    if (one) {
      const t = tickets.find((x) => x.number === decodeURIComponent(one[1]));
      return t ? json(200, { data: { ticket: t, messages } }) : json(404, { error: { code: 'NOT_FOUND', message: 'No support request with that number.' } });
    }
    return json(200, { data: null });
  });
});
afterEach(() => cleanup());

const mount = () => render(<Training surface={{ id: 'training', label: 'Help & training' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);

describe('support requests on Help & training', () => {
  it('says when there are none, and writes and sends one, which then opens with its number', async () => {
    mount();
    expect(await screen.findByText(/You have no support requests/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /New request/ }));
    const send = await screen.findByRole('button', { name: 'Send request' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Assign is missing' } });
    fireEvent.change(screen.getByLabelText('What happened'), { target: { value: 'On the Plan step there is no Assign beside the protocol.' } });
    fireEvent.click(send);
    expect(await screen.findByRole('heading', { level: 2, name: 'Assign is missing' })).toBeTruthy();
    expect(screen.getByText(/SUP-000007 · Open/)).toBeTruthy();
    expect(screen.getByText(/Support has not replied yet/)).toBeTruthy();
    expect(window.location.search).toBe('?request=SUP-000007');
    expect(posted[0].body).toMatchObject({ subject: 'Assign is missing', category: 'general', priority: 'medium', context: { via: 'help_center' } });
  });

  it('opens the draft AnA linked, prefilled, and sends it as hers', async () => {
    const link = '?request=new&subject=Export+fails&details=The+eCTD+export+stops+at+80+percent+every+time.&category=bug_report&priority=high&articles=couldnt-load-try-again';
    expect(helpViewFromLocation(link)).toMatchObject({ kind: 'new-request', draft: { subject: 'Export fails', category: 'bug_report', articles: ['couldnt-load-try-again'] } });
    window.history.replaceState(null, '', `/concept2cure/training${link}`);
    mount();
    expect(await screen.findByText(/AnA drafted this request/)).toBeTruthy();
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Export fails');
    expect((screen.getByLabelText('Urgency') as HTMLSelectElement).value).toBe('high');
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByRole('heading', { level: 2, name: 'Export fails' });
    expect(posted[0].body).toMatchObject({ category: 'bug_report', priority: 'high', context: { via: 'ana', articles: ['couldnt-load-try-again'] } });
  });

  it('a refused send says why and keeps what was written', async () => {
    refuseSend = true;
    window.history.replaceState(null, '', '/concept2cure/training?request=new&subject=Hello+there&details=Something+went+wrong+here.');
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The request was not sent')).toBeTruthy();
    expect(within(alert).getByText(/Nothing was saved/)).toBeTruthy();
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Hello there');
  });

  it('a refusal apiRequest throws shows the server’s own sentence, and the failed-write sentence in place of infrastructure text', async () => {
    // apiRequest throws ApiRequestError for every non-401 failure, carrying the parsed envelope as its payload.
    let refusal: unknown = { error: { code: 'SUPPORT_UNAVAILABLE', message: 'The support request could not be recorded with its audit record. Nothing was saved.' } };
    const answer = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'POST') throw new ApiRequestError('The server could not complete this request. Try again.', 503, refusal, 'SUPPORT_UNAVAILABLE');
      return answer(method, url, body);
    });
    window.history.replaceState(null, '', '/concept2cure/training?request=new&subject=Hello+there&details=Something+went+wrong+here.');
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Send request' }));
    expect(within(await screen.findByRole('alert')).getByText('The support request could not be recorded with its audit record. Nothing was saved.')).toBeTruthy();

    refusal = { error: { code: 'INTERNAL', message: 'relation "support_tickets" does not exist' } };
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('The request could not be sent. Nothing was saved.'));
    expect(screen.getByRole('alert').textContent).not.toMatch(/relation|support_tickets/);
  });

  it('replies, marks resolved, and rates', async () => {
    tickets = [{ ...base, number: 'SUP-000007', subject: 'Assign is missing', description: 'No Assign.', status: 'open', replies: 0 }];
    messages = [{ id: 1, content: 'Assign shows once the document has a template.', createdAt: '2026-11-12T10:30:00Z', from: 'support', author: 'Concept2Cure support', you: false }];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Assign is missing/ }));
    expect(await screen.findByText(/Concept2Cure support ·/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(await screen.findByText(/SUP-000007 · Resolved/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '5 of 5' }));
    expect(await screen.findByText('You rated the answer 5 of 5.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reply to open it again'), { target: { value: 'It is back.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(screen.getByText(/SUP-000007 · Open/)).toBeTruthy());
    expect(posted.map((p) => p.url)).toEqual([
      '/api/support/tickets/SUP-000007/resolve', '/api/support/tickets/SUP-000007/rating', '/api/support/tickets/SUP-000007/messages',
    ]);
  });

  it('a failed read of the list says so, not "no requests"', async () => {
    listDown = true;
    mount();
    expect(await screen.findByText("Couldn't load your support requests")).toBeTruthy();
    expect(screen.queryByText(/You have no support requests/)).toBeNull();
  });

  it('a number the person cannot see is said to be not found, with no retry', async () => {
    window.history.replaceState(null, '', '/concept2cure/training?request=SUP-000999');
    mount();
    expect(await screen.findByText(/no support request with that number that you can see/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});

describe('Ask support', () => {
  it('opens the conversation asked as support: from Help & training, and the turn carries { support: true }', async () => {
    const { originTurnContext } = await import('../editor/authoringConversationOrigin');
    const onNav = vi.fn();
    render(<Training surface={{ id: 'training', label: 'Help & training' } as never} onAsk={vi.fn()} onNav={onNav} segment="biopharma" />);
    fireEvent.click(await screen.findByRole('button', { name: /Ask support/ }));
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
    const handed = (window as unknown as { C2C_CONVO: { id: string; seed: null; origin: Parameters<typeof originTurnContext>[0] } }).C2C_CONVO;
    expect(handed).toMatchObject({ id: 'new', seed: null, origin: { surfaceId: 'training', label: 'Help & training' } });
    // What the conversation sends with the person's first turn (ConversationThread sendTurn).
    expect(originTurnContext(handed.origin, { state: 'none' } as never, null)).toMatchObject({
      screenName: 'training', moduleContext: { surface: 'training', support: true },
    });
  });
});
