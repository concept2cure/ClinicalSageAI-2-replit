/**
 * Support requests on Help & training (P-127, docs/design/HELP_AND_SUPPORT_2026-11-10.md §3.4): the person's requests to
 * Concept2Cure support, a new request (written here, or drafted by AnA and opened from her link), and one request's
 * thread, where the person replies, marks it resolved and rates the answer. Reads and writes /api/support
 * (server/routes/support.ts). A failed read says so; a refused write says why and that nothing was saved.
 */
import React, { useState } from 'react';
import { I } from '../../icons';
import { useLiveData, EmptyState, ErrorState } from '../../dataConnect';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';

export interface SupportTicket {
  number: string; subject: string; description: string; status: string; priority: string; category: string;
  openedBy: { name: string | null; you: boolean }; replies: number; lastReplyAt: string | null;
  resolvedAt: string | null; closedAt: string | null; rating: number | null; createdAt: string; updatedAt: string;
}
interface TicketsRead { tickets: SupportTicket[]; scope: 'yours' | 'organisation' }
interface TicketRead {
  ticket: SupportTicket;
  messages: Array<{ id: number; content: string; createdAt: string; from: 'customer' | 'support'; author: string | null; you: boolean }>;
}
export interface RequestDraft { subject?: string; details?: string; category?: string; priority?: string; articles?: string[] }

export const STATUS_WORDS: Record<string, string> = {
  open: 'Open', in_progress: 'In progress', waiting_on_customer: 'Waiting for you', waiting_on_internal: 'With support',
  escalated: 'Escalated', resolved: 'Resolved', closed: 'Closed',
};
const CATEGORY_WORDS: Record<string, string> = {
  general: 'A question', technical: 'Something is not working', bug_report: 'A defect', account: 'My account or sign-in',
  billing: 'Billing', compliance: 'Compliance and records', integration: 'A connection to another system', feature_request: 'A suggestion',
};
const PRIORITY_WORDS: Record<string, string> = { low: 'Low', medium: 'Normal', high: 'High: my work is blocked', critical: 'Critical: a filing is at risk' };

const when = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** The server's reason for a refused write, or the failed-write sentence. */
async function send(method: 'POST', url: string, body: unknown): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const res = await apiRequest(method, url, body);
    const json = await res.json().catch(() => null) as { data?: unknown; error?: { message?: string } } | null;
    if (res.ok) return { ok: true, data: json?.data };
    return { ok: false, message: json?.error?.message ?? 'The request could not be sent. Nothing was saved.' };
  } catch (e) {
    const payload = e instanceof ApiRequestError ? (e.payload as { error?: { message?: string } } | undefined) : undefined;
    return { ok: false, message: payload?.error?.message ?? 'The request could not be sent. Nothing was saved.' };
  }
}

