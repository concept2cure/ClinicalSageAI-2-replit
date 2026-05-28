// ProjectThread — AnA conversation thread for a project. Port of ui_kits/projects/App.jsx Thread.

import * as React from 'react';
import { useAnaChat, type AnaChatMessage } from '../../components/ana/useAnaChat';

interface ProjectThreadProps {
  projectId: string;
  projectName?: string | null;
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60_000);
  if (mins < 2)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function TurnChips({ message }: { message: AnaChatMessage }) {
  if (!message.toolCalls?.length && !message.executedActions?.length) return null;
  const chips = [
    ...(message.toolCalls ?? []).map(t => ({ label: t.label ?? t.name ?? 'Tool' })),
    ...(message.executedActions ?? []).map(a => ({ label: a.label ?? a.actionType ?? 'Action' })),
  ];
  return (
    <div className="chips">
      {chips.map((c, i) => (
        <span key={i} className="chip">{c.label}</span>
      ))}
    </div>
  );
}

export function ProjectThread({ projectId, projectName }: ProjectThreadProps) {
  const [draft, setDraft] = React.useState('');
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const anaChat = useAnaChat({
    projectId,
    projectName: projectName ?? null,
    screenName: 'Project detail',
    moduleContext: { workstream: 'project', projectId },
  });

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [anaChat.messages.length]);

  function handleSend() {
    const text = draft.trim();
    if (!text || anaChat.isStreaming) return;
    setDraft('');
    void anaChat.send(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      <div className="pj-thread">
        {anaChat.messages.length === 0 && !anaChat.isStreaming && (
          <div style={{ padding: '24px 0', color: 'var(--text-400)', fontSize: 12 }}>
            No conversation yet. Ask AnA something about this project.
          </div>
        )}
        {anaChat.messages.map((msg: AnaChatMessage) => {
          const isAna = msg.role === 'assistant';
          const displayName = isAna ? 'AnA' : 'You';
          const av = isAna ? 'A' : 'Y';
          const when = msg.sentAt != null ? relTime(msg.sentAt) : 'just now';
          const body = msg.text || (msg.streaming ? msg.statusPhase || 'Routing…' : '');
          return (
            <div key={msg.id} className={`pj-turn ${isAna ? 'ana' : 'user'}`}>
              <div className="av">{av}</div>
              <div className="body">
                <div className="who">
                  <b>{displayName}</b>
                  <span>{when}</span>
                </div>
                <p className="text">{body}{msg.streaming && <span className="caret">▍</span>}</p>
                <TurnChips message={msg} />
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="pj-composer">
        <textarea
          rows={1}
          placeholder="Continue the project conversation, or open a section…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={anaChat.isStreaming}
        />
        <div className="row">
          <div className="left">
            <button disabled={anaChat.isStreaming} onClick={() => anaChat.reset()}>AnA 1.0</button>
          </div>
          <button
            className="send"
            title="Send"
            disabled={!draft.trim() || anaChat.isStreaming}
            onClick={handleSend}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
