/**
 * Universal Authoring — conversation surface (Chat, Composer, Skills,
 * SelectionToolbar). Port of ui_kits/authoring/Conversation.jsx.
 *
 * @module client/src/concept2cure/authoring/conversation/Conversation
 */

import * as React from 'react';
import { I } from '../icons';
import { AUTH_SLASH_COMMANDS, AUTH_SKILLS, type AuthMessage, type Block, type Skill } from '../data';

export interface SelectionRect { top: number; left: number; width: number; height: number; }
export interface AuthSelection { paragraphId: string; text: string; rect: SelectionRect; }
export type SelectionAction = 'strengthen' | 'tighten' | 'regenerate' | 'cite' | 'precedent' | 'comment' | 'flag';

/* ───────── Selection toolbar ───────── */
export function SelectionToolbar({ selection, onAction }: { selection: AuthSelection | null; onAction: (a: SelectionAction) => void }) {
  if (!selection) return null;
  const { rect } = selection;
  const top = Math.max(60, rect.top - 44);
  const left = Math.max(220, rect.left + rect.width / 2 - 220);
  return (
    <div className="au-seltool" style={{ top, left }}>
      <button onClick={() => onAction('strengthen')} title="Rewrite stronger against precedent">{I.sparkle} Strengthen</button>
      <button onClick={() => onAction('tighten')} title="Shorten while preserving claims">{I.diff} Tighten</button>
      <button onClick={() => onAction('regenerate')} title="Re-draft using current source data">{I.revert} Regenerate</button>
      <div className="sep" />
      <button onClick={() => onAction('cite')} title="Attach evidence">{I.cite} Cite</button>
      <button onClick={() => onAction('precedent')} title="Find regulatory precedent">{I.book} Precedent</button>
      <div className="sep" />
      <button onClick={() => onAction('comment')} title="Comment · @-mention a reviewer">{I.quote} Comment</button>
      <button onClick={() => onAction('flag')} title="Flag for reviewer attention">{I.warn} Flag</button>
    </div>
  );
}

/* ───────── Composer ───────── */
function Composer({ value, onChange, onSend, disabled }: { value: string; onChange: (v: string) => void; onSend: (v: string) => void; disabled?: boolean }) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const isSlash = value.startsWith('/');
  const slashFilter = isSlash ? value.slice(1).toLowerCase() : '';
  const slashItems = isSlash
    ? AUTH_SLASH_COMMANDS.filter((c) => c.id.startsWith(slashFilter) || c.label.toLowerCase().startsWith('/' + slashFilter))
    : [];

  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [value]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSend(value.trim());
    }
  };

  const pickSlash = (cmd: { label: string }) => {
    onChange(cmd.label + ' ');
    taRef.current && taRef.current.focus();
  };

  return (
    <div className="au-composer">
      <textarea
        ref={taRef}
        rows={1}
        placeholder="Ask AnA · type / for commands"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
      />
      {isSlash && slashItems.length > 0 && (
        <div className="au-slash">
          {slashItems.map((c) => (
            <button key={c.id} className="au-slash-item" onMouseDown={() => pickSlash(c)}>
              <code>{c.label}</code>
              <span className="hint">{c.hint}</span>
            </button>
          ))}
        </div>
      )}
      <div className="au-composer-row">
        <div className="left">
          <button className="au-chip" title="Attach evidence">{I.attach}</button>
          <button className="au-chip" title="Skills">{I.tools} Skills</button>
          <button className="au-chip" title="Mentions">{I.at} Mention</button>
          <button className="au-chip" title="Model">c2c-Opus 4.7 {I.chevronDn}</button>
        </div>
        <div className="right">
          <button className="au-chip" title="Command palette (⌘K)">{I.command}</button>
          <button className="au-send" disabled={!value.trim()} onClick={() => onSend(value.trim())} title="Send (Enter)">
            {I.arrowUp}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Skills row ───────── */
function SkillsRow({ onPick }: { onPick: (s: Skill) => void }) {
  return (
    <div className="au-suggest">
      {AUTH_SKILLS.slice(0, 6).map((s) => (
        <button key={s.id} onClick={() => onPick(s)} title={s.hint}>
          {I.sparkle} {s.label}
        </button>
      ))}
    </div>
  );
}

/* ───────── Message renderers ───────── */
function ToolLine({ block }: { block: Block }) {
  if (block.kind === 'tool') {
    return (
      <div className="tool">
        <span style={{ color: '#788c5d', display: 'inline-flex' }}>{I.check}</span>
        <span><b>{block.label}</b> {block.value}</span>
      </div>
    );
  }
  if (block.kind === 'stream') {
    return (
      <div className="tool">
        <span className="spin" />
        <span><b>Streaming</b> {block.target} <span style={{ color: 'var(--text-400)' }}>{block.hint}</span></span>
      </div>
    );
  }
  return null;
}

function MessageList({ messages, pending }: { messages: AuthMessage[]; pending: boolean }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, pending]);
  return (
    <div className="au-chat-scroll" ref={scrollRef}>
      <div className="au-thread">
        {messages.map((m, i) =>
          m.role === 'user'
            ? (
              <div key={i} className="au-msg-user">
                {m.pre && <div className="pre">{m.pre}</div>}
                {m.text}
              </div>
            )
            : (
              <div key={i} className="au-msg-ai">
                <div className="avatar">A</div>
                <div className="body">
                  {m.blocks.map((b, j) => {
                    if (b.kind === 'p') return <p key={j}>{b.text}</p>;
                    if (b.kind === 'chip') return (
                      <button key={j} className="artifact-chip">
                        <span className="ico">{I.fileText}</span>
                        <span>
                          <span className="title">{b.title}</span><br />
                          <span className="meta">{b.meta}</span>
                        </span>
                      </button>
                    );
                    return <ToolLine key={j} block={b} />;
                  })}
                </div>
              </div>
            ),
        )}
        {pending && (
          <div className="au-msg-ai">
            <div className="avatar">A</div>
            <div className="body"><div className="au-typing"><span /><span /><span /></div></div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface ChatProps {
  title: string;
  hint: string;
  messages: AuthMessage[];
  pending: boolean;
  value: string;
  onChange: (v: string) => void;
  onSend: (v: string) => void;
  showSkills: boolean;
  onPickSkill: (s: Skill) => void;
}

export function Chat({ title, hint, messages, pending, value, onChange, onSend, showSkills, onPickSkill }: ChatProps) {
  return (
    <section className="au-chat">
      <div className="au-chat-head">
        <span className="title">{title}</span>
        <span className="hint">{hint}</span>
      </div>
      <MessageList messages={messages} pending={pending} />
      {showSkills && <SkillsRow onPick={onPickSkill} />}
      <div className="au-chat-foot">
        <Composer value={value} onChange={onChange} onSend={onSend} disabled={pending} />
      </div>
    </section>
  );
}
