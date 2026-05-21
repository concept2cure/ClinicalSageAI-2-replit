/* global React, I, MDX_NAV_ITEMS, MDX_NAV_V2, MDX_NAV_GROUPS, MDX_SUGGESTIONS, ANA_MODES, ANA_TOOLS */
/* Shell: Rail (left), TopBar, TabBar, CmdK palette, AnA rail (right).
   AnA is the Concept2Cure RI assistant — this file is just its surface.
   All model calls route through the server-side AI gateway; the UI never
   touches the Anthropic API. Mode → model mapping lives in ANA_MODES. */

const { useState, useEffect, useRef, useMemo } = React;

/* ─────────────────────────────────────────────────────────────
   Rail
   ───────────────────────────────────────────────────────────── */
function Rail({ activeNav, setActiveNav, collapsed, setCollapsed, user }) {
  /* Prefer the new v2 nav (15 items, 4 tiers — mirrors zen-app-constants.ts).
     Falls back to legacy MDX_NAV_ITEMS if v2 isn't loaded. */
  const items  = (typeof MDX_NAV_V2 !== 'undefined' && MDX_NAV_V2) ? MDX_NAV_V2 : MDX_NAV_ITEMS;
  const groups = (typeof MDX_NAV_GROUPS !== 'undefined' && MDX_NAV_GROUPS) ? MDX_NAV_GROUPS : [
    { id: 'workstream', label: 'Workstream' },
    { id: 'work',       label: 'Workspace' },
    { id: 'system',     label: '' },
  ];

  const renderItem = (item) => {
    const Cn = I[item.icon];
    const isActive = activeNav === item.id;
    if (item.href) {
      return (
        <a key={item.id} className="nav-item" href={item.href} title={collapsed ? item.label : undefined}>
          <span className="ico">{Cn}</span><span className="lbl">{item.label}</span>
        </a>
      );
    }
    return (
      <button
        key={item.id}
        className="nav-item"
        aria-current={isActive || undefined}
        onClick={() => setActiveNav(item.id)}
        title={collapsed ? item.label : undefined}
      >
        <span className="ico">{Cn}</span>
        <span className="lbl">{item.label}</span>
        {item.meta && <span className="nav-meta">{item.meta}</span>}
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-top">
        <div className="rail-logo">
          <img src="assets/concept2cure-icon.svg" alt=""/>
          <div className="rail-logo-text">Concept2Cure<span>.RI</span></div>
        </div>
        <button className="rail-collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          {I.panelLeft}
        </button>
      </div>
      {groups.map(g => {
        const gItems = items.filter(i => i.group === g.id);
        if (!gItems.length) return null;
        return (
          <React.Fragment key={g.id}>
            {g.label && <div className="rail-section">{g.label}</div>}
            <div className="rail-nav">{gItems.map(renderItem)}</div>
          </React.Fragment>
        );
      })}
      <div className="rail-spacer"/>
      <button className="rail-account" title={user.name}>
        <div className="avatar">{user.initials}</div>
        <div className="who">
          <div className="name">{user.name}</div>
          <div className="plan">{user.role}</div>
        </div>
        <span className="chev">{I.down}</span>
      </button>
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
   TopBar
   ───────────────────────────────────────────────────────────── */
function TopBar({ hereLabel, program, onOpenPalette }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <a href="../home/index.html" style={{color:'inherit',textDecoration:'none'}}>Concept2Cure.RI</a>
        <span className="sep">›</span>
        <span>Medical Device and Diagnostics</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer"/>
      {program && (
        <button className="tb-pill" title="Active program">
          <span className="dot"/>
          <span>{program.code} · {program.title.split(' ').slice(0, 2).join(' ')}</span>
          <span style={{color:'var(--text-400)'}}>{I.down}</span>
        </button>
      )}

      {/* ⌘K command bar trigger — primary entry to AnA + navigation.
          The keyboard shortcut is global (see CmdK component); the button
          is the discoverable affordance. Shows the shortcut so users learn it. */}
      <button className="tb-cmdk" onClick={onOpenPalette} title="Command · ⌘K">
        <span className="ico">{I.search}</span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>

      <div className="tb-actions">
        <button className="tb-btn" title="Filter">{I.filter}</button>
        <button className="tb-btn" title="Notifications">{I.bell}</button>
        <button className="tb-btn" title="Help">{I.help}</button>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────
   TabBar
   ───────────────────────────────────────────────────────────── */
function TabBar({ activeNav, setActiveNav }) {
  const tabs = [
    { id: 'overview',  label: 'Overview',        icon: 'grid',        count: 4 },
    { id: 'k510',      label: '510(k)',          icon: 'file',        count: 6 },
    { id: 'pma',       label: 'PMA',             icon: 'shieldCheck', count: 3 },
    { id: 'cer',       label: 'CER',             icon: 'microscope',  count: 2 },
    { id: 'predicate', label: 'Precedent intel', icon: 'scale' },
  ];
  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button
          key={t.id} className="tab"
          aria-current={activeNav === t.id || undefined}
          onClick={() => setActiveNav(t.id)}
        >
          <span className="ico">{I[t.icon]}</span>
          <span>{t.label}</span>
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ⌘K command palette
   First keystroke routes:
     "/"    → navigate (surfaces, programs)
     ">"    → run a RIM tool (search_predicates, …)
     else   → ask AnA (sends to gateway in the resolved mode)
   ───────────────────────────────────────────────────────────── */
function CmdK({ open, onClose, activeNav, program, setActiveNav, onAskAna, mode, setMode }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const navRoutes = [
    { id: 'overview',  label: 'Overview',                 hint: 'Portfolio health · programs' },
    { id: 'k510',      label: '510(k) submissions',       hint: 'Predicate, SE matrix, eSTAR' },
    { id: 'pma',       label: 'PMA submissions',          hint: '10-phase workflow · modules' },
    { id: 'cer',       label: 'CER generator',            hint: 'Signals · literature · Article 61' },
    { id: 'predicate', label: 'Precedent intelligence',   hint: 'Cross-agency patterns' },
    { id: 'engineering', label: 'Device engineering',     hint: 'ISO 14971 · cybersecurity · biocompat' },
    { id: 'udi',        label: 'UDI and labeling',        hint: 'GUDID · regional labels' },
    { id: 'postmarket', label: 'Post-market vigilance',   hint: 'MDR · signal trends' },
  ];

  const mode_ = q.startsWith('/') ? 'nav' : q.startsWith('>') ? 'tool' : (q.trim() ? 'ask' : 'mixed');
  const term = q.replace(/^[\/>]\s?/, '').toLowerCase();

  const items = useMemo(() => {
    if (mode_ === 'nav') {
      return navRoutes
        .filter(r => !term || r.label.toLowerCase().includes(term) || r.hint.toLowerCase().includes(term))
        .map(r => ({ ...r, kind: 'nav' }));
    }
    if (mode_ === 'tool') {
      return ANA_TOOLS
        .filter(t => !term || t.label.toLowerCase().includes(term) || t.desc.toLowerCase().includes(term) || t.group.toLowerCase().includes(term))
        .map(t => ({ id: t.id, label: t.label, hint: `${t.group} · ${t.desc}`, kind: 'tool' }));
    }
    if (mode_ === 'ask') {
      return [
        { id: 'ask', label: `Ask AnA: "${q.trim()}"`, hint: `Runs in ${ANA_MODES.find(m => m.id === mode).label} · ${ANA_MODES.find(m => m.id === mode).model}`, kind: 'ask' },
        ...(MDX_SUGGESTIONS[activeNav] || []).map((s, i) => ({ id: `sg-${i}`, label: s, hint: 'Suggested for this surface', kind: 'suggest' })),
      ];
    }
    // mixed — empty query shows recent + suggestions + nav preview
    return [
      ...(MDX_SUGGESTIONS[activeNav] || []).slice(0, 3).map((s, i) => ({ id: `sg-${i}`, label: s, hint: 'Suggested for this surface', kind: 'suggest' })),
      { id: 'hint-nav',  label: 'Type "/" to jump to a surface',                   hint: 'Navigation',      kind: 'hint' },
      { id: 'hint-tool', label: 'Type ">" to run a RIM tool',                      hint: 'Tools',           kind: 'hint' },
      { id: 'hint-ask',  label: 'Or just type a question — AnA routes via gateway',hint: 'Ask',             kind: 'hint' },
    ];
  }, [q, mode_, term, activeNav, mode]);

  const run = (item) => {
    if (!item) return;
    if (item.kind === 'nav')      { setActiveNav(item.id); }
    else if (item.kind === 'tool')     { onAskAna(`>${item.id}`, { tool: item.id }); }
    else if (item.kind === 'ask')      { onAskAna(q.trim()); }
    else if (item.kind === 'suggest')  { onAskAna(item.label); }
    else if (item.kind === 'hint')     { return; }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
      else if (e.key === 'Enter')     { e.preventDefault(); run(items[sel]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, sel]);

  if (!open) return null;

  return (
    <div className="cmdk-backdrop" onClick={onClose} role="dialog" aria-label="Command palette">
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span className="cmdk-leading">{I.search}</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            value={q}
            onChange={e => { setQ(e.target.value); setSel(0); }}
            placeholder='Ask AnA, "/" to navigate, ">" for a tool…'
          />
          <div className="cmdk-mode-chip" title={`${ANA_MODES.find(m => m.id === mode).label} · ${ANA_MODES.find(m => m.id === mode).model}`}>
            <span className="dot"/>
            {ANA_MODES.find(m => m.id === mode).label}
          </div>
        </div>

        <div className="cmdk-context">
          {program ? (
            <><span className="lbl">Context</span> <span className="val">{program.code} · {program.title}</span></>
          ) : (
            <><span className="lbl">Context</span> <span className="val">Medical Device and Diagnostics · {activeNav}</span></>
          )}
        </div>

        <div className="cmdk-list" role="listbox">
          {items.map((item, i) => (
            <button
              key={item.id}
              className={`cmdk-item${sel === i ? ' on' : ''}`}
              role="option"
              aria-selected={sel === i}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(item)}
            >
              <span className="cmdk-kind" data-kind={item.kind}>
                {item.kind === 'nav'     && I.arrowRight}
                {item.kind === 'tool'    && I.zap}
                {item.kind === 'ask'     && I.sparkles}
                {item.kind === 'suggest' && I.sparkles}
                {item.kind === 'hint'    && I.help}
              </span>
              <span className="cmdk-label">{item.label}</span>
              <span className="cmdk-hint">{item.hint}</span>
            </button>
          ))}
        </div>

        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
          <div className="cmdk-foot-spacer"/>
          <span>
            Mode:{' '}
            {ANA_MODES.map(m => (
              <button
                key={m.id}
                className={`cmdk-mode-btn${mode === m.id ? ' on' : ''}`}
                onClick={() => setMode(m.id)}
                title={`${m.desc} · routes to ${m.model}`}
              >
                {m.label}
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   AnA rail — right-edge persistent surface.
   - Default: 32px seam. No pulse, no ornament. Just an edge.
   - Click seam → expand to 400px. Keyboard: ⌘\ to toggle.
   - Header: "AnA" + "Claude {model}" metadata + mode chip.
   - Body: context · suggestions · recent · composer.
   - Collapse: seam X button or ⌘\.
   State persists in localStorage (mdx.anaCollapsed).
   ───────────────────────────────────────────────────────────── */
function AnaRail({ open, setOpen, activeNav, program, mode, setMode, messages, onSend }) {
  const [draft, setDraft] = useState('');
  const suggestions = MDX_SUGGESTIONS[activeNav] || MDX_SUGGESTIONS.overview;
  const modelName = ANA_MODES.find(m => m.id === mode).model;

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  if (!open) {
    // Seam: 32px strip on right edge. Two quiet affordances (click anywhere to
    // open; small sparkle mid-way). No pulse, no icon soup, no "badge" counters.
    return (
      <aside className="ana-seam" aria-label="AnA assistant (collapsed)">
        <button className="ana-seam-btn" onClick={() => setOpen(true)} title="Open AnA · ⌘\">
          <span className="ana-seam-mark">✻</span>
          <span className="ana-seam-label">AnA</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="ana-rail" aria-label="AnA assistant">
      <div className="ana-rail-hdr">
        <div className="ana-id">
          <span className="ana-id-mark">✻</span>
          <div className="ana-id-text">
            <div className="ana-id-name">AnA 1.0 RI</div>
            <div className="ana-id-model">Claude {modelName}</div>
          </div>
        </div>
        <div className="ana-rail-actions">
          <button className="tb-btn" title="History">{I.clock}</button>
          <button className="tb-btn" title="New thread">{I.plus}</button>
          <button className="tb-btn" onClick={() => setOpen(false)} title="Collapse · ⌘\">{I.panelRight || I.panelLeft}</button>
        </div>
      </div>

      {/* Mode selector — intent, not model. Resolves to a Claude model server-side. */}
      <div className="ana-mode-row">
        {ANA_MODES.map(m => (
          <button
            key={m.id}
            className={`ana-mode-btn${mode === m.id ? ' on' : ''}`}
            onClick={() => setMode(m.id)}
            title={`${m.desc} · Claude ${m.model}`}
          >
            <span className="lbl">{m.label}</span>
            <span className="sub">{m.model}</span>
          </button>
        ))}
      </div>

      <div className="ana-rail-body">
        {program && (
          <div className="ana-context">
            <div className="lbl">Context</div>
            <div className="val">{program.code} · {program.title}</div>
            <div className="sub">{program.stage} · {program.readiness}% ready</div>
          </div>
        )}

        <div className="ana-section-label">Suggested for this surface</div>
        {suggestions.map((s, i) => (
          <button key={i} className="ana-suggestion" onClick={() => { onSend(s); }}>
            <span className="ico">{I.sparkles}</span>
            <span>{s}</span>
          </button>
        ))}

        <div className="ana-section-label" style={{ marginTop: 8 }}>Thread</div>
        {messages.length === 0 && (
          <div className="ana-empty">
            No messages yet. Use ⌘K for quick asks, or type below.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ana-msg ${m.role}`}>
            <div className="who">
              {m.role === 'ana' ? `AnA · ${ANA_MODES.find(x => x.id === m.mode)?.model || modelName}` : 'You'} · {m.when}
            </div>
            <div className="body">{m.body}</div>
          </div>
        ))}
      </div>

      <div className="ana-rail-foot">
        <div className="ana-composer">
          <textarea
            rows={1}
            placeholder="Ask AnA about this workspace…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button className="ana-send" disabled={!draft.trim()} title="Send" onClick={send}>
            {I.arrowUp}
          </button>
        </div>
        <div className="ana-foot-meta">
          Routes via AI gateway · Claude {modelName}
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { Rail, TopBar, TabBar, CmdK, AnaRail });
