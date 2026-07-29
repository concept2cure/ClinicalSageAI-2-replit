(() => {
/**
 * MDX kit harness composer — mirrors the shape of App.tsx in the codebase
 * but stripped of editors, AnaRail, CmdK (focus is the 6 new surfaces).
 *
 * onAskAna is wired to the page-level toast so you can see what AnA would
 * receive for each interaction.
 */

const {
  React, Rail, TopBar, TabBar, AnaSeam, I, EsignModal,
  MDX_NAV_V2, MDX_PROGRAMS,
  EngineeringSurface,
  UdiSurface, PostmarketSurface,
  AnalyticsSurface, MemorySurface, AdminSurface,
  VaultSurface, AuditSurface, NotificationsSurface, TemplatesSurface, QualitySurface,
  IvdSurface, IvdrSurface, CdxSurface, LdtSurface,
  AnaReviewSurface, QSubSurface, SamdSurface, ClinicalSurface,
  SearchSurface, OnboardingSurface, ConversationsSurface,
} = window;

const HERE_LABEL = {
  overview:     'Overview',
  k510:         '510(k) Submissions',
  pma:          'PMA Submissions',
  cer:          'CER Generator',
  predicate:    'Precedent intelligence',
  tasks:        'Tasks and reviews',
  vault:        'Document vault',
  validation:   'Validation center',
  submissions:  'Submission center',
  templates:    'Templates',
  engineering:  'Device engineering',
  udi:          'UDI and labeling',
  postmarket:   'Post-market vigilance',
  analytics:    'Analytics',
  memory:       'AnA memory',
  admin:        'Admin and access',
};

const USER = { name: 'Jordan Chen', initials: 'JC', role: 'Enterprise · Reg Affairs' };

/* The 5 surfaces already shipped in the codebase. The harness shows a
   pointer so reviewers don't think they're missing here. */
const SHIPPED_SURFACES = new Set(['overview', 'k510', 'pma', 'cer', 'predicate']);
const WORKBENCH_SURFACES = new Set(['tasks', 'vault', 'validation', 'submissions', 'templates']);

function ShippedReference({ nav }) {
  const label = HERE_LABEL[nav] || nav;
  const codepath = SHIPPED_SURFACES.has(nav)
    ? `client/src/concept2cure/mdx/surfaces/${
        nav === 'overview' ? 'Overview' :
        nav === 'k510'     ? 'K510Surface' :
        nav === 'pma'      ? 'PmaSurface' :
        nav === 'cer'      ? 'CerSurface' :
        'PrecedentSurface'
      }.tsx`
    : `client/src/concept2cure/mdx/workbench/Workbench.tsx`;
  return (
    <div className="indesign">
      <div className="indesign-icon">{I.check}</div>
      <div className="indesign-phase">Reference — shipped in codebase</div>
      <h2>{label}</h2>
      <div className="indesign-desc">
        This surface is implemented in the v2 codebase. Open <span className="mono">{codepath}</span>.
        The Phase 4 design contracts in HANDOFF.md cover only the surfaces this kit added.
      </div>
    </div>
  );
}

function MdxApp() {
  const [activeNav, setActiveNav] = React.useState('engineering');
  const [collapsed, setCollapsed] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);

  /* Active program context — for surfaces that scope to one device.
     Phase 9 connection pass: extended to cover every per-program surface.
     Mapping: which device the surface should anchor to in the kit harness. */
  const program = React.useMemo(() => {
    if (activeNav === 'engineering' || activeNav === 'samd')      return MDX_PROGRAMS.find(p => p.id === 'bx204');
    if (activeNav === 'ivd')                                       return MDX_PROGRAMS.find(p => p.id === 'dx102');
    if (activeNav === 'ivdr' || activeNav === 'cdx')               return MDX_PROGRAMS.find(p => p.id === 'iv415');
    if (activeNav === 'clinical')                                  return MDX_PROGRAMS.find(p => p.id === 'cv330');
    return null;
  }, [activeNav]);

  const askAna = React.useCallback((text, opts = {}) => {
    // In production, this routes through useAnaChat → /api/ana-ri/stream.
    // The kit harness surfaces the message so reviewers see the wiring works.
    setToast({ text, when: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
    /* eslint-disable-next-line no-console */
    console.log('[AnA]', text);
  }, []);

  const hereLabel = HERE_LABEL[activeNav] || 'Overview';

  let surface;
  if (activeNav === 'engineering') {
    surface = <EngineeringSurface program={program} onAskAna={askAna} onOpenEditor={(id) => askAna(`Open document ${id} in editor`)} />;
  }
  else if (activeNav === 'udi')           surface = <UdiSurface onAskAna={askAna} onOpenEditor={(id) => askAna(`Open document ${id} in editor`)} />;
  else if (activeNav === 'postmarket')    surface = <PostmarketSurface onAskAna={askAna} onOpenEditor={(id) => askAna(`Open document ${id} in editor`)} />;
  else if (activeNav === 'analytics')     surface = <AnalyticsSurface onAskAna={askAna} />;
  else if (activeNav === 'memory')        surface = <MemorySurface onAskAna={askAna} />;
  else if (activeNav === 'admin')         surface = <AdminSurface onAskAna={askAna} />;
  else if (activeNav === 'vault')         surface = <VaultSurface onAskAna={askAna} onOpenEditor={(id) => askAna(`Preview vault artifact ${id}`)} />;
  else if (activeNav === 'audit')         surface = <AuditSurface onAskAna={askAna} onOpenEditor={(id) => askAna(`Open audit export ${id}`)} />;
  else if (activeNav === 'notifications') surface = <NotificationsSurface onAskAna={askAna} />;
  else if (activeNav === 'templates')     surface = <TemplatesSurface onAskAna={askAna} onOpenEditor={(id) => askAna(`Apply template ${id} to a program`)} />;
  else if (activeNav === 'quality')       surface = <QualitySurface onAskAna={askAna} onOpenEditor={(id) => askAna(`Open QMS document ${id}`)} />;
  else if (activeNav === 'ivd')           surface = <IvdSurface program={program} onAskAna={askAna} onOpenEditor={(id) => askAna(`Open IVD document ${id}`)} />;
  else if (activeNav === 'ivdr')          surface = <IvdrSurface program={program} onAskAna={askAna} onOpenEditor={(id) => askAna(`Open IVDR document ${id}`)} />;
  else if (activeNav === 'cdx')           surface = <CdxSurface program={program} onAskAna={askAna} onOpenEditor={(id) => askAna(`Open CDx document ${id}`)} />;
  else if (activeNav === 'ldt')           surface = <LdtSurface onAskAna={askAna} onOpenEditor={(id) => askAna(`Open LDT document ${id}`)} />;
  else if (activeNav === 'ana-review')    surface = <AnaReviewSurface program={program} onAskAna={askAna} />;
  else if (activeNav === 'qsub')          surface = <QSubSurface program={program} onAskAna={askAna} onOpenEditor={(id) => askAna(`Open Q-Sub document ${id}`)} />;
  else if (activeNav === 'samd')          surface = <SamdSurface program={program} onAskAna={askAna} onOpenEditor={(id) => askAna(`Open SaMD document ${id}`)} />;
  else if (activeNav === 'clinical')      surface = <ClinicalSurface program={program} onAskAna={askAna} onOpenEditor={(id) => askAna(`Open clinical document ${id}`)} />;
  else if (activeNav === 'search')        surface = <SearchSurface program={program} onAskAna={askAna} />;
  else if (activeNav === 'onboarding')    surface = <OnboardingSurface onAskAna={askAna} />;
  else if (activeNav === 'conversations') surface = <ConversationsSurface program={program} onAskAna={askAna} />;
  else surface = <ShippedReference nav={activeNav} />;

  return (
    <div
      className="shell"
      data-collapsed={collapsed}
      data-ana-open={false}
    >
      <Rail
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        user={USER}
      />
      <main className="main">
        <TopBar
          hereLabel={hereLabel}
          program={program}
          onOpenPalette={() => askAna('Open command palette (⌘K)')}
        />
        <TabBar activeNav={activeNav} setActiveNav={setActiveNav} programs={MDX_PROGRAMS} />
        <div className="page" data-screen-label={`MDX · ${hereLabel}`}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>
      <AnaSeam onOpen={() => askAna('Open AnA rail')} />

      {toast && (
        <div className="kit-toast" role="status">
          <span className="kit-toast-mark">✻</span>
          <div className="kit-toast-body">
            <div className="kit-toast-head">
              <span className="kit-toast-lbl">→ AnA</span>
              <span className="kit-toast-when">{toast.when}</span>
            </div>
            <div className="kit-toast-text">{toast.text}</div>
          </div>
          <button className="kit-toast-close" onClick={() => setToast(null)} title="Dismiss">{I.close}</button>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<MdxApp />);

})();
