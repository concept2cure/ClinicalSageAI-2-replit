(() => {
var { useState } = React;
const { Rail, TopBar, ProtocolSurface, CmcSurface, BiostatSurface, ReportsSurface } = window.IntSurfaces;

function App() {
  const [activeNav, setActiveNav] = useState('protocol');
  const onAsk = (q) => { console.log('[AnA]', q); };
  let surface;
  switch (activeNav) {
    case 'cmc':       surface = <CmcSurface onAsk={onAsk}/>;       break;
    case 'biostat':   surface = <BiostatSurface onAsk={onAsk}/>;   break;
    case 'reporting': surface = <ReportsSurface onAsk={onAsk}/>;   break;
    default:          surface = <ProtocolSurface onAsk={onAsk}/>;
  }
  return (
    <div className="in-shell" data-screen-label="Intelligence">
      <Rail activeNav={activeNav} setActiveNav={setActiveNav}/>
      <div className="in-main">
        <TopBar activeNav={activeNav}/>
        <div className="in-page" data-screen-label={`Intelligence · ${activeNav}`}>
          <div className="in-page-inner">{surface}</div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

})();
