(() => {
const {
  PdevI: I,
  PDEV_PROGRAMS, PDEV_NAV_ITEMS,
  PdevRail, PdevTopBar, PdevAnaDock,
  PdevOverview, PdevWorkstream, PdevAssembly, PdevFdaStream, PdevContradictions,
  PdevActivityDetail, PdevAiDraftSheet, PdevEvidencePicker, PdevConfirmDialog,
} = window;

const HERE_LABEL = {
  overview: 'Program dashboard',
  cmc: 'CMC workstream',
  nonclinical: 'Nonclinical workstream',
  clinical: 'Clinical workstream',
  regulatory: 'Regulatory workstream',
  ind_assembly: 'IND assembly readiness',
  contradictions: 'Contradictions registry',
  fda_interactions: 'FDA interactions',
};

function PdevApp() {
  const [activeNav, setActiveNav] = React.useState('overview');
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(true);
  const [programId, setProgramId] = React.useState(PDEV_PROGRAMS[0].id);
  const [activeActivity, setActiveActivity] = React.useState(null);
  const [aiDraft, setAiDraft] = React.useState(null);
  const [evidencePicker, setEvidencePicker] = React.useState(null);
  const [confirmCfg, setConfirmCfg] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);

  const program = PDEV_PROGRAMS.find(p => p.id === programId);

  const askAna = React.useCallback((text) => {
    setToast({ text, when: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
    setAnaOpen(true);
  }, []);

  const openConfirm = (cfg) => setConfirmCfg(cfg);
  const closeConfirm = () => setConfirmCfg(null);
  const onConfirm = (result) => {
    askAna(`Logged: ${confirmCfg.action} · "${result.reason}"`);
    closeConfirm();
    setActiveActivity(null);
    setAiDraft(null);
    setEvidencePicker(null);
  };

  const isWorkstreamNav = ['cmc','nonclinical','clinical','regulatory'].includes(activeNav);

  let surface;
  if (activeNav === 'overview') {
    surface = <PdevOverview program={program} setActiveNav={setActiveNav} onAskAna={askAna} onSnapshot={() => askAna('Snapshot readiness now')} />;
  } else if (isWorkstreamNav) {
    surface = <PdevWorkstream ws={activeNav} program={program} openActivity={setActiveActivity} onAskAna={askAna} />;
  } else if (activeNav === 'ind_assembly') {
    surface = <PdevAssembly program={program} onAskAna={askAna} openCompile={() => openConfirm({
      action: 'Compile IND assembly',
      target: `${program.code} · ${program.productName.split(' · ')[0]}`,
      resource: program.code,
      minReason: 30,
      confirmWord: 'yes-transmit',
    })} />;
  } else if (activeNav === 'fda_interactions') {
    surface = <PdevFdaStream program={program} onAskAna={askAna} openConfirm={openConfirm} />;
  } else if (activeNav === 'contradictions') {
    surface = <PdevContradictions program={program} onAskAna={askAna} openConfirm={openConfirm} />;
  }

  return (
    <div className="pdev-shell" data-collapsed={collapsed} data-ana-open={anaOpen}>
      <PdevRail
        activeNav={activeNav} setActiveNav={setActiveNav}
        collapsed={collapsed} setCollapsed={setCollapsed}
        program={program} programs={PDEV_PROGRAMS} switchProgram={setProgramId}
      />
      <main className="pdev-main">
        <PdevTopBar hereLabel={HERE_LABEL[activeNav] || 'PDEV'} program={program} onOpenPalette={() => askAna('Open command palette')} />
        <div className="pdev-page">
          <div className="pdev-page-inner">{surface}</div>
        </div>
      </main>
      <PdevAnaDock open={anaOpen} setOpen={setAnaOpen} program={program} activeNav={activeNav} activity={activeActivity} />

      {activeActivity && (
        <PdevActivityDetail
          activity={activeActivity}
          onClose={() => setActiveActivity(null)}
          openDraft={(act, doc) => setAiDraft({ activity: act, doc })}
          openEvidence={(act) => setEvidencePicker({ activity: act })}
          openConfirm={openConfirm}
          onAskAna={askAna}
        />
      )}
      {aiDraft && <PdevAiDraftSheet activity={aiDraft.activity} doc={aiDraft.doc} onClose={() => setAiDraft(null)} openConfirm={openConfirm} />}
      {evidencePicker && <PdevEvidencePicker activity={evidencePicker.activity} onClose={() => setEvidencePicker(null)} openConfirm={openConfirm} />}
      {confirmCfg && <PdevConfirmDialog open={true} {...confirmCfg} onCancel={closeConfirm} onConfirm={onConfirm} />}

      {toast && (
        <div className="pdev-toast">
          <span className="pdev-toast-mark">✻</span>
          <div className="pdev-toast-body">
            <div className="pdev-toast-head"><span>→ AnA</span><span className="mono">{toast.when}</span></div>
            <div className="pdev-toast-text">{toast.text}</div>
          </div>
          <button className="pdev-toast-close" onClick={() => setToast(null)}>{I.close}</button>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<PdevApp />);
})();
