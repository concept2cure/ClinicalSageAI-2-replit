/* global React, I, AUTH_SLASH_COMMANDS, AUTH_SKILLS */
const { useState, useRef, useEffect } = React;

/* ───────── Selection toolbar — fixed-positioned popover above the user's range.
   Phase 10.3 — extended with Comment and Regenerate alongside the existing
   Strengthen / Tighten / Cite / Precedent / Flag verbs. Each verb stays one
   tap; all five paths use the same governed-action audit ledger. */
function SelectionToolbar({ selection, onAction }) {
  if (!selection) return null;
  const { rect } = selection;
  const top  = Math.max(60, rect.top - 44);
  const left = Math.max(220, rect.left + rect.width / 2 - 220);
  return (
    <div className="au-seltool" style={{ top, left }}>
      <button onClick={() => onAction('strengthen')} title="Rewrite stronger against precedent">{I.sparkle} Strengthen</button>
      <button onClick={() => onAction('tighten')}    title="Shorten while preserving claims">{I.diff} Tighten</button>
      <button onClick={() => onAction('regenerate')} title="Re-draft using current source data">{I.revert} Regenerate</button>
      <div className="sep"/>
      <button onClick={() => onAction('cite')}       title="Attach evidence">{I.cite} Cite</button>
      <button onClick={() => onAction('precedent')}  title="Find regulatory precedent">{I.book} Precedent</button>
      <div className="sep"/>
      <button onClick={() => onAction('comment')}    title="Comment · @-mention a reviewer">{I.chat || I.quote} Comment</button>
      <button onClick={() => onAction('flag')}       title="Flag for reviewer attention">{I.warn} Flag</button>
    </div>
  );
}

/* ───────── Composer — multiline textarea + slash command suggestions + send. */
function Composer({ value, onChange, onSend, disabled }) {
  const taRef = useRef(null);
  const isSlash = value.startsWith('/');
  const slashFilter = isSlash ? value.slice(1).toLowerCase() : '';
  const slashItems = isSlash
    ? AUTH_SLASH_COMMANDS.filter(c => c.id.startsWith(slashFilter) || c.label.toLowerCase().startsWith('/' + slashFilter))
    : [];

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [value]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSend(value.trim());
    }
  };

  const pickSlash = (cmd) => {
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
          {slashItems.map(c => (
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
          <button className="au-chip" title="Skills"   >{I.tools} Skills</button>
          <button className="au-chip" title="Mentions" >{I.at}    Mention</button>
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

/* ───────── Skills row — quick chips for the most useful AnA commands. */
function SkillsRow({ onPick }) {
  return (
    <div className="au-suggest">
      {AUTH_SKILLS.slice(0, 6).map(s => (
        <button key={s.id} onClick={() => onPick(s)} title={s.hint}>
          {I.sparkle} {s.label}
        </button>
      ))}
    </div>
  );
}

/* ───────── Message renderers ───────── */
function ToolLine({ block }) {
  if (block.kind === 'tool') {
    return (
      <div className="tool">
        <span style={{ color:'#788c5d', display:'inline-flex' }}>{I.check}</span>
        <span><b>{block.label}</b> {block.value}</span>
      </div>
    );
  }
  if (block.kind === 'stream') {
    return (
      <div className="tool">
        <span className="spin"/>
        <span><b>Streaming</b> {block.target} <span style={{ color:'var(--text-400)' }}>{block.hint}</span></span>
      </div>
    );
  }
  return null;
}

function MessageList({ messages, pending }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, pending]);
  return (
    <div className="au-chat-scroll" ref={scrollRef}>
      <div className="au-thread">
        {messages.map((m, i) => (
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
                    if (b.kind === 'p')    return <p key={j}>{b.text}</p>;
                    if (b.kind === 'chip') return (
                      <button key={j} className="artifact-chip">
                        <span className="ico">{I.fileText}</span>
                        <span>
                          <span className="title">{b.title}</span><br/>
                          <span className="meta">{b.meta}</span>
                        </span>
                      </button>
                    );
                    return <ToolLine key={j} block={b}/>;
                  })}
                </div>
              </div>
            )
        ))}
        {pending && (
          <div className="au-msg-ai">
            <div className="avatar">A</div>
            <div className="body"><div className="au-typing"><span/><span/><span/></div></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Outer Chat wrapper used in conversation mode AND workbench inspector. */
function Chat({ title, hint, messages, pending, value, onChange, onSend, showSkills, onPickSkill }) {
  return (
    <section className="au-chat">
      <div className="au-chat-head">
        <span className="title">{title}</span>
        <span className="hint">{hint}</span>
      </div>
      <MessageList messages={messages} pending={pending}/>
      {showSkills && <SkillsRow onPick={onPickSkill}/>}
      <div className="au-chat-foot">
        <Composer value={value} onChange={onChange} onSend={onSend} disabled={pending}/>
      </div>
    </section>
  );
}

window.Conversation = { Chat, SelectionToolbar };
