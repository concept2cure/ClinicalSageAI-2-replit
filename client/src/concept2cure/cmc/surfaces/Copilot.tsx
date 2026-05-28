// CMC copilot — chat surface wired to POST /api/cmc/cmc-copilot/query.
// Each turn is a live round-trip; responses render in the transcript.

import * as React from 'react';
import { useCmcCopilot } from '../../hooks/useCMC';
import { CmcIcon } from '../icons';
import { CMC_SUGGESTIONS } from '../data/nav';
import { ErrorState } from './state';

interface Msg { role: 'you' | 'ana'; body: string; }

export function CmcCopilot({ projectId }: { projectId: string | null }) {
  const copilot = useCmcCopilot();
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [draft, setDraft] = React.useState('');
  const logRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, copilot.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || copilot.isPending) return;
    setMessages(prev => [...prev, { role: 'you', body: trimmed }]);
    setDraft('');
    copilot.mutate(
      { query: trimmed, context: { workstream: 'cmc', projectId: projectId ?? undefined } },
      {
        onSuccess: (data) => {
          const reply = (data?.response as string)
            ?? (typeof data === 'string' ? data : JSON.stringify(data));
          setMessages(prev => [...prev, { role: 'ana', body: reply || 'No response returned.' }]);
        },
      },
    );
  };

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">CMC copilot</h1>
          <div className="bp-meta">Ask CMC and regulatory questions grounded in your project</div>
        </div>
      </div>

      <div className="bp-card" style={{ padding: 16 }}>
        <div className="cmc-chat">
          <div className="cmc-chat-log" ref={logRef}>
            {messages.length === 0 && (
              <div className="bp-od-starters" style={{ marginTop: 0 }}>
                {CMC_SUGGESTIONS.copilot.map((s, i) => (
                  <button key={i} className="bp-od-starter" type="button" onClick={() => send(s)}>
                    <span className="bp-od-starter-ico"><CmcIcon name="sparkles" /></span>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`cmc-chat-msg ${m.role}`}>{m.body}</div>
            ))}
            {copilot.isPending && <div className="cmc-chat-msg ana">Thinking…</div>}
          </div>

          {copilot.isError && <ErrorState message={copilot.error?.message ?? 'The copilot service is unavailable.'} />}

          <form
            style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
            onSubmit={e => { e.preventDefault(); send(draft); }}>
            <textarea
              rows={2}
              aria-label="Ask the CMC copilot"
              placeholder="Ask about specifications, stability, ICH guidance…"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); }
              }}
              disabled={copilot.isPending}
              style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical', background: 'var(--bg-000)', color: 'var(--text-100)' }}
            />
            <button className="bp-btn-primary" type="submit" disabled={!draft.trim() || copilot.isPending} aria-label="Send">
              <CmcIcon name="send" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
