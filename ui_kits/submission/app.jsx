(() => {
/* Submission Gateway — App composer. Reuses MDX chassis shell via the
   biopharma Rail/TopBar pattern; this kit ships a thin standalone shell
   so it runs on its own and proves the surface. */
const { useState } = React;
const I = window.SG_I;
const USER = window.SG_USER;

function App() {
  const askAna = (q) => { console.log('[AnA · submission]', q); };
  return (
    <div className="sg-railed">
      <window.PlatformRail active="submission"/>
      <div className="sg-rail-main">
      <div className="sg-shell" data-screen-label="Submission Center">
      <header className="sg-topbar">
        <div className="sg-logo">
          <img src="../../assets/concept2cure-icon.svg" alt=""/>
          <span>Concept2Cure<span style={{ color:'var(--accent-main-100)' }}>.RI</span></span>
        </div>
        <div className="sg-sep"/>
        <div className="sg-crumbs">
          <a href="../home/index.html">Concept2Cure.RI</a>
          <span className="sep">›</span>
          <span className="here">Submission Center</span>
        </div>
        <div className="sg-spacer"/>
        <button className="sg-tb-search"><span className="ico">{I.search}</span><span className="lbl">Ask AnA, jump to…</span><span className="kbd">⌘K</span></button>
        <button className="sg-tb-btn" title="Notifications">{I.bell}</button>
      </header>
      <div className="sg-page">
        <div className="sg-page-inner">
          <window.SubmissionSurface onAskAna={askAna}/>
        </div>
      </div>
    </div>
      </div>
</div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

})();
