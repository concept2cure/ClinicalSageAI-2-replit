/* global React, I, NAV_ITEMS, MODULES */
/* Three new home-screen widgets: domain scope switcher, AnA proactive card, ⌘K palette. */
const { useState: useStateExt, useEffect: useEffectExt, useRef: useRefExt, useMemo } = React;

/* ─────────────────────────────────────────────────────────
   Domain scope switcher (topbar)
   ───────────────────────────────────────────────────────── */
function ScopeSwitcher({ scope, setScope }) {
  const opts = [
    { id: 'all',       label: 'All',        ico: 'globe' },
    { id: 'biopharma', label: 'Biopharma',  ico: 'atom' },
    { id: 'mdx',       label: 'Device/Dx',  ico: 'stethoscope' },
  ];
  return (
    <div className="scope" role="tablist" aria-label="Domain scope">
      {opts.map(o => (
        <button key={o.id}
          className="scope-btn"
          data-on={scope === o.id}
          role="tab" aria-selected={scope === o.id}
          onClick={() => setScope(o.id)}
        >
          <span className="ico">{I[o.ico]}</span>{o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   AnA proactive card — "3 things need you today"
   ───────────────────────────────────────────────────────── */
function AnaCard({ scope, onOpenPalette }) {
  const [dismissed, setDismissed] = useStateExt(false);
  if (dismissed) return null;

  const items = {
    all: [
      { num: '01', t: "Review J. Chen's biostat SAP — 2 comments open",             meta: 'BX-204 · due today' },
      { num: '02', t: 'Resolve 2 gaps on EMA scientific advice prep',                meta: 'Pack · ready to ship' },
      { num: '03', t: 'Approve §3.2.S Drug substance for NDA 212345',                meta: 'Readiness 87%' },
    ],
    biopharma: [
      { num: '01', t: 'Approve §3.2.S Drug substance for NDA 212345',                meta: 'Readiness 87%' },
      { num: '02', t: 'Resolve 2 gaps on EMA scientific advice prep',                meta: 'Pack · ready to ship' },
      { num: '03', t: 'Confirm pediatric plan harmonization across FDA/EMA',         meta: 'iPSP · PIP' },
    ],
    mdx: [
      { num: '01', t: 'Finalize 510(k) predicate analysis — 14 candidates',          meta: 'BX-204 device · SE arg.' },
      { num: '02', t: 'Sign off UDI-DI assignments for Class II portfolio',          meta: '23 devices' },
      { num: '03', t: 'Close 3 post-market vigilance cases',                         meta: 'MedWatch · due Fri' },
    ],
  }[scope] || [];

  return (
    <div className="ana-card" role="region" aria-label="AnA briefing">
      <div className="ana-head">
        <div className="ana-avatar">A</div>
        <div className="ana-title">AnA · morning briefing <span className="when">· 3 minutes ago</span></div>
        <button className="ana-dismiss" onClick={() => setDismissed(true)} title="Dismiss">{I.close}</button>
      </div>
      <div className="ana-body">
        <strong>{items.length} things need you today.</strong> I've scanned your projects, reviews and agency feeds — here's what's time-sensitive, ordered by impact.
      </div>
      <div className="ana-items">
        {items.map((it, i) => (
          <button key={i} className="ana-item">
            <span className="num">{it.num}</span>
            <span>{it.t}</span>
            <span className="meta">{it.meta}</span>
          </button>
        ))}
      </div>
      <div className="ana-actions">
        <button className="ana-btn primary">Start with #1 {I.arrowRight}</button>
        <button className="ana-btn ghost" onClick={onOpenPalette}>See all tasks</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Command palette (⌘K)
   ───────────────────────────────────────────────────────── */
function CommandPalette({ open, onClose, onNavigate }) {
  const [q, setQ] = useStateExt('');
  const [focusIdx, setFocusIdx] = useStateExt(0);
  const inputRef = useRefExt(null);

  // Build searchable pool: nav items + module descriptions + a few AnA shortcuts + recents
  const pool = useMemo(() => {
    const nav = NAV_ITEMS.map(n => ({ kind: 'Module', label: n.label, icon: n.icon, id: n.id }));
    const ana = [
      { kind: 'Ask AnA', label: 'Draft CTD Section 2.5',     icon: 'file',  id: 'ana.draft25' },
      { kind: 'Ask AnA', label: 'Find 510(k) predicates',    icon: 'search',id: 'ana.510k' },
      { kind: 'Ask AnA', label: 'Review biostat SAP',        icon: 'flask', id: 'ana.sap' },
      { kind: 'Ask AnA', label: 'Submission readiness check',icon: 'clip',  id: 'ana.ready' },
      { kind: 'Ask AnA', label: 'Cross-agency precedent',    icon: 'globe', id: 'ana.cross' },
    ];
    const recents = [
      { kind: 'Recent', label: 'NDA 212345 · §2.5 Clinical overview', icon: 'pencil', id: 'r.25' },
      { kind: 'Recent', label: '510(k) predicate search — Q1',        icon: 'search', id: 'r.510' },
      { kind: 'Recent', label: 'EMA scientific advice prep',           icon: 'globe',  id: 'r.ema' },
    ];
    return [...nav, ...ana, ...recents];
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return pool;
    const ql = q.toLowerCase();
    return pool.filter(p => p.label.toLowerCase().includes(ql) || p.kind.toLowerCase().includes(ql));
  }, [q, pool]);

  // Group
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(f => { (g[f.kind] = g[f.kind] || []).push(f); });
    return g;
  }, [filtered]);

  // Flattened ordered list for keyboard focus
  const flat = useMemo(() => {
    const order = ['Ask AnA', 'Module', 'Recent'];
    const out = [];
    order.forEach(k => { (grouped[k] || []).forEach(it => out.push(it)); });
    return out;
  }, [grouped]);

  useEffectExt(() => {
    if (open) { setQ(''); setFocusIdx(0); setTimeout(() => inputRef.current?.focus(), 40); }
  }, [open]);

  useEffectExt(() => { setFocusIdx(0); }, [q]);

  const handleKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const it = flat[focusIdx];
      if (it) { onNavigate(it); onClose(); }
    }
  };

  if (!open) return null;
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="palette-input-row">
          <span className="ico">{I.search}</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask AnA, jump to a module, search recents…"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {flat.length === 0 && <div className="palette-empty">No matches for "{q}"</div>}
          {['Ask AnA', 'Module', 'Recent'].map(section => {
            const items = grouped[section];
            if (!items || !items.length) return null;
            return (
              <div key={section}>
                <div className="palette-section">{section}</div>
                {items.map((it) => {
                  const globalIdx = flat.indexOf(it);
                  return (
                    <button key={it.id}
                      className="palette-item"
                      data-focused={globalIdx === focusIdx}
                      onMouseEnter={() => setFocusIdx(globalIdx)}
                      onClick={() => { onNavigate(it); onClose(); }}
                    >
                      <span className="p-ico">{I[it.icon] || I.right}</span>
                      <span className="p-label">{it.label}</span>
                      <span className="p-hint">{it.kind === 'Module' ? 'Open' : it.kind === 'Ask AnA' ? '↵ Ask' : 'Resume'}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><kbd>↑↓</kbd>navigate</span>
          <span><kbd>↵</kbd>select</span>
          <span><kbd>Esc</kbd>close</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScopeSwitcher, AnaCard, CommandPalette });
