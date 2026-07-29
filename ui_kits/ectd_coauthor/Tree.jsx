/* global React, I */

/* eCTD tree data — canonical M1–M5 structure, abridged */
const TREE = [
  { num: '1', label: 'Administrative', status: 'approved', open: false, children: [
    { num: '1.2', label: 'Cover letter', status: 'approved' },
    { num: '1.3.1', label: 'Application form (356h)', status: 'approved' },
    { num: '1.14.1.3', label: 'Draft labeling', status: 'review' },
  ]},
  { num: '2', label: 'Summaries', status: 'review', open: true, children: [
    { num: '2.2', label: 'Introduction', status: 'approved' },
    { num: '2.3', label: 'Quality overall summary', status: 'review' },
    { num: '2.4', label: 'Nonclinical overview', status: 'draft' },
    { num: '2.5', label: 'Clinical overview', status: 'draft' },
    { num: '2.6', label: 'Nonclinical written summaries', status: 'todo' },
    { num: '2.7', label: 'Clinical summary', status: 'draft' },
  ]},
  { num: '3', label: 'Quality (CMC)', status: 'draft', open: true, children: [
    { num: '3.2.S', label: 'Drug substance', status: 'draft' },
    { num: '3.2.P', label: 'Drug product', status: 'draft' },
    { num: '3.2.A', label: 'Appendices', status: 'todo' },
  ]},
  { num: '4', label: 'Nonclinical', status: 'approved', open: false, children: [
    { num: '4.2.1', label: 'Pharmacology', status: 'approved' },
    { num: '4.2.3', label: 'Toxicology', status: 'approved' },
  ]},
  { num: '5', label: 'Clinical', status: 'review', open: false, children: [
    { num: '5.2',   label: 'Tabular listing of studies', status: 'approved' },
    { num: '5.3.5', label: 'Efficacy & safety studies', status: 'review' },
    { num: '5.4',   label: 'Literature references', status: 'blocked' },
  ]},
];

function Tree({ activePath, setActivePath }) {
  const [open, setOpen] = React.useState(() => Object.fromEntries(TREE.map(m => [m.num, m.open])));
  const toggle = (n) => setOpen(o => ({ ...o, [n]: !o[n] }));

  return (
    <aside className="tree">
      <div className="tree-head">
        <b>eCTD · NDA 212345</b>
        <button className="topbar-btn" title="History" style={{padding:'2px 4px'}}>{I.history}</button>
      </div>
      <div className="tree-search">
        {I.search}
        <input placeholder="Find section…" />
      </div>
      {TREE.map((m) => (
        <div key={m.num} className="tree-module">
          <button className="tree-row" data-active={activePath === m.num || undefined} onClick={() => toggle(m.num)}>
            <span className="tree-caret" data-open={open[m.num] || undefined}>{I.chevron}</span>
            <span className="tree-num">M{m.num}</span>
            <span className="tree-label">{m.label}</span>
            <span className="tree-status" data-s={m.status}/>
          </button>
          {open[m.num] && (
            <div className="tree-children">
              {m.children.map(c => (
                <button key={c.num} className="tree-row"
                        data-active={activePath === c.num || undefined}
                        onClick={() => setActivePath(c.num)}>
                  <span className="tree-num">{c.num}</span>
                  <span className="tree-label">{c.label}</span>
                  <span className="tree-status" data-s={c.status}/>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="tree-foot">
        <div className="tree-foot-row"><span>Submission readiness</span><b>87%</b></div>
        <div className="tree-foot-row"><span>Sections blocking</span><b>3</b></div>
        <div className="tree-foot-row"><span>Last RIM sync</span><b>4 min ago</b></div>
      </div>
    </aside>
  );
}

Object.assign(window, { Tree });
