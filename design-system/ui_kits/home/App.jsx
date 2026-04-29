/* global React, ReactDOM, I, NAV_ITEMS, NAV_SUB, DASH, MODULES, RECENTS, SUGGESTIONS, ScopeSwitcher, AnaCard, CommandPalette, ProjectsScreen */
const { useState, useEffect } = React;

/* ─────────────────────────────────────────────────────────
   Tweaks — persisted editable defaults
   ───────────────────────────────────────────────────────── */
const DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "collapsed": false,
  "activeNav": "projects",
  "userName": "Jordan",
  "userInitials": "JC",
  "userRole": "Enterprise · Reg Affairs"
}/*EDITMODE-END*/;

/* ─────────────────────────────────────────────────────────
   Nav Rail
   ───────────────────────────────────────────────────────── */
function Rail({ activeNav, setActiveNav, collapsed, setCollapsed, user }) {
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

      <div className="rail-search" role="search">
        <span className="sc-ico">{I.search}</span>
        <input placeholder="Search artifacts, chats…" />
        <kbd>⌘K</kbd>
      </div>

      <div className="rail-section">Modules</div>
      <div className="rail-nav">
        {NAV_ITEMS.map(item => {
          const Cn = I[item.icon];
          const isActive = activeNav === item.id;
          return (
            <React.Fragment key={item.id}>
              <button
                className="nav-item"
                aria-current={isActive || undefined}
                onClick={() => setActiveNav(item.id)}
                data-label={item.label}
                title={collapsed ? item.label : undefined}
              >
                <span className="ico">{Cn}</span>
                <span className="lbl">{item.label}</span>
              </button>
              {isActive && NAV_SUB[item.id] && !collapsed && (
                <div className="rail-sub">
                  {NAV_SUB[item.id].map((s, i) => (
                    <button key={i} className="sub-item">
                      <span className="dot"/><span>{s}</span>
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

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

/* ─────────────────────────────────────────────────────────
   Top bar — breadcrumbs + workspace pill + actions
   ───────────────────────────────────────────────────────── */
function TopBar({ activeNavLabel, scope, setScope, onOpenPalette }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span className="here">{activeNavLabel || 'Home'}</span>
      </div>
      <ScopeSwitcher scope={scope} setScope={setScope}/>
      <div className="tb-divider"/>
      <button className="workspace-pill" title="Switch workspace">
        <span className="sqr" aria-hidden="true"/>
        <span>BioNova Therapeutics</span>
        <span className="chev">{I.down}</span>
      </button>
      <div className="tb-divider"/>
      <div className="tb-actions">
        <button className="tb-btn" title="Search (⌘K)" onClick={onOpenPalette}>{I.search}</button>
        <button className="tb-btn" title="Notifications">
          {I.bell}
          <span className="badge" aria-hidden="true"/>
        </button>
        <button className="tb-btn" title="Help">{I.help}</button>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────
   Composer + Greeting
   ───────────────────────────────────────────────────────── */
function GreetAndCompose({ userName }) {
  const [draft, setDraft] = useState('');
  const send = () => { if (!draft.trim()) return; /* no-op demo */ setDraft(''); };

  const hour = new Date().getHours();
  const tod = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="greet-block">
      <span className="greet-star" aria-hidden="true">✻</span>
      <h1 className="greet-h1">{tod}, {userName}</h1>
      <div className="greet-sub">What would you like to work on? Ask AnA, or jump into a module below.</div>

      <div className="composer">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask AnA — draft a section, pull a precedent, review a SAP…"
          rows={1}
        />
        <div className="composer-actions">
          <button className="composer-icon" title="Attach">{I.attach}</button>
          <button className="composer-icon" title="Tools">{I.tools}</button>
          <button className="composer-chip">AnA 1.0 RI {I.down}</button>
          <button className="composer-send" onClick={send} disabled={!draft.trim()} title="Send">
            {I.arrowUp}
          </button>
        </div>
      </div>

      <div className="suggest">
        {SUGGESTIONS.map((s, i) => (
          <button key={i} className="suggest-pill" onClick={() => setDraft(s.label)}>
            <span className="ico">{I[s.ico]}</span>{s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Dashboard strip
   ───────────────────────────────────────────────────────── */
function Dashboard() {
  return (
    <>
      <div className="sec-hdr">
        <div className="sec-title">At a glance</div>
        <button className="sec-more">View all dashboards {I.right}</button>
      </div>
      <div className="dash">
        {DASH.map((d, i) => (
          <button key={i} className="dash-card">
            <div className="dash-label">{d.label}</div>
            <div className="dash-metric">
              {d.metric}{d.unit && <span className="unit">{d.unit}</span>}
            </div>
            {d.bar && (
              <div className="readiness">
                <div className={`readiness-fill ${d.bar.tone === 'warn' ? 'warn' : d.bar.tone === 'err' ? 'err' : ''}`} style={{ width: `${d.bar.pct}%` }}/>
              </div>
            )}
            <div className="dash-meta">{d.meta}</div>
          </button>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Module Launcher
   ───────────────────────────────────────────────────────── */
function Launcher({ activeNav, setActiveNav }) {
  return (
    <>
      <div className="sec-hdr">
        <div className="sec-title">All modules</div>
        <button className="sec-more">Customize {I.right}</button>
      </div>
      <div className="modules">
        {MODULES.map((m, i) => {
          const Cn = I[m.icon];
          const navItem = NAV_ITEMS.find(n => n.id === m.navId);
          const isPinned = navItem && navItem.group === 'domain';
          const isActive = activeNav === m.navId;
          const cls = ['module-card', isPinned && 'is-pinned', isPinned && isActive && 'is-active'].filter(Boolean).join(' ');
          const href = navItem && navItem.href;
          return (
            <a
              key={i}
              className={cls}
              href={href || '#'}
              onClick={(e) => { if (!href) e.preventDefault(); setActiveNav(m.navId); }}
            >
              <div className="mc-head">
                <div className="mc-ico">{Cn}</div>
                <div className="mc-arrow">{I.arrowRight}</div>
              </div>
              <div className="mc-title">{m.title}</div>
              <div className="mc-desc">{m.desc}</div>
              <div className="mc-foot">
                <span className="dot"/>{m.foot}
              </div>
            </a>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Recent Activity
   ───────────────────────────────────────────────────────── */
function Recents() {
  return (
    <>
      <div className="sec-hdr">
        <div className="sec-title">Recent activity</div>
        <button className="sec-more">View all {I.right}</button>
      </div>
      <div className="recents">
        {RECENTS.map((r, i) => (
          <button key={i} className="recent-row">
            <span className="r-ico">{I[r.icon]}</span>
            <span className="r-ttl"><span className="r-mod">{r.mod}</span>{r.ttl}</span>
            <span className={`pill ${r.pill.kind}`}><span className="pd"/>{r.pill.label}</span>
            <span className="r-when">{r.when}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Tweaks Panel
   ───────────────────────────────────────────────────────── */
function TweaksPanel({ tweaks, setTweak, onClose }) {
  return (
    <aside className="tweaks-panel" role="dialog" aria-label="Tweaks">
      <div className="tweaks-title">
        <span>Tweaks</span>
        <button className="close" onClick={onClose} title="Close">{I.close}</button>
      </div>

      <div className="tweak-row">
        <span className="tweak-label">Dark mode</span>
        <button className="switch" data-on={tweaks.dark} onClick={() => setTweak('dark', !tweaks.dark)} aria-label="Dark mode"/>
      </div>

      <div className="tweak-row">
        <span className="tweak-label">Rail collapsed</span>
        <button className="switch" data-on={tweaks.collapsed} onClick={() => setTweak('collapsed', !tweaks.collapsed)} aria-label="Collapse rail"/>
      </div>

      <div className="tweak-row">
        <span className="tweak-label">Active module</span>
        <div className="seg">
          {[
            { id: 'mdx', label: 'Device' },
            { id: 'biopharma', label: 'Biopharma' },
            { id: 'projects', label: 'Projects' },
          ].map(o => (
            <button key={o.id}
              className="seg-btn"
              data-on={tweaks.activeNav === o.id}
              onClick={() => setTweak('activeNav', o.id)}
            >{o.label}</button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────
   App
   ───────────────────────────────────────────────────────── */
function App() {
  const [tweaks, setTweaks] = useState(DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [editModeActive, setEditModeActive] = useState(false);
  const [scope, setScope] = useState('all');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const setTweak = (key, val) => {
    setTweaks(t => {
      const next = { ...t, [key]: val };
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: val } }, '*');
      return next;
    });
  };

  // Tweaks host protocol: register listener first, then announce
  useEffect(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') { setEditModeActive(true); setTweaksOpen(true); }
      if (e.data.type === '__deactivate_edit_mode') { setEditModeActive(false); setTweaksOpen(false); }
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // ⌘K / Ctrl-K palette
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPaletteNav = (it) => {
    if (it.kind === 'Module') { setTweak('activeNav', it.id); }
  };

  const activeNavLabel = NAV_ITEMS.find(n => n.id === tweaks.activeNav)?.label || 'Home';
  const user = { name: tweaks.userName, initials: tweaks.userInitials, role: tweaks.userRole };

  return (
    <div className={`shell${tweaks.dark ? ' dark' : ''}`} data-collapsed={tweaks.collapsed}>
      <Rail
        activeNav={tweaks.activeNav}
        setActiveNav={(id) => setTweak('activeNav', id)}
        collapsed={tweaks.collapsed}
        setCollapsed={(v) => setTweak('collapsed', v)}
        user={user}
      />
      <main className="main">
        <TopBar activeNavLabel={activeNavLabel} scope={scope} setScope={setScope} onOpenPalette={() => setPaletteOpen(true)}/>
        <div className="page" data-screen-label="01 Home">
          <div className="page-inner">
            {tweaks.activeNav === 'projects' ? (
              <ProjectsScreen/>
            ) : (
              <>
                <GreetAndCompose userName={tweaks.userName}/>
                <AnaCard scope={scope} onOpenPalette={() => setPaletteOpen(true)}/>
                <Dashboard/>
                <div style={{ height: 24 }}/>
                <Launcher activeNav={tweaks.activeNav} setActiveNav={(id) => setTweak('activeNav', id)}/>
                <div style={{ height: 24 }}/>
                <Recents/>
              </>
            )}
          </div>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={onPaletteNav}/>

      {editModeActive && tweaksOpen && (
        <TweaksPanel tweaks={tweaks} setTweak={setTweak} onClose={() => setTweaksOpen(false)}/>
      )}
      {editModeActive && !tweaksOpen && (
        <button className="tweaks-toggle" onClick={() => setTweaksOpen(true)} title="Tweaks">
          {I.sliders}
        </button>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
