/* global React, ReactDOM, I, MDX_PROGRAMS, MDX_NAV_ITEMS, MDX_STUBS, ANA_MODES, EDITOR_PROGRAM, Rail, TopBar, TabBar, CmdK, AnaRail, OverviewSurface, K510Surface, PMASurface, CERSurface, PrecedentSurface, InDesignSurface, EstarEditorSurface, TasksSurface, VaultSurface, ValidationSurface, SubmissionsSurface, TemplatesSurfaceface, InDesignSurface, EstarEditorSurface */
const { useState, useEffect } = React;

/* Tweak defaults — written to disk via EDITMODE when the user toggles them.
   `anaOpen` is the new AnA-rail open state (replaces the old anaCollapsed dock). */
const DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "railCollapsed": false,
  "anaOpen": false,
  "anaMode": "standard",
  "activeNav": "overview",
  "userName": "Jordan Chen",
  "userInitials": "JC",
  "userRole": "Enterprise · Reg Affairs"
}/*EDITMODE-END*/;

function TweaksPanel({ tweaks, setTweak, onClose }) {
  return (
    <aside className="tweaks-panel" role="dialog" aria-label="Tweaks">
      <div className="tweaks-title">
        <span>Tweaks</span>
        <button className="close" onClick={onClose} title="Close">{I.close}</button>
      </div>
      <div className="tweak-row">
        <span>Dark mode</span>
        <button className="switch" data-on={tweaks.dark} onClick={() => setTweak('dark', !tweaks.dark)} aria-label="Dark mode"/>
      </div>
      <div className="tweak-row">
        <span>Rail collapsed</span>
        <button className="switch" data-on={tweaks.railCollapsed} onClick={() => setTweak('railCollapsed', !tweaks.railCollapsed)} aria-label="Rail collapsed"/>
      </div>
      <div className="tweak-row">
        <span>AnA rail open</span>
        <button className="switch" data-on={tweaks.anaOpen} onClick={() => setTweak('anaOpen', !tweaks.anaOpen)} aria-label="AnA rail open"/>
      </div>
      <div className="tweak-row">
        <span>AnA mode</span>
        <div className="seg">
          {ANA_MODES.map(m => (
            <button key={m.id} className="seg-btn" data-on={tweaks.anaMode === m.id} onClick={() => setTweak('anaMode', m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="tweak-row">
        <span>Active surface</span>
        <div className="seg">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'k510',     label: '510(k)' },
            { id: 'pma',      label: 'PMA' },
            { id: 'cer',      label: 'CER' },
          ].map(o => (
            <button key={o.id} className="seg-btn" data-on={tweaks.activeNav === o.id} onClick={() => setTweak('activeNav', o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function App() {
  const [tweaks, setTweaks] = useState(DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [editModeActive, setEditModeActive] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [messages, setMessages] = useState([]);

  /* First-visit discovery — open AnA once so users find it, then respect preference. */
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const visited = localStorage.getItem('mdx.visited');
    if (!visited) {
      localStorage.setItem('mdx.visited', '1');
      setTweaks(t => ({ ...t, anaOpen: true }));
    }
  }, []);

  const setTweak = (key, val) => {
    setTweaks(t => {
      const next = { ...t, [key]: val };
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: val } }, '*');
      return next;
    });
  };

  useEffect(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode')   { setEditModeActive(true); setTweaksOpen(true); }
      if (e.data.type === '__deactivate_edit_mode') { setEditModeActive(false); setTweaksOpen(false); }
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  /* Global keyboard — ⌘K palette, ⌘\ toggle AnA rail. */
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdkOpen(o => !o); }
      if (mod && e.key === '\\')              { e.preventDefault(); setTweak('anaOpen', !tweaks.anaOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tweaks.anaOpen]);

  const openProgram = (prog) => {
    setSelectedProgram(prog);
    setTweak('activeNav', prog.pathway);
  };

  const hereLabel = ({
    overview: 'Overview',
    k510: '510(k) Submissions',
    pma: 'PMA Submissions',
    cer: 'CER Generator',
    predicate: 'Precedent intelligence',
    engineering: 'Device engineering',
    udi: 'UDI and labeling',
    postmarket: 'Post-market vigilance',
    tasks: 'Tasks and reviews',
    vault: 'Document vault',
    validation: 'Validation center',
    submissions: 'Submission center',
    templates: 'Templates',
    analytics: 'Analytics',
    memory: 'Claude memory',
    admin: 'Admin and access',
  })[tweaks.activeNav] || 'Overview';

  const user = { name: tweaks.userName, initials: tweaks.userInitials, role: tweaks.userRole };
  const programForContext = selectedProgram || (
    tweaks.activeNav === 'k510' ? MDX_PROGRAMS[0] :
    tweaks.activeNav === 'pma'  ? MDX_PROGRAMS[2] :
    tweaks.activeNav === 'cer'  ? MDX_PROGRAMS[3] :
    null
  );

  /* Ask AnA — opens the rail if collapsed, appends a user message + a placeholder
     AnA response. In production this dispatches to /api/ana-ri (socket.io) via the
     gateway. Here we surface a stub that shows the round-trip shape. */
  const askAna = (text, opts = {}) => {
    if (!text) return;
    const now = 'just now';
    setMessages(ms => [
      ...ms,
      { role: 'user', body: text, when: now, mode: tweaks.anaMode },
      { role: 'ana',  body: opts.tool
          ? `Would run \`${opts.tool}\` via gateway in ${ANA_MODES.find(m => m.id === tweaks.anaMode).label} mode.`
          : 'Routing via gateway… (this is the UI stub — real response streams here in production).',
        when: now, mode: tweaks.anaMode },
    ]);
    setTweak('anaOpen', true);
  };

  const inEditor = tweaks.activeNav === 'editor';

  let Surface;
  if (inEditor) {
    Surface = <EstarEditorSurface initialMode={tweaks.anaMode}/>;
  } else if (MDX_STUBS[tweaks.activeNav]) {
    Surface = <InDesignSurface stub={MDX_STUBS[tweaks.activeNav]}/>;
  } else {
    const openEditor = () => setTweak('activeNav', 'editor');
    switch (tweaks.activeNav) {
      case 'k510':        Surface = <K510Surface program={programForContext} onAskAna={askAna} onOpenEditor={openEditor}/>; break;
      case 'pma':         Surface = <PMASurface onAskAna={askAna}/>; break;
      case 'cer':         Surface = <CERSurface onAskAna={askAna}/>; break;
      case 'predicate':   Surface = <PrecedentSurface onAskAna={askAna}/>; break;
      case 'tasks':       Surface = <TasksSurface onAskAna={askAna}/>; break;
      case 'vault':       Surface = <VaultSurface onAskAna={askAna}/>; break;
      case 'validation':  Surface = <ValidationSurface onAskAna={askAna}/>; break;
      case 'submissions': Surface = <SubmissionsSurface onAskAna={askAna}/>; break;
      case 'templates':   Surface = <TemplatesSurface onAskAna={askAna}/>; break;
      default:            Surface = <OverviewSurface onOpenProgram={openProgram} onAskAna={askAna}/>;
    }
  }

  return (
    <div
      className={`shell${tweaks.dark ? ' dark' : ''}${inEditor ? ' editor-mode' : ''}`}
      data-collapsed={inEditor ? true : tweaks.railCollapsed}
      data-ana-open={inEditor ? false : tweaks.anaOpen}
    >
      <Rail
        activeNav={tweaks.activeNav}
        setActiveNav={(id) => setTweak('activeNav', id)}
        collapsed={inEditor ? true : tweaks.railCollapsed}
        setCollapsed={(v) => setTweak('railCollapsed', v)}
        user={user}
      />
      <main className="main">
        {inEditor ? (
          <div className="ed-breadcrumb-bar">
            <button className="ed-exit" onClick={() => setTweak('activeNav', 'k510')} title="Back to 510(k)">
              {I.arrowLeft}
              <span>Back to 510(k)</span>
            </button>
            <span className="ed-crumb-sep">{I.right}</span>
            <span className="ed-crumb">{EDITOR_PROGRAM?.title || 'OR-801'}</span>
            <span className="ed-crumb-sep">{I.right}</span>
            <span className="ed-crumb here">510(k) module editor</span>
            <span className="tb-spacer" style={{ flex: 1 }}/>
            <button className="tb-btn" onClick={() => setCmdkOpen(true)} title="Command palette">{I.search}</button>
          </div>
        ) : (
          <>
            <TopBar hereLabel={hereLabel} program={programForContext} onOpenPalette={() => setCmdkOpen(true)}/>
            <TabBar activeNav={tweaks.activeNav} setActiveNav={(id) => setTweak('activeNav', id)}/>
          </>
        )}
        {inEditor ? (
          <div className="ed-main-scroll" data-screen-label="MDX · 510(k) editor">
            {Surface}
          </div>
        ) : (
          <div className="page" data-screen-label={`MDX · ${hereLabel}`}>
            <div className="page-inner">
              {Surface}
            </div>
          </div>
        )}
      </main>
      {!inEditor && (
        <AnaRail
          open={tweaks.anaOpen}
          setOpen={(v) => setTweak('anaOpen', v)}
          activeNav={tweaks.activeNav}
          program={programForContext}
          mode={tweaks.anaMode}
          setMode={(m) => setTweak('anaMode', m)}
          messages={messages}
          onSend={askAna}
        />
      )}

      <CmdK
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        activeNav={tweaks.activeNav}
        program={programForContext}
        setActiveNav={(id) => setTweak('activeNav', id)}
        onAskAna={askAna}
        mode={tweaks.anaMode}
        setMode={(m) => setTweak('anaMode', m)}
      />

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
