(() => {
/**
 * Shell — Rail + TopBar + TabBar + collapsed AnA seam.
 *
 * Ported (compressed) from client/src/concept2cure/mdx/shell/*.tsx.
 * Pure JSX-friendly; data imports come from window.MDX_NAV_GROUPS,
 * window.MDX_NAV_V2 + window.MDX_PROGRAMS.
 *
 * Globals set: window.Rail, window.TopBar, window.TabBar, window.AnaSeam.
 */

const { I } = window;
const { MDX_NAV_GROUPS, MDX_NAV_V2 } = window;

// ─── Rail (left, 260 / 56 collapsed) ──────────────────────────────
function Rail({ activeNav, setActiveNav, collapsed, setCollapsed, user }) {
  const renderItem = (item) => {
    const Cn = I[item.icon];
    const isActive = activeNav === item.id;
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
          <div className="rail-logo-text">Concept2Cure<span>.RI</span></div>
        </div>
        <button
          className="rail-collapse"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {I.panelLeft}
        </button>
      </div>
      {MDX_NAV_GROUPS.map(g => {
        const items = MDX_NAV_V2.filter(i => i.group === g.id);
        if (!items.length) return null;
        return (
          <React.Fragment key={g.id}>
            {g.label && <div className="rail-section">{g.label}</div>}
            <div className="rail-nav">{items.map(renderItem)}</div>
          </React.Fragment>
        );
      })}
      <div className="rail-spacer" />
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

// ─── TopBar (48px, breadcrumbs + ⌘K + actions) ────────────────────
function TopBar({ hereLabel, program, onOpenPalette }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Medical Device and Diagnostics</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      {program && (
        <button className="tb-pill" title="Switch program (⌘K)" onClick={onOpenPalette}>
          <span className="dot" />
          <span>{program.code} · {program.title.split(' ').slice(0, 2).join(' ')}</span>
          <span style={{ color: 'var(--text-400)' }}>{I.down}</span>
        </button>
      )}
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

// ─── TabBar (44px workstream tabs) ─────────────────────────────────
function TabBar({ activeNav, setActiveNav, programs }) {
  const tabs = [
    { id: 'overview',  label: 'Overview',         icon: 'grid',        count: programs.length },
    { id: 'k510',      label: '510(k)',           icon: 'file',        count: programs.filter(p => p.pathway === 'k510').length },
    { id: 'pma',       label: 'PMA',              icon: 'shieldCheck', count: programs.filter(p => p.pathway === 'pma').length },
    { id: 'cer',       label: 'CER',              icon: 'microscope',  count: programs.filter(p => p.pathway === 'cer').length },
    { id: 'predicate', label: 'Precedent intel',  icon: 'scale' },
  ];
  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button
          key={t.id}
          className="tab"
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

// ─── Collapsed AnA seam (32px, right edge) ─────────────────────────
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

window.Rail = Rail;
window.TopBar = TopBar;
window.TabBar = TabBar;
window.AnaSeam = AnaSeam;

})();
