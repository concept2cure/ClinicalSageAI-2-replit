/* global React, I, AUTH_AGENCIES, AUTH_DOC_TYPES */
const { useState, useRef, useEffect } = React;

/* Click-outside helper */
function useClickOutside(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);
  return ref;
}

/* ───────── Picker popovers ───────── */
function DocTypePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const cur = AUTH_DOC_TYPES.find(d => d.id === value);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="au-pill" onClick={() => setOpen(o => !o)} title="Document type">
        <span className="pill-label">Type</span>
        <b>{cur ? cur.label : value}</b>
        <span style={{ display:'inline-flex' }}>{I.chevronDn}</span>
      </button>
      {open && (
        <div className="au-pop">
          <h6>Document type</h6>
          {AUTH_DOC_TYPES.map(d => (
            <button key={d.id} className="au-pop-item" data-active={d.id===value || undefined}
                    onClick={() => { onChange(d.id); setOpen(false); }}>
              <div className="row">
                <span>{d.label}</span>
                <span className="desc">{d.family}</span>
              </div>
              {d.id===value && <span className="right">{I.check}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AgencyPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const cur = AUTH_AGENCIES.find(a => a.id === value);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="au-pill agency" onClick={() => setOpen(o => !o)} title="Agency rule pack">
        <span style={{ display:'inline-flex' }}>{I.agency}</span>
        <b>{cur ? cur.label : value}</b>
        <span style={{ display:'inline-flex' }}>{I.chevronDn}</span>
      </button>
      {open && (
        <div className="au-pop" style={{ minWidth: 300 }}>
          <h6>Agency rule pack</h6>
          {AUTH_AGENCIES.map(a => (
            <button key={a.id} className="au-pop-item" data-active={a.id===value || undefined}
                    onClick={() => { onChange(a.id); setOpen(false); }}>
              <div className="row">
                <span><b>{a.label}</b> · {a.region}</span>
                <span className="desc">{a.esubmit}</span>
              </div>
              {a.id===value && <span className="right">{I.check}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Version-history popover — three most recent versions per active section.
   In v2 this reads from c2c_document_section_versions (Phase 9 schema). */
function HistoryPopover({ open, onClose, version, lastSaved }) {
  const ref = useClickOutside(open, onClose);
  if (!open) return null;
  const versions = [
    { v: version,    when: lastSaved,         who: 'AnA',         note: 'Regenerated from refreshed sources',     current: true  },
    { v: 'v0.3',     when: '14 minutes ago',  who: 'Jordan Chen', note: 'Tightened against FDA 2023 bridging',    current: false },
    { v: 'v0.2',     when: '2 hours ago',     who: 'AnA',         note: 'Drafted from IND §2.7.4 + CSR-201',      current: false },
    { v: 'v0.1',     when: 'yesterday',       who: 'Alex Reyes',  note: 'Seed from prior NDA outline',             current: false },
  ];
  return (
    <div ref={ref} className="au-pop" style={{ right: 0, minWidth: 320 }}>
      <h6>Version history · this section</h6>
      {versions.map((v, i) => (
        <button key={i} className="au-pop-item" data-active={v.current || undefined}>
          <div className="row">
            <span><b>{v.v}</b> · {v.who} · {v.when}</span>
            <span className="desc">{v.note}</span>
          </div>
          {!v.current && <span className="right">Compare · Restore</span>}
          {v.current && <span className="right">Current</span>}
        </button>
      ))}
    </div>
  );
}


function TopBar({
  program, docType, agency, view, focus, treeCollapsed, version, lastSaved, streaming,
  evidenceMode, onEvidenceMode,
  onDocType, onAgency, onView, onToggleTree, onToggleFocus,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const docLabel = (AUTH_DOC_TYPES.find(d => d.id === docType) || {}).label || docType;
  return (
    <header className="au-topbar">
      <div className="au-logo">
        <img src="../../assets/concept2cure-icon.svg" alt=""/>
        <b>Concept2Cure<span>.RI</span></b>
      </div>
      <div className="au-sep"/>
      <button className="au-tb-btn" onClick={onToggleTree} title="Toggle outline">{I.panelLeft}</button>
      <div className="au-crumbs">
        <span>{program.code}</span>
        <span className="sep">/</span>
        <span>{program.title}</span>
        <span className="sep">/</span>
        <span className="here">{docLabel}</span>
      </div>

      <div className="au-sep"/>
      <DocTypePicker value={docType} onChange={onDocType}/>
      <AgencyPicker value={agency} onChange={onAgency}/>

      <div className="au-sep"/>
      <div className="au-toggle" role="tablist" aria-label="Authoring view">
        <button data-active={view==='conversation' || undefined} onClick={() => onView('conversation')}>
          {I.conversation} Conversation
        </button>
        <button data-active={view==='workbench' || undefined} onClick={() => onView('workbench')}>
          {I.workbench} Workbench
        </button>
      </div>

      <div className="au-toggle" role="tablist" aria-label="Evidence density" title="Evidence density">
        <button data-active={evidenceMode==='off' || undefined} onClick={() => onEvidenceMode('off')} title="Hide citations">
          {I.eye} Off
        </button>
        <button data-active={evidenceMode==='footnote' || undefined} onClick={() => onEvidenceMode('footnote')} title="Inline footnote chips">
          {I.cite} Cite
        </button>
        <button data-active={evidenceMode==='margin' || undefined} onClick={() => onEvidenceMode('margin')} title="Margin evidence rail (audit prep)">
          {I.quote} Margin
        </button>
      </div>

      <div className="au-spacer"/>

      <div className="au-savestatus" title={`Last saved ${lastSaved}`}>
        <span className={`dot ${streaming ? 'streaming' : ''}`}/>
        <span>{streaming ? 'Drafting…' : `Autosaved · ${version} · ${lastSaved}`}</span>
      </div>
      <button className="au-tb-btn" title="History" onClick={() => setHistoryOpen(o => !o)} style={{ position: 'relative' }}>
        {I.history}
        <HistoryPopover open={historyOpen} onClose={() => setHistoryOpen(false)} version={version} lastSaved={lastSaved}/>
      </button>
      <button className="au-tb-btn" title="Share">{I.share}</button>
      <button className="au-tb-btn" title="Export">{I.download}</button>
      <button className="au-tb-btn" onClick={onToggleFocus} title={focus ? 'Exit focus' : 'Focus'}>
        {focus ? I.exitFocus : I.focus}
      </button>
      <button className="au-tb-btn primary">Submit for review</button>
    </header>
  );
}

window.AuthShell = { TopBar };
