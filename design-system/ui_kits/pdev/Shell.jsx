/**
 * PDEV kit · shell. Three columns — rail / main / AnA dock.
 *
 * Mirrors design-system/ui_kits/mdx/shell.jsx with PDEV-specific labels
 * and the sub-nav specified in PDEV_IND_DESIGN_BRIEF.md §1.2.
 */
(() => {
const { PdevI: I, PDEV_NAV_GROUPS, PDEV_NAV_ITEMS, PDEV_SUGGESTIONS, PDEV_COMMANDS } = window;

function PdevRail({ activeNav, setActiveNav, collapsed, setCollapsed, program, programs, switchProgram }) {
  return (
    <nav className="pdev-rail" aria-label="PDEV navigation">
      <div className="pdev-rail-top">
        <div className="pdev-rail-logo">
          <div className="pdev-rail-logo-text">Concept2Cure<span>.RI</span></div>
        </div>
        <button className="pdev-rail-collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          {I.panelLeft}
        </button>
      </div>

      <div className="pdev-rail-breadcrumb">
        <button className="pdev-rail-breadcrumb-btn" onClick={() => setActiveNav('overview')}>
          <span className="ico">{I.arrowLeft}</span>
          <span className="lbl">Domain: PDEV</span>
        </button>
      </div>

      <div className="pdev-rail-program">
        <div className="pdev-rail-program-label">Active program</div>
        <select
          className="pdev-rail-program-select"
          value={program?.id || ''}
          onChange={(e) => switchProgram(e.target.value)}
        >
          {programs.map(p => (
            <option key={p.id} value={p.id}>{p.code} · {p.productName.split(' · ')[0]}</option>
          ))}
        </select>
      </div>

      {PDEV_NAV_GROUPS.map(g => {
        const items = PDEV_NAV_ITEMS.filter(i => i.group === g.id);
        if (!items.length) return null;
        return (
          <React.Fragment key={g.id}>
            {g.label && <div className="pdev-rail-section">{g.label}</div>}
            <div className="pdev-rail-nav">
              {items.map(item => {
                const Cn = I[item.icon];
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    className="pdev-nav-item"
                    aria-current={isActive || undefined}
                    onClick={() => setActiveNav(item.id)}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="ico">{Cn}</span>
                    <span className="lbl">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}

      <div className="pdev-rail-spacer" />
      <button className="pdev-rail-account">
        <div className="pdev-avatar">JC</div>
        <div className="pdev-who">
          <div className="pdev-name">Jordan Chen</div>
          <div className="pdev-plan">Reg lead · BX-501</div>
        </div>
        <span className="chev">{I.down}</span>
      </button>
    </nav>
  );
}

function PdevTopBar({ hereLabel, program, onOpenPalette }) {
  return (
    <header className="pdev-topbar">
      <div className="pdev-crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>PDEV</span>
        {program && <><span className="sep">›</span><span>{program.code}</span></>}
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="pdev-tb-spacer" />
      {program && (
        <button className="pdev-tb-pill" onClick={onOpenPalette} title="Switch program">
          <span className="pdev-dot" />
          <span>{program.code} · {program.productName.split(' · ')[0]}</span>
          <span className="chev">{I.down}</span>
        </button>
      )}
      <button className="pdev-tb-cmdk" onClick={onOpenPalette} title="Command palette · ⌘K">
        <span className="ico">{I.search}</span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="pdev-tb-actions">
        <button className="pdev-tb-btn">{I.filter}</button>
        <button className="pdev-tb-btn">{I.bell}</button>
        <button className="pdev-tb-btn">{I.help}</button>
      </div>
    </header>
  );
}

function PdevAnaDock({ open, setOpen, program, activeNav, activity }) {
  const [draft, setDraft] = React.useState('');
  const [showCommands, setShowCommands] = React.useState(false);
  const suggestions = PDEV_SUGGESTIONS[activeNav] || PDEV_SUGGESTIONS.overview;

  if (!open) {
    return (
      <aside className="pdev-ana-seam">
        <button className="pdev-ana-seam-btn" onClick={() => setOpen(true)} title="Open AnA · ⌘\\">
          <span className="pdev-ana-mark">✻</span>
          <span className="pdev-ana-seam-label">AnA</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="pdev-ana">
      <div className="pdev-ana-hdr">
        <div className="pdev-ana-id">
          <span className="pdev-ana-mark">✻</span>
          <div className="pdev-ana-id-text">
            <div className="pdev-ana-id-name">AnA 1.0 RI</div>
            <div className="pdev-ana-id-model">Claude Opus 4.5</div>
          </div>
        </div>
        <button className="pdev-tb-btn" onClick={() => setOpen(false)} title="Collapse · ⌘\\">
          {I.panelRight}
        </button>
      </div>

      {program && (
        <div className="pdev-ana-context">
          <div className="lbl">Context</div>
          <div className="val">{program.code} · {program.productName.split(' · ')[0]}</div>
          <div className="sub">Readiness {program.readiness}% · {program.daysToInd} days to IND</div>
          {activity && (
            <div className="pdev-ana-context-activity">
              <span className="ico">{I.zap}</span>
              <span>{activity.title}</span>
            </div>
          )}
          {program.topBlocker && (
            <div className="pdev-ana-context-blocker">
              <span className="ico">{I.alertCircle}</span>
              <span>{program.topBlocker}</span>
            </div>
          )}
        </div>
      )}

      <div className="pdev-ana-section-label">Suggested for this surface</div>
      {suggestions.slice(0, 3).map((s, i) => (
        <button key={i} className="pdev-ana-suggestion" onClick={() => { setDraft(s); }}>
          <span className="ico">{I.sparkles}</span>
          <span>{s}</span>
        </button>
      ))}

      <button className="pdev-ana-cmd-toggle" onClick={() => setShowCommands(v => !v)}>
        {showCommands ? '▾' : '▸'} 20 PDEV commands (/pdev)
      </button>
      {showCommands && (
        <div className="pdev-ana-commands">
          {PDEV_COMMANDS.map(c => (
            <button key={c.id} className="pdev-ana-cmd" onClick={() => setDraft(c.example)}>
              <span className="pdev-ana-cmd-id mono">{c.id}</span>
              <span className="pdev-ana-cmd-ex">{c.example}</span>
            </button>
          ))}
        </div>
      )}

      <div className="pdev-ana-spacer" />

      <div className="pdev-ana-foot">
        <div className="pdev-ana-composer">
          <textarea
            rows={2}
            placeholder="Ask AnA about this program…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="pdev-ana-send" disabled={!draft.trim()}>{I.arrowUp}</button>
        </div>
        <div className="pdev-ana-foot-meta">Routes via AnA gateway · Opus 4.5</div>
      </div>
    </aside>
  );
}

Object.assign(window, { PdevRail, PdevTopBar, PdevAnaDock });
})();
