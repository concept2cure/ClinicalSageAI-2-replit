/* global React, I, AUTH_EVIDENCE, AUTH_REVIEWERS */
var { useMemo } = React;

/* Helper: walk the outline tree → flat array of leaf sections only. */
function flattenLeaves(nodes, parent = null, out = []) {
  for (const n of nodes) {
    if (n.children) flattenLeaves(n.children, n, out);
    else out.push({ ...n, parent });
  }
  return out;
}

const STATUS_LABELS = {
  approved: 'Approved',
  review:   'In review',
  drafted:  'Drafted',
  locked:   'Locked',
  todo:     'Not started',
};

const STATUS_UPDATED = {
  approved: '3 days ago',
  review:   'Today',
  drafted:  'Yesterday',
  locked:   '6 days ago',
  todo:     '—',
};

const reviewerById = (id) => AUTH_REVIEWERS.find(r => r.id === id);

function ownerCell(ownerId) {
  if (!ownerId) {
    return (
      <span className="owner-cell">
        <span className="av" style={{ background:'transparent', border:'1px dashed var(--bg-300)' }}>+</span>
        <span style={{ color:'var(--text-400)' }}>Assign</span>
      </span>
    );
  }
  const r = reviewerById(ownerId);
  return (
    <span className="owner-cell">
      <span className="av">{ownerId}</span>
      <span>{r ? r.name.split(' ')[0] : ownerId}</span>
    </span>
  );
}

