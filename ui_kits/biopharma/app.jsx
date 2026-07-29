(() => {
/* Biopharma kit composer
 * ─────────────────────────────────────────────────────────────
 * Mirrors MDX's app.jsx pattern: rail + topbar + tabbar + content
 * area + collapsed AnA seam. Routes activeNav → biopharma surfaces
 * (window.Biopharma*), falling back to a chassis stub for shared
 * surfaces that reuse MDX components in v2.
 */

const {
  React, Rail, TopBar, TabBar, AnaSeam, AnaDock, I,
  BIOPHARMA_PROGRAMS, BIOPHARMA_SUGGESTIONS, HERE_LABEL_BIOPHARMA,
  BIOPHARMA_IND, BIOPHARMA_NDA,
  BiopharmaOverview, BiopharmaInd, BiopharmaNda, BiopharmaPediatric,
  BiopharmaPv, BiopharmaJnda, BiopharmaLifecycle, BiopharmaOrphan, BiopharmaMeetings,
  BiopharmaPathway, BiopharmaStub,
} = window;

const USER = { name: 'Jordan Chen', initials: 'JC', role: 'Enterprise · Reg Affairs' };

/* Surfaces that in v2 will reuse MDX components verbatim — the kit
   shows a stub explaining the chassis share, so reviewers don't think
   biopharma is missing a screen. */
const SHARED_WITH_MDX = {
  tasks: 'mdx/workbench/Tasks',
  'ana-review': 'mdx/surfaces/AnaReview',
  vault: 'mdx/surfaces/Vault',
  validation: 'mdx/workbench/Validation',
  submissions: 'mdx/workbench/Submissions',
  templates: 'mdx/surfaces/Templates',
  analytics: 'mdx/surfaces/Analytics',
  memory: 'mdx/surfaces/Memory',
  conversations: 'mdx/surfaces/Conversations',
  search: 'mdx/surfaces/Search',
  notifications: 'mdx/surfaces/Notifications',
  audit: 'mdx/surfaces/Audit',
  onboarding: 'mdx/surfaces/Onboarding',
  admin: 'mdx/surfaces/Admin',
};

function BiopharmaApp() {
  const [activeNav, setActiveNav] = React.useState('overview');
  const [collapsed, setCollapsed] = React.useState(false);
  const [clientType, setClientType] = React.useState(() => {
    try { return localStorage.getItem('biopharma.clientType') || 'pharma'; }
    catch { return 'pharma'; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('biopharma.clientType', clientType); } catch { /* noop */ }
  }, [clientType]);
  const [anaOpen,   setAnaOpen]   = React.useState(() => {
    try {
      const raw = localStorage.getItem('biopharma.anaOpen');
      return raw === null ? false : JSON.parse(raw);
    } catch { return false; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('biopharma.anaOpen', JSON.stringify(anaOpen)); } catch { /* noop */ }
  }, [anaOpen]);

  const [density, setDensity] = React.useState(() => {
    try { return localStorage.getItem('biopharma.density') || 'comfortable'; }
    catch { return 'comfortable'; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('biopharma.density', density); } catch { /* noop */ }
  }, [density]);
  // ⌘\ toggles the dock
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setAnaOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);

  /* Active program — picks the right BX-# for each surface, mirrors MDX */
  const program = React.useMemo(() => {
    if (activeNav === 'ind')        return BIOPHARMA_PROGRAMS.find(p => p.id === 'bx115');
    if (activeNav === 'nda')        return BIOPHARMA_PROGRAMS.find(p => p.id === 'bx204');
    if (activeNav === 'bla')        return BIOPHARMA_PROGRAMS.find(p => p.id === 'bx301');
    if (activeNav === 'maa')        return BIOPHARMA_PROGRAMS.find(p => p.id === 'bx420');
    if (activeNav === 'pharmacov')  return BIOPHARMA_PROGRAMS.find(p => p.id === 'bx099');
    return null;
  }, [activeNav]);

  const askAna = React.useCallback((text) => {
    setToast({ text, when: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
    /* eslint-disable-next-line no-console */
    console.log('[AnA · biopharma]', text);
  }, []);

  const hereLabel = HERE_LABEL_BIOPHARMA[activeNav] || 'Overview';

  let surface;
  if (activeNav === 'overview')            surface = <BiopharmaOverview programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'ind')            surface = <BiopharmaInd program={program} programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'nda')            surface = <BiopharmaNda program={program} programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'bla')            surface = <BiopharmaPathway pathwayKey="bla" kicker="BLA · 351(a) biologics" programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'maa')            surface = <BiopharmaPathway pathwayKey="maa" kicker="MAA · EU centralized procedure" programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'jnda')           surface = <BiopharmaJnda programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'lifecycle')      surface = <BiopharmaLifecycle programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'orphan')         surface = <BiopharmaOrphan programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'meetings')       surface = <BiopharmaMeetings programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'pediatric')      surface = <BiopharmaPediatric programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (activeNav === 'pharmacov')      surface = <BiopharmaPv programs={BIOPHARMA_PROGRAMS} onAskAna={askAna}/>;
  else if (SHARED_WITH_MDX[activeNav])     surface = <BiopharmaStub nav={activeNav} label={hereLabel} sharedWith={SHARED_WITH_MDX[activeNav]}/>;
  else                                     surface = <BiopharmaStub nav={activeNav} label={hereLabel}/>;

  return (
    <div className="shell" data-collapsed={collapsed} data-ana-open={anaOpen ? 'true' : 'false'}>
      <Rail activeNav={activeNav} setActiveNav={setActiveNav} collapsed={collapsed} setCollapsed={setCollapsed} user={USER} clientType={clientType}/>

      <main className="main">
        <TopBar hereLabel={hereLabel} program={program} density={density} onDensity={setDensity} clientType={clientType} setClientType={setClientType} onOpenPalette={() => askAna(BIOPHARMA_SUGGESTIONS[activeNav] ? BIOPHARMA_SUGGESTIONS[activeNav][0] : 'Show me what you can do here')}/>
        <TabBar activeNav={activeNav} setActiveNav={setActiveNav} programs={BIOPHARMA_PROGRAMS} clientType={clientType}/>
        <div className="page" data-screen-label={`Biopharma · ${hereLabel}`} data-density={density}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>

      {anaOpen
        ? <AnaDock activeNav={activeNav} open={anaOpen} onClose={() => setAnaOpen(false)}/>
        : <AnaSeam onOpen={() => setAnaOpen(true)}/>
      }

      {toast && (
        <div className="kit-toast">
          <div className="kit-toast-mark">{I.sparkles}</div>
          <div className="kit-toast-body">
            <div className="kit-toast-head">
              <span className="kit-toast-lbl">Would send to AnA</span>
              <span className="kit-toast-when">{toast.when}</span>
            </div>
            <div className="kit-toast-text">{toast.text}</div>
          </div>
          <button className="kit-toast-close" onClick={() => setToast(null)}>{I.close}</button>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<BiopharmaApp/>);

})();
