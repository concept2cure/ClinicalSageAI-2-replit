(() => {
/* Shared platform rail — the ONE navigation, identical on every screen.
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for the left rail. Every standalone kit
 * harness loads this and calls window.PlatformRail({ active }). In v2
 * this is `_shared/shell/Rail.tsx` mounted once by the app shell, so the
 * rail and its items never drift between surfaces. Collapse state
 * persists in localStorage('c2c.railCollapsed'), shared across surfaces. */

const { useState } = React;

const RailIcon = ({ d }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const RI = {
  stethoscope:<RailIcon d={<><path d="M4.8 2.3A.3.3 0 0 1 5.1 2h1.8a.3.3 0 0 1 .3.3v4.4a3 3 0 0 1-6 0V2.3z"/><path d="M8 15v1a5 5 0 0 0 10 0V8"/><circle cx="20" cy="10" r="2"/></>}/>,
  atom:      <RailIcon d={<><circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5z"/><path d="M3.8 20.2c-2.04-2.03.02-7.36 4.5-11.9 4.54-4.52 9.87-6.54 11.9-4.5 2.04 2.03.02 7.36-4.5 11.9-4.54 4.52-9.87 6.54-11.9 4.5z"/></>}/>,
  folder:    <RailIcon d={<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>}/>,
  vault:     <RailIcon d={<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/></>}/>,
  check:     <RailIcon d={<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>}/>,
  send:      <RailIcon d={<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>}/>,
  microscope:<RailIcon d={<><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/></>}/>,
  beaker:    <RailIcon d={<><path d="M4.5 3h15"/><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3"/><path d="M6 14h12"/></>}/>,
  sigma:     <RailIcon d={<><polyline points="18 7 18 4 6 4 12 12 6 20 18 20 18 17"/></>}/>,
  shieldCheck:<RailIcon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>}/>,
  barChart:  <RailIcon d={<><line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="12" width="3" height="8"/><rect x="10.5" y="8" width="3" height="12"/><rect x="16" y="4" width="3" height="16"/></>}/>,
  brain:     <RailIcon d={<><path d="M12 5a3 3 0 1 0-5.997.142 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18z"/><path d="M12 5a3 3 0 1 1 5.997.142 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18z"/></>}/>,
  sparkles:  <RailIcon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>}/>,
  scroll:    <RailIcon d={<><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M21 17V5a2 2 0 0 0-2-2H8"/></>}/>,
  settings:  <RailIcon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}/>,
  panelLeft: <RailIcon d={<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>}/>,
};

/* The ONE nav — identical everywhere. Mirrors home/data.jsx NAV_ITEMS. */
const NAV = [
  { group: 'Domain', items: [
    { id: 'mdx',        label: 'Medical Device and Diagnostics', icon: 'stethoscope', href: '../mdx/index.html' },
    { id: 'biopharma',  label: 'Biotech and Pharma',             icon: 'atom',        href: '../biopharma/index.html' },
  ]},
  { group: 'Work', items: [
    { id: 'projects',   label: 'Projects',                       icon: 'folder',      href: '../projects/index.html' },
    { id: 'vault',      label: 'Vault DMS',                      icon: 'vault',       href: '../vault/index.html' },
    { id: 'tasking',    label: 'Tasking and Collaboration',      icon: 'check',       href: '../tasking/index.html' },
    { id: 'submission', label: 'Submission Center',              icon: 'send',        href: '../submission/index.html' },
  ]},
  { group: 'Intelligence', items: [
    { id: 'protocol',   label: 'Protocol and Study Design',      icon: 'microscope',  href: '../intelligence/index.html?tab=protocol' },
    { id: 'cmc',        label: 'CMC Module',                     icon: 'beaker',      href: '../cmc/index.html' },
    { id: 'biostat',    label: 'Biostatistics',                  icon: 'sigma',       href: '../intelligence/index.html?tab=biostat' },
    { id: 'quality',    label: 'Quality and Lifecycle',          icon: 'shieldCheck', href: '../risk/index.html' },
    { id: 'reporting',  label: 'Reports',                        icon: 'barChart',    href: '../intelligence/index.html?tab=reporting' },
  ]},
  { group: 'System', items: [
    { id: 'memory',     label: 'AnA Memory',                     icon: 'brain',       href: '../intelligence/index.html?tab=reporting' },
    { id: 'artifacts',  label: 'Documents',                      icon: 'sparkles',    href: '../authoring/index.html' },
    { id: 'audit',      label: 'Audit and Compliance',           icon: 'scroll',      href: '../pathway-tabs/index.html' },
    { id: 'admin',      label: 'Admin Settings',                 icon: 'settings',    href: '../home/index.html' },
  ]},
];

function PlatformRail({ active }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('c2c.railCollapsed') === '1'; } catch { return false; }
  });
  const toggle = () => setCollapsed(c => { const n = !c; try { localStorage.setItem('c2c.railCollapsed', n ? '1' : '0'); } catch {} return n; });

  return (
    <nav className="sg-rail" data-collapsed={collapsed || undefined}>
      <div className="sg-rail-top">
        <div className="sg-rail-logo"><img src="../../assets/concept2cure-icon.svg" alt=""/><span>Concept2Cure<span style={{color:'var(--accent-main-100)'}}>.RI</span></span></div>
        <button className="sg-rail-collapse" onClick={toggle} title={collapsed ? 'Expand' : 'Collapse'}>{RI.panelLeft}</button>
      </div>
      {NAV.map(g => (
        <React.Fragment key={g.group}>
          <div className="sg-rail-section">{g.group}</div>
          {g.items.map(it => (
            <a key={it.id} className="sg-rail-item" href={it.href} aria-current={it.id === active || undefined} title={it.label}>
              <span className="ico">{RI[it.icon] || RI.beaker}</span><span className="lbl">{it.label}</span>
            </a>
          ))}
        </React.Fragment>
      ))}
    </nav>
  );
}

window.PlatformRail = PlatformRail;
})();