/* ───────── Workbench main — section table + filters + KPIs ───────── */
function WorkbenchTable({ outline, docType, agencyLabel, activeId, onPick, onDraft }) {
  const leaves = useMemo(() => flattenLeaves(outline), [outline]);

  const counts = leaves.reduce((acc, n) => {
    const s = n.status || 'todo';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const total = leaves.length;
  const ready = (counts.approved || 0) + (counts.locked || 0);
  const blocked = leaves.filter(l => l.mandatory && (l.status === 'todo' || !l.status)).length;
  const readinessPct = total ? Math.round((ready / total) * 100) : 0;

  return (
    <div className="au-wb">
      <div className="au-wb-head">
        <h1>{docType.label}</h1>
        <span className="meta">{agencyLabel} rule pack · {leaves.length} sections</span>
        <span className="spacer"/>
        <button className="au-tb-btn primary" style={{ whiteSpace: 'nowrap' }}>{I.sparkle} Draft with AnA</button>
      </div>

      <div className="au-wb-prog-strip">
        <div className="au-wb-kpi">
          <span className="label">Readiness</span>
          <span className="val">{readinessPct}%</span>
          <span className="sub">{ready}/{total} sections ready</span>
        </div>
        <div className="au-wb-kpi">
          <span className="label">In review</span>
          <span className="val">{counts.review || 0}</span>
          <span className="sub">awaiting reviewer sign-off</span>
        </div>
        <div className="au-wb-kpi">
          <span className="label">Drafted</span>
          <span className="val">{counts.drafted || 0}</span>
          <span className="sub">AnA + author work in progress</span>
        </div>
        <div className="au-wb-kpi">
          <span className="label">Mandatory blockers</span>
          <span className="val">{blocked}</span>
          <span className="sub">mandatory sections without a draft</span>
        </div>
      </div>

      <div className="au-wb-table">
        <div className="au-wb-thead">
          <span>Path</span>
          <span>Section</span>
          <span>Status</span>
          <span>Owner</span>
          <span>Updated</span>
          <span style={{ textAlign:'right' }}>Actions</span>
        </div>
        {leaves.map(n => (
          <div key={n.id} className="au-wb-row"
               data-active={n.id===activeId || undefined}
               onClick={() => onPick(n.id)}>
            <span className="path">{n.path}</span>
            <span className="label">
              <div className="lbl">
                {n.label}
                {n.mandatory && <span title="Mandatory" style={{ marginLeft: 6, fontSize: 9.5, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-100)', color: 'var(--text-400)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', verticalAlign: 1 }}>Req</span>}
              </div>
              <div className="sub">{n.parent ? n.parent.label : ''}</div>
            </span>
            <span>
              <span className={`au-status-pill ${n.status || 'todo'}`}>
                <span className="dot"/>{STATUS_LABELS[n.status || 'todo']}
              </span>
            </span>
            <span>{ownerCell(n.owner)}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-300)' }}>{STATUS_UPDATED[n.status || 'todo']}</span>
            <span className="au-wb-actions">
              <button onClick={(e) => { e.stopPropagation(); onPick(n.id); }} title="Open">{I.eye}</button>
              <button className="primary" onClick={(e) => { e.stopPropagation(); onDraft(n.id); }} title="Draft with AnA">
                {I.sparkle} Draft
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Inspector: Evidence / Reviewers / Activity panes ───────── */
function EvidencePane({ items, sectionMeta }) {
  return (
    <div>
      <div className="au-insp-section-title">Linked to §{sectionMeta.path}</div>
      {items.slice(0, 4).map(e => (
        <div key={e.id} className="au-ev-item">
          <span className="kind">{I.book}</span>
          <div className="body">
            <div className="title">{e.title}</div>
            <div className="meta">{e.kind} · {e.meta}</div>
          </div>
          <div className="conf">{Math.round(e.conf*100)}%</div>
        </div>
      ))}
      <div className="au-insp-section-title" style={{ marginTop: 14 }}>Vault search</div>
      <div className="au-ev-item" style={{ borderStyle:'dashed', background:'transparent' }}>
        <span className="kind">{I.search}</span>
        <div className="body">
          <div className="title">Search RIM + Vault</div>
          <div className="meta">Find evidence to anchor a claim</div>
        </div>
      </div>
    </div>
  );
}

function ReviewersPane({ reviewers, sectionMeta }) {
  return (
    <div>
      <div className="au-insp-section-title">Owner</div>
      {sectionMeta.owner
        ? (() => {
            const r = reviewerById(sectionMeta.owner);
            return (
              <div className="au-rev-row">
                <span className="av">{sectionMeta.owner}</span>
                <div>
                  <div className="name">{r ? r.name : sectionMeta.owner}</div>
                  <div className="role">{r ? r.role : '—'}</div>
                </div>
                <span className="au-status-pill review" style={{ marginLeft:'auto' }}><span className="dot"/>Reviewing</span>
              </div>
            );
          })()
        : (
          <div className="au-rev-row" style={{ borderStyle:'dashed' }}>
            <span className="av" style={{ background:'transparent', border:'1px dashed var(--bg-300)' }}>+</span>
            <span style={{ color:'var(--text-400)' }}>Assign owner</span>
          </div>
        )
      }
      <div className="au-insp-section-title" style={{ marginTop: 14 }}>Other reviewers</div>
      {reviewers.filter(r => r.id !== sectionMeta.owner).slice(0, 4).map(r => (
        <div key={r.id} className="au-rev-row">
          <span className="av">{r.id}</span>
          <div>
            <div className="name">{r.name}</div>
            <div className="role">{r.role}</div>
          </div>
          <button className="au-tb-btn" style={{ marginLeft:'auto', fontSize: 11 }}>{I.send} Request</button>
        </div>
      ))}
    </div>
  );
}

function AskAnaPane({ Chat, chatProps }) {
  return <Chat {...chatProps} hint="Ask AnA · scoped to this section"/>;
}

function Inspector({ tab, setTab, sectionMeta, evidence, reviewers, Chat, chatProps }) {
  return (
    <aside className="au-inspector">
      <div className="au-insp-tabs">
        <button className="au-insp-tab" data-active={tab==='ana'      || undefined} onClick={() => setTab('ana')}>{I.sparkle} Ask AnA</button>
        <button className="au-insp-tab" data-active={tab==='evidence' || undefined} onClick={() => setTab('evidence')}>{I.book} Evidence</button>
        <button className="au-insp-tab" data-active={tab==='review'   || undefined} onClick={() => setTab('review')}>{I.users} Reviewers</button>
      </div>
      <div className="au-insp-body" style={tab === 'ana' ? { padding: 0, display:'flex', flexDirection:'column' } : null}>
        {tab === 'ana'      && <AskAnaPane Chat={Chat} chatProps={chatProps}/>}
        {tab === 'evidence' && <EvidencePane items={evidence} sectionMeta={sectionMeta}/>}
        {tab === 'review'   && <ReviewersPane reviewers={reviewers} sectionMeta={sectionMeta}/>}
      </div>
    </aside>
  );
}

window.Workbench = { WorkbenchTable, Inspector };
