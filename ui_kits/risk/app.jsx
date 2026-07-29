(() => {
const I = window.RM_I;
function App() {
  const askAna = (q) => { console.log('[AnA · risk]', q); };
  return (
    <div className="sg-railed">
      <window.PlatformRail active="quality"/>
      <div className="sg-rail-main">
      <div className="sg-shell" data-screen-label="Risk Management">
      <header className="sg-topbar">
        <div className="sg-logo"><img src="../../assets/concept2cure-icon.svg" alt=""/><span>Concept2Cure<span style={{color:'var(--accent-main-100)'}}>.RI</span></span></div>
        <div className="sg-sep"/>
        <div className="sg-crumbs"><a href="../home/index.html">Concept2Cure.RI</a><span className="sep">›</span><a href="../mdx/index.html">Medical Device and Diagnostics</a><span className="sep">›</span><span className="here">Risk Management</span></div>
        <div className="sg-spacer"/>
        <button className="sg-tb-search"><span className="ico">{I.search}</span><span className="lbl">Ask AnA, jump to…</span><span className="kbd">⌘K</span></button>
        <button className="sg-tb-btn" title="Notifications">{I.bell}</button>
      </header>
      <div className="sg-page"><div className="sg-page-inner"><window.RiskSurface onAskAna={askAna}/></div></div>
    </div>
      </div>
</div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
})();