/** The person's requests, on Help & training's front page. */
export function YourRequests({ onOpen, onNew }: { onOpen: (number: string) => void; onNew: () => void }) {
  const [version, setVersion] = useState(0);
  const read = useLiveData<TicketsRead>('/api/support/tickets', ['/api/support/tickets', version]);
  return (
    <section className="hc-sec" aria-labelledby="hc-requests-h">
      <div className="hc-sec-head">
        <h2 id="hc-requests-h" className="hc-h">{read.data?.scope === 'organisation' ? 'Your organisation’s support requests' : 'Your support requests'}</h2>
        <button type="button" className="btn ghost sm" onClick={onNew}>{I.plus} New request</button>
      </div>
      {read.loading ? (
        <div role="status" className="scaf-note">Loading your requests…</div>
      ) : read.error || !read.data ? (
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load your support requests"
          hint="This is a failed read, not an empty list." retry={() => setVersion((v) => v + 1)} />
      ) : read.data.tickets.length === 0 ? (
        <p className="hc-coll-s">
          {read.data.scope === 'organisation' ? 'Your organisation has no support requests.' : 'You have no support requests.'}
          {' '}When the Help Center does not answer you, write one, or ask support.
        </p>
      ) : (
        <ul className="hc-list">
          {read.data.tickets.map((t) => (
            <li key={t.number}>
              <button type="button" className="hc-row" onClick={() => onOpen(t.number)}>
                <span className="hc-row-t">{t.subject}</span>
                <span className="hc-row-s">
                  {t.number} · {STATUS_WORDS[t.status] ?? t.status} · {t.replies === 1 ? '1 reply' : `${t.replies} replies`} · updated {when(t.updatedAt)}
                  {!t.openedBy.you && t.openedBy.name ? ` · from ${t.openedBy.name}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Write a request, or read and send the one AnA drafted. */
export function NewRequest({ draft, onBack, onSent }: { draft: RequestDraft; onBack: () => void; onSent: (number: string) => void }) {
  const [subject, setSubject] = useState(draft.subject ?? '');
  const [details, setDetails] = useState(draft.details ?? '');
  const [category, setCategory] = useState(draft.category && CATEGORY_WORDS[draft.category] ? draft.category : 'general');
  const [priority, setPriority] = useState(draft.priority && PRIORITY_WORDS[draft.priority] ? draft.priority : 'medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = subject.trim().length >= 4 && details.trim().length >= 10;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const r = await send('POST', '/api/support/tickets', {
      subject: subject.trim(), description: details.trim(), category, priority,
      context: { via: draft.subject || draft.details ? 'ana' : 'help_center', ...(draft.articles?.length ? { articles: draft.articles } : {}) },
    });
    setBusy(false);
    if (r.ok) onSent((r.data as { ticket: SupportTicket }).ticket.number);
    else setError(r.message);
  };
  return (
    <article className="hc-article" aria-labelledby="hc-new-h">
      <button type="button" className="hc-back" onClick={onBack}>{I.left} Help &amp; training</button>
      <h2 id="hc-new-h" className="hc-article-t">New support request</h2>
      <p className="hc-coll-s">
        {draft.subject || draft.details ? 'AnA drafted this request. Read it, change what you want, and send it. ' : ''}
        It goes to Concept2Cure support with a number you can follow here.
      </p>
      <form className="hc-form" onSubmit={submit}>
        <label className="hc-field"><span>Subject</span>
          <input className="c2c-input" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="The problem in a few words" />
        </label>
        <label className="hc-field"><span>What happened</span>
          <textarea className="c2c-input" rows={7} value={details} maxLength={8000} onChange={(e) => setDetails(e.target.value)}
            placeholder="What you were doing, where, what you expected, and what happened. Copy any message word for word." />
        </label>
        <div className="hc-field-row">
          <label className="hc-field"><span>About</span>
            <select className="c2c-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_WORDS).map(([v, w]) => <option key={v} value={v}>{w}</option>)}
            </select>
          </label>
          <label className="hc-field"><span>Urgency</span>
            <select className="c2c-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY_WORDS).map(([v, w]) => <option key={v} value={v}>{w}</option>)}
            </select>
          </label>
        </div>
        {error && <ErrorState variant="inline" title="The request was not sent" message={error} onDismiss={() => setError(null)} />}
        <div className="hc-actions">
          <button type="submit" className="btn primary" disabled={!ready || busy}>{busy ? 'Sending…' : 'Send request'}</button>
          <button type="button" className="btn ghost" onClick={onBack}>Cancel</button>
        </div>
      </form>
    </article>
  );
}

function Rate({ number, onDone }: { number: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const rate = async (rating: number) => {
    const r = await send('POST', `/api/support/tickets/${encodeURIComponent(number)}/rating`, { rating });
    if (r.ok) onDone(); else setError(r.message);
  };
  return (
    <div className="hc-rate">
      <span>How well did support answer this?</span>
      <div role="group" aria-label="Rate the answer from 1 (poorly) to 5 (very well)">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="btn ghost sm" onClick={() => rate(n)} aria-label={`${n} of 5`}>{n}</button>)}
      </div>
      {error && <ErrorState variant="inline" title="The rating was not recorded" message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}

/** One request: what was asked, the replies, and what the person can do next. */
const byline = (t: SupportTicket) => (t.openedBy.you ? 'You' : t.openedBy.name ?? 'A member');

/** What was asked and every public reply, oldest first. */
function RequestThread({ ticket: t, messages }: TicketRead) {
  return (
    <ol className="hc-thread">
      <li className="hc-msg"><div className="hc-msg-h">{byline(t)} · {when(t.createdAt)}</div><p>{t.description}</p></li>
      {messages.map((m) => (
        <li key={m.id} className={`hc-msg${m.from === 'support' ? ' support' : ''}`}>
          <div className="hc-msg-h">{m.you ? 'You' : m.author ?? 'A member'} · {when(m.createdAt)}</div>
          <p>{m.content}</p>
        </li>
      ))}
    </ol>
  );
}

/** Reply (a resolved request opens again), mark resolved, rate. A closed request takes no reply. */
function RequestActions({ t, path, onChanged }: { t: SupportTicket; path: string; onChanged: () => void }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = t.status === 'resolved' || t.status === 'closed';
  const act = async (url: string, body: unknown, after?: () => void) => {
    setBusy(true);
    setError(null);
    const r = await send('POST', url, body);
    setBusy(false);
    if (r.ok) { after?.(); onChanged(); } else setError(r.message);
  };
  return (
    <>
      {t.status !== 'closed' && (
        <form className="hc-form" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) void act(`${path}/messages`, { content: reply.trim() }, () => setReply('')); }}>
          <label className="hc-field"><span>{settled ? 'Reply to open it again' : 'Reply'}</span>
            <textarea className="c2c-input" rows={3} value={reply} maxLength={8000} onChange={(e) => setReply(e.target.value)} />
          </label>
          <div className="hc-actions">
            <button type="submit" className="btn primary" disabled={!reply.trim() || busy}>Send reply</button>
            {!settled && <button type="button" className="btn ghost" disabled={busy} onClick={() => void act(`${path}/resolve`, {})}>Mark resolved</button>}
          </div>
        </form>
      )}
      {error && <ErrorState variant="inline" title="That was not saved" message={error} onDismiss={() => setError(null)} />}
      {settled && t.openedBy.you && t.rating == null && <Rate number={t.number} onDone={onChanged} />}
      {t.rating != null && <p className="hc-coll-s">You rated the answer {t.rating} of 5.</p>}
    </>
  );
}

/** One request: what was asked, the replies, and what the person can do next. */
export function RequestView({ number, onBack }: { number: string; onBack: () => void }) {
  const [version, setVersion] = useState(0);
  const path = `/api/support/tickets/${encodeURIComponent(number)}`;
  const read = useLiveData<TicketRead>(path, [path, version]);
  const reload = () => setVersion((v) => v + 1);
  const back = <button type="button" className="hc-back" onClick={onBack}>{I.left} Help &amp; training</button>;
  if (read.loading && !read.data) return <div role="status" className="scaf-note">Loading the request…</div>;
  if (read.error || !read.data) {
    const missing = read.status === 404;
    return (
      <div className="hc-article">
        {back}
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load this request"
          hint={missing ? 'There is no support request with that number that you can see.' : 'This is a failed read. Try again.'}
          retry={missing ? undefined : reload} />
      </div>
    );
  }
  const { ticket: t, messages } = read.data;
  const waiting = !['resolved', 'closed'].includes(t.status) && messages.every((m) => m.from !== 'support');
  return (
    <article className="hc-article" aria-labelledby="hc-req-h">
      {back}
      <p className="hc-eyebrow">{t.number} · {STATUS_WORDS[t.status] ?? t.status}</p>
      <h2 id="hc-req-h" className="hc-article-t">{t.subject}</h2>
      <p className="hc-coll-s">Opened {when(t.createdAt)} by {t.openedBy.you ? 'you' : byline(t)}.</p>
      <RequestThread ticket={t} messages={messages} />
      {waiting && <p className="hc-coll-s">Support has not replied yet. A reply appears here.</p>}
      <RequestActions t={t} path={path} onChanged={reload} />
    </article>
  );
}
