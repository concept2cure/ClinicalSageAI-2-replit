(() => {
/* Biopharma shell — Rail (reuses MDX), TopBar, TabBar, AnaSeam
 * ─────────────────────────────────────────────────────────────────
 * The Rail is identical to MDX's (just reads window.MDX_NAV_GROUPS
 * which data.jsx has aliased to BIOPHARMA_NAV_GROUPS). TopBar and
 * TabBar are biopharma-specific. In v2 these graduate to:
 *   client/src/concept2cure/biopharma/shell/{Rail,TopBar,TabBar}.tsx
 * with `domain="biopharma"` propagated everywhere.
 */

const { React, I, MDX_NAV_GROUPS, MDX_NAV_V2, BIOPHARMA_DOMAIN, HERE_LABEL_BIOPHARMA, CLIENT_TYPES } = window;

/* Filter rail items to those allowed for the active client type. The
   workbench + intelligence + system groups always render; only workstream
   and lifecycle filter by clientType.workstream + clientType.lifecycle. */
function filterNav(items, clientType) {
  if (!clientType || clientType === 'all') return items;
  const cfg = CLIENT_TYPES[clientType];
  if (!cfg) return items;
  const allowedWS = new Set(cfg.workstream);
  const allowedLC = new Set(cfg.lifecycle);
  return items.filter(it => {
    if (it.group === 'workstream') return allowedWS.has(it.id);
    if (it.group === 'lifecycle')  return allowedLC.has(it.id);
    return true;
  });
}

/* ─── Rail (lifted from MDX) — group headers collapse on click ─── */
function Rail({ activeNav, setActiveNav, collapsed, setCollapsed, user, clientType }) {
  // Which group does the active item belong to? That group must stay open.
  const activeGroupId = React.useMemo(() => {
    const item = MDX_NAV_V2.find(i => i.id === activeNav);
    return item ? item.group : null;
  }, [activeNav]);

  // Persisted collapse state per group. Default: only "workstream" + activeGroup open.
  const [groupOpen, setGroupOpen] = React.useState(() => {
    let stored = {};
    try {
      const raw = localStorage.getItem('biopharma.railGroupsOpen');
      if (raw) stored = JSON.parse(raw);
    } catch (_e) { /* ignore */ }
    const out = {};
    MDX_NAV_GROUPS.forEach(g => {
      if (stored[g.id] != null) out[g.id] = stored[g.id];
      else out[g.id] = g.id === 'workstream' || g.id === 'system' || !g.label;
    });
    return out;
  });
  React.useEffect(() => {
    try { localStorage.setItem('biopharma.railGroupsOpen', JSON.stringify(groupOpen)); }
    catch (_e) { /* quota */ }
  }, [groupOpen]);

  const toggleGroup = (gid) => setGroupOpen(prev => ({ ...prev, [gid]: !prev[gid] }));

  const renderItem = (item) => {
    const isActive = activeNav === item.id;
    return (
      <button key={item.id} className="nav-item" aria-current={isActive || undefined}
              onClick={() => setActiveNav(item.id)} title={collapsed ? item.label : undefined}>
        <span className="ico">{I[item.icon]}</span>
        <span className="lbl">{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-top">
        <div className="rail-logo">
          <div className="rail-logo-text">Concept2Cure<span>.RI</span></div>
        </div>
        <button className="rail-collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          {I.panelLeft}
        </button>
      </div>
      {MDX_NAV_GROUPS.map(g => {
        const items = filterNav(MDX_NAV_V2, clientType).filter(i => i.group === g.id);
        if (!items.length) return null;
        // Group with no label (e.g. 'system') is never collapsible.
        const collapsible = !!g.label;
        const isOpen = collapsible ? (groupOpen[g.id] || activeGroupId === g.id) : true;
        const visibleItems = isOpen ? items : items.filter(i => i.id === activeNav);
        const hiddenCount = items.length - visibleItems.length;
        return (
          <React.Fragment key={g.id}>
            {collapsible && (
              <button
                className="rail-section rail-section-toggle"
                data-open={isOpen || undefined}
                onClick={() => toggleGroup(g.id)}
                title={isOpen ? `Collapse ${g.label}` : `Expand ${g.label}`}
              >
                <span className="rail-section-chev">{I.down}</span>
                <span>{g.label}</span>
                {!isOpen && hiddenCount > 0 && <span className="rail-section-count">{hiddenCount}</span>}
              </button>
            )}
            <div className="rail-nav">{visibleItems.map(renderItem)}</div>
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

/* ─── TopBar — biopharma breadcrumb ─── */
function TopBar({ hereLabel, program, density, onDensity, onOpenPalette }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>{BIOPHARMA_DOMAIN.label}</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      {program && (
        <button className="tb-pill" title="Switch program (⌘K)" onClick={onOpenPalette}>
          <span className="dot" />
          <span>{program.code} · {program.title}</span>
          <span style={{ color: 'var(--text-400)' }}>{I.down}</span>
        </button>
      )}
      <button className="tb-cmdk" onClick={onOpenPalette} title="Command · ⌘K">
        <span className="ico">{I.search}</span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="bp-density-toggle" role="tablist" aria-label="Density">
        <button data-active={density === 'compact'      || undefined} onClick={() => onDensity('compact')}      title="Compact density">Compact</button>
        <button data-active={density === 'comfortable'  || undefined} onClick={() => onDensity('comfortable')}  title="Comfortable density (default)">Comfortable</button>
        <button data-active={density === 'spacious'     || undefined} onClick={() => onDensity('spacious')}     title="Spacious density">Spacious</button>
      </div>
      <div className="tb-actions">
        <button className="tb-btn" title="Filter">{I.filter}</button>
        <button className="tb-btn" title="Notifications">{I.bell}</button>
        <button className="tb-btn" title="Help">{I.help}</button>
      </div>
    </header>
  );
}

/* ─── TabBar — biopharma workstream pathways ─── */
function TabBar({ activeNav, setActiveNav, programs, clientType }) {
  const allTabs = [
    { id: 'overview',  label: 'Overview',           icon: 'grid',  count: programs.length },
    { id: 'ind',       label: 'IND / CTA',          icon: 'flask', count: programs.filter(p => p.pathway === 'ind').length },
    { id: 'nda',       label: 'NDA',                icon: 'file',  count: programs.filter(p => p.pathway === 'nda').length },
    { id: 'bla',       label: 'BLA',                icon: 'atom',  count: programs.filter(p => p.pathway === 'bla').length },
    { id: 'maa',       label: 'MAA',                icon: 'globe', count: programs.filter(p => p.pathway === 'maa').length },
    { id: 'jnda',      label: 'JNDA',               icon: 'shieldCheck' },
    { id: 'lifecycle', label: 'Lifecycle',          icon: 'history' },
    { id: 'precedent', label: 'Precedent intel',    icon: 'scale' },
  ];
  const cfg = CLIENT_TYPES[clientType];
  const allowed = cfg ? new Set(cfg.workstream) : null;
  const tabs = allowed ? allTabs.filter(t => allowed.has(t.id)) : allTabs;
  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button key={t.id} className="tab" aria-current={activeNav === t.id || undefined}
                onClick={() => setActiveNav(t.id)}>
          <span className="ico">{I[t.icon]}</span>
          <span>{t.label}</span>
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ─── AnaSeam (lifted) ─── */
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

window.Rail   = Rail;
window.TopBar = TopBar;
window.TabBar = TabBar;
window.AnaSeam = AnaSeam;

})();
