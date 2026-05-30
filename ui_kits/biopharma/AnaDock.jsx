(() => {
/* Biopharma · persistent AnA dock
 * ─────────────────────────────────────────────────────────────
 * Always-present right-side conversation surface. Two states:
 *   - seam   : 32px right-edge handle, visible on every screen
 *   - dock   : 400px expanded conversation pane with agentic controls
 *
 * The dock is scope-aware: header label + suggestion chips + the
 * AnA system prompt all switch when activeNav changes. Conversation
 * history is per-scope (one thread per surface), so leaving Overview
 * and coming back resumes that surface's thread.
 *
 * In v2 this graduates to `_shared/shell/AnaDock.tsx` with the
 * `domain` + `activeNav` props plumbed in by the host shell.
 */

const { React, I, BIOPHARMA_SUGGESTIONS, HERE_LABEL_BIOPHARMA, BIOPHARMA_PROGRAMS } = window;

const MODES = [
  { id: 'standard',      label: 'Sonnet 4.5',    desc: 'Chat · reasoning · quick answers',  short: 'Standard'      },
  { id: 'deep-research', label: 'Opus 4.5',      desc: 'Drafting · multi-step · long-form', short: 'Deep research' },
  { id: 'nano-banana',   label: 'Haiku 4.5',     desc: 'Autocomplete · inline · classify',  short: 'Inline'        },
];

const GOVERNED_COMMANDS = [
  { id: 'draft',     label: '/draft',     hint: 'Draft against the active rule pack',   risk: 'low'  },
  { id: 'cite',      label: '/cite',      hint: 'Attach evidence from Vault or RIM',    risk: 'low'  },
  { id: 'precedent', label: '/precedent', hint: 'Search regulatory precedent',          risk: 'low'  },
  { id: 'compare',   label: '/compare',   hint: 'Compare against historical filings',   risk: 'low'  },
  { id: 'validate',  label: '/validate',  hint: 'Run rule-pack validators on this section', risk: 'low' },
  { id: 'submit',    label: '/submit',    hint: 'Compile and submit to the agency',     risk: 'high' },
  { id: 'lock',      label: '/lock',      hint: 'Lock this artifact for review',         risk: 'med'  },
  { id: 'respond',   label: '/respond',   hint: 'Draft HAQ response from prior submissions', risk: 'low'  },
  { id: 'flag',      label: '/flag',      hint: 'Flag for reviewer attention',           risk: 'low'  },
];

/* ───── Welcome seed per surface ───── */
function seedForScope(scope) {
  const label = HERE_LABEL_BIOPHARMA[scope] || 'Overview';
  return [{
    role: 'ana',
    blocks: [
      { kind: 'p', text: `Grounded on ${label}. I can draft, cite, validate, or run governed actions on this surface. Type / to see commands, or pick a suggestion below.` },
    ],
  }];
}

/* ───── Single message renderer ───── */
function Message({ m }) {
  if (m.role === 'user') {
    return (
      <div className="ad-msg ad-msg-user">
        {m.pre && <div className="ad-msg-pre">{m.pre}</div>}
        <div className="ad-msg-body">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="ad-msg ad-msg-ana">
      <div className="ad-avatar">A</div>
      <div className="ad-msg-body">
        {m.blocks.map((b, j) => {
          if (b.kind === 'p')   return <p key={j}>{b.text}</p>;
          if (b.kind === 'tool')return (
            <div key={j} className="ad-tool">
              <span className="ad-tool-tick">{I.check}</span>
              <span><b>{b.label}</b> {b.value}</span>
            </div>
          );
          if (b.kind === 'pending') return (
            <div key={j} className="ad-tool">
              <span className="ad-tool-spin"/>
              <span><b>{b.label}</b> {b.value}</span>
            </div>
          );
          if (b.kind === 'action') return (
            <div key={j} className="ad-action">
              <div className="ad-action-head">
                <span className="ad-action-ico">{I[b.icon] || I.sparkles}</span>
                <span><b>{b.title}</b></span>
                <span className={`ad-risk ad-risk-${b.risk || 'low'}`}>{b.risk || 'low'} risk</span>
              </div>
              <div className="ad-action-desc">{b.desc}</div>
              <div className="ad-action-btns">
                <button className="ad-action-btn ad-action-confirm">{I.check} Approve and run</button>
                <button className="ad-action-btn">Modify</button>
                <button className="ad-action-btn">Skip</button>
              </div>
            </div>
          );
          return null;
        })}
      </div>
    </div>
  );
}

/* ───── Composer with slash menu + suggestion chips ───── */
function Composer({ value, onChange, onSend, onUpload, scope, projectName, agentic, onAgenticToggle, model, onModelChange }) {
  const ref = React.useRef(null);
  const fileRef = React.useRef(null);
  const [modelOpen, setModelOpen] = React.useState(false);

  const isSlash = value.startsWith('/');
  const slashTerm = isSlash ? value.slice(1).toLowerCase() : '';
  const slashItems = isSlash
    ? GOVERNED_COMMANDS.filter(c => c.id.startsWith(slashTerm))
    : [];

  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = Math.min(ref.current.scrollHeight, 140) + 'px';
  }, [value]);

  const send = () => { if (value.trim()) onSend(value.trim()); };
  const pickSlash = (cmd) => { onChange(cmd.label + ' '); ref.current && ref.current.focus(); };

  const suggestions = (BIOPHARMA_SUGGESTIONS[scope] || []).slice(0, 3);

  return (
    <div className="ad-foot">
      {suggestions.length > 0 && !value && (
        <div className="ad-suggest">
          {suggestions.map((s, i) => (
            <button key={i} className="ad-suggest-chip" onClick={() => onSend(s)} title={s}>
              <span className="ad-suggest-spark">{I.sparkles}</span>
              <span>{s}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ad-composer">
        <textarea
          ref={ref}
          rows={1}
          placeholder="Ask AnA · type / for commands"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        {isSlash && slashItems.length > 0 && (
          <div className="ad-slash">
            {slashItems.map(c => (
              <button key={c.id} className="ad-slash-item" onMouseDown={() => pickSlash(c)}>
                <code>{c.label}</code>
                <span className="ad-slash-hint">{c.hint}</span>
                <span className={`ad-risk ad-risk-${c.risk}`}>{c.risk}</span>
              </button>
            ))}
          </div>
        )}

        <div className="ad-composer-row">
          <div className="ad-composer-left">
            <input ref={fileRef} type="file" hidden multiple onChange={(e) => {
              const files = e.target.files; if (!files || !files.length) return;
              onUpload(Array.from(files).map(f => f.name));
              e.target.value = '';
            }}/>
            <button className="ad-chip" title={`Attach a file — saved to ${projectName || 'this project'} and added to project memory`} onClick={() => fileRef.current && fileRef.current.click()}>{I.attach}</button>
            <button className="ad-chip" title="Mention reviewer">{I.users || I.user}</button>
            <button className="ad-chip" onClick={onAgenticToggle} title={agentic ? 'Switch to Suggest only' : 'Switch to Act without asking'}>
              {agentic ? (
                <><span style={{ color: 'var(--accent-main-100)', display:'inline-flex' }}>{I.sparkles}</span><span>Act without asking</span></>
              ) : (
                <><span style={{ color:'var(--text-300)', display:'inline-flex' }}>{I.shield || I.shieldCheck}</span><span>Suggest only</span></>
              )}
            </button>
          </div>
          <div className="ad-composer-right">
            <div className="ad-model-wrap">
              <button className="ad-chip ad-model" onClick={() => setModelOpen(o => !o)} title="Model">
                <span>{model.short}</span>
                <span style={{ color: 'var(--text-400)', display:'inline-flex' }}>{I.down}</span>
              </button>
              {modelOpen && (
                <div className="ad-pop">
                  {MODES.map(m => (
                    <button key={m.id} className="ad-pop-item" data-active={m.id===model.id || undefined}
                            onClick={() => { onModelChange(m); setModelOpen(false); }}>
                      <div><b>{m.short}</b><div className="ad-pop-desc">{m.label} · {m.desc}</div></div>
                      {m.id===model.id && <span style={{ color: 'var(--accent-main-100)', display:'inline-flex' }}>{I.check}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="ad-send" onClick={send} disabled={!value.trim()} title="Send · Enter">
              {I.arrowUp}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Dock body ───── */
function AnaDock({ activeNav, open, onClose }) {
  const scope = activeNav;
  const label = HERE_LABEL_BIOPHARMA[scope] || 'Overview';

  /* Per-scope thread storage. Keyed by surface so each screen keeps its own. */
  const [threads, setThreads] = React.useState({});
  const messages = threads[scope] || seedForScope(scope);
  const [draft,   setDraft]   = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [agentic, setAgentic] = React.useState(false);
  const [model,   setModel]   = React.useState(MODES[1]);

  const setMessages = (updater) => {
    setThreads(prev => ({
      ...prev,
      [scope]: typeof updater === 'function' ? updater(prev[scope] || seedForScope(scope)) : updater,
    }));
  };

  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, pending, open]);

  const send = (text) => {
    setMessages(m => [...m, { role: 'user', text }]);
    setDraft('');
    setPending(true);
    setTimeout(() => {
      setPending(false);
      // If slash command or agentic-mode + a meaningful action verb, render
      // a governed-action card. Otherwise reply conversationally.
      const isCommand = text.startsWith('/');
      const isAction  = isCommand || /^(submit|file|lock|approve|run|compile|publish)/i.test(text);
      if (isAction) {
        const cmd = isCommand ? text.split(/\s+/)[0].slice(1) : 'draft';
        const meta = GOVERNED_COMMANDS.find(c => c.id === cmd) || GOVERNED_COMMANDS[0];
        setMessages(m => [...m, { role: 'ana', blocks: [
          { kind: 'tool',  label: 'Scope',  value: `${label} · ${model.short}` },
          { kind: 'tool',  label: 'Audit',  value: `21 CFR Part 11 · reason will be captured` },
          { kind: 'action', icon: 'sparkles', title: meta.label + ' ' + (text.replace(meta.label, '').trim() || `for ${label}`), risk: meta.risk,
            desc: agentic
              ? `Act-without-asking is ON — I would have executed this automatically. Click Approve to commit, Modify to adjust, or Skip to discard.`
              : `Suggest-only mode — I drafted the action. Approve to run it through the governed pipeline (writes an audit row), Modify to revise, or Skip to discard.`,
          },
        ]}]);
      } else {
        setMessages(m => [...m, { role: 'ana', blocks: [
          { kind: 'tool', label: 'Grounded', value: `${label} · ${model.short}` },
          { kind: 'p',    text: `I'd reflect that against the active rule pack and your evidence corpus. The live AnA wires this to /api/ana-ri/stream with moduleContext={workstream:'biopharma', activeNav:'${scope}', authoringView: '${agentic ? 'agentic':'suggest'}'}.` },
        ]}]);
      }
    }, 800);
  };

  const newThread = () => setMessages(seedForScope(scope));

  if (!open) return null;

  return (
    <aside className="ad-dock" aria-label="AnA assistant">
      <div className="ad-head">
        <div className="ad-head-title">
          <span className="ad-head-mark">{I.sparkles}</span>
          <div>
            <div className="ad-head-name">AnA</div>
            <div className="ad-head-scope">{label}</div>
          </div>
        </div>
        <div className="ad-head-actions">
          <button className="ad-head-btn" onClick={newThread} title="New thread">{I.plus}</button>
          <button className="ad-head-btn" title="History">{I.history || I.clock}</button>
          <button className="ad-head-btn" title="Pin / Close" onClick={onClose}>{I.close}</button>
        </div>
      </div>

      <div className="ad-scroll" ref={scrollRef}>
        <div className="ad-thread">
          {messages.map((m, i) => <Message key={i} m={m}/>)}
          {pending && (
            <div className="ad-msg ad-msg-ana">
              <div className="ad-avatar">A</div>
              <div className="ad-msg-body"><div className="ad-typing"><span/><span/><span/></div></div>
            </div>
          )}
        </div>
      </div>

      <Composer
        value={draft} onChange={setDraft} onSend={send}
        onUpload={(names) => {
          const list = names.join(', ');
          setMessages(m => [...m, { role: 'user', text: `Uploaded: ${list}` }]);
          setPending(true);
          setTimeout(() => {
            setPending(false);
            setMessages(m => [...m, { role: 'ana', blocks: [
              { kind: 'tool', label: 'Saved',  value: `${list} → ${label} · stored in project vault` },
              { kind: 'tool', label: 'Memory', value: `Project memory updated · AnA can now ground on these` },
              { kind: 'p',    text: `Filed ${names.length} file${names.length>1?'s':''} to ${label}. I classified ${names.length>1?'them':'it'} and linked to the most relevant section — say the word and I'll draft from ${names.length>1?'them':'it'}.` },
            ]}]);
          }, 900);
        }}
        scope={scope}
        projectName={label}
        agentic={agentic} onAgenticToggle={() => setAgentic(a => !a)}
        model={model} onModelChange={setModel}
      />
    </aside>
  );
}

/* ───── Seam (when dock closed) ───── */
function AnaSeam({ onOpen }) {
  return (
    <aside className="ana-seam" aria-label="AnA assistant (collapsed)">
      <button className="ana-seam-btn" onClick={onOpen} title="Open AnA · ⌘\\">
        <span className="ana-seam-mark">✻</span>
        <span className="ana-seam-label">AnA</span>
      </button>
    </aside>
  );
}

window.AnaDock = AnaDock;
window.AnaSeam = AnaSeam;

})();
